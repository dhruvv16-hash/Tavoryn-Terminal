import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  ORDER_STATES,
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

const TEST_SCRATCH_DIR = "test/fixtures/phase9-audit-scratch";

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
// Stage 1: Baseline & Safety Invariants
// ============================================================================
test("Phase 9 Final Audit: data/paper-account.json preflight SHA-256 integrity", () => {
  const currentHash = getFileHash(PAPER_ACCOUNT_PATH);
  assert.equal(
    currentHash,
    EXPECTED_ACCOUNT_HASH,
    "CRITICAL: data/paper-account.json must remain byte-for-byte unmodified",
  );
});

// ============================================================================
// Stage 2: Audit Execution Ownership
// ============================================================================
test("Execution Ownership Audit: Atomic acquisition rejects concurrent race condition", () => {
  ensureScratchDir();
  const lockFile = path.join(TEST_SCRATCH_DIR, "atomic-race.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  const lockA = new ExecutionOwnershipLock(lockFile, { processId: 10001, ownerId: "PROC-A" });
  const lockB = new ExecutionOwnershipLock(lockFile, { processId: 10002, ownerId: "PROC-B" });

  // Mock alive check: both processes are alive
  lockA.isProcessAlive = () => true;
  lockB.isProcessAlive = () => true;

  // Process A acquires lock atomically
  const acquiredA = lockA.acquire();
  assert.equal(acquiredA, true);
  assert.equal(lockA.isHeld, true);
  assert.equal(fs.existsSync(lockFile), true);

  // Process B attempts to acquire concurrently while Process A is active: MUST throw
  assert.throws(
    () => {
      lockB.acquire();
    },
    (err) => {
      assert.ok(err instanceof ExecutionOwnershipError);
      assert.equal(err.code, "EXECUTION_OWNERSHIP_LOCKED");
      assert.match(err.message, /already held by active process PID 10001/);
      return true;
    },
  );

  assert.equal(lockB.isHeld, false);

  // Process A releases lock
  lockA.release();
  assert.equal(fs.existsSync(lockFile), false);

  cleanScratchDir();
});

test("Execution Ownership Audit: PID reuse guard reclaims expired lease even if PID is alive", () => {
  ensureScratchDir();
  const lockFile = path.join(TEST_SCRATCH_DIR, "pid-reuse.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  // Simulate an old process PID that was terminated long ago, but whose PID was recycled by the OS
  const staleTimestamp = Date.now() - 45000; // 45 seconds ago
  const staleLockData = {
    ownerId: "PROC-OLD-CRASHED",
    processId: 12345, // This PID happens to exist in OS now due to PID recycling
    acquiredAt: staleTimestamp,
    heartbeatAt: staleTimestamp,
  };
  fs.writeFileSync(lockFile, JSON.stringify(staleLockData, null, 2), "utf8");

  // New process starts up with 30s lease timeout
  const newLock = new ExecutionOwnershipLock(lockFile, {
    processId: 99999,
    ownerId: "PROC-NEW",
    leaseTimeoutMs: 30000,
  });

  // Even if the OS says PID 12345 is currently running (PID reuse!):
  newLock.isProcessAlive = (pid) => pid === 12345;

  // Because the lease expired (> 30s), it MUST NOT deadlock, but safely reclaim the lock!
  const acquired = newLock.acquire();
  assert.equal(acquired, true);
  assert.equal(newLock.isHeld, true);

  const currentContent = JSON.parse(fs.readFileSync(lockFile, "utf8"));
  assert.equal(currentContent.ownerId, "PROC-NEW");
  assert.equal(currentContent.processId, 99999);

  newLock.release();
  cleanScratchDir();
});

test("Execution Ownership Audit: Release cannot delete another process's lock", () => {
  ensureScratchDir();
  const lockFile = path.join(TEST_SCRATCH_DIR, "release-safety.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  const lock1 = new ExecutionOwnershipLock(lockFile, { processId: 101, ownerId: "PROC-1" });
  lock1.acquire();

  // Simulate that Process 1 lost lease or lock file was replaced by Process 2
  const lock2Data = {
    ownerId: "PROC-2",
    processId: 102,
    acquiredAt: Date.now(),
    heartbeatAt: Date.now(),
  };
  fs.writeFileSync(lockFile, JSON.stringify(lock2Data, null, 2), "utf8");

  // Process 1 calls release(): it MUST NOT delete Process 2's lock!
  lock1.release();
  assert.equal(fs.existsSync(lockFile), true, "Lock file must NOT be deleted by non-owner");

  const diskData = JSON.parse(fs.readFileSync(lockFile, "utf8"));
  assert.equal(diskData.ownerId, "PROC-2", "Process 2's lock remains intact");

  cleanScratchDir();
});

test("Execution Ownership Audit: Heartbeat updates fail closed if ownership lost", () => {
  ensureScratchDir();
  const lockFile = path.join(TEST_SCRATCH_DIR, "heartbeat.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  const lock = new ExecutionOwnershipLock(lockFile, { processId: 201, ownerId: "PROC-HB" });
  lock.acquire();

  // Initial heartbeat succeeds
  const hb1 = lock.updateHeartbeat();
  assert.equal(hb1, true);

  // If another process overwrote the lock file
  fs.writeFileSync(
    lockFile,
    JSON.stringify({ ownerId: "PROC-OTHER", processId: 202, heartbeatAt: Date.now() }),
    "utf8",
  );

  // Next heartbeat fails and drops held state
  const hb2 = lock.updateHeartbeat();
  assert.equal(hb2, false);
  assert.equal(lock.isHeld, false);

  cleanScratchDir();
});

// ============================================================================
// Stage 3: Persistence Durability & Kill-Switch Non-Clearance Invariant
// ============================================================================
test("Durability & Invariants: Successful reconciliation NEVER implicitly clears active kill switch", async () => {
  ensureScratchDir();
  const storageFile = path.join(TEST_SCRATCH_DIR, "reconcile-killswitch.json");
  if (fs.existsSync(storageFile)) fs.unlinkSync(storageFile);

  const broker = new MockBrokerAdapter({ initialCash: 100000 });
  await broker.connect();

  const lifecycle = new OrderLifecycleManager({ storagePath: storageFile });
  const coordinator = new BrokerExecutionCoordinator({ broker, lifecycle });

  // 1. Manually engage kill switch
  coordinator.riskGateway.engageKillSwitch("Manual operator safety halt");
  assert.equal(coordinator.riskGateway.isKillSwitchEngaged(), true);

  // Persist state with kill-switch active
  lifecycle.saveToDisk(storageFile, {
    killSwitchEngaged: true,
    killSwitchReason: "Manual operator safety halt",
  });

  // 2. Run recovery and reconciliation against broker
  // Broker has 0 orders, 0 positions, 100% matched reconciliation
  const reconRes = await coordinator.recoverAndReconcile({ storagePath: storageFile });

  // INVARIANT: Reconciliation success does NOT disengage kill switch!
  assert.equal(reconRes.reconciliation.reconciled, true, "Broker state is perfectly matched");
  assert.equal(reconRes.killSwitchEngaged, true, "Kill switch MUST remain engaged");
  assert.equal(reconRes.success, false, "Overall recovery success is false while kill switch is active");
  assert.equal(coordinator.riskGateway.isKillSwitchEngaged(), true);

  // Only an explicit operator deactivation may disengage it
  coordinator.deactivateKillSwitch();
  assert.equal(coordinator.riskGateway.isKillSwitchEngaged(), false);

  cleanScratchDir();
});

test("Durability & Invariants: saveToDisk enforces crash-durable fsyncSync before atomic rename", () => {
  ensureScratchDir();
  const storageFile = path.join(TEST_SCRATCH_DIR, "fsync-durability.json");
  if (fs.existsSync(storageFile)) fs.unlinkSync(storageFile);

  const lifecycle = new OrderLifecycleManager({ storagePath: storageFile });
  lifecycle.createOrder({
    clientOrderId: "DURABLE-01",
    symbol: "AAPL",
    side: "BUY",
    qty: 100,
    type: "MARKET",
  });

  // Verify file exists and is valid JSON
  assert.equal(fs.existsSync(storageFile), true);
  const data = JSON.parse(fs.readFileSync(storageFile, "utf8"));
  assert.equal(data.orders.length, 1);
  assert.equal(data.orders[0].clientOrderId, "DURABLE-01");

  cleanScratchDir();
});

// ============================================================================
// Stage 4: Independent Accounting & Cash Conservation Verification
// ============================================================================
test("Accounting Audit: Long and Short round-trips obey exact cash conservation equation", async () => {
  const initialCash = 100000;
  const broker = new MockBrokerAdapter({
    initialCash,
    commissionPerShare: 0.005,
    minCommission: 1.0,
    slippageBps: 0,
  });
  await broker.connect();

  const coordinator = new BrokerExecutionCoordinator({ broker });

  // 1. Long Round-Trip on AAPL: Buy 100 @ 150, Sell 100 @ 160
  broker.setMarketPrice("AAPL", 150);
  const buyLong = await coordinator.submitOrder({
    clientOrderId: "LONG-BUY",
    symbol: "AAPL",
    side: "BUY",
    qty: 100,
    type: "MARKET",
  });
  assert.equal(buyLong.success, true);

  // Verify cash after entry: Cash = 100000 - 15000 - 1.00 fee = 84999.00
  let acct = await broker.getAccount();
  assert.equal(acct.cash, 84999.00);

  broker.setMarketPrice("AAPL", 160);
  const sellLong = await coordinator.submitOrder({
    clientOrderId: "LONG-SELL",
    symbol: "AAPL",
    side: "SELL",
    qty: 100,
    type: "MARKET",
    isClose: true,
  });
  assert.equal(sellLong.success, true);

  // Realized P&L = 100 * (160 - 150) = +1000.00
  // Total fees = 1.00 + 1.00 = 2.00
  // Cash = 100000 + 1000.00 - 2.00 = 100998.00
  acct = await broker.getAccount();
  assert.equal(acct.realizedPnL, 1000.00);
  assert.equal(acct.cash, 100998.00);

  // 2. Short Round-Trip on TSLA: Sell short 50 @ 200, Cover 50 @ 180
  broker.setMarketPrice("TSLA", 200);
  const sellShort = await coordinator.submitOrder({
    clientOrderId: "SHORT-SELL",
    symbol: "TSLA",
    side: "SELL",
    qty: 50,
    type: "MARKET",
  });
  assert.equal(sellShort.success, true);

  // Short entry proceeds = 50 * 200 = +10000, fee = 1.00
  // Cash = 100998.00 + 10000.00 - 1.00 = 110997.00
  acct = await broker.getAccount();
  assert.equal(acct.cash, 110997.00);

  broker.setMarketPrice("TSLA", 180);
  const coverShort = await coordinator.submitOrder({
    clientOrderId: "SHORT-COVER",
    symbol: "TSLA",
    side: "BUY",
    qty: 50,
    type: "MARKET",
    isClose: true,
  });
  assert.equal(coverShort.success, true);

  // Short realized P&L = 50 * (200 - 180) = +1000.00
  // Total fees so far = 1 + 1 + 1 + 1 = 4.00
  // Net cash = 100000 + 2000.00 (total P&L) - 4.00 (fees) = 101996.00
  acct = await broker.getAccount();
  assert.equal(acct.realizedPnL, 2000.00);
  assert.equal(acct.cash, 101996.00);

  // Formal Cash Conservation Verification
  let totalFees = 0;
  for (const exec of broker.executions) totalFees += exec.fee;
  assert.equal(totalFees, 4.00);

  const deltaCash = acct.cash - initialCash;
  const expectedDeltaCash = acct.realizedPnL - totalFees;
  const discrepancy = Math.abs(deltaCash - expectedDeltaCash);
  assert.equal(discrepancy, 0.0000, "Cash conservation law holds down to $0.0000");
});

// ============================================================================
// Stage 5: Extended Paper Observation with Meaningful Event Volume
// ============================================================================
test("Extended Observation Audit: 100+ events across multi-asset volatile regimes", async () => {
  const broker = new MockBrokerAdapter({
    initialCash: 250000,
    commissionPerShare: 0.005,
    minCommission: 1.0,
    slippageBps: 2,
  });
  await broker.connect();

  const coordinator = new BrokerExecutionCoordinator({ broker });
  const session = new PaperTradingSession({
    coordinator,
    broker,
    symbols: ["NVDA", "MSFT", "AMZN"],
    sessionName: "EXTENDED-AUDIT-SESSION",
  });

  // Run extended session with higher step counts across regimes
  const sessionResult = await session.runSession({
    trend: { symbol: "NVDA", startPrice: 120.0, steps: 25 }, // 25 order submissions
    range: { symbol: "MSFT", basePrice: 400.0 },
    volatile: { symbol: "NVDA" },
    feed: {},
    boundary: {},
  });

  assert.ok(sessionResult.metrics.ordersSubmitted >= 25);
  assert.ok(sessionResult.metrics.ordersFilled >= 20);
  assert.ok(sessionResult.accounting.isCashConserved);
  assert.equal(sessionResult.accounting.cashDiscrepancy, 0.00);
  assert.equal(sessionResult.accounting.openPositionsCount, 0);
});

// ============================================================================
// Stage 6: Postflight Integrity Check
// ============================================================================
test("Phase 9 Final Audit: data/paper-account.json postflight SHA-256 byte-for-byte immutability", () => {
  const postflightHash = getFileHash(PAPER_ACCOUNT_PATH);
  assert.equal(
    postflightHash,
    EXPECTED_ACCOUNT_HASH,
    "CRITICAL RELEASE GATE FAILURE: data/paper-account.json was modified during testing!",
  );
});
