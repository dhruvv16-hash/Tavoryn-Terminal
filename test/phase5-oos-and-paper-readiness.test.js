import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { FrozenResearchProtocol, hashConfig } from "../lib/frozen-protocol.js";
import { evaluateStrategyPromotionGates, DEFAULT_PROMOTION_THRESHOLDS } from "../lib/strategy-promotion.js";
import { ShadowTradingEngine } from "../lib/shadow-engine.js";
import { Strategy } from "../lib/strategy-interface.js";

const PAPER_ACCOUNT_HASH = "8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D";

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

function generateSyntheticBars(n = 100, trend = 0.001, vol = 2) {
  const bars = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const o = price;
    const c = price + (i % 2 === 0 ? vol : -vol * 0.8) + price * trend;
    const h = Math.max(o, c) + 1.5;
    const l = Math.min(o, c) - 1.5;
    bars.push(makeBar(i, Number(o.toFixed(2)), Number(h.toFixed(2)), Number(l.toFixed(2)), Number(c.toFixed(2))));
    price = c;
  }
  return bars;
}

// ============================================================================
// 1. Frozen Research Protocol: Chronological Splits, Embargo, Warmup, Freezing
// ============================================================================

test("frozen-protocol: partitions chronologically into train, validation, holdout with embargo", () => {
  const bars = generateSyntheticBars(120);
  const protocol = new FrozenResearchProtocol(bars, {
    trainPct: 0.5,
    valPct: 0.25,
    holdoutPct: 0.25,
    embargoBars: 5,
    warmupBars: 10,
  });

  const p = protocol.partitions;
  assert.equal(p.train.startIndex, 0);
  assert.equal(p.train.endIndex, 60);
  assert.equal(p.train.bars.length, 60);

  // Validation starts at 60 + embargo(5) = 65, ends at 90
  assert.equal(p.validation.startIndex, 65);
  assert.equal(p.validation.endIndex, 90);
  // Validation bars include 10 warmup bars preceding index 65 (55..90 -> 35 bars)
  assert.equal(p.validation.warmupBars, 10);
  assert.equal(p.validation.bars.length, 35);

  // Holdout starts at 90 + embargo(5) = 95, ends at 120
  assert.equal(p.holdout.startIndex, 95);
  assert.equal(p.holdout.endIndex, 120);
  // Holdout bars include 10 warmup bars preceding index 95 (85..120 -> 35 bars)
  assert.equal(p.holdout.warmupBars, 10);
  assert.equal(p.holdout.bars.length, 35);

  // Embargo guarantees chronological gap between training and validation
  assert(p.validation.from > p.train.to);
  assert(p.holdout.from > p.validation.to);
});

test("frozen-protocol: rejects invalid split percentages and small datasets", () => {
  const bars = generateSyntheticBars(100);

  assert.throws(
    () => new FrozenResearchProtocol(bars, { trainPct: 0.6, valPct: 0.3, holdoutPct: 0.3 }),
    /Split percentages must sum to 1.0/,
  );

  const fewBars = generateSyntheticBars(40);
  assert.throws(
    () => new FrozenResearchProtocol(fewBars),
    /requires at least 60 bars/,
  );

  assert.throws(
    () => new FrozenResearchProtocol(bars, { trainPct: 0.8, valPct: 0.1, holdoutPct: 0.1, embargoBars: 20 }),
    /Embargo of 20 bars exceeds validation partition capacity/,
  );
});

test("frozen-protocol: registers exploratory attempts and tracks trial multiplicity", () => {
  const bars = generateSyntheticBars(100);
  const protocol = new FrozenResearchProtocol(bars);

  const a1 = protocol.registerAttempt({ fastPeriod: 10, slowPeriod: 30 }, 1.45, { note: "first run" });
  const a2 = protocol.registerAttempt({ fastPeriod: 15, slowPeriod: 45 }, 1.62, { note: "second run" });

  assert.equal(protocol.attempts.length, 2);
  assert.equal(a1.id, "ATTEMPT-1");
  assert.equal(a2.id, "ATTEMPT-2");
  assert.equal(a1.paramHash, hashConfig({ fastPeriod: 10, slowPeriod: 30 }));
  assert.equal(a2.paramHash, hashConfig({ fastPeriod: 15, slowPeriod: 45 }));
});

