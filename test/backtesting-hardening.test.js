import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  normalizeBar,
  validateHistoricalBars,
  computeBarsHash,
} from "../lib/historical-data.js";
import { computeBacktestMetrics } from "../lib/backtest-metrics.js";
import {
  DeterministicReplayEngine,
  runReplay,
} from "../lib/replay-engine.js";
import {
  Strategy,
  ReferenceEmaCrossStrategy,
  ReferenceBreakoutStrategy,
  ReferenceRsiMeanReversionStrategy,
} from "../lib/strategy-interface.js";
import {
  splitBars,
  walkForwardValidation,
  verifyNoLookaheadBias,
} from "../lib/backtest-validation.js";

const fixtureBars = JSON.parse(
  fs.readFileSync(new URL("./fixtures/btc-1d.json", import.meta.url), "utf8"),
);

const makeBar = (i, o, h, l, c, v = 100) => ({
  time: 1700000000 + i * 86400,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: v,
  symbol: "TEST",
  timeframe: "1D",
});

// ============================================================================
// 1. Historical Data Validation & Schema Invariants
// ============================================================================

test("historical-data: validates canonical bars and computes deterministic hash", () => {
  const bars = [
    makeBar(0, 100, 105, 95, 102),
    makeBar(1, 102, 108, 101, 106),
    makeBar(2, 106, 110, 104, 109),
  ];
  const res = validateHistoricalBars(bars);
  assert.equal(res.valid, true);
  assert.equal(res.count, 3);
  assert.equal(res.bars.length, 3);
  assert.equal(res.sha256, computeBarsHash(res.bars));
  assert.equal(res.provenance.provider, "tavoryn-terminal");
  assert.ok(res.fromIso.includes("2023-"));
});

test("historical-data: rejects non-array or empty bar collections", () => {
  assert.throws(() => validateHistoricalBars(null), /must be an array/);
  assert.throws(() => validateHistoricalBars([]), /cannot be empty/);
});

test("historical-data: rejects duplicate timestamps", () => {
  const dupes = [
    makeBar(0, 100, 105, 95, 100),
    makeBar(0, 100, 105, 95, 100), // duplicate time
  ];
  assert.throws(() => validateHistoricalBars(dupes), /Duplicate timestamp detected/);
});

test("historical-data: rejects non-chronological timestamps", () => {
  const reversed = [
    makeBar(1, 100, 105, 95, 100),
    makeBar(0, 100, 105, 95, 100), // earlier than prev
  ];
  assert.throws(() => validateHistoricalBars(reversed), /Non-chronological order/);
});

test("historical-data: rejects non-finite or non-positive prices", () => {
  assert.throws(
    () => validateHistoricalBars([makeBar(0, -100, 105, 95, 100)]),
    /Invalid open price/,
  );
  assert.throws(
    () => validateHistoricalBars([makeBar(0, 100, NaN, 95, 100)]),
    /Invalid high price/,
  );
  assert.throws(
    () => validateHistoricalBars([makeBar(0, 100, 105, 0, 100)]),
    /Invalid low price/,
  );
  assert.throws(
    () => validateHistoricalBars([makeBar(0, 100, 105, 95, Infinity)]),
    /Invalid close price/,
  );
});

test("historical-data: rejects negative volume", () => {
  assert.throws(
    () => validateHistoricalBars([makeBar(0, 100, 105, 95, 100, -50)]),
    /Invalid volume/,
  );
});

test("historical-data: rejects invalid OHLC geometric relationships", () => {
  // High less than Open
  assert.throws(
    () => validateHistoricalBars([makeBar(0, 105, 100, 95, 98)]),
    /high \(100\) must be >= open/,
  );
  // Low greater than Close
  assert.throws(
    () => validateHistoricalBars([makeBar(0, 100, 105, 102, 101)]),
    /low \(102\) must be <= open/,
  );
});

test("historical-data: detects gaps without fabricating prices", () => {
  const barsWithGap = [
    makeBar(0, 100, 105, 95, 100),
    makeBar(1, 100, 105, 95, 100),
    makeBar(10, 100, 105, 95, 100), // 9-day gap
  ];
  const res = validateHistoricalBars(barsWithGap, { timeframe: "1D" });
  assert.equal(res.valid, true);
  assert.equal(res.gaps.length, 1);
  assert.equal(res.gaps[0].missingBarsApprox, 8);
  assert.throws(
    () => validateHistoricalBars(barsWithGap, { timeframe: "1D", strictNoGaps: true }),
    /gaps detected/,
  );
});

// ============================================================================
// 2. Lookahead Bias Prevention & Execution Timing
// ============================================================================

