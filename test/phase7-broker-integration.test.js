import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

import {
  BaseBrokerAdapter,
  BrokerError,
  RateLimitError,
  TimeoutError,
  AuthenticationError,
  OrderRejectedError,
  DEFAULT_BROKER_CAPABILITIES,
} from "../lib/broker/broker-adapter.js";

import {
  ORDER_STATES,
  TERMINAL_STATES,
  OrderRecord,
  OrderLifecycleManager,
} from "../lib/broker/order-lifecycle.js";

import {
  PreTradeRiskGateway,
  RISK_REJECTION_CODES,
} from "../lib/broker/risk-gateway.js";

import { MockBrokerAdapter } from "../lib/broker/mock-broker.js";
import { BrokerExecutionCoordinator } from "../lib/broker/execution-coordinator.js";

const PAPER_ACCOUNT_PATH = "data/paper-account.json";
const EXPECTED_ACCOUNT_HASH =
  "8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D";

function getFileHash(filepath) {
  const content = fs.readFileSync(filepath);
  return crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
}

// ============================================================================
// 1. Safety & Baseline Invariants
// ============================================================================
test("Phase 7 Baseline: paper-account.json SHA256 integrity check", () => {
  const currentHash = getFileHash(PAPER_ACCOUNT_PATH);
  assert.equal(
    currentHash,
    EXPECTED_ACCOUNT_HASH,
    "data/paper-account.json must remain byte-for-byte unmodified across Phase 7",
  );
});

test("Phase 7 Safety: Live broker execution is disabled by default", () => {
  const adapter = new BaseBrokerAdapter("test-broker");
  assert.equal(adapter.isLive, false);
  assert.equal(adapter.capabilities.isSandbox, true);

  // Attempting LIVE mode without confirmation token must throw AuthenticationError
  assert.throws(
    () => {
      new BaseBrokerAdapter("live-broker", { environment: "LIVE" });
    },
    (err) => err instanceof AuthenticationError && err.code === "AUTHENTICATION_FAILED",
  );
});

// ============================================================================
// 2. Broker Adapter Contract & Capabilities (Stage 1)
// ============================================================================
test("Broker Adapter Contract: Declares capabilities and error taxonomy", async () => {
  const adapter = new BaseBrokerAdapter("generic-broker");
  const caps = adapter.getCapabilities();

  assert.equal(caps.canCancel, true);
  assert.equal(caps.canReplace, false);
  assert.ok(Array.isArray(caps.supportedOrderTypes));
  assert.ok(caps.supportedOrderTypes.includes("MARKET"));
  assert.ok(caps.supportedOrderTypes.includes("LIMIT"));

  // Check custom error hierarchy
  const err = new RateLimitError("Rate limit exceeded", 45);
  assert.ok(err instanceof BrokerError);
  assert.equal(err.code, "RATE_LIMIT_EXCEEDED");
  assert.equal(err.retryAfterSec, 45);

  const rej = new OrderRejectedError("Price out of collar", "COLLAR_BREACH");
  assert.ok(rej instanceof BrokerError);
  assert.equal(rej.rejectionReason, "COLLAR_BREACH");

  // Health query
  await adapter.connect();
  const health = await adapter.getHealth();
  assert.equal(health.status, "CONNECTED");
  assert.equal(health.isConnected, true);
  assert.equal(health.isLive, false);
});

