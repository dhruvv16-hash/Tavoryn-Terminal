import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  ORDER_STATES,
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
  ExecutionOwnershipLock,
  ExecutionOwnershipError,
} from "../lib/broker/execution-lock.js";
import { PaperTradingSession } from "../lib/broker/paper-session.js";

const PAPER_ACCOUNT_PATH = "data/paper-account.json";
const EXPECTED_ACCOUNT_HASH =
  "8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D";

const TEST_SCRATCH_DIR = "test/fixtures/phase9-scratch";

function getFileHash(filepath) {
  const content = fs.readFileSync(filepath);
  return crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
}

function ensureScratchDir() {
  if (!fs.existsSync(TEST_SCRATCH_DIR)) {
    fs.mkdirSync(TEST_SCRATCH_DIR, { recursive: true });
  }
}

function cleanScratchDir() {
  if (fs.existsSync(TEST_SCRATCH_DIR)) {
    fs.rmSync(TEST_SCRATCH_DIR, { recursive: true, force: true });
  }
}

// ============================================================================
// 1. Stage 0 — Baseline & Immutability Invariants
// ============================================================================
test("Phase 9 Baseline: paper-account.json SHA-256 preflight immutability", () => {
  const currentHash = getFileHash(PAPER_ACCOUNT_PATH);
  assert.equal(
    currentHash,
    EXPECTED_ACCOUNT_HASH,
    "CRITICAL: data/paper-account.json must remain byte-for-byte unmodified",
  );
});

// ============================================================================
// 2. Stage 1 — Restart & Persistence Validation
// ============================================================================
test("Restart Validation: Active kill-switch state MUST persist across process restart", async () => {
  ensureScratchDir();
  const storageFile = path.join(TEST_SCRATCH_DIR, "killswitch-persistence.json");
  if (fs.existsSync(storageFile)) fs.unlinkSync(storageFile);

  const broker = new MockBrokerAdapter({ initialCash: 100000 });
  await broker.connect();

  // Session 1: Coordinator activates kill-switch and terminates
  const lifecycle1 = new OrderLifecycleManager({ storagePath: storageFile });
  const coordinator1 = new BrokerExecutionCoordinator({ broker, lifecycle: lifecycle1 });

  await coordinator1.activateKillSwitch({ reason: "Emergency loss breach in Session 1" });
  assert.ok(coordinator1.riskGateway.isKillSwitchEngaged());

  // Session 2: Fresh coordinator starts up after crash/restart
  const lifecycle2 = new OrderLifecycleManager({ storagePath: storageFile });
  const coordinator2 = new BrokerExecutionCoordinator({ broker, lifecycle: lifecycle2 });

  // Run recovery and reconciliation
  const recoveryResult = await coordinator2.recoverAndReconcile({ storagePath: storageFile });
  assert.equal(recoveryResult.killSwitchEngaged, true);
  assert.equal(coordinator2.riskGateway.isKillSwitchEngaged(), true);

  // CRITICAL: Trading must NOT silently reactivate! Standard order must be rejected
  const blockedRes = await coordinator2.submitOrder({
    clientOrderId: "POST-RESTART-ORDER",
    symbol: "AAPL",
    side: "BUY",
    qty: 10,
    type: "MARKET",
  });
  assert.equal(blockedRes.success, false);
  assert.equal(blockedRes.code, RISK_REJECTION_CODES.KILL_SWITCH_ACTIVE);

  cleanScratchDir();
});

test("Restart Validation: Corrupted state file fails closed and engages kill switch", async () => {
  ensureScratchDir();
  const corruptedFile = path.join(TEST_SCRATCH_DIR, "corrupted-state.json");

  // Write corrupted / truncated JSON data to simulate interrupted disk write
  fs.writeFileSync(corruptedFile, '{"version": 1, "orders": [{"clientOrderId": "CORRUPTED"', "utf8");

  const broker = new MockBrokerAdapter();
  await broker.connect();

  const lifecycle = new OrderLifecycleManager();
  const coordinator = new BrokerExecutionCoordinator({ broker, lifecycle });

  // Recovery must fail closed rather than starting with a blank slate
  const recoveryResult = await coordinator.recoverAndReconcile({ storagePath: corruptedFile });
  assert.equal(recoveryResult.success, false);
  assert.match(recoveryResult.error, /corrupted or unreadable/i);
  assert.equal(recoveryResult.killSwitchEngaged, true);
  assert.equal(coordinator.riskGateway.isKillSwitchEngaged(), true);

  // New orders rejected
  const blockedRes = await coordinator.submitOrder({
    clientOrderId: "CORRUPT-TEST",
    symbol: "MSFT",
    side: "BUY",
    qty: 10,
  });
  assert.equal(blockedRes.success, false);
  assert.equal(blockedRes.code, RISK_REJECTION_CODES.KILL_SWITCH_ACTIVE);

  cleanScratchDir();
});