test("lookahead-prevention: context strictly restricts bars slice to historical bars [0...t]", () => {
  const bars = Array.from({ length: 20 }, (_, i) => makeBar(i, 100 + i, 105 + i, 95 + i, 101 + i));
  let maxHistorySeen = 0;
  let attemptLookaheadResult = null;

  class InspectorStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.bars.length > maxHistorySeen) maxHistorySeen = ctx.bars.length;
      assert.equal(ctx.bars.length, ctx.index + 1);
      assert.equal(ctx.bar.time, bar.time);
      // Attempting to index beyond ctx.index returns undefined
      attemptLookaheadResult = ctx.bars[ctx.index + 1];
    }
  }

  runReplay(bars, new InspectorStrategy());
  assert.equal(maxHistorySeen, 19); // Final bar onBar called at index 18
  assert.equal(attemptLookaheadResult, undefined);
});

test("lookahead-prevention: orders placed on bar t Close fill strictly on bar t+1 Open", () => {
  const bars = [
    makeBar(0, 100, 105, 95, 100),
    makeBar(1, 110, 115, 105, 112),
    makeBar(2, 120, 125, 115, 122),
  ];

  class SignalOnZeroStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) {
        ctx.submitOrder({ side: "BUY", type: "MARKET", reason: "Test Entry" });
      }
    }
  }

  const res = runReplay(bars, new SignalOnZeroStrategy(), { feePct: 0, slippagePct: 0 });
  assert.equal(res.trades.length, 1);
  // Entry time must be bar 1's time, not bar 0's time!
  assert.equal(res.trades[0].entryTime, bars[1].time);
  assert.equal(res.trades[0].entryPrice, bars[1].open);
});

test("lookahead-prevention: automated harness verifies future bar perturbations do not alter past decisions", () => {
  const check = verifyNoLookaheadBias(() => new ReferenceEmaCrossStrategy(), fixtureBars);
  assert.equal(check.passed, true);
  assert.ok(check.run1TradeCount > 0);
  assert.equal(check.run1TradeCount, check.run2TradeCount);
});

// ============================================================================
// 3. Deterministic Repeatability
// ============================================================================

test("determinism: identical inputs produce byte-identical trade lists and equity curves", () => {
  const run1 = runReplay(fixtureBars, new ReferenceEmaCrossStrategy());
  const run2 = runReplay(fixtureBars, new ReferenceEmaCrossStrategy());

  assert.deepEqual(run1.trades, run2.trades);
  assert.deepEqual(run1.equity, run2.equity);
  assert.deepEqual(run1.metrics, run2.metrics);
});

// ============================================================================
// 4. Execution Realism: Gap-Through Stops & Intrabar Ambiguity
// ============================================================================

test("execution-realism: gap-through stop fills at the Open with slippage, not at stop price", () => {
  // Long entry at 100 with 5% stop (stop = 95). Bar 2 gaps down to open at 80.
  const bars = [
    makeBar(0, 100, 105, 95, 100),
    makeBar(1, 100, 102, 98, 100), // enters here at 100
    makeBar(2, 80, 85, 75, 82),   // opens at 80, gapping through 95 stop
    makeBar(3, 82, 85, 80, 84),
  ];

  class BuyAndStopStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) {
        ctx.submitOrder({ side: "BUY", type: "MARKET", stopLossPct: 5 });
      }
    }
  }

  const res = runReplay(bars, new BuyAndStopStrategy(), { feePct: 0, slippagePct: 1 });
  assert.equal(res.trades.length, 1);
  const trade = res.trades[0];
  assert.equal(trade.exitReason, "Stop");
  // Fill price must be 80 * (1 - 0.01) = 79.2, NOT 95!
  assert.ok(Math.abs(trade.exitPrice - 79.2) < 1e-6);
  assert.ok(trade.pnlPct < -20);
});

test("execution-realism: intrabar stop vs target collision respects worst vs optimistic modes", () => {
  // Bar 1 touches both 5% target (105) and 5% stop (95)
  const bars = [
    makeBar(0, 100, 100, 100, 100),
    makeBar(1, 100, 108, 92, 100), // touches both stop (95) and target (105)
    makeBar(2, 100, 100, 100, 100),
  ];

  class BracketStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) {
        ctx.submitOrder({ side: "BUY", type: "MARKET", stopLossPct: 5, takeProfitPct: 5 });
      }
    }
  }

  // 'worst' mode must pick Stop
  const worstRun = runReplay(bars, new BracketStrategy(), { intrabar: "worst", feePct: 0, slippagePct: 0 });
  assert.equal(worstRun.trades[0].exitReason, "Stop");
  assert.equal(worstRun.trades[0].exitPrice, 95);

  // 'optimistic' mode must pick Target
  const optRun = runReplay(bars, new BracketStrategy(), { intrabar: "optimistic", feePct: 0, slippagePct: 0 });
  assert.equal(optRun.trades[0].exitReason, "Target");
  assert.equal(optRun.trades[0].exitPrice, 105);
});