// ============================================================================
// 3. Order Lifecycle & Idempotency State Machine (Stage 2)
// ============================================================================
test("Order Lifecycle: Full valid progression and transition tracking", () => {
  const order = new OrderRecord({
    clientOrderId: "TEST-001",
    symbol: "AAPL",
    side: "BUY",
    qty: 100,
    type: "LIMIT",
    limitPrice: 150.0,
  });

  assert.equal(order.state, ORDER_STATES.CREATED);
  assert.equal(order.side, 1);
  assert.equal(order.qty, 100);
  assert.equal(order.remainingQty, 100);

  // CREATED -> RISK_APPROVED
  const r1 = order.transitionTo(ORDER_STATES.RISK_APPROVED, "Risk approved");
  assert.ok(r1.success);
  assert.equal(order.state, ORDER_STATES.RISK_APPROVED);

  // RISK_APPROVED -> SUBMITTED
  const r2 = order.transitionTo(ORDER_STATES.SUBMITTED, "Submitted to exchange");
  assert.ok(r2.success);
  assert.equal(order.state, ORDER_STATES.SUBMITTED);

  // SUBMITTED -> ACKNOWLEDGED
  const r3 = order.transitionTo(ORDER_STATES.ACKNOWLEDGED, "Exchange ACK");
  assert.ok(r3.success);
  assert.equal(order.state, ORDER_STATES.ACKNOWLEDGED);

  // Verify transition audit trail
  assert.equal(order.transitions.length, 4);
  assert.equal(order.transitions[1].toState, ORDER_STATES.RISK_APPROVED);
  assert.equal(order.transitions[2].toState, ORDER_STATES.SUBMITTED);
  assert.equal(order.transitions[3].toState, ORDER_STATES.ACKNOWLEDGED);
});

test("Order Lifecycle: Terminal states reject further mutations", () => {
  const order = new OrderRecord({
    clientOrderId: "TEST-002",
    symbol: "NVDA",
    side: "SELL",
    qty: 50,
  });

  order.transitionTo(ORDER_STATES.RISK_APPROVED);
  order.transitionTo(ORDER_STATES.SUBMITTED);
  order.transitionTo(ORDER_STATES.ACKNOWLEDGED);
  const rFill = order.transitionTo(ORDER_STATES.FILLED, "Fully executed");
  assert.ok(rFill.success);
  assert.ok(order.isTerminal());

  // Attempting transition after FILLED must be rejected
  const rIllegal = order.transitionTo(ORDER_STATES.CANCELLED);
  assert.equal(rIllegal.success, false);
  assert.match(rIllegal.reason, /terminal state/i);
});

test("Order Lifecycle: Illegal state jumps are rejected by transition matrix", () => {
  const order = new OrderRecord({
    clientOrderId: "TEST-003",
    symbol: "MSFT",
    side: "BUY",
    qty: 10,
  });

  // Cannot jump directly from CREATED to FILLED
  const rJump = order.transitionTo(ORDER_STATES.FILLED);
  assert.equal(rJump.success, false);
  assert.match(rJump.reason, /Illegal state transition/);
  assert.equal(order.state, ORDER_STATES.CREATED);
});

test("Order Lifecycle: Idempotent execution report processing & cumulative VWAP", () => {
  const order = new OrderRecord({
    clientOrderId: "TEST-004",
    symbol: "TSLA",
    side: "BUY",
    qty: 200,
  });
  order.transitionTo(ORDER_STATES.RISK_APPROVED);
  order.transitionTo(ORDER_STATES.SUBMITTED);
  order.transitionTo(ORDER_STATES.ACKNOWLEDGED);

  // First partial fill: 100 shares @ $200, fee $1
  const report1 = {
    executionId: "EXEC-01",
    fillPrice: 200,
    qty: 100,
    fee: 1.0,
  };
  const res1 = order.applyExecutionReport(report1);
  assert.ok(res1.applied);
  assert.equal(order.state, ORDER_STATES.PARTIALLY_FILLED);
  assert.equal(order.filledQty, 100);
  assert.equal(order.remainingQty, 100);
  assert.equal(order.avgFillPrice, 200);
  assert.equal(order.totalFees, 1.0);

  // Duplicate execution report with identical executionId
  const resDup = order.applyExecutionReport(report1);
  assert.equal(resDup.applied, false);
  assert.equal(resDup.reason, "DUPLICATE_EXECUTION_REPORT");
  assert.equal(order.filledQty, 100); // Not double-counted!

  // Second partial fill: 100 shares @ $210, fee $1
  const report2 = {
    executionId: "EXEC-02",
    fillPrice: 210,
    qty: 100,
    fee: 1.0,
  };
  const res2 = order.applyExecutionReport(report2);
  assert.ok(res2.applied);
  assert.equal(order.state, ORDER_STATES.FILLED);
  assert.equal(order.filledQty, 200);
  assert.equal(order.remainingQty, 0);
  // VWAP: (100 * 200 + 100 * 210) / 200 = 205.00
  assert.equal(order.avgFillPrice, 205);
  assert.equal(order.totalFees, 2.0);
});