test("frozen-protocol: freezes strategy specification and locks parameters", () => {
  const bars = generateSyntheticBars(100);
  const protocol = new FrozenResearchProtocol(bars);
  protocol.registerAttempt({ fast: 10, slow: 30 });

  const frozen = protocol.freezeStrategy("v1.0.0", { fast: 10, slow: 30 }, "Optimal validation Sharpe");
  assert.equal(frozen.version, "v1.0.0");
  assert.equal(frozen.attemptsCount, 1);
  assert.ok(frozen.paramHash);

  // Prohibits registering new attempts after freezing
  assert.throws(
    () => protocol.registerAttempt({ fast: 12, slow: 28 }),
    /Cannot register new exploratory attempts after strategy has been frozen/,
  );

  // Prohibits double freezing
  assert.throws(
    () => protocol.freezeStrategy("v1.0.1", { fast: 12 }),
    /Strategy already frozen/,
  );
});

test("frozen-protocol: evaluates holdout once and strictly prohibits tuning on holdout", () => {
  const bars = generateSyntheticBars(100);
  const protocol = new FrozenResearchProtocol(bars);

  class MockMovingAverageStrategy extends Strategy {
    constructor(params) {
      super();
      this.fast = params.fast || 5;
    }
    onBar(bar, ctx) {
      if (ctx.index === 10 && !ctx.position) {
        ctx.submitOrder({ side: "BUY", type: "MARKET" });
      } else if (ctx.index === 15 && ctx.position) {
        ctx.closePosition("Exit");
      }
    }
  }

  // Throws if holdout evaluated before freezing
  assert.throws(
    () => protocol.evaluateFinalHoldout((params) => new MockMovingAverageStrategy(params)),
    /Strategy must be frozen before evaluating final holdout/,
  );

  protocol.freezeStrategy("v1.0.0", { fast: 5 });

  const res = protocol.evaluateFinalHoldout((params) => new MockMovingAverageStrategy(params));
  assert.ok(res.provenance.datasetHash);
  assert.ok(res.partitions.holdout.metrics);
  assert.equal(res.attemptsCount, 0);

  // Second holdout evaluation must throw a protocol violation error
  assert.throws(
    () => protocol.evaluateFinalHoldout((params) => new MockMovingAverageStrategy(params)),
    /Tuning on holdout data is strictly prohibited/,
  );
});

// ============================================================================
// 2. Strategy Promotion Gates: Statistical Significance & Risk Boundaries
// ============================================================================

test("promotion-gates: passes robust strategy with sufficient trades, positive expectancy, and low drawdown", () => {
  const mockHoldoutResult = {
    partitions: {
      holdout: {
        bars: generateSyntheticBars(50),
        metrics: {
          totalTrades: 25,
          netProfit: 12500,
          netProfitPct: 12.5,
          buyHoldPct: 5.0,
          expectancyPerTrade: 500,
          expectancyPct: 2.1,
          maxDrawdownPct: 14.2,
          profitFactor: 2.1,
          winningTrades: 17,
          losingTrades: 8,
        },
        trades: [
          // 25 trades with well-distributed winning PnLs (no outlier concentration)
          ...Array.from({ length: 17 }, (_, i) => ({ id: `t-${i}`, pnl: 800 + i * 20 })),
          ...Array.from({ length: 8 }, (_, i) => ({ id: `loss-${i}`, pnl: -300 })),
        ],
      },
    },
  };

  const evalRes = evaluateStrategyPromotionGates(mockHoldoutResult, {
    minTradeCount: 20,
    mustBeatBenchmark: true,
  });

  assert.equal(evalRes.promoted, true);
  assert.equal(evalRes.verdict, "PROMOTED_TO_CONTROLLED_PAPER");
  assert.equal(evalRes.failedCount, 0);
  assert.equal(evalRes.passedCount, evalRes.totalGates);
});