// ============================================================================
// 5. Phase 2 Risk Controls Integration
// ============================================================================

test("risk-controls: maxOrderNotional rejects orders exceeding limit without modifying state", () => {
  const bars = [
    makeBar(0, 100, 105, 95, 100),
    makeBar(1, 100, 105, 95, 100),
    makeBar(2, 100, 105, 95, 100),
  ];

  class BigOrderStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) {
        // 500 shares * $100 = $50,000 order notional
        ctx.submitOrder({ side: "BUY", type: "MARKET", qty: 500 });
      }
    }
  }

  const res = runReplay(bars, new BigOrderStrategy(), {
    initialCapital: 100000,
    riskLimits: { maxOrderNotional: 25000 },
    feePct: 0,
    slippagePct: 0,
  });

  assert.equal(res.trades.length, 0);
  assert.equal(res.rejections.length, 1);
  assert.match(res.rejections[0].reason, /Order notional .* exceeds maximum limit/);
  assert.equal(res.equity[res.equity.length - 1].value, 100000);
});

test("risk-controls: maxDailyLoss rejects new orders once daily loss threshold is breached", () => {
  const baseT = 1699960000; // 11:06:40 UTC on 2023-11-14
  const bars = [
    { time: baseT, open: 100, high: 105, low: 95, close: 100, volume: 100, symbol: "TEST", timeframe: "1h" },
    { time: baseT + 3600, open: 100, high: 102, low: 70, close: 80, volume: 100, symbol: "TEST", timeframe: "1h" }, // stopped out at 90 (-$1,000)
    { time: baseT + 7200, open: 80, high: 85, low: 75, close: 80, volume: 100, symbol: "TEST", timeframe: "1h" },   // attempts order, rejected
    { time: baseT + 10800, open: 80, high: 85, low: 75, close: 80, volume: 100, symbol: "TEST", timeframe: "1h" },
  ];

  class SerialTraderStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) {
        ctx.submitOrder({ side: "BUY", type: "MARKET", qty: 100, stopLossPct: 10 });
      } else if (ctx.index === 1) {
        ctx.submitOrder({ side: "BUY", type: "MARKET", qty: 100 });
      }
    }
  }

  const res = runReplay(bars, new SerialTraderStrategy(), {
    initialCapital: 50000,
    riskLimits: { maxDailyLoss: 1000 },
    feePct: 0,
    slippagePct: 0,
  });

  assert.equal(res.trades.length, 1);
  assert.ok(res.rejections.length >= 1);
  assert.match(res.rejections[0].reason, /Daily loss limit .* reached/);
});

// ============================================================================
// 6. Comprehensive Metrics & Edge Cases
// ============================================================================

test("metrics: zero trades returns structured zeros and nulls with NO NaN or Infinity", () => {
  const metrics = computeBacktestMetrics([], [{ time: 1000, value: 10000 }], [], { initialCapital: 10000 });
  assert.equal(metrics.totalTrades, 0);
  assert.equal(metrics.winRatePct, 0);
  assert.equal(metrics.lossRatePct, 0);
  assert.equal(metrics.profitFactor, 0);
  assert.equal(metrics.expectancyPct, null);
  assert.equal(metrics.expectancyPerTrade, 0);
  assert.equal(metrics.maxDrawdownPct, 0);
  assert.equal(metrics.maxDrawdownDurationBars, 0);
  assert.equal(metrics.cagrPct, null);
  assert.equal(metrics.sharpe, null);
  assert.equal(metrics.sortino, null);
  assert.equal(metrics.turnoverPct, 0);

  // Assert no property is NaN
  for (const [k, v] of Object.entries(metrics)) {
    if (typeof v === "number") {
      assert.ok(!Number.isNaN(v), `Property ${k} should not be NaN`);
    }
  }
});

test("metrics: zero losing trades returns null profitFactor with clean explanatory note", () => {
  const trades = [
    { pnl: 500, pnlPct: 5, entryPrice: 100, exitPrice: 105, qty: 100, bars: 2, fees: 5, slippage: 2 },
    { pnl: 300, pnlPct: 3, entryPrice: 100, exitPrice: 103, qty: 100, bars: 1, fees: 5, slippage: 2 },
  ];
  const equity = [
    { time: 1000, value: 10000 },
    { time: 2000, value: 10500 },
    { time: 3000, value: 10800 },
  ];
  const metrics = computeBacktestMetrics(trades, equity, [], { initialCapital: 10000 });
  assert.equal(metrics.totalTrades, 2);
  assert.equal(metrics.winRatePct, 100);
  assert.equal(metrics.profitFactor, null);
  assert.equal(metrics.profitFactorNote, "No losing trades");
  assert.equal(metrics.expectancyPct, 4); // (1.0 * 4%) - (0 * 0%)
  assert.equal(metrics.expectancyPerTrade, 400); // 800 / 2
});