test("OrderLifecycleManager: Duplicate clientOrderId prevention and lookup", () => {
  const mgr = new OrderLifecycleManager();
  const ord1 = mgr.createOrder({ clientOrderId: "CID-1", symbol: "AAPL", side: "BUY", qty: 10 });
  assert.ok(ord1);

  assert.throws(
    () => {
      mgr.createOrder({ clientOrderId: "CID-1", symbol: "AAPL", side: "BUY", qty: 10 });
    },
    /Duplicate clientOrderId/,
  );

  mgr.setBrokerOrderId("CID-1", "BORD-999");
  assert.equal(mgr.getOrderByBrokerId("BORD-999"), ord1);
});

// ============================================================================
// 4. Pre-Trade Risk Gateway (Stage 3)
// ============================================================================
test("Risk Gateway: Fail-closed on missing price or buying power", () => {
  const gateway = new PreTradeRiskGateway({ maxOrderQty: 100 });

  // Missing market price for market order
  const resPrice = gateway.evaluateOrder(
    { symbol: "AAPL", side: "BUY", qty: 50, type: "MARKET" },
    { currentPrice: null, buyingPower: 10000 },
  );
  assert.equal(resPrice.allowed, false);
  assert.equal(resPrice.code, RISK_REJECTION_CODES.MISSING_MARKET_PRICE);

  // Missing buying power for new opening order
  const resBP = gateway.evaluateOrder(
    { symbol: "AAPL", side: "BUY", qty: 50, type: "LIMIT", limitPrice: 150 },
    { buyingPower: null, currentPrice: 150 },
  );
  assert.equal(resBP.allowed, false);
  assert.equal(resBP.code, RISK_REJECTION_CODES.UNKNOWN_BUYING_POWER);
});

test("Risk Gateway: Enforces maxOrderQty, maxOrderNotional, and buying power limits", () => {
  const gateway = new PreTradeRiskGateway({
    maxOrderQty: 500,
    maxOrderNotional: 50000,
  });

  // Max qty breach
  const resQty = gateway.evaluateOrder(
    { symbol: "SPY", side: "BUY", qty: 600, type: "LIMIT", limitPrice: 50 },
    { buyingPower: 100000 },
  );
  assert.equal(resQty.allowed, false);
  assert.equal(resQty.code, RISK_REJECTION_CODES.MAX_ORDER_QTY_EXCEEDED);

  // Max notional breach: 400 * 200 = $80,000 > $50,000
  const resNotional = gateway.evaluateOrder(
    { symbol: "SPY", side: "BUY", qty: 400, type: "LIMIT", limitPrice: 200 },
    { buyingPower: 100000 },
  );
  assert.equal(resNotional.allowed, false);
  assert.equal(resNotional.code, RISK_REJECTION_CODES.MAX_ORDER_NOTIONAL_EXCEEDED);

  // Insufficient buying power: notional $30,000 > buyingPower $20,000
  const resBP = gateway.evaluateOrder(
    { symbol: "SPY", side: "BUY", qty: 200, type: "LIMIT", limitPrice: 150 },
    { buyingPower: 20000 },
  );
  assert.equal(resBP.allowed, false);
  assert.equal(resBP.code, RISK_REJECTION_CODES.INSUFFICIENT_BUYING_POWER);
});

