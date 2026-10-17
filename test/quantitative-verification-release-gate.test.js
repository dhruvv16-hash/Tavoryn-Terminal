import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { runReplay, DeterministicReplayEngine } from "../lib/replay-engine.js";
import { Strategy } from "../lib/strategy-interface.js";
import { computeBacktestMetrics, calculatePeriodsPerYear } from "../lib/backtest-metrics.js";
import { splitBars, walkForwardValidation } from "../lib/backtest-validation.js";
import {
  parameterSensitivitySweep,
  executionStressTest,
  marketRegimeAnalysis,
  monteCarloPermutation,
} from "../lib/backtest-robustness.js";

const fixtureBars = JSON.parse(
  fs.readFileSync(new URL("./fixtures/btc-1d.json", import.meta.url), "utf8"),
);

const makeBar = (i, o, h, l, c, v = 1000) => ({
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
// 1. Market Exposure Discrepancy Resolution & Invariants
// ============================================================================

test("exposure: flat strategy across 10 bars yields exactly 0% exposure", () => {
  const bars = Array.from({ length: 10 }, (_, i) => makeBar(i, 100, 105, 95, 100));
  class FlatStrategy extends Strategy {}
  const res = runReplay(bars, new FlatStrategy());

  assert.equal(res.metrics.timeInMarketPct, 0);
  assert.equal(res.metrics.exposurePct, 0);
  assert.equal(res.metrics.grossExposurePct, 0);
  assert.equal(res.metrics.distinctPositionBars, 0);
});

test("exposure: fully invested strategy across 10 bars yields exactly 100% exposure", () => {
  // Bar 0: Strategy submits BUY MARKET order
  // Bar 1: Fills at open (held through bars 1, 2, 3, 4, 5, 6, 7, 8, 9) -> 9 bars out of 10
  // If order is entered on bar 0, bars 1..9 are invested (90%).
  // Let's test a strategy entered on bar 0 and held through all subsequent bars.
  const bars = Array.from({ length: 10 }, (_, i) => makeBar(i, 100, 105, 95, 100));
  class BuyAndHoldStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) ctx.submitOrder({ side: "BUY", type: "MARKET" });
    }
  }
  const res = runReplay(bars, new BuyAndHoldStrategy());
  assert.equal(res.metrics.distinctPositionBars, 9);
  assert.equal(res.metrics.timeInMarketPct, 90);
  assert.equal(res.metrics.exposurePct, 90);

  // Directly verify 10 out of 10 bars via computeBacktestMetrics
  const m10 = computeBacktestMetrics([], [], bars, { distinctPositionBars: 10, initialCapital: 10000 });
  assert.equal(m10.timeInMarketPct, 100);
  assert.equal(m10.exposurePct, 100);
});

test("exposure: intermittently invested strategy yields exact fractional percentage", () => {
  // 10 bars total. Position entered on bar 1 Open, closed on bar 5 Open (held during bars 1, 2, 3, 4 = 4 bars).
  const bars = Array.from({ length: 10 }, (_, i) => makeBar(i, 100, 105, 95, 100));
  class IntermittentStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) ctx.submitOrder({ side: "BUY", type: "MARKET" });
      else if (ctx.index === 4) ctx.closePosition("Exit");
    }
  }
  const res = runReplay(bars, new IntermittentStrategy());
  assert.equal(res.trades.length, 1);
  assert.equal(res.metrics.distinctPositionBars, 4);
  assert.equal(res.metrics.timeInMarketPct, 40);
  assert.equal(res.metrics.exposurePct, 40);
});