test("Restart Validation: Unresolved reconciliation discrepancies halt trading post-restart", async () => {
  ensureScratchDir();
  const storageFile = path.join(TEST_SCRATCH_DIR, "recon-mismatch.json");
  if (fs.existsSync(storageFile)) fs.unlinkSync(storageFile);

  const broker = new MockBrokerAdapter();
  await broker.connect();

  // Create local order in ACKNOWLEDGED state that is completely absent on broker
  const lifecycle = new OrderLifecycleManager({ storagePath: storageFile });
  const ord = lifecycle.createOrder({
    clientOrderId: "GHOST-01",
    symbol: "AAPL",
    side: "BUY",
    qty: 10,
    type: "LIMIT",
    limitPrice: 150,
  });
  lifecycle.transitionOrder("GHOST-01", ORDER_STATES.RISK_APPROVED);
  lifecycle.transitionOrder("GHOST-01", ORDER_STATES.SUBMITTED);
  lifecycle.transitionOrder("GHOST-01", ORDER_STATES.ACKNOWLEDGED);

  const coordinator = new BrokerExecutionCoordinator({ broker, lifecycle });

  // Reconcile post-restart: missing order triggers discrepancy and halts trading
  const recRes = await coordinator.recoverAndReconcile({ storagePath: storageFile });
  assert.equal(recRes.success, false);
  assert.equal(recRes.killSwitchEngaged, true);
  assert.ok(coordinator.riskGateway.isKillSwitchEngaged());

  cleanScratchDir();
});

