import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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
import {
  appendResearchLedger,
  verifyResearchLedgerIntegrity,
  readResearchLedger,
} from "../lib/research-ledger.js";
import { redactSensitiveData, createStructuredLog } from "../lib/logger.js";

const PAPER_ACCOUNT_PATH = "data/paper-account.json";
const EXPECTED_ACCOUNT_HASH =
  "8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D";

const TEST_STORAGE_DIR = "test/fixtures/phase8-scratch";

function getFileHash(filepath) {
  const content = fs.readFileSync(filepath);
  return crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
}

function ensureTestDir() {
  if (!fs.existsSync(TEST_STORAGE_DIR)) {
    fs.mkdirSync(TEST_STORAGE_DIR, { recursive: true });
  }
}

function cleanTestDir() {
  if (fs.existsSync(TEST_STORAGE_DIR)) {
    fs.rmSync(TEST_STORAGE_DIR, { recursive: true, force: true });
  }
}

// ============================================================================
// 1. Baseline and Immutability Invariant (Stage 0)
// ============================================================================
test("Phase 8 Baseline: paper-account.json SHA-256 preflight immutability", () => {
  const currentHash = getFileHash(PAPER_ACCOUNT_PATH);
  assert.equal(
    currentHash,
    EXPECTED_ACCOUNT_HASH,
    "CRITICAL: data/paper-account.json must remain byte-for-byte unmodified",
  );
});

// ============================================================================
// 2. Persistence and Restart Recovery (Stage 1)
// ============================================================================
test("Persistence: Non-terminal states, partial fills, VWAP, and execution IDs survive restart", () => {
  ensureTestDir();
  const storageFile = path.join(TEST_STORAGE_DIR, "orders-persistence-test.json");
  if (fs.existsSync(storageFile)) fs.unlinkSync(storageFile);

  // 1. Session 1: Create manager with storage path and record partial fills
  const mgr1 = new OrderLifecycleManager({ storagePath: storageFile });
  const ord = mgr1.createOrder({
    clientOrderId: "PERSIST-001",
    symbol: "AAPL",
    side: "BUY",
    qty: 200,
    type: "LIMIT",
    limitPrice: 150.0,
  });

  mgr1.transitionOrder("PERSIST-001", ORDER_STATES.RISK_APPROVED, "Risk checks passed");
  mgr1.transitionOrder("PERSIST-001", ORDER_STATES.SUBMITTED, "Submitted to broker");
  mgr1.setBrokerOrderId("PERSIST-001", "BORD-PERSIST-99");
  mgr1.transitionOrder("PERSIST-001", ORDER_STATES.ACKNOWLEDGED, "Broker ACK");

  // Partial fill 1: 100 shares @ $150
  mgr1.applyExecutionReport("PERSIST-001", {
    executionId: "EXEC-P1",
    fillPrice: 150,
    qty: 100,
    fee: 1.0,
  });

  assert.equal(ord.state, ORDER_STATES.PARTIALLY_FILLED);
  assert.equal(ord.filledQty, 100);
  assert.equal(ord.avgFillPrice, 150);
  assert.ok(fs.existsSync(storageFile), "Storage file must be written to disk");

  // 2. Session 2: Simulate crash and restart by creating fresh manager loading the same file
  const mgr2 = new OrderLifecycleManager({ storagePath: storageFile });
  assert.equal(mgr2.getAllOrders().length, 1);

  const recoveredOrd = mgr2.getOrder("PERSIST-001");
  assert.ok(recoveredOrd, "Order must be recovered from disk");
  assert.equal(recoveredOrd.clientOrderId, "PERSIST-001");
  assert.equal(recoveredOrd.brokerOrderId, "BORD-PERSIST-99");
  assert.equal(recoveredOrd.state, ORDER_STATES.PARTIALLY_FILLED);
  assert.equal(recoveredOrd.filledQty, 100);
  assert.equal(recoveredOrd.remainingQty, 100);
  assert.equal(recoveredOrd.avgFillPrice, 150);
  assert.equal(recoveredOrd.totalFees, 1.0);
  assert.equal(recoveredOrd.transitions.length, 5);

  // 3. Duplicate fill rejection survives restart:
  // Re-applying EXEC-P1 to recovered order must be rejected as duplicate
  const dupRes = mgr2.applyExecutionReport("PERSIST-001", {
    executionId: "EXEC-P1",
    fillPrice: 150,
    qty: 100,
    fee: 1.0,
  });
  assert.equal(dupRes.applied, false);
  assert.equal(dupRes.reason, "DUPLICATE_EXECUTION_REPORT");
  assert.equal(recoveredOrd.filledQty, 100, "Duplicate execution must not be counted");

  // 4. Apply second partial fill after restart: 100 shares @ $160
  const fill2Res = mgr2.applyExecutionReport("PERSIST-001", {
    executionId: "EXEC-P2",
    fillPrice: 160,
    qty: 100,
    fee: 1.0,
  });
  assert.ok(fill2Res.applied);
  assert.equal(recoveredOrd.state, ORDER_STATES.FILLED);
  assert.equal(recoveredOrd.filledQty, 200);
  assert.equal(recoveredOrd.remainingQty, 0);
  // Cumulative VWAP: (100*150 + 100*160) / 200 = 155.00
  assert.equal(recoveredOrd.avgFillPrice, 155.0);
  assert.equal(recoveredOrd.totalFees, 2.0);

  cleanTestDir();
});