test("metrics: verifies mathematical expectancy formula across winning and losing trades", () => {
  const trades = [
    { pnl: 200, pnlPct: 10, entryPrice: 100, exitPrice: 110, qty: 20, bars: 1 },
    { pnl: -100, pnlPct: -5, entryPrice: 100, exitPrice: 95, qty: 20, bars: 1 },
  ];
  const equity = [
    { time: 1000, value: 10000 },
    { time: 2000, value: 10200 },
    { time: 3000, value: 10100 },
  ];
  const metrics = computeBacktestMetrics(trades, equity, [], { initialCapital: 10000 });
  // Win rate 50%, Avg win 10%, Loss rate 50%, Avg loss -5%
  // Expectancy = (0.5 * 10) - (0.5 * 5) = 5 - 2.5 = 2.5%
  assert.equal(metrics.expectancyPct, 2.5);
  assert.equal(metrics.expectancyPerTrade, 50); // 100 net profit / 2 trades
});

// ============================================================================
// 7. Data Partitioning & Walk-Forward Validation
// ============================================================================

test("validation: splitBars partitions data chronologically without leakage", () => {
  const bars = Array.from({ length: 100 }, (_, i) => makeBar(i, 100, 105, 95, 100));
  const splits = splitBars(bars, { trainPct: 0.6, valPct: 0.2, testPct: 0.2 });

  assert.equal(splits.train.length, 60);
  assert.equal(splits.val.length, 20);
  assert.equal(splits.test.length, 20);

  // Strictly contiguous and increasing timestamps
  assert.ok(splits.train.at(-1).time < splits.val[0].time);
  assert.ok(splits.val.at(-1).time < splits.test[0].time);
  assert.equal(splits.metadata.totalBars, 100);
});

test("validation: walkForwardValidation optimizes on In-Sample and scores on Out-of-Sample", () => {
  const paramGrid = [
    { fastLength: 5, slowLength: 15 },
    { fastLength: 9, slowLength: 21 },
    { fastLength: 12, slowLength: 26 },
  ];

  const wf = walkForwardValidation(
    fixtureBars,
    (params) => new ReferenceEmaCrossStrategy(params),
    paramGrid,
    { folds: 3, isRatio: 0.6 },
  );

  assert.equal(wf.folds.length, 3);
  for (const fold of wf.folds) {
    assert.ok(fold.isRange.bars > 0);
    assert.ok(fold.oosRange.bars > 0);
    assert.ok(fold.chosenParams.fastLength);
  }
  assert.ok(typeof wf.avgIsSharpe === "number");
  assert.ok(typeof wf.avgOosSharpe === "number");
});

// ============================================================================
// 8. Reference Strategies Execution & Disclaimers
// ============================================================================

test("reference-strategies: all reference strategies run to completion and contain non-profit disclaimers", () => {
  const s1 = new ReferenceEmaCrossStrategy();
  const s2 = new ReferenceBreakoutStrategy();
  const s3 = new ReferenceRsiMeanReversionStrategy();

  assert.match(s1.disclaimer, /Does NOT imply profitability/);
  assert.match(s2.disclaimer, /Does NOT imply profitability/);
  assert.match(s3.disclaimer, /Does NOT imply profitability/);

  const r1 = runReplay(fixtureBars, s1);
  const r2 = runReplay(fixtureBars, s2);
  const r3 = runReplay(fixtureBars, s3);

  assert.ok(r1.trades.length > 0);
  assert.ok(r2.trades.length > 0);
  assert.ok(r3.trades.length > 0);

  assert.equal(r1.equity.length, fixtureBars.length);
  assert.equal(r2.equity.length, fixtureBars.length);
  assert.equal(r3.equity.length, fixtureBars.length);
});

// ============================================================================
// 9. Paper Account File Invariant
// ============================================================================

test("paper-account: backtesting never alters data/paper-account.json", () => {
  const paperFile = new URL("../data/paper-account.json", import.meta.url);
  const beforeHash = crypto.createHash("sha256").update(fs.readFileSync(paperFile)).digest("hex");

  // Run backtests and validations
  runReplay(fixtureBars, new ReferenceEmaCrossStrategy());
  runReplay(fixtureBars, new ReferenceBreakoutStrategy());
  validateHistoricalBars(fixtureBars);

  const afterHash = crypto.createHash("sha256").update(fs.readFileSync(paperFile)).digest("hex");
  assert.equal(afterHash, beforeHash, "data/paper-account.json must remain completely untouched");
});