test("promotion-gates: rejects strategy with insufficient trade count (<20 trades)", () => {
  const mockHoldoutResult = {
    partitions: {
      holdout: {
        metrics: {
          totalTrades: 6,
          netProfit: 5000,
          expectancyPerTrade: 833,
          expectancyPct: 3.5,
          maxDrawdownPct: 10,
          profitFactor: 3.0,
        },
        trades: Array.from({ length: 6 }, (_, i) => ({ id: `t-${i}`, pnl: 833 })),
      },
    },
  };

  const evalRes = evaluateStrategyPromotionGates(mockHoldoutResult, { minTradeCount: 20 });
  assert.equal(evalRes.promoted, false);
  assert.equal(evalRes.verdict, "PROMOTION_REJECTED");
  assert.ok(evalRes.failedGates.some((g) => g.gate === "minTradeCount"));
  assert.ok(evalRes.warnings.some((w) => w.includes("Severe sample size limitation")));
});

test("promotion-gates: rejects strategy with negative expectancy or excessive drawdown", () => {
  const mockHoldoutResult = {
    partitions: {
      holdout: {
        metrics: {
          totalTrades: 30,
          netProfit: -1200,
          expectancyPerTrade: -40,
          expectancyPct: -0.4,
          maxDrawdownPct: 38.5, // Exceeds 30% max limit
          profitFactor: 0.82,
        },
        trades: Array.from({ length: 30 }, (_, i) => ({ id: `t-${i}`, pnl: -40 })),
      },
    },
  };

  const evalRes = evaluateStrategyPromotionGates(mockHoldoutResult);
  assert.equal(evalRes.promoted, false);
  assert.ok(evalRes.failedGates.some((g) => g.gate === "positiveExpectancy"));
  assert.ok(evalRes.failedGates.some((g) => g.gate === "maxDrawdownLimit"));
  assert.ok(evalRes.failedGates.some((g) => g.gate === "profitFactorFloor"));
});

test("promotion-gates: rejects strategy with extreme profit concentration in top 3 trades (>50%)", () => {
  // Strategy made $10,000 total net profit, but $8,500 came from top 3 trades (85% concentration)
  const mockHoldoutResult = {
    partitions: {
      holdout: {
        metrics: {
          totalTrades: 25,
          netProfit: 10000,
          expectancyPerTrade: 400,
          expectancyPct: 1.5,
          maxDrawdownPct: 15.0,
          profitFactor: 1.8,
        },
        trades: [
          { id: "t1", pnl: 4000 },
          { id: "t2", pnl: 2500 },
          { id: "t3", pnl: 2000 },
          ...Array.from({ length: 22 }, (_, i) => ({ id: `t-${i + 4}`, pnl: (1500 / 22) })),
        ],
      },
    },
  };

  const evalRes = evaluateStrategyPromotionGates(mockHoldoutResult, { maxTop3TradeConcentrationPct: 50.0 });
  assert.equal(evalRes.promoted, false);
  const concentrationGate = evalRes.failedGates.find((g) => g.gate === "topTradeConcentration");
  assert.ok(concentrationGate);
  assert.equal(concentrationGate.actual, 85);
  assert.ok(concentrationGate.reason.includes("Extreme outlier reliance"));
});

test("promotion-gates: rejects strategy failing transaction friction stress test", () => {
  const mockHoldoutResult = {
    partitions: {
      holdout: {
        metrics: {
          totalTrades: 25,
          netProfit: 2000,
          expectancyPerTrade: 80,
          expectancyPct: 0.8,
          maxDrawdownPct: 12.0,
          profitFactor: 1.2,
        },
        trades: Array.from({ length: 25 }, (_, i) => ({ id: `t-${i}`, pnl: 80 })),
      },
    },
    // Pre-computed stress test showing failure under conservative frictions
    stressTest: {
      conservativeSurvives: false,
      allTiersSurvive: false,
    },
  };

  const evalRes = evaluateStrategyPromotionGates(mockHoldoutResult, { mustSurviveFriction: true });
  assert.equal(evalRes.promoted, false);
  assert.ok(evalRes.failedGates.some((g) => g.gate === "mustSurviveFriction"));
});

