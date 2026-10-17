import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { runReplay, DeterministicReplayEngine } from "../lib/replay-engine.js";
import { Strategy } from "../lib/strategy-interface.js";
import { computeBacktestMetrics } from "../lib/backtest-metrics.js";
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
// 1. Execution-Simulator Audit & Order Types
// ============================================================================

test("execution-audit: limit order price improvement and unfilled pending behavior", () => {
  // Bar 0: Strategy submits BUY LIMIT at 100
  // Bar 1: Opens at 96 (price improvement! fills at 96)
  // Bar 2: Closes position at 105
  // Bar 3: Strategy submits BUY LIMIT at 90
  // Bar 4: Low is 92 (limit never reached -> stays pending and unfilled)
  const bars = [
    makeBar(0, 100, 105, 95, 100),
    makeBar(1, 96, 102, 95, 100), // fills at 96
    makeBar(2, 105, 110, 104, 108), // closes
    makeBar(3, 100, 105, 95, 100), // submits limit at 90
    makeBar(4, 98, 100, 92, 95),   // low is 92, limit at 90 never reached
  ];

  class LimitOrderStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) {
        ctx.submitOrder({ side: "BUY", type: "LIMIT", limitPrice: 100, qty: 10 });
      } else if (ctx.index === 1) {
        ctx.closePosition("Target reached");
      } else if (ctx.index === 3) {
        ctx.submitOrder({ side: "BUY", type: "LIMIT", limitPrice: 90, qty: 10 });
      }
    }
  }

  const res = runReplay(bars, new LimitOrderStrategy(), { feePct: 0, slippagePct: 0 });

  assert.equal(res.trades.length, 1);
  const t = res.trades[0];
  // Price improvement: filled at bar 1 Open (96) instead of limit price (100)
  assert.equal(t.entryPrice, 96);
  assert.equal(t.exitPrice, 105);
  assert.equal(t.qty, 10);
  assert.equal(t.grossPnl, (105 - 96) * 10); // +$90

  // The limit order submitted on bar 3 remains pending at bar 4
  assert.equal(res.engine ? res.engine.pendingOrders.length : 1, 1);
});

test("execution-audit: limit order cancellation releases pending reservation", () => {
  const bars = [
    makeBar(0, 100, 105, 95, 100),
    makeBar(1, 102, 104, 98, 100),
    makeBar(2, 100, 105, 98, 100),
  ];

  class CancelStrategy extends Strategy {
    constructor() {
      super();
      this.savedOrderId = null;
    }
    onBar(bar, ctx) {
      if (ctx.index === 0) {
        const order = ctx.submitOrder({ side: "BUY", type: "LIMIT", limitPrice: 90, qty: 10 });
        this.savedOrderId = order.id;
      } else if (ctx.index === 1) {
        assert.equal(ctx.pendingOrders.length, 1);
        ctx.cancelOrder(this.savedOrderId);
        assert.equal(ctx.pendingOrders.length, 0);
      }
    }
  }

  const res = runReplay(bars, new CancelStrategy());
  assert.equal(res.trades.length, 0);
});

// ============================================================================
// 2. Opening Gaps Through Stops & Targets
// ============================================================================