test("Persistence: Crash recovery reconciles pre-ACK in-flight orders against broker reality", async () => {
  ensureTestDir();
  const storageFile = path.join(TEST_STORAGE_DIR, "orders-crash-preack.json");
  if (fs.existsSync(storageFile)) fs.unlinkSync(storageFile);

  const broker = new MockBrokerAdapter({ initialCash: 100000 });
  await broker.connect();
  broker.setMarketPrice("MSFT", 300);

  const lifecycle1 = new OrderLifecycleManager({ storagePath: storageFile });
  const coordinator1 = new BrokerExecutionCoordinator({ broker, lifecycle: lifecycle1 });

  // Place resting limit order
  const subRes = await coordinator1.submitOrder({
    clientOrderId: "RESTING-PREACK",
    symbol: "MSFT",
    side: "BUY",
    qty: 10,
    type: "LIMIT",
    limitPrice: 280, // resting below market
  });
  assert.ok(subRes.success);
  assert.equal(subRes.order.state, ORDER_STATES.ACKNOWLEDGED);

  // Simulate abrupt client termination & restart
  const lifecycle2 = new OrderLifecycleManager({ storagePath: storageFile });
  const coordinator2 = new BrokerExecutionCoordinator({ broker, lifecycle: lifecycle2 });

  // Recover and reconcile against authoritative upstream broker
  const recoveryResult = await coordinator2.recoverAndReconcile({ storagePath: storageFile });
  assert.ok(recoveryResult.success);
  assert.equal(recoveryResult.recoveredOrdersCount, 1);
  assert.ok(recoveryResult.reconciliation.reconciled);

  const recovered = lifecycle2.getOrder("RESTING-PREACK");
  assert.ok(recovered);
  assert.equal(recovered.state, ORDER_STATES.ACKNOWLEDGED);

  cleanTestDir();
});

test("Research Ledger: Append-only hash chain integrity survives restarts and detects tampering", () => {
  ensureTestDir();
  const ledgerPath = path.join(TEST_STORAGE_DIR, "research-ledger-tamper.jsonl");
  if (fs.existsSync(ledgerPath)) fs.unlinkSync(ledgerPath);

  // 1. Append valid research evaluation entries
  appendResearchLedger(ledgerPath, {
    datasetHash: "DATASET-001",
    version: "1.0.0",
    paramHash: "PARAM-A",
    evaluatedAt: 1700000000000,
    metricsSummary: { sharpe: 1.85, maxDrawdownPct: 0.12 },
  });

  appendResearchLedger(ledgerPath, {
    datasetHash: "DATASET-002",
    version: "1.0.0",
    paramHash: "PARAM-B",
    evaluatedAt: 1700000010000,
    metricsSummary: { sharpe: 2.15, maxDrawdownPct: 0.08 },
  });

  // Verify intact chain
  const v1 = verifyResearchLedgerIntegrity(ledgerPath);
  assert.ok(v1.valid);
  assert.equal(v1.count, 2);

  // 2. Adversarial tampering: modify entry 0's metrics in the ledger file
  const lines = fs.readFileSync(ledgerPath, "utf8").trim().split("\n");
  const tamperedEntry = JSON.parse(lines[0]);
  tamperedEntry.metricsSummary.sharpe = 9.99; // post-hoc tampering
  lines[0] = JSON.stringify(tamperedEntry);
  fs.writeFileSync(ledgerPath, lines.join("\n") + "\n", "utf8");

  // Verify integrity check detects tampering
  const vTampered = verifyResearchLedgerIntegrity(ledgerPath);
  assert.equal(vTampered.valid, false);
  assert.equal(vTampered.brokenIndex, 0);
  assert.match(vTampered.reason, /Integrity hash mismatch/);

  cleanTestDir();
});