// ============================================================================
// 3. Stage 2 — Execution Ownership & Cross-Process Exclusivity
// ============================================================================
test("Execution Ownership: Enforces single process ownership and rejects concurrent owners", () => {
  ensureScratchDir();
  const lockFile = path.join(TEST_SCRATCH_DIR, "account-execution.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  // Process 1 acquires lock
  const lock1 = new ExecutionOwnershipLock(lockFile, { processId: process.pid, ownerId: "PROC-1" });
  assert.ok(lock1.acquire());
  assert.ok(fs.existsSync(lockFile));

  // Process 2 (different process ID, active) attempts to acquire same account lock
  const lock2 = new ExecutionOwnershipLock(lockFile, { processId: 999999, ownerId: "PROC-2" });

  // Process 1 already holds lock with process.pid (which is alive): Process 2 must be rejected!
  assert.throws(
    () => {
      lock2.acquire();
    },
    (err) => err instanceof ExecutionOwnershipError && err.code === "EXECUTION_OWNERSHIP_LOCKED",
  );

  // Dead process lease reclamation:
  // If the lock file points to a dead PID (isProcessAlive returns false), lock can be reclaimed
  const deadLockData = {
    ownerId: "PROC-DEAD",
    processId: 888888, // dead PID
    acquiredAt: Date.now() - 60000,
    heartbeatAt: Date.now() - 60000,
  };
  fs.writeFileSync(lockFile, JSON.stringify(deadLockData), "utf8");

  const lock3 = new ExecutionOwnershipLock(lockFile, { processId: process.pid, ownerId: "PROC-3" });
  lock3.isProcessAlive = () => false; // dead PID
  assert.ok(lock3.acquire(), "Dead process lease must be safely reclaimed");

  // Clean release
  lock3.release();
  assert.equal(fs.existsSync(lockFile), false);

  cleanScratchDir();
});

// ============================================================================
// 4. Stage 3, 4, 5 — Extended Paper Session & Accounting Reconciliation
// ============================================================================
test("Extended Paper Session: Full multi-regime simulation and exact cash conservation verification", async () => {
  const broker = new MockBrokerAdapter({
    initialCash: 100000,
    commissionPerShare: 0.005,
    minCommission: 1.0,
    slippageBps: 2, // 2 basis points slippage
  });
  await broker.connect();

  const coordinator = new BrokerExecutionCoordinator({ broker });
  const session = new PaperTradingSession({ coordinator, broker, sessionName: "TEST-SESSION-01" });

  const sessionResult = await session.runSession({
    trend: { symbol: "AAPL", startPrice: 150.0, steps: 5 },
    range: { symbol: "MSFT", basePrice: 300.0 },
    volatile: { symbol: "AAPL" },
    feed: {},
    boundary: {},
  });

  // 1. Verify regimes executed
  assert.ok(sessionResult.regimesExecuted.includes("TRENDING_UP"));
  assert.ok(sessionResult.regimesExecuted.includes("CHOPPY_RANGE"));
  assert.ok(sessionResult.regimesExecuted.includes("VOLATILE_GAP"));
  assert.ok(sessionResult.regimesExecuted.includes("FEED_OUTAGE_RECOVERY"));
  assert.ok(sessionResult.regimesExecuted.includes("SESSION_BOUNDARY_CLOSE"));

  // 2. Verify operational metrics
  const metrics = sessionResult.metrics;
  assert.ok(metrics.ticksProcessed >= 7);
  assert.ok(metrics.ordersSubmitted >= 7);
  assert.ok(metrics.ordersFilled >= 5);
  assert.ok(metrics.ordersCancelled >= 1);
  assert.ok(metrics.feedOutagesCount >= 1);
  assert.ok(metrics.feedGapsRecovered >= 1);
  assert.ok(metrics.killSwitchTriggeredCount >= 1);
  assert.ok(metrics.latencyStats.p50Ms >= 0);

  // 3. Stage 4: Rigorous Cash Conservation Equation Verification
  // Ending Cash must match Starting Cash + Realized P&L - Fees - Open Outlay down to $0.01
  const accounting = sessionResult.accounting;
  assert.ok(
    accounting.isCashConserved,
    `Cash conservation failure! Discrepancy: $${accounting.cashDiscrepancy}. Expected: $${accounting.expectedEndingCash}, Actual: $${accounting.endingCash}`,
  );
  assert.equal(accounting.cashDiscrepancy, 0.0, "Cash discrepancy must be exactly 0.00");
  assert.equal(accounting.openPositionsCount, 0, "All positions cleanly flattened after session close");
});

test("Extended Paper Session: Mid-session crash recovery maintains exact accounting", async () => {
  ensureScratchDir();
  const storageFile = path.join(TEST_SCRATCH_DIR, "session-mid-crash.json");
  if (fs.existsSync(storageFile)) fs.unlinkSync(storageFile);

  const broker = new MockBrokerAdapter({ initialCash: 100000 });
  await broker.connect();
  broker.setMarketPrice("AAPL", 150);

  // Session 1: Buy 50 AAPL, then simulate crash
  const lifecycle1 = new OrderLifecycleManager({ storagePath: storageFile });
  const coordinator1 = new BrokerExecutionCoordinator({ broker, lifecycle: lifecycle1 });

  await coordinator1.submitOrder({
    clientOrderId: "MID-CRASH-01",
    symbol: "AAPL",
    side: "BUY",
    qty: 50,
    type: "MARKET",
  });

  const pos1 = await broker.getPositions();
  assert.equal(pos1[0].qty, 50);

  // Crash and reboot into Session 2 loading storage file
  const lifecycle2 = new OrderLifecycleManager({ storagePath: storageFile });
  const coordinator2 = new BrokerExecutionCoordinator({ broker, lifecycle: lifecycle2 });
  const recRes = await coordinator2.recoverAndReconcile({ storagePath: storageFile });
  assert.ok(recRes.success);
  assert.equal(recRes.recoveredOrdersCount, 1);

  // Session 2: Liquidate position cleanly
  const closeRes = await coordinator2.submitOrder({
    clientOrderId: "MID-CRASH-02",
    symbol: "AAPL",
    side: "SELL",
    qty: 50,
    type: "MARKET",
    isClose: true,
  });
  assert.ok(closeRes.success);

  const pos2 = await broker.getPositions();
  assert.equal(pos2.length, 0);

  // Verify cash conservation
  const acct = await broker.getAccount();
  let totalFees = 0;
  for (const exec of broker.executions) totalFees += exec.fee;
  const expectedCash = 100000 + acct.realizedPnL - totalFees;
  assert.equal(Number(acct.cash.toFixed(2)), Number(expectedCash.toFixed(2)));

  cleanScratchDir();
});

// ============================================================================
// 5. Stage 6 — Postflight Safety & File Immutability
// ============================================================================
test("Phase 9 Postflight: paper-account.json remained byte-identical throughout all operations", () => {
  const finalHash = getFileHash(PAPER_ACCOUNT_PATH);
  assert.equal(
    finalHash,
    EXPECTED_ACCOUNT_HASH,
    "CRITICAL RELEASE GATE FAILURE: data/paper-account.json was modified!",
  );
});