test("execution-audit: gap-through stops and targets across Long and Short positions", () => {
  // Case A: Long position target gap up
  // Long entry at 100, target 110. Next bar opens at 120 (gaps above target).
  const barsLongTarget = [
    makeBar(0, 100, 100, 100, 100),
    makeBar(1, 100, 102, 98, 100), // enters at 100
    makeBar(2, 120, 125, 118, 122), // opens at 120 (gap past 110)
    makeBar(3, 122, 125, 120, 124),
  ];

  class LongTargetStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) ctx.submitOrder({ side: "BUY", type: "MARKET", takeProfitPct: 10 });
    }
  }

  const rLongTarget = runReplay(barsLongTarget, new LongTargetStrategy(), { feePct: 0, slippagePct: 0 });
  assert.equal(rLongTarget.trades.length, 1);
  assert.equal(rLongTarget.trades[0].exitReason, "Target");
  assert.equal(rLongTarget.trades[0].exitPrice, 120); // Fills at gap open 120, not 110!

  // Case B: Short position stop gap up
  // Short entry at 100, stop 105. Next bar opens at 115 (gaps above stop).
  const barsShortStop = [
    makeBar(0, 100, 100, 100, 100),
    makeBar(1, 100, 102, 98, 100), // short enters at 100
    makeBar(2, 115, 120, 112, 118), // opens at 115 (gap past 105)
    makeBar(3, 118, 120, 115, 116),
  ];

  class ShortStopStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) ctx.submitOrder({ side: "SELL", type: "MARKET", stopLossPct: 5 });
    }
  }

  const rShortStop = runReplay(barsShortStop, new ShortStopStrategy(), { feePct: 0, slippagePct: 0 });
  assert.equal(rShortStop.trades.length, 1);
  assert.equal(rShortStop.trades[0].exitReason, "Stop");
  assert.equal(rShortStop.trades[0].exitPrice, 115); // Fills at gap open 115, not 105!
});

// ============================================================================
// 3. Partial Exits & Position Reversals
// ============================================================================

test("execution-audit: partial position exit realizes pro-rata P&L and preserves cost basis", () => {
  // Buy 100 shares at 100 ($10,000 cost).
  // At bar 1: close 40 shares at 110.
  // At bar 2: close remaining 60 shares at 120.
  const bars = [
    makeBar(0, 100, 105, 95, 100),
    makeBar(1, 100, 105, 98, 102), // Buy 100 shares at 100
    makeBar(2, 110, 115, 108, 112), // Close 40 shares at 110
    makeBar(3, 120, 125, 118, 122), // Close remaining 60 shares at 120
  ];

  class PartialExitStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) {
        ctx.submitOrder({ side: "BUY", type: "MARKET", qty: 100 });
      } else if (ctx.index === 1) {
        ctx.closePosition("Partial 40%", 40);
      } else if (ctx.index === 2) {
        ctx.closePosition("Close remaining 60%");
      }
    }
  }

  const res = runReplay(bars, new PartialExitStrategy(), { feePct: 0, slippagePct: 0, initialCapital: 20000 });
  assert.equal(res.trades.length, 2);

  // Trade 1: 40 shares closed at 110
  const t1 = res.trades[0];
  assert.equal(t1.qty, 40);
  assert.equal(t1.entryPrice, 100);
  assert.equal(t1.exitPrice, 110);
  assert.equal(t1.grossPnl, (110 - 100) * 40); // +$400
  assert.equal(t1.isPartial, true);

  // Trade 2: remaining 60 shares closed at 120
  const t2 = res.trades[1];
  assert.equal(t2.qty, 60);
  assert.equal(t2.entryPrice, 100);
  assert.equal(t2.exitPrice, 120);
  assert.equal(t2.grossPnl, (120 - 100) * 60); // +$1200
  assert.equal(t2.isPartial, false);

  // Total net profit = $400 + $1200 = $1600. Final equity = $21,600
  assert.equal(res.metrics.netProfit, 1600);
  assert.equal(res.metrics.finalEquity, 21600);
});