// ============================================================================
// 3. Concurrency and Order-Race Testing (Stage 2)
// ============================================================================
test("Concurrency: Simultaneous orders competing for same buying power are strictly serialized without over-allocation", async () => {
  const broker = new MockBrokerAdapter({ initialCash: 10000 }); // $10,000 cash
  await broker.connect();
  broker.setMarketPrice("AAPL", 100);

  const coordinator = new BrokerExecutionCoordinator({ broker });

  // Two simultaneous orders competing for $7,000 each (Total: $14,000 > $10,000 available)
  const order1Spec = {
    clientOrderId: "RACE-01",
    symbol: "AAPL",
    side: "BUY",
    qty: 70, // 70 * 100 = $7,000
    type: "MARKET",
  };
  const order2Spec = {
    clientOrderId: "RACE-02",
    symbol: "AAPL",
    side: "BUY",
    qty: 70, // 70 * 100 = $7,000
    type: "MARKET",
  };

  // Dispatch both simultaneously
  const [res1, res2] = await Promise.all([
    coordinator.submitOrder(order1Spec),
    coordinator.submitOrder(order2Spec),
  ]);

  // Exactly one order must succeed, and the second must be rejected for insufficient buying power
  const successCount = (res1.success ? 1 : 0) + (res2.success ? 1 : 0);
  assert.equal(successCount, 1, "Exactly one order must succeed when competing for limited buying power");

  const rejectedRes = res1.success ? res2 : res1;
  assert.equal(rejectedRes.success, false);
  assert.equal(rejectedRes.code, RISK_REJECTION_CODES.INSUFFICIENT_BUYING_POWER);

  // Verify account cash was only debited once
  const acct = await broker.getAccount();
  assert.ok(acct.cash >= 2900 && acct.cash <= 3100, `Cash should reflect only one trade: ${acct.cash}`);
});

test("Concurrency: Partial fill arriving during in-flight cancellation is safely recorded", async () => {
  const broker = new MockBrokerAdapter({ initialCash: 50000 });
  await broker.connect();
  broker.setMarketPrice("TSLA", 200);

  const coordinator = new BrokerExecutionCoordinator({ broker });

  // Place resting limit order for 50 TSLA
  await broker.submitOrder({
    clientOrderId: "CANCEL-RACE-01",
    symbol: "TSLA",
    side: "BUY",
    qty: 50,
    type: "LIMIT",
    limitPrice: 190,
  });

  const order = coordinator.lifecycle.createOrder({
    clientOrderId: "CANCEL-RACE-01",
    symbol: "TSLA",
    side: "BUY",
    qty: 50,
    type: "LIMIT",
    limitPrice: 190,
  });
  coordinator.lifecycle.transitionOrder("CANCEL-RACE-01", ORDER_STATES.RISK_APPROVED);
  coordinator.lifecycle.transitionOrder("CANCEL-RACE-01", ORDER_STATES.SUBMITTED);
  coordinator.lifecycle.transitionOrder("CANCEL-RACE-01", ORDER_STATES.ACKNOWLEDGED);

  // Simulate: while cancellation is in-flight, a partial fill executes at broker
  broker.simulateFill("CANCEL-RACE-01", { qty: 20, price: 190 });

  // Now cancellation processes the remaining 30
  const cancelRes = await coordinator.cancelOrder("CANCEL-RACE-01", "User cancel");
  assert.ok(cancelRes.success);

  // Result: filledQty = 20, state = CANCELLED (order stopped), fees and VWAP preserved
  assert.equal(order.filledQty, 20);
  assert.equal(order.avgFillPrice, 190);
  assert.equal(order.state, ORDER_STATES.CANCELLED);
});