// ============================================================================
// 3. Shadow & Controlled Paper-Trading Engine: Matching, Audit Trail, Safety
// ============================================================================

test("shadow-engine: enforces broker isolation invariant", () => {
  class DummyStrategy extends Strategy {}
  const engine = new ShadowTradingEngine(new DummyStrategy());

  assert.equal(engine.isLiveBrokerConnected, false);
  assert.throws(
    () => engine.connectBroker(),
    /Security Violation: Live broker execution is disabled in ShadowTradingEngine/,
  );
});

test("shadow-engine: executes orders, records structured audit trail and mark-to-market portfolio", () => {
  class TrendFollower extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) {
        ctx.submitOrder({ side: "BUY", type: "MARKET", qty: 10, reason: "Breakout" });
      } else if (ctx.index === 2) {
        ctx.closePosition("Trend exit");
      }
    }
  }

  const engine = new ShadowTradingEngine(new TrendFollower(), { initialCapital: 50000, feePct: 0.1, slippagePct: 0.05 });
  const bars = [
    makeBar(0, 100, 105, 98, 104),
    makeBar(1, 105, 110, 104, 108),
    makeBar(2, 110, 115, 109, 114),
    makeBar(3, 112, 116, 110, 113),
  ];

  for (const bar of bars) {
    engine.processBar(bar);
  }

  const status = engine.getStatus();
  assert.equal(status.status, "HEALTHY");
  assert.equal(status.tradesCount, 1);
  assert.equal(status.openPositionsCount, 0);
  assert.equal(status.reconciliation.reconciled, true);
  assert.equal(status.reconciliation.cashConservationVerified, true);
  assert.equal(status.reconciliation.cashDiscrepancy, 0);

  // Verify comprehensive audit log
  assert.ok(engine.auditLog.length >= 4);
  const orderIntent = engine.auditLog.find((l) => l.type === "ORDER_INTENT");
  const orderFilled = engine.auditLog.find((l) => l.type === "ORDER_FILLED");
  const orderClosed = engine.auditLog.find((l) => l.type === "ORDER_CLOSED");

  assert.ok(orderIntent && orderFilled && orderClosed);
  assert.ok(orderFilled.simulatedFill.fillPrice > 105); // Includes ask spread + slippage
  assert.ok(orderClosed.simulatedFill.netPnl > 0);
});

test("shadow-engine: emergency kill switch stops trading, cancels orders and flattens position", () => {
  class LongStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) {
        ctx.submitOrder({ side: "BUY", type: "MARKET", qty: 5 });
      }
    }
  }

  const engine = new ShadowTradingEngine(new LongStrategy(), { initialCapital: 20000 });
  engine.processBar(makeBar(0, 100, 102, 99, 101));
  engine.processBar(makeBar(1, 102, 105, 101, 104)); // Position opened

  assert.ok(engine.position);
  assert.equal(engine.killSwitchActive, false);

  // Trigger emergency kill switch with flatten
  engine.activateKillSwitch({ flatten: true, reason: "Operator risk breach alert" });

  assert.equal(engine.killSwitchActive, true);
  assert.equal(engine.position, null); // Flattened!
  assert.equal(engine.trades.length, 1);
  assert.equal(engine.trades[0].exitReason, "Kill switch emergency flatten");

  // Subsequent order submission is rejected
  const rejectedOrder = engine.submitOrder({ side: "BUY", type: "MARKET", qty: 2 });
  assert.ok(rejectedOrder.reason.includes("Kill switch is active"));

  const status = engine.getStatus();
  assert.equal(status.status, "KILLED");
  assert.equal(status.killSwitchActive, true);

  // Deactivate restores execution state
  engine.deactivateKillSwitch("Operator resolved incident");
  assert.equal(engine.killSwitchActive, false);
});