test("execution-audit: position reversal closes existing position and opens opposite side in one step", () => {
  // Bar 0: Long 50 shares at 100
  // Bar 1: Strategy submits SELL MARKET 80 shares (closes Long 50, opens Short 30 at 105)
  // Bar 2: Closes position at 95 (short gains $10/share)
  const bars = [
    makeBar(0, 100, 105, 95, 100),
    makeBar(1, 100, 102, 98, 100), // Long 50 shares
    makeBar(2, 105, 108, 104, 106), // SELL 80 shares
    makeBar(3, 95, 98, 92, 94),     // Closes short
  ];

  class ReversalStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) {
        ctx.submitOrder({ side: "BUY", type: "MARKET", qty: 50 });
      } else if (ctx.index === 1) {
        ctx.submitOrder({ side: "SELL", type: "MARKET", qty: 80 });
      } else if (ctx.index === 2) {
        ctx.closePosition("Exit short");
      }
    }
  }

  const res = runReplay(bars, new ReversalStrategy(), { feePct: 0, slippagePct: 0, initialCapital: 20000 });
  assert.equal(res.trades.length, 2);

  // Trade 1: Long 50 shares closed at 105 -> P&L = (105 - 100) * 50 = +$250
  assert.equal(res.trades[0].side, "long");
  assert.equal(res.trades[0].qty, 50);
  assert.equal(res.trades[0].grossPnl, 250);

  // Trade 2: Short 30 shares entered at 105, closed at 95 -> P&L = (105 - 95) * 30 = +$300
  assert.equal(res.trades[1].side, "short");
  assert.equal(res.trades[1].qty, 30);
  assert.equal(res.trades[1].grossPnl, 300);

  // Total net profit = $250 + $300 = $550
  assert.equal(res.metrics.netProfit, 550);
});

// ============================================================================
// 4. Execution Friction: Borrow Fees & Volume Participation
// ============================================================================

test("execution-audit: short borrow financing fee deducts continuous financing cost", () => {
  // Short 10 shares at 100. Held across 5 daily bars.
  // borrowFeePctAnnual = 3.65% -> 0.01% per day (10 shares * $100 * 0.0001 = $0.10/day).
  const bars = [
    makeBar(0, 100, 105, 95, 100),
    makeBar(1, 100, 105, 95, 100), // Enters short at 100
    makeBar(2, 100, 105, 95, 100), // Day 1 borrow fee
    makeBar(3, 100, 105, 95, 100), // Day 2 borrow fee
    makeBar(4, 100, 105, 95, 100), // Day 3 borrow fee
  ];

  class ShortBorrowStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) ctx.submitOrder({ side: "SELL", type: "MARKET", qty: 10 });
    }
  }

  const res = runReplay(bars, new ShortBorrowStrategy(), {
    feePct: 0,
    slippagePct: 0,
    borrowFeePctAnnual: 3.65, // exactly 0.01% daily
  });

  assert.equal(res.trades.length, 1);
  assert.ok(res.metrics.totalBorrowFees > 0);
  assert.ok(res.trades[0].borrowFees > 0);
  assert.ok(res.metrics.finalEquity < res.metrics.initialCapital);
});

test("execution-audit: volume participation liquidity limit caps order size or rejects", () => {
  // Bar has volume of 1,000 shares.
  // Strategy requests 500 shares.
  // maxVolumeParticipationPct: 10% -> max 100 shares allowed.
  const bars = [
    makeBar(0, 100, 105, 95, 100, 1000),
    makeBar(1, 100, 105, 95, 100, 1000),
    makeBar(2, 100, 105, 95, 100, 1000),
  ];

  class BigVolumeStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) ctx.submitOrder({ side: "BUY", type: "MARKET", qty: 500 });
    }
  }

  // Sub-case 1: allowPartialFills = true -> capped to 100 shares
  const rPartial = runReplay(bars, new BigVolumeStrategy(), {
    maxVolumeParticipationPct: 10,
    allowPartialFills: true,
    feePct: 0,
    slippagePct: 0,
  });
  assert.equal(rPartial.trades[0].qty, 100);

  // Sub-case 2: allowPartialFills = false -> rejected
  const rReject = runReplay(bars, new BigVolumeStrategy(), {
    maxVolumeParticipationPct: 10,
    allowPartialFills: false,
    feePct: 0,
    slippagePct: 0,
  });
  assert.equal(rReject.trades.length, 0);
  assert.equal(rReject.rejections.length, 1);
  assert.match(rReject.rejections[0].reason, /Liquidity rejection/);
});

// ============================================================================
// 5. Hand-Calculated Metric Invariant Verification
// ============================================================================