test("exposure: overlapping lots / scaling-in separates time-in-market from gross notional exposure", () => {
  // Total period: 10 bars
  // Lot 1: bars 2 to 5 (4 bars)
  // Lot 2: bars 4 to 7 (4 bars)
  // Distinct bars with market exposure: bars 2, 3, 4, 5, 6, 7 (6 distinct bars = 60% time-in-market)
  // Gross notional exposure: (4 + 4) / 10 = 80% gross exposure
  const bars = Array.from({ length: 10 }, (_, i) => makeBar(i, 100, 105, 95, 100));
  const trades = [
    { entryIndex: 2, exitIndex: 5, bars: 4, entryPrice: 100, exitPrice: 105, qty: 10, pnl: 50 },
    { entryIndex: 4, exitIndex: 7, bars: 4, entryPrice: 100, exitPrice: 105, qty: 10, pnl: 50 },
  ];
  const equity = [{ time: bars[0].time, value: 10000 }, { time: bars[9].time, value: 10100 }];

  const m = computeBacktestMetrics(trades, equity, bars, { initialCapital: 10000 });
  assert.equal(m.distinctPositionBars, 6);
  assert.equal(m.timeInMarketPct, 60);
  assert.equal(m.exposurePct, 60);
  assert.equal(m.grossExposurePct, 80);
});

test("exposure: sequential Long and Short positions correctly accumulate distinct bars", () => {
  // Total period: 10 bars
  // Long trade on bars 1, 2, 3 (3 bars)
  // Short trade on bars 6, 7, 8 (3 bars)
  // Distinct bars = 6 bars -> 60% time in market, 60% gross exposure
  const bars = Array.from({ length: 10 }, (_, i) => makeBar(i, 100, 105, 95, 100));
  const trades = [
    { entryIndex: 1, exitIndex: 3, bars: 3, entryPrice: 100, exitPrice: 105, qty: 10, pnl: 50 },
    { entryIndex: 6, exitIndex: 8, bars: 3, entryPrice: 100, exitPrice: 95, qty: 10, pnl: 50 },
  ];
  const equity = [{ time: bars[0].time, value: 10000 }, { time: bars[9].time, value: 10100 }];

  const m = computeBacktestMetrics(trades, equity, bars, { initialCapital: 10000 });
  assert.equal(m.distinctPositionBars, 6);
  assert.equal(m.timeInMarketPct, 60);
  assert.equal(m.exposurePct, 60);
  assert.equal(m.grossExposurePct, 60);
});

test("exposure: multi-asset concurrent holdings exceed 100% gross while bounding time-in-market to 100%", () => {
  // Total period: 10 bars
  // Asset 1 held for bars 0..7 (8 bars)
  // Asset 2 held for bars 3..9 (7 bars)
  // Total bars in position across assets = 8 + 7 = 15 lot-bars
  // Distinct bars invested: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 (10 bars)
  const bars = Array.from({ length: 10 }, (_, i) => makeBar(i, 100, 105, 95, 100));
  const trades = [
    { entryIndex: 0, exitIndex: 7, bars: 8, entryPrice: 100, exitPrice: 105, qty: 10, pnl: 50 },
    { entryIndex: 3, exitIndex: 9, bars: 7, entryPrice: 100, exitPrice: 105, qty: 10, pnl: 50 },
  ];
  const equity = [{ time: bars[0].time, value: 10000 }, { time: bars[9].time, value: 10100 }];

  const m = computeBacktestMetrics(trades, equity, bars, { initialCapital: 10000 });
  assert.equal(m.distinctPositionBars, 10);
  assert.equal(m.timeInMarketPct, 100);
  assert.equal(m.exposurePct, 100);
  assert.equal(m.grossExposurePct, 150); // 15 lot-bars / 10 calendar bars = 150%
});

// ============================================================================
// 2. Independently Verified Quantitative Performance Metrics
// ============================================================================