test("Risk Gateway: Enforces allowed instruments and order types", () => {
  const gateway = new PreTradeRiskGateway({
    allowedInstruments: ["AAPL", "MSFT"],
    allowedOrderTypes: ["LIMIT"],
  });

  // Disallowed symbol
  const resSym = gateway.evaluateOrder(
    { symbol: "GME", side: "BUY", qty: 10, type: "LIMIT", limitPrice: 20 },
    { buyingPower: 10000 },
  );
  assert.equal(resSym.allowed, false);
  assert.equal(resSym.code, RISK_REJECTION_CODES.DISALLOWED_INSTRUMENT);

  // Disallowed order type
  const resType = gateway.evaluateOrder(
    { symbol: "AAPL", side: "BUY", qty: 10, type: "MARKET" },
    { buyingPower: 10000, currentPrice: 150 },
  );
  assert.equal(resType.allowed, false);
  assert.equal(resType.code, RISK_REJECTION_CODES.DISALLOWED_ORDER_TYPE);
});

test("Risk Gateway: Feed-health integration halts orders when feed is stale or degraded", () => {
  const gateway = new PreTradeRiskGateway();

  // Degraded feed health object
  const resDegraded = gateway.evaluateOrder(
    { symbol: "AAPL", side: "BUY", qty: 10, type: "LIMIT", limitPrice: 150 },
    {
      buyingPower: 10000,
      feedHealth: { status: "DEGRADED", isHealthy: false, canTrade: false },
    },
  );
  assert.equal(resDegraded.allowed, false);
  assert.equal(resDegraded.code, RISK_REJECTION_CODES.STALE_OR_DEGRADED_FEED);

  // Stale feed timestamp
  const resStale = gateway.evaluateOrder(
    { symbol: "AAPL", side: "BUY", qty: 10, type: "LIMIT", limitPrice: 150 },
    {
      buyingPower: 10000,
      feedTimestamp: Date.now() - 30000, // 30s ago (> 15s threshold)
    },
  );
  assert.equal(resStale.allowed, false);
  assert.equal(resStale.code, RISK_REJECTION_CODES.FEED_STALE);
});

test("Risk Gateway: Max daily loss breaker and risk-reducing exit exemption", () => {
  const gateway = new PreTradeRiskGateway({
    maxDailyLoss: 1000,
  });

  // Daily loss breached ($1200 >= $1000): new opening order rejected
  const resOpen = gateway.evaluateOrder(
    { symbol: "AAPL", side: "BUY", qty: 10, type: "LIMIT", limitPrice: 150, isClose: false },
    { currentDailyLoss: 1200, buyingPower: 50000 },
  );
  assert.equal(resOpen.allowed, false);
  assert.equal(resOpen.code, RISK_REJECTION_CODES.DAILY_LOSS_LIMIT_REACHED);

  // Risk-reducing closing order IS permitted under daily loss breach to stem losses
  const resClose = gateway.evaluateOrder(
    { symbol: "AAPL", side: "SELL", qty: 10, type: "LIMIT", limitPrice: 150, isClose: true },
    { currentDailyLoss: 1200, buyingPower: 0 }, // buying power 0 doesn't block closing order!
  );
  assert.equal(resClose.allowed, true);
  assert.equal(resClose.isRiskReducing, true);
});

test("Risk Gateway: Kill-switch blocks normal trading but permits emergency liquidation", () => {
  const gateway = new PreTradeRiskGateway();
  gateway.engageKillSwitch("Risk limit breach");
  assert.ok(gateway.isKillSwitchEngaged());

  // Standard order rejected
  const resNormal = gateway.evaluateOrder(
    { symbol: "AAPL", side: "BUY", qty: 10, type: "LIMIT", limitPrice: 150 },
    { buyingPower: 10000 },
  );
  assert.equal(resNormal.allowed, false);
  assert.equal(resNormal.code, RISK_REJECTION_CODES.KILL_SWITCH_ACTIVE);

  // Emergency kill-switch flatten order allowed through
  const resFlatten = gateway.evaluateOrder(
    {
      symbol: "AAPL",
      side: "SELL",
      qty: 10,
      type: "MARKET",
      isClose: true,
      isKillSwitchFlatten: true,
    },
    { currentPrice: 150 },
  );
  assert.equal(resFlatten.allowed, true);
});