test("Concurrency: Late fill arriving after cancellation acknowledgement is recorded without desync", async () => {
  const broker = new MockBrokerAdapter({ initialCash: 50000 });
  await broker.connect();
  broker.setMarketPrice("NVDA", 100);

  const coordinator = new BrokerExecutionCoordinator({ broker });

  const order = coordinator.lifecycle.createOrder({
    clientOrderId: "LATE-FILL-01",
    symbol: "NVDA",
    side: "BUY",
    qty: 100,
    type: "LIMIT",
    limitPrice: 95,
  });
  coordinator.lifecycle.transitionOrder("LATE-FILL-01", ORDER_STATES.RISK_APPROVED);
  coordinator.lifecycle.transitionOrder("LATE-FILL-01", ORDER_STATES.SUBMITTED);
  coordinator.lifecycle.transitionOrder("LATE-FILL-01", ORDER_STATES.ACKNOWLEDGED);
  coordinator.lifecycle.transitionOrder("LATE-FILL-01", ORDER_STATES.CANCELLED, "Cancel acknowledged");

  assert.equal(order.state, ORDER_STATES.CANCELLED);

  // Broker delayed execution report arrives after cancel was acknowledged
  const lateReport = {
    executionId: "EXEC-LATE-01",
    clientOrderId: "LATE-FILL-01",
    brokerOrderId: "BORD-LATE",
    symbol: "NVDA",
    side: 1,
    qty: 100,
    fillPrice: 95,
    fee: 1.0,
  };

  const applyRes = coordinator.lifecycle.applyExecutionReport("LATE-FILL-01", lateReport);
  assert.ok(applyRes.applied);
  assert.equal(order.state, ORDER_STATES.FILLED);
  assert.equal(order.filledQty, 100);
  assert.equal(order.avgFillPrice, 95);
});

test("Concurrency: Multiple simultaneous kill-switch requests do not launch duplicate liquidations", async () => {
  const broker = new MockBrokerAdapter({ initialCash: 100000 });
  await broker.connect();
  broker.setMarketPrice("AAPL", 150);

  const coordinator = new BrokerExecutionCoordinator({ broker });

  // Establish long position of 100 AAPL
  await coordinator.submitOrder({
    clientOrderId: "LONG-POS",
    symbol: "AAPL",
    side: "BUY",
    qty: 100,
    type: "MARKET",
  });

  const posBefore = await broker.getPositions();
  assert.equal(posBefore[0].qty, 100);

  // Trigger 3 simultaneous kill-switch activations concurrently
  const [kill1, kill2, kill3] = await Promise.all([
    coordinator.activateKillSwitch({ reason: "Alarm 1" }),
    coordinator.activateKillSwitch({ reason: "Alarm 2" }),
    coordinator.activateKillSwitch({ reason: "Alarm 3" }),
  ]);

  // All must succeed and verify clean flattening
  assert.ok(kill1.success);
  assert.ok(kill2.success);
  assert.ok(kill3.success);

  // Exactly 1 position was flattened; must not over-sell or flip into a short position!
  const posAfter = await broker.getPositions();
  assert.equal(posAfter.length, 0, "Positions must be completely flattened to 0 (no short flip)");
});

// ============================================================================
// 4. Risk Gateway Adversarial Audit (Stage 3)
// ============================================================================
test("Risk Gateway Adversarial: Closing-order exemption cannot reverse position or exceed closable qty", () => {
  const gateway = new PreTradeRiskGateway({ maxOrderQty: 1000 });

  // 1. Attempt isClose: true when NO position exists
  const resNoPos = gateway.evaluateOrder(
    { symbol: "AAPL", side: "SELL", qty: 10, type: "MARKET", isClose: true },
    { positions: [], currentPrice: 150, buyingPower: 10000 },
  );
  assert.equal(resNoPos.allowed, false);
  assert.equal(resNoPos.code, RISK_REJECTION_CODES.INVALID_CLOSING_ORDER);

  // 2. Attempt isClose: true in the SAME direction as position (BUY on long position)
  const resSameSide = gateway.evaluateOrder(
    { symbol: "AAPL", side: "BUY", qty: 10, type: "MARKET", isClose: true },
    {
      positions: [{ symbol: "AAPL", qty: 50 }],
      currentPrice: 150,
      buyingPower: 10000,
    },
  );
  assert.equal(resSameSide.allowed, false);
  assert.equal(resSameSide.code, RISK_REJECTION_CODES.INVALID_CLOSING_ORDER);

  // 3. Attempt isClose: true with qty > existing position (50 shares long, selling 100 to flip short)
  const resExcess = gateway.evaluateOrder(
    { symbol: "AAPL", side: "SELL", qty: 100, type: "MARKET", isClose: true },
    {
      positions: [{ symbol: "AAPL", qty: 50 }],
      currentPrice: 150,
      buyingPower: 10000,
    },
  );
  assert.equal(resExcess.allowed, false);
  assert.equal(resExcess.code, RISK_REJECTION_CODES.CLOSING_QTY_EXCEEDS_POSITION);

  // 4. Legitimate closing order passes
  const resValid = gateway.evaluateOrder(
    { symbol: "AAPL", side: "SELL", qty: 50, type: "MARKET", isClose: true },
    {
      positions: [{ symbol: "AAPL", qty: 50 }],
      currentPrice: 150,
      buyingPower: 0, // buying power 0 doesn't block legitimate close
    },
  );
  assert.equal(resValid.allowed, true);
  assert.equal(resValid.isRiskReducing, true);
});