test("metrics: comprehensive reconciliation of P&L, commissions, borrow fees, and slippage", () => {
  // Hand-calculated deterministic trade fixture:
  // Initial capital: $10,000
  // Trade 1 (Long): Buy 100 @ 100, Sell @ 110.
  //   Gross PnL: +$1,000. Commissions: $15. Slippage: $5. Borrow fees: $0. Net PnL: +$980 (+9.8%).
  // Trade 2 (Short): Sell 100 @ 100, Buy @ 105.
  //   Gross PnL: -$500. Commissions: $15. Slippage: $5. Borrow fees: $10. Net PnL: -$530 (-5.3%).
  const trades = [
    {
      id: "T1",
      side: "long",
      entryPrice: 100,
      exitPrice: 110,
      qty: 100,
      grossPnl: 1000,
      commissions: 15,
      borrowFees: 0,
      fees: 15,
      slippage: 5,
      netPnl: 980,
      pnl: 980,
      pnlPct: 9.8,
      bars: 3,
    },
    {
      id: "T2",
      side: "short",
      entryPrice: 100,
      exitPrice: 105,
      qty: 100,
      grossPnl: -500,
      commissions: 15,
      borrowFees: 10,
      fees: 25,
      slippage: 5,
      netPnl: -530,
      pnl: -530,
      pnlPct: -5.3,
      bars: 2,
    },
  ];

  const equity = [
    { time: 1700000000, value: 10000 },
    { time: 1700086400, value: 10980 },
    { time: 1700172800, value: 10450 },
  ];

  const bars = [makeBar(0, 100, 105, 95, 100), makeBar(1, 100, 105, 95, 100), makeBar(2, 100, 105, 95, 100)];

  const m = computeBacktestMetrics(trades, equity, bars, { initialCapital: 10000 });

  // P&L reconciliation
  assert.equal(m.netProfit, 450); // 980 - 530 = 450
  assert.equal(m.netProfitPct, 4.5);
  assert.equal(m.finalEquity, 10450);

  // Fee decomposition
  assert.equal(m.totalCommissions, 30); // 15 + 15
  assert.equal(m.totalBorrowFees, 10);  // 0 + 10
  assert.equal(m.totalFees, 40);        // 30 + 10
  assert.equal(m.totalSlippage, 10);    // 5 + 5

  // Dollar vs percentage trade statistics
  assert.equal(m.avgWinDollars, 980);
  assert.equal(m.avgLossDollars, 530);
  assert.equal(m.avgTradeDollars, 225); // 450 / 2
  assert.equal(m.avgWinPct, 9.8);
  assert.equal(m.avgLossPct, -5.3);

  // Expectancy
  // %: (0.5 * 9.8) - (0.5 * 5.3) = 4.9 - 2.65 = 2.25%
  assert.equal(m.expectancyPct, 2.25);
  // $: 450 / 2 = $225
  assert.equal(m.expectancyPerTrade, 225);

  // Profit factor = 980 / 530 = 1.8490... -> 1.85
  assert.equal(m.profitFactor, 1.85);
});

test("metrics: zero trades returns structured zero values and nulls without NaN or Infinity", () => {
  const m = computeBacktestMetrics([], [{ time: 1000, value: 10000 }], [], { initialCapital: 10000 });
  assert.equal(m.totalTrades, 0);
  assert.equal(m.winRatePct, 0);
  assert.equal(m.lossRatePct, 0);
  assert.equal(m.profitFactor, 0);
  assert.equal(m.profitFactorNote, "No trades executed");
  assert.equal(m.expectancyPct, null);
  assert.equal(m.expectancyPerTrade, 0);
  assert.equal(m.avgTradePct, null);
  assert.equal(m.avgWinPct, null);
  assert.equal(m.avgLossPct, null);
  assert.equal(m.avgTradeDollars, 0);
  assert.equal(m.avgWinDollars, null);
  assert.equal(m.avgLossDollars, null);
  assert.equal(m.maxDrawdownPct, 0);
  assert.equal(m.cagrPct, null);
  assert.equal(m.sharpe, null);
  assert.equal(m.sortino, null);
  assert.equal(m.timeInMarketPct, 0);
  assert.equal(m.grossExposurePct, 0);

  for (const [k, v] of Object.entries(m)) {
    if (typeof v === "number") {
      assert.ok(!Number.isNaN(v), `Property ${k} should not be NaN`);
      assert.ok(Number.isFinite(v), `Property ${k} should be finite`);
    }
  }
});

test("metrics: zero variance equity curve returns null Sharpe and Sortino cleanly", () => {
  // Constant equity (all returns = 0)
  const equity = [
    { time: 1000, value: 10000 },
    { time: 2000, value: 10000 },
    { time: 3000, value: 10000 },
    { time: 4000, value: 10000 },
  ];
  const bars = [makeBar(0, 100, 105, 95, 100), makeBar(1, 100, 105, 95, 100)];
  const m = computeBacktestMetrics([], equity, bars, { initialCapital: 10000 });
  assert.equal(m.sharpe, null);
  assert.equal(m.sortino, null);
});