// ============================================================================
// 5. Mock Broker Sandbox Execution (Stage 4)
// ============================================================================
test("Mock Broker Sandbox: Realistic account balance, positions, and P&L tracking", async () => {
  const broker = new MockBrokerAdapter({
    initialCash: 50000,
    commissionPerShare: 0.01,
    minCommission: 1.0,
  });
  await broker.connect();
  broker.setMarketPrice("AAPL", 150);

  // 1. Submit market buy: 100 AAPL @ $150
  const buyRes = await broker.submitOrder({
    clientOrderId: "B-01",
    symbol: "AAPL",
    side: "BUY",
    qty: 100,
    type: "MARKET",
  });

  assert.equal(buyRes.status, "FILLED");
  assert.equal(buyRes.fill.qty, 100);
  assert.equal(buyRes.fill.fillPrice, 150);
  assert.equal(buyRes.fill.fee, 1.0); // 100 * 0.01

  const acctAfterBuy = await broker.getAccount();
  // Cash = 50000 - 15000 (notional) - 1.0 (fee) = 34999.00
  assert.equal(acctAfterBuy.cash, 34999.0);
  assert.equal(acctAfterBuy.portfolioValue, 49999.0); // 34999 cash + 15000 equity

  const positions = await broker.getPositions();
  assert.equal(positions.length, 1);
  assert.equal(positions[0].symbol, "AAPL");
  assert.equal(positions[0].qty, 100);
  assert.equal(positions[0].avgEntryPrice, 150);

  // 2. AAPL rises to $160
  broker.setMarketPrice("AAPL", 160);
  const acctGain = await broker.getAccount();
  // Unrealized P&L = (160 - 150) * 100 = $1,000
  assert.equal(acctGain.unrealizedPnL, 1000.0);
  assert.equal(acctGain.portfolioValue, 50999.0);

  // 3. Sell 50 shares @ $160
  const sellRes = await broker.submitOrder({
    clientOrderId: "S-01",
    symbol: "AAPL",
    side: "SELL",
    qty: 50,
    type: "MARKET",
    isClose: true,
  });

  assert.equal(sellRes.status, "FILLED");
  // Realized P&L: 50 * (160 - 150) = $500
  const acctAfterSell = await broker.getAccount();
  assert.equal(acctAfterSell.realizedPnL, 500.0);
  const posAfterSell = await broker.getPositions();
  assert.equal(posAfterSell[0].qty, 50);

  // 4. Sell remaining 50 shares @ $160 -> Position closed
  await broker.submitOrder({
    clientOrderId: "S-02",
    symbol: "AAPL",
    side: "SELL",
    qty: 50,
    type: "MARKET",
    isClose: true,
  });

  const posFinal = await broker.getPositions();
  assert.equal(posFinal.length, 0); // Position deleted when completely closed
  const acctFinal = await broker.getAccount();
  assert.equal(acctFinal.realizedPnL, 1000.0);
});

test("Mock Broker Sandbox: Resting limit order execution", async () => {
  const broker = new MockBrokerAdapter({ initialCash: 10000 });
  await broker.connect();
  broker.setMarketPrice("MSFT", 300);

  // Submit BUY limit order @ $290 (resting, since current is $300)
  const limitRes = await broker.submitOrder({
    clientOrderId: "L-01",
    symbol: "MSFT",
    side: "BUY",
    qty: 10,
    type: "LIMIT",
    limitPrice: 290,
  });

  assert.equal(limitRes.status, "ACKNOWLEDGED");
  assert.equal(limitRes.filled, false);

  const openOrders = await broker.getOpenOrders();
  assert.equal(openOrders.length, 1);
  assert.equal(openOrders[0].clientOrderId, "L-01");

  // Simulate market price drops and fill is executed via simulateFill
  const fill = broker.simulateFill("L-01", { price: 290, qty: 10 });
  assert.equal(fill.fillPrice, 290);
  assert.equal(fill.qty, 10);

  const openAfter = await broker.getOpenOrders();
  assert.equal(openAfter.length, 0);
  const positions = await broker.getPositions();
  assert.equal(positions[0].symbol, "MSFT");
  assert.equal(positions[0].qty, 10);
});