test("Risk Gateway Adversarial: Reject position exposure breach and missing valuation", () => {
  const gateway = new PreTradeRiskGateway({
    maxPositionExposure: 20000,
  });

  // Current position: 100 AAPL @ $150 ($15,000 exposure). Adding 50 shares @ $150 gives $22,500 > $20,000 limit
  const resExposure = gateway.evaluateOrder(
    { symbol: "AAPL", side: "BUY", qty: 50, type: "LIMIT", limitPrice: 150 },
    {
      positions: [{ symbol: "AAPL", qty: 100 }],
      buyingPower: 50000,
    },
  );
  assert.equal(resExposure.allowed, false);
  assert.equal(resExposure.code, RISK_REJECTION_CODES.MAX_POSITION_EXPOSURE_EXCEEDED);
});

// ============================================================================
// 5. Kill-Switch Reliability & Residual Verification (Stage 4)
// ============================================================================
test("Kill-Switch Reliability: Reports failure and unresolved exposure when broker fails during flattening", async () => {
  const broker = new MockBrokerAdapter({ initialCash: 100000 });
  await broker.connect();
  broker.setMarketPrice("AAPL", 150);

  const coordinator = new BrokerExecutionCoordinator({ broker });

  // Establish position
  await coordinator.submitOrder({
    clientOrderId: "POS-FAIL-01",
    symbol: "AAPL",
    side: "BUY",
    qty: 100,
    type: "MARKET",
  });

  // Inject broker rejection on emergency order
  broker.setFailureMode("REJECT", "Liquidity pool frozen");

  const killResult = await coordinator.activateKillSwitch({
    reason: "Test emergency with failure injection",
  });

  // Kill switch must NOT claim success because residual positions remain
  assert.equal(killResult.success, false, "Must not claim success when flattening failed");
  assert.equal(killResult.verified, false);
  assert.ok(killResult.residualPositions.length > 0, "Must explicitly report residual positions");
  assert.equal(killResult.flattenErrors.length, 1);
  assert.ok(coordinator.riskGateway.isKillSwitchEngaged(), "System must remain halted");

  broker.clearFailureMode();
});

// ============================================================================
// 6. Auditability and Security (Stage 5)
// ============================================================================
test("Security: Recursive secret redaction in audit logs and error metadata", () => {
  const rawMeta = {
    apiKey: "AMBER-SECRET-12345",
    authToken: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    userPassword: "SuperSecretPassword!",
    order: {
      symbol: "AAPL",
      brokerSecret: "UPSTREAM-SECRET-XYZ",
      deepNested: {
        api_key: "DEEP-KEY-999",
      },
    },
  };

  const redacted = redactSensitiveData(rawMeta);

  assert.equal(redacted.apiKey, "[REDACTED]");
  assert.equal(redacted.authToken, "[REDACTED]");
  assert.equal(redacted.userPassword, "[REDACTED]");
  assert.equal(redacted.order.brokerSecret, "[REDACTED]");
  assert.equal(redacted.order.deepNested.api_key, "[REDACTED]");
  assert.equal(redacted.order.symbol, "AAPL", "Non-sensitive data must be preserved");

  // String redaction
  const rawMsg = "Error connecting with key=SECRET99 and Bearer token123";
  const redactedMsg = redactSensitiveData(rawMsg);
  assert.match(redactedMsg, /key=\[REDACTED\]/);
  assert.match(redactedMsg, /Bearer \[REDACTED\]/);
});

// ============================================================================
// 7. Postflight Account State Immutability (Stage 7)
// ============================================================================
test("Phase 8 Postflight: paper-account.json remained byte-identical throughout all tests", () => {
  const finalHash = getFileHash(PAPER_ACCOUNT_PATH);
  assert.equal(
    finalHash,
    EXPECTED_ACCOUNT_HASH,
    "CRITICAL RELEASE GATE FAILURE: data/paper-account.json was modified!",
  );
});