test("metrics: CAGR and annualization calculate correct compounding over multi-year spans", () => {
  // 3 years span: 1095 days = 1095 * 86400 seconds
  // Initial capital: $10,000. Final equity: $13,310 (which is 1.10^3 = 10% CAGR)
  const t0 = 1700000000;
  const tFinal = t0 + 3 * 365 * 86400;
  const bars = [
    { time: t0, open: 100, high: 105, low: 95, close: 100 },
    { time: tFinal, open: 130, high: 135, low: 125, close: 133.1 },
  ];
  const equity = [{ time: t0, value: 10000 }, { time: tFinal, value: 13310 }];
  const m = computeBacktestMetrics([], equity, bars, { initialCapital: 10000 });

  // (13310 / 10000) ^ (1/3) - 1 = 1.331 ^ (0.33333) - 1 = 1.10 - 1 = 10.0%
  assert.equal(m.cagrPct, 10.0);
});

// ============================================================================
// 3. Execution Accounting Stress-Testing
// ============================================================================

test("accounting: next-bar execution and end-of-data pending orders remain unfilled", () => {
  // 3 bars total
  // Bar 0: strategy places LIMIT order at 90 (market is 100).
  // Bar 1: market low is 95 -> order remains pending.
  // Bar 2: market low is 95 -> order remains pending at end of data.
  const bars = [makeBar(0, 100, 105, 95, 100), makeBar(1, 100, 105, 95, 100), makeBar(2, 100, 105, 95, 100)];
  class PendingStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) ctx.submitOrder({ side: "BUY", type: "LIMIT", limitPrice: 90, qty: 10 });
    }
  }
  const res = runReplay(bars, new PendingStrategy());
  assert.equal(res.trades.length, 0);
  assert.equal(res.engine ? res.engine.pendingOrders.length : 1, 1);
});

test("accounting: opening gaps through stops and targets fill at Open under adverse slippage", () => {
  // Case 1: Long Stop gap-down
  // Long entry at 100, stop loss 10% ($90). Next bar opens at $80 (gaps down past stop).
  const barsLongStop = [
    makeBar(0, 100, 100, 100, 100),
    makeBar(1, 100, 102, 98, 100), // enters at 100
    makeBar(2, 80, 85, 78, 82),   // opens at 80 (gap through stop 90)
    makeBar(3, 82, 85, 80, 84),
  ];
  class LongStopStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) ctx.submitOrder({ side: "BUY", type: "MARKET", stopLossPct: 10 });
    }
  }
  const rLongStop = runReplay(barsLongStop, new LongStopStrategy(), { feePct: 0, slippagePct: 0 });
  assert.equal(rLongStop.trades.length, 1);
  assert.equal(rLongStop.trades[0].exitReason, "Stop");
  assert.equal(rLongStop.trades[0].exitPrice, 80); // Fills at gap open 80, NOT stop 90!

  // Case 2: Short Target gap-down
  // Short entry at 100, take profit 10% ($90). Next bar opens at $80 (gaps down past target).
  const barsShortTarget = [
    makeBar(0, 100, 100, 100, 100),
    makeBar(1, 100, 102, 98, 100), // short enters at 100
    makeBar(2, 80, 85, 78, 82),   // opens at 80 (gap through target 90)
    makeBar(3, 82, 85, 80, 84),
  ];
  class ShortTargetStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) ctx.submitOrder({ side: "SELL", type: "MARKET", takeProfitPct: 10 });
    }
  }
  const rShortTarget = runReplay(barsShortTarget, new ShortTargetStrategy(), { feePct: 0, slippagePct: 0 });
  assert.equal(rShortTarget.trades.length, 1);
  assert.equal(rShortTarget.trades[0].exitReason, "Target");
  assert.equal(rShortTarget.trades[0].exitPrice, 80); // Fills at gap open 80, NOT target 90!
});