test("Mock Broker Sandbox: Deterministic failure injection", async () => {
  const broker = new MockBrokerAdapter();
  await broker.connect();

  // 1. Timeout failure mode
  broker.setFailureMode("SUBMISSION_TIMEOUT");
  await assert.rejects(
    async () => {
      await broker.submitOrder({ symbol: "AAPL", side: "BUY", qty: 10 });
    },
    (err) => err instanceof TimeoutError,
  );

  // 2. Reject failure mode
  broker.setFailureMode("REJECT", "Exchange halted trading");
  await assert.rejects(
    async () => {
      await broker.submitOrder({ symbol: "AAPL", side: "BUY", qty: 10 });
    },
    (err) => err instanceof OrderRejectedError && err.rejectionReason === "Exchange halted trading",
  );

  // 3. Rate limit failure mode
  broker.setFailureMode("RATE_LIMIT");
  await assert.rejects(
    async () => {
      await broker.submitOrder({ symbol: "AAPL", side: "BUY", qty: 10 });
    },
    (err) => err instanceof RateLimitError,
  );

  broker.clearFailureMode();
});

// ============================================================================
// 6. Execution Coordinator & Reconciliation (Stage 5)
// ============================================================================
test("Execution Coordinator: End-to-end order execution flow with risk & lifecycle", async () => {
  const broker = new MockBrokerAdapter({ initialCash: 100000 });
  await broker.connect();
  broker.setMarketPrice("GOOG", 100);

  const coordinator = new BrokerExecutionCoordinator({ broker });

  // Submit valid market order
  const res = await coordinator.submitOrder({
    clientOrderId: "COORD-01",
    symbol: "GOOG",
    side: "BUY",
    qty: 50,
    type: "MARKET",
  });

  assert.ok(res.success);
  assert.equal(res.status, ORDER_STATES.FILLED);
  assert.equal(res.order.filledQty, 50);

  // Attempt duplicate submission
  const resDup = await coordinator.submitOrder({
    clientOrderId: "COORD-01",
    symbol: "GOOG",
    side: "BUY",
    qty: 50,
  });
  assert.equal(resDup.success, false);
  assert.equal(resDup.code, "DUPLICATE_ORDER");
});

test("Execution Coordinator: Submission timeout triggers SUBMISSION_TIMEOUT state without blind resubmission", async () => {
  const broker = new MockBrokerAdapter({ initialCash: 50000 });
  await broker.connect();
  broker.setMarketPrice("AMZN", 150);

  const coordinator = new BrokerExecutionCoordinator({ broker });

  // Inject timeout
  broker.setFailureMode("SUBMISSION_TIMEOUT");

  const res = await coordinator.submitOrder({
    clientOrderId: "TIMEOUT-01",
    symbol: "AMZN",
    side: "BUY",
    qty: 20,
    type: "MARKET",
  });

  assert.equal(res.success, false);
  assert.equal(res.code, "SUBMISSION_TIMEOUT");
  assert.equal(res.order.state, ORDER_STATES.SUBMISSION_TIMEOUT);

  // Verify audit log captured the timeout
  const audits = coordinator.getAuditLogs();
  assert.ok(audits.some((a) => a.action === "ORDER_SUBMISSION_TIMEOUT"));

  broker.clearFailureMode();
});

test("Execution Coordinator: State reconciliation resolves timed-out orders against broker reality", async () => {
  const broker = new MockBrokerAdapter({ initialCash: 50000 });
  await broker.connect();
  broker.setMarketPrice("AAPL", 150);

  const coordinator = new BrokerExecutionCoordinator({ broker });

  // Order that timed out locally and never reached broker
  broker.setFailureMode("SUBMISSION_TIMEOUT");
  const resTimeout = await coordinator.submitOrder({
    clientOrderId: "ORPHAN-01",
    symbol: "AAPL",
    side: "BUY",
    qty: 10,
    type: "MARKET",
  });
  broker.clearFailureMode();
  assert.equal(resTimeout.order.state, ORDER_STATES.SUBMISSION_TIMEOUT);

  // Run reconciliation
  const reconResult = await coordinator.reconcile();
  assert.ok(reconResult.reconciled);
  // Reconciliation verified the order never reached the broker and transitioned it to REJECTED
  assert.equal(resTimeout.order.state, ORDER_STATES.REJECTED);
});