test("shadow-engine: detects duplicate, out-of-order, and missing data gaps", () => {
  class NoopStrategy extends Strategy {}
  const engine = new ShadowTradingEngine(new NoopStrategy(), { expectedIntervalSec: 86400 });

  const b0 = makeBar(0, 100, 105, 95, 100);
  const b1 = makeBar(1, 102, 106, 98, 104);
  const bGap = makeBar(4, 110, 115, 108, 112); // Gap of 3 days (259200s > 86400 * 1.5)

  // 1. Ingest normal bars
  engine.processBar(b0);
  engine.processBar(b1);

  // 2. Duplicate bar detection (prevents double execution)
  const dupRes = engine.processBar(b1);
  assert.equal(dupRes.status, "SKIPPED_DUPLICATE");
  assert.ok(engine.anomalies.some((a) => a.type === "DUPLICATE_BAR_TIMESTAMP"));

  // 3. Out-of-order bar detection (unprocessed bar arriving with older timestamp)
  const bOutOfOrder = { ...makeBar(0.5, 101, 103, 99, 102), time: b0.time + 43200 };
  const outOfOrderRes = engine.processBar(bOutOfOrder);
  assert.equal(outOfOrderRes.status, "REJECTED_OUT_OF_ORDER");
  assert.ok(engine.anomalies.some((a) => a.type === "OUT_OF_ORDER_TIMESTAMP"));

  // 4. Data gap detection
  engine.processBar(bGap);
  assert.ok(engine.anomalies.some((a) => a.type === "MISSING_DATA_GAP"));
});

test("shadow-engine: snapshot save and restore recovery maintains idempotency and state", () => {
  class SimpleBuyer extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) ctx.submitOrder({ side: "BUY", type: "MARKET", qty: 10 });
    }
  }

  const engineA = new ShadowTradingEngine(new SimpleBuyer(), { initialCapital: 100000 });
  const b0 = makeBar(0, 100, 105, 95, 100);
  const b1 = makeBar(1, 102, 108, 100, 106);

  engineA.processBar(b0);
  engineA.processBar(b1); // Fills buy order

  const snapshot = engineA.saveSnapshot();
  assert.ok(snapshot.cash < 100000);
  assert.ok(snapshot.position);
  assert.equal(snapshot.processedTimestamps.length, 2);

  // Restore into a completely new engine instance B
  const engineB = new ShadowTradingEngine(new SimpleBuyer(), { initialCapital: 100000 });
  engineB.restoreSnapshot(snapshot);

  assert.equal(engineB.cash, engineA.cash);
  assert.equal(engineB.position.qty, engineA.position.qty);
  assert.equal(engineB.processedTimestamps.size, 2);

  // Idempotency: Re-feeding b0 or b1 into engineB skips them without re-opening orders
  const replayB0 = engineB.processBar(b0);
  assert.equal(replayB0.status, "SKIPPED_DUPLICATE");
  assert.equal(engineB.trades.length, 0); // No phantom trades created

  // Processing new bar b2 works seamlessly
  const b2 = makeBar(2, 107, 112, 106, 110);
  const nextRes = engineB.processBar(b2);
  assert.equal(nextRes.status, "PROCESSED");
});

test("shadow-engine: reconciles short entry, reversal, and short borrow financing fees", () => {
  class ShortAndReverseStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) {
        ctx.submitOrder({ side: "SELL", type: "MARKET", qty: 10 });
      } else if (ctx.index === 2) {
        // Reverse from short to long
        ctx.submitOrder({ side: "BUY", type: "MARKET", qty: 10 });
      } else if (ctx.index === 3) {
        ctx.closePosition("Exit all");
      }
    }
  }

  const engine = new ShadowTradingEngine(new ShortAndReverseStrategy(), {
    initialCapital: 50000,
    feePct: 0.1,
    slippagePct: 0.05,
    borrowFeePctAnnual: 5.0, // 5% annual borrow rate
  });

  const bars = [
    makeBar(0, 100, 102, 98, 100),
    makeBar(1, 98, 100, 96, 97), // Short position held, accrues borrow fees
    makeBar(2, 95, 98, 94, 96),  // Reversal: short closed at 95, long opened at 95
    makeBar(3, 100, 104, 99, 102), // Long closed
    makeBar(4, 102, 105, 100, 103),
  ];

  for (const bar of bars) {
    engine.processBar(bar);
  }

  const status = engine.getStatus();
  assert.equal(status.tradesCount, 2);
  assert.equal(status.openPositionsCount, 0);
  assert.equal(status.reconciliation.reconciled, true);
  assert.equal(status.reconciliation.cashConservationVerified, true);
  assert.ok(status.reconciliation.cashDiscrepancy < 0.05);

  const shortTrade = engine.trades.find((t) => t.side === "short");
  assert.ok(shortTrade);
  assert.ok(shortTrade.borrowFees > 0);
  assert.equal(shortTrade.fees, shortTrade.commissions + shortTrade.borrowFees);
});