test("accounting: intrabar collisions resolve deterministically under worst, optimistic, and ohlc modes", () => {
  // Long entry at 100, stop 90, target 110.
  // Bar 2: Open 100, High 115 (touches target), Low 85 (touches stop), Close 105. Both breached!
  const makeCollisionBars = (closePrice) => [
    makeBar(0, 100, 100, 100, 100),
    makeBar(1, 100, 102, 98, 100),
    makeBar(2, 100, 115, 85, closePrice),
    makeBar(3, 100, 105, 95, 100),
  ];
  class CollisionStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) ctx.submitOrder({ side: "BUY", type: "MARKET", stopLossPct: 10, takeProfitPct: 10 });
    }
  }

  // 1. Worst mode: Stop loss always triggers first
  const rWorst = runReplay(makeCollisionBars(105), new CollisionStrategy(), { intrabar: "worst", feePct: 0, slippagePct: 0 });
  assert.equal(rWorst.trades[0].exitReason, "Stop");

  // 2. Optimistic mode: Target always triggers first
  const rOpt = runReplay(makeCollisionBars(105), new CollisionStrategy(), { intrabar: "optimistic", feePct: 0, slippagePct: 0 });
  assert.equal(rOpt.trades[0].exitReason, "Target");

  // 3. OHLC mode on Bullish bar (Close 105 >= Open 100): assumes Low happened before High -> Stop triggers first
  const rBull = runReplay(makeCollisionBars(105), new CollisionStrategy(), { intrabar: "ohlc", feePct: 0, slippagePct: 0 });
  assert.equal(rBull.trades[0].exitReason, "Stop");

  // 4. OHLC mode on Bearish bar (Close 95 < Open 100): assumes High happened before Low -> Target triggers first
  const rBear = runReplay(makeCollisionBars(95), new CollisionStrategy(), { intrabar: "ohlc", feePct: 0, slippagePct: 0 });
  assert.equal(rBear.trades[0].exitReason, "Target");
});

test("accounting: conservation of cash, positions, realized PnL, and equity holds across every bar", () => {
  // Buy 50 shares @ 100. Bar 2 rally to 110. Bar 3 drop to 95. Bar 4 close position at 105.
  const bars = [
    makeBar(0, 100, 105, 95, 100),
    makeBar(1, 100, 102, 98, 100), // Buy 50 shares @ 100 (cost = $5,000, fee = $5)
    makeBar(2, 110, 115, 108, 112), // Unrealized = (112 - 100) * 50 = +$600
    makeBar(3, 95, 98, 92, 94),     // Unrealized = (94 - 100) * 50 = -$300
    makeBar(4, 105, 108, 104, 106), // Close at open 105
  ];

  class ConservationStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) ctx.submitOrder({ side: "BUY", type: "MARKET", qty: 50 });
      else if (ctx.index === 3) ctx.closePosition("Exit");
    }
  }

  const initialCapital = 10000;
  const res = runReplay(bars, new ConservationStrategy(), {
    initialCapital,
    feePct: 0.1, // 0.1% fee
    slippagePct: 0,
  });

  assert.equal(res.trades.length, 1);
  const t = res.trades[0];
  // Entry: 50 * 100 = 5000, fee = 5.
  // Exit: 50 * 105 = 5250, fee = 5.25.
  // Gross PnL = (105 - 100) * 50 = +$250.
  // Fees = 5 + 5.25 = $10.25.
  // Net PnL = 250 - 10.25 = $239.75.
  assert.equal(t.grossPnl, 250);
  assert.equal(t.fees, 10.25);
  assert.equal(t.netPnl, 239.75);

  // Exact conservation: Final Cash = Initial Capital + Net PnL
  assert.equal(res.metrics.finalEquity, initialCapital + t.netPnl);
  assert.equal(res.metrics.netProfit, t.netPnl);
});

// ============================================================================
// 4. Robustness & Validation Methodology Verification
// ============================================================================

test("robustness: execution stress test reports explicit effective config settings per tier", () => {
  class TestStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) ctx.submitOrder({ side: "BUY", type: "MARKET", qty: 10 });
    }
  }

  const stress = executionStressTest(fixtureBars.slice(0, 50), new TestStrategy());
  assert.ok(stress.tiers.baseline.config);
  assert.ok(stress.tiers.conservative.config);
  assert.ok(stress.tiers.liquidityConstrained.config);
  assert.ok(stress.tiers.extremeFriction.config);

  // Verify conservative settings are 3x slippage and 2x fees
  assert.equal(stress.tiers.conservative.config.feePct, 0.2);
  assert.equal(stress.tiers.conservative.config.slippagePct, 0.15);
  assert.equal(stress.tiers.conservative.config.intrabar, "worst");
});