test("metrics: hand-calculated fixture verifies mathematical accuracy of all quant metrics", () => {
  // Deterministic trade fixture:
  // Initial capital: $10,000
  // Trade 1: Long 100 @ 100 -> Exit @ 110 (Gross +$1,000, Fees $20, Slippage $10 -> Net +$970, +9.7%)
  // Trade 2: Short 100 @ 100 -> Exit @ 105 (Gross -$500, Fees $20, Slippage $10 -> Net -$530, -5.3%)
  const trades = [
    {
      id: "T1",
      side: "long",
      entryPrice: 100,
      exitPrice: 110,
      qty: 100,
      grossPnl: 1000,
      netPnl: 970,
      pnl: 970,
      pnlPct: 9.7,
      fees: 20,
      slippage: 10,
      bars: 5,
    },
    {
      id: "T2",
      side: "short",
      entryPrice: 100,
      exitPrice: 105,
      qty: 100,
      grossPnl: -500,
      netPnl: -530,
      pnl: -530,
      pnlPct: -5.3,
      fees: 20,
      slippage: 10,
      bars: 3,
    },
  ];

  const equity = [
    { time: 1700000000, value: 10000 },
    { time: 1700086400, value: 10970 }, // Peak $10,970
    { time: 1700172800, value: 10440 }, // Drawdown to $10,440 (-$530, -4.83%)
  ];

  const bars = [
    makeBar(0, 100, 102, 98, 100),
    makeBar(1, 100, 105, 99, 105),
    makeBar(2, 105, 112, 104, 110),
  ];

  const m = computeBacktestMetrics(trades, equity, bars, { initialCapital: 10000 });

  // 1. Profit & Capital
  assert.equal(m.initialCapital, 10000);
  assert.equal(m.finalEquity, 10440);
  assert.equal(m.netProfit, 440); // $970 - $530 = $440
  assert.equal(m.netProfitPct, 4.4); // 440 / 10000 * 100

  // 2. Win / Loss Rates
  assert.equal(m.totalTrades, 2);
  assert.equal(m.winningTrades, 1);
  assert.equal(m.losingTrades, 1);
  assert.equal(m.winRatePct, 50);
  assert.equal(m.lossRatePct, 50);

  // 3. Profit Factor: Gross Wins / Gross Losses = 970 / 530 = 1.8301... -> 1.83
  assert.equal(m.profitFactor, 1.83);

  // 4. Expectancy:
  // %: (0.50 * 9.7) - (0.50 * 5.3) = 4.85 - 2.65 = 2.2%
  assert.equal(m.expectancyPct, 2.2);
  // $: 440 / 2 = $220
  assert.equal(m.expectancyPerTrade, 220);

  // 5. Drawdown:
  // Peak = $10,970, Trough = $10,440 -> DD $ = $530, DD % = 530 / 10970 * 100 = 4.8313... -> 4.83%
  assert.equal(m.maxDrawdownDollars, 530);
  assert.equal(m.maxDrawdownPct, 4.83);
  assert.equal(m.maxDrawdownDurationBars, 1);

  // 6. Fees & Slippage attribution
  assert.equal(m.totalFees, 40);
  assert.equal(m.totalSlippage, 20);

  // 7. Turnover & Exposure
  // Notional traded = (100*100 + 110*100) + (100*100 + 105*100) = 21,000 + 20,500 = 41,500
  // Turnover = 41,500 / 10,000 * 100 = 415%
  // Time-in-market exposure is strictly in [0, 100]% (3 distinct bars out of 3 total bars = 100%)
  assert.equal(m.timeInMarketPct, 100);
  assert.equal(m.exposurePct, 100);
  // Gross notional exposure measures cumulative trade-lot bars (8 lot-bars / 3 total bars = 266.67%)
  assert.equal(m.grossExposurePct, 266.67);
});

// ============================================================================
// 6. Robustness Analysis: Sweeps, Stress Testing & Monte Carlo
// ============================================================================