test("frozen-protocol: durable research ledger survives restarts and prevents holdout re-evaluation", () => {
  const tmpLedger = path.join(os.tmpdir(), `test-research-ledger-${Date.now()}.jsonl`);
  const bars = generateSyntheticBars(100);

  class MockStrat extends Strategy {}

  // 1. First protocol instance evaluates holdout and records in ledger
  const proto1 = new FrozenResearchProtocol(bars, { ledgerPath: tmpLedger });
  proto1.freezeStrategy("v1.0.0", { fast: 5, slow: 20 });
  const res1 = proto1.evaluateFinalHoldout((p) => new MockStrat());

  assert.ok(res1.ledgerEntry);
  assert.equal(res1.ledgerEntry.version, "v1.0.0");
  assert.equal(res1.ledgerEntry.index, 0);

  // 2. Second completely new protocol instance (simulating process restart)
  const proto2 = new FrozenResearchProtocol(bars, { ledgerPath: tmpLedger });
  proto2.freezeStrategy("v1.0.0", { fast: 5, slow: 20 });

  // Re-evaluation is strictly blocked by the durable ledger
  assert.throws(
    () => proto2.evaluateFinalHoldout((p) => new MockStrat()),
    /already permanently recorded in durable research ledger/,
  );

  // Clean up
  try { fs.unlinkSync(tmpLedger); } catch {}
});

test("research-ledger: detects file tampering and rejects corrupted hash chain", async () => {
  const { appendResearchLedger, verifyResearchLedgerIntegrity } = await import("../lib/research-ledger.js");
  const tmpLedger = path.join(os.tmpdir(), `tamper-ledger-${Date.now()}.jsonl`);

  appendResearchLedger(tmpLedger, {
    datasetHash: "DATASET_A",
    version: "v1.0.0",
    paramHash: "PARAMS_A",
    evaluatedAt: 1000,
    metricsSummary: { netProfit: 100 },
  });

  appendResearchLedger(tmpLedger, {
    datasetHash: "DATASET_B",
    version: "v1.1.0",
    paramHash: "PARAMS_B",
    evaluatedAt: 2000,
    metricsSummary: { netProfit: 200 },
  });

  const verified = verifyResearchLedgerIntegrity(tmpLedger);
  assert.equal(verified.valid, true);
  assert.equal(verified.count, 2);

  // Tamper with record 1 (alter netProfit)
  const content = fs.readFileSync(tmpLedger, "utf8");
  const tampered = content.replace('"netProfit":100', '"netProfit":999999');
  fs.writeFileSync(tmpLedger, tampered, "utf8");

  const tamperedCheck = verifyResearchLedgerIntegrity(tmpLedger);
  assert.equal(tamperedCheck.valid, false);
  assert.ok(tamperedCheck.reason.includes("Integrity hash mismatch"));

  // Clean up
  try { fs.unlinkSync(tmpLedger); } catch {}
});

// ============================================================================
// 4. Non-Negotiable Account Preservation & Offline Safety Invariant
// ============================================================================

test("invariant: data/paper-account.json remains byte-for-byte unmodified", () => {
  const content = fs.readFileSync(new URL("../data/paper-account.json", import.meta.url));
  const currentHash = crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
  assert.equal(
    currentHash,
    PAPER_ACCOUNT_HASH,
    "CRITICAL: data/paper-account.json hash modified! Account isolation invariant violated.",
  );
});