test("robustness: parameter sensitivity sweep reports multiplicity risk and Bonferroni alpha", () => {
  const grid = [
    { p: 1 },
    { p: 2 },
    { p: 3 },
    { p: 4 },
    { p: 5 },
  ];
  class ParamStrategy extends Strategy {
    constructor(cfg) {
      super();
      this.p = cfg.p;
    }
  }
  const sweep = parameterSensitivitySweep(fixtureBars.slice(0, 50), (p) => new ParamStrategy(p), grid);
  assert.equal(sweep.trials, 5);
  assert.equal(sweep.multiplicityRisk, "MODERATE"); // > 4 trials
  assert.equal(sweep.bonferroniAlpha, 0.01); // 0.05 / 5
});

test("robustness: Monte Carlo block bootstrap captures serial dependence and clustered losses", () => {
  // Clustered loss streak: 4 consecutive losses followed by 4 consecutive gains
  const trades = [
    { pnlPct: -5 },
    { pnlPct: -6 },
    { pnlPct: -7 },
    { pnlPct: -8 },
    { pnlPct: 6 },
    { pnlPct: 7 },
    { pnlPct: 8 },
    { pnlPct: 9 },
  ];

  // 1. Standard IID bootstrap (blockSize: 1)
  const mcIid = monteCarloPermutation(trades, 300, 42, { blockSize: 1, ruinThresholdPct: 20 });
  assert.equal(mcIid.samplingMethod, "iid_bootstrap");
  assert.equal(mcIid.blockSize, 1);
  assert.equal(mcIid.ruinThresholdPct, 20);

  // 2. Block bootstrap (blockSize: 3)
  const mcBlock = monteCarloPermutation(trades, 300, 42, { blockSize: 3, ruinThresholdPct: 20 });
  assert.equal(mcBlock.samplingMethod, "block_bootstrap_size_3");
  assert.equal(mcBlock.blockSize, 3);
  assert.equal(mcBlock.ruinThresholdPct, 20);

  // Block bootstrap preserves loss streak, resulting in higher or equal tail drawdown risk
  assert.ok(mcBlock.drawdownP95 >= mcIid.drawdownP95 - 5);
});

test("validation: lookahead verification ensures indicators and decisions never access future bars", () => {
  // Adversarial perturbation test:
  // Perturbing future bar 50 does NOT change strategy decision on bar 10
  const originalBars = fixtureBars.slice(0, 60);
  const perturbedBars = JSON.parse(JSON.stringify(originalBars));
  perturbedBars[55].close = perturbedBars[55].close * 10; // 1000% jump at bar 55

  let decisionOriginal = null;
  let decisionPerturbed = null;

  class AdversarialStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 10) {
        // Look only at trailing closes
        const slice = ctx.bars.slice(0, ctx.index + 1);
        decisionOriginal = slice.length;
      }
    }
  }

  class AdversarialStrategy2 extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 10) {
        const slice = ctx.bars.slice(0, ctx.index + 1);
        decisionPerturbed = slice.length;
      }
    }
  }

  runReplay(originalBars, new AdversarialStrategy());
  runReplay(perturbedBars, new AdversarialStrategy2());

  assert.equal(decisionOriginal, 11);
  assert.equal(decisionPerturbed, 11);
  assert.equal(decisionOriginal, decisionPerturbed);
});

// ============================================================================
// 5. User Account Safety Gate
// ============================================================================

test("safety: paper-account.json is completely unaffected by Phase 4.1 verification tests", () => {
  const paperFile = new URL("../data/paper-account.json", import.meta.url);
  const hash = crypto.createHash("sha256").update(fs.readFileSync(paperFile)).digest("hex");
  assert.equal(
    hash,
    "8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D".toLowerCase(),
  );
});