// ============================================================================
// 7. Emergency Kill-Switch & Flattening Verification (Stage 5)
// ============================================================================
test("Execution Coordinator: Kill-switch cancels open orders, flattens positions, and verifies zero exposure", async () => {
  const broker = new MockBrokerAdapter({ initialCash: 100000 });
  await broker.connect();
  broker.setMarketPrice("AAPL", 150);
  broker.setMarketPrice("MSFT", 300);

  const coordinator = new BrokerExecutionCoordinator({ broker });

  // 1. Establish long position in AAPL and short/long position in MSFT
  await coordinator.submitOrder({
    clientOrderId: "POS-01",
    symbol: "AAPL",
    side: "BUY",
    qty: 100,
    type: "MARKET",
  });
  await coordinator.submitOrder({
    clientOrderId: "POS-02",
    symbol: "MSFT",
    side: "BUY",
    qty: 50,
    type: "MARKET",
  });

  // Verify positions exist before kill-switch
  const posBefore = await broker.getPositions();
  assert.equal(posBefore.length, 2);

  // 2. Place a resting limit order that stays open
  await broker.submitOrder({
    clientOrderId: "OPEN-RESTING",
    symbol: "AAPL",
    side: "BUY",
    qty: 20,
    type: "LIMIT",
    limitPrice: 120, // resting below market
  });
  coordinator.lifecycle.createOrder({
    clientOrderId: "OPEN-RESTING",
    symbol: "AAPL",
    side: "BUY",
    qty: 20,
    type: "LIMIT",
    limitPrice: 120,
  });
  coordinator.lifecycle.transitionOrder("OPEN-RESTING", ORDER_STATES.RISK_APPROVED);
  coordinator.lifecycle.transitionOrder("OPEN-RESTING", ORDER_STATES.SUBMITTED);
  coordinator.lifecycle.transitionOrder("OPEN-RESTING", ORDER_STATES.ACKNOWLEDGED);

  assert.equal(coordinator.lifecycle.getOpenOrders().length, 1);

  // 3. ACTIVATE KILL-SWITCH
  const killResult = await coordinator.activateKillSwitch({
    cancelOpenOrders: true,
    flattenPositions: true,
    reason: "Emergency circuit breaker triggered",
  });

  assert.ok(killResult.success);
  assert.ok(killResult.killSwitchEngaged);
  assert.equal(killResult.cancelledOrdersCount, 1);
  assert.equal(killResult.flattenedPositionsCount, 2);
  assert.equal(killResult.verified, true);
  assert.equal(killResult.residualPositions.length, 0);

  // 4. Strictly verify that broker positions are now empty
  const posAfter = await broker.getPositions();
  assert.equal(posAfter.length, 0, "All positions must be flattened to zero");

  // 5. Subsequent normal order submissions must be blocked by kill-switch
  const blockedRes = await coordinator.submitOrder({
    clientOrderId: "POST-KILL",
    symbol: "AAPL",
    side: "BUY",
    qty: 10,
    type: "MARKET",
  });
  assert.equal(blockedRes.success, false);
  assert.equal(blockedRes.code, RISK_REJECTION_CODES.KILL_SWITCH_ACTIVE);

  // 6. Deactivate kill-switch restores readiness
  coordinator.deactivateKillSwitch();
  assert.equal(coordinator.riskGateway.isKillSwitchEngaged(), false);
});

// ============================================================================
// 8. Post-Run Paper Account Immutability Verification
// ============================================================================
test("Phase 7 Postflight: paper-account.json remained byte-identical throughout execution", () => {
  const finalHash = getFileHash(PAPER_ACCOUNT_PATH);
  assert.equal(
    finalHash,
    EXPECTED_ACCOUNT_HASH,
    "CRITICAL SAFEGUARD: data/paper-account.json was modified during testing!",
  );
});