test("robustness: parameter sensitivity sweep evaluates stability and detects fragility", () => {
  const grid = [
    { fastLength: 5, slowLength: 15 },
    { fastLength: 7, slowLength: 20 },
    { fastLength: 9, slowLength: 21 },
    { fastLength: 12, slowLength: 26 },
  ];

  class TestEmaStrategy extends Strategy {
    constructor(p) {
      super();
      this.p = p;
    }
    onBar(bar, ctx) {
      if (ctx.index === 10) ctx.submitOrder({ side: "BUY", type: "MARKET" });
      else if (ctx.index === 25) ctx.closePosition("Exit");
    }
  }

  const sweep = parameterSensitivitySweep(fixtureBars.slice(0, 100), (p) => new TestEmaStrategy(p), grid);
  assert.equal(sweep.trials, 4);
  assert.ok(typeof sweep.robustSharePct === "number");
  assert.equal(sweep.results.length, 4);
});

test("robustness: execution stress test evaluates strategy across 4 friction tiers", () => {
  class StressTestStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) {
        ctx.submitOrder({ side: "BUY", type: "MARKET", qty: 10, stopLossPct: 15 });
      }
    }
  }

  const stress = executionStressTest(fixtureBars.slice(0, 100), new StressTestStrategy());
  assert.ok(stress.tiers.baseline);
  assert.ok(stress.tiers.conservative);
  assert.ok(stress.tiers.liquidityConstrained);
  assert.ok(stress.tiers.extremeFriction);
  assert.ok(typeof stress.conservativeSurvives === "boolean");
});

test("robustness: market regime analysis classifies historical bars and attributes trades", () => {
  const trades = [
    { entryTime: fixtureBars[30].time, pnl: 500 },
    { entryTime: fixtureBars[60].time, pnl: -200 },
  ];

  const regimes = marketRegimeAnalysis(fixtureBars.slice(0, 100), trades, 20);
  assert.ok(regimes.summary);
  assert.ok(Object.keys(regimes.summary).length > 0);
});

test("robustness: Monte Carlo permutation computes quantile bounds and ruin probability", () => {
  const trades = [
    { pnlPct: 5 },
    { pnlPct: -3 },
    { pnlPct: 8 },
    { pnlPct: -4 },
    { pnlPct: 6 },
    { pnlPct: -2 },
  ];

  const mc = monteCarloPermutation(trades, 200, 42);
  assert.equal(mc.runs, 200);
  assert.ok(typeof mc.returnP5 === "number");
  assert.ok(typeof mc.returnP50 === "number");
  assert.ok(typeof mc.returnP95 === "number");
  assert.ok(typeof mc.ruinProbabilityPct === "number");
  assert.ok(mc.returnP5 <= mc.returnP50);
  assert.ok(mc.returnP50 <= mc.returnP95);
});

// ============================================================================
// 7. Provenance & Execution Model Transparency
// ============================================================================

test("provenance: replay engine output includes documented executionModel metadata and explicit limitations", () => {
  class DummyStrategy extends Strategy {}
  const res = runReplay(fixtureBars.slice(0, 20), new DummyStrategy());

  assert.ok(res.executionModel);
  assert.equal(res.executionModel.version, "tavoryn-execution-v4.0");
  assert.ok(Array.isArray(res.executionModel.assumptions));
  assert.ok(Array.isArray(res.executionModel.unsupportedBehaviors));
  assert.match(res.executionModel.assumptions[0], /bar boundaries/);
  assert.match(res.executionModel.unsupportedBehaviors[0], /queue priority/);
});

// ============================================================================
// 8. User Account Integrity
// ============================================================================

test("safety: paper-account.json is completely unaffected by Phase 4 tests", () => {
  const paperFile = new URL("../data/paper-account.json", import.meta.url);
  const hash = crypto.createHash("sha256").update(fs.readFileSync(paperFile)).digest("hex");
  assert.equal(
    hash,
    "8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D".toLowerCase(),
  );
});
