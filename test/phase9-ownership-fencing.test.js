import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

import {
  ORDER_STATES,
  OrderLifecycleManager,
} from "../lib/broker/order-lifecycle.js";

import { MockBrokerAdapter } from "../lib/broker/mock-broker.js";
import { BrokerExecutionCoordinator } from "../lib/broker/execution-coordinator.js";
import {
  ExecutionOwnershipLock,
  ExecutionOwnershipError,
} from "../lib/broker/execution-lock.js";

const TEST_SCRATCH_DIR = "test/fixtures/phase9-fencing-scratch";

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
// 1. Owner pausing longer than lease timeout and resuming (local expiry check)
// ============================================================================
test("Ownership Fencing: Owner pausing longer than lease timeout fails ownership check on resume", () => {
  ensureScratchDir();
  const lockFile = path.join(TEST_SCRATCH_DIR, "paused-owner.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  const lock = new ExecutionOwnershipLock(lockFile, {
    processId: process.pid,
    ownerId: "PROC-PAUSE",
    leaseTimeoutMs: 30000,
  });

  assert.ok(lock.acquire());
  assert.equal(lock.isHeld, true);

  // Simulate an event-loop freeze or GC pause of 35 seconds
  lock.lastHeartbeatTime = Date.now() - 35000;

  // On resume, assertOwnership() MUST detect that local lease expired without relying on external file changes
  assert.throws(
    () => {
      lock.assertOwnership();
    },
    (err) => {
      assert.ok(err instanceof ExecutionOwnershipError);
      assert.match(err.message, /lease expired locally/);
      return true;
    },
  );

  // isHeld must be downgraded to false
  assert.equal(lock.isHeld, false);

  lock.release();
  cleanScratchDir();
});

// ============================================================================
// 2. Second process reclaiming expired lock while original process remains alive
// ============================================================================
test("Ownership Fencing: Second process reclaims expired lock while original process remains alive", () => {
  ensureScratchDir();
  const lockFile = path.join(TEST_SCRATCH_DIR, "reclaim-expired.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  const lock1 = new ExecutionOwnershipLock(lockFile, {
    processId: 1001,
    ownerId: "PROC-1",
    leaseTimeoutMs: 30000,
  });
  lock1.isProcessAlive = () => true;
  assert.ok(lock1.acquire());

  // Simulate that Process 1 paused and its heartbeat became stale (> 30s ago)
  const staleData = {
    ownerId: "PROC-1",
    processId: 1001,
    acquiredAt: Date.now() - 40000,
    heartbeatAt: Date.now() - 40000,
  };
  fs.writeFileSync(lockFile, JSON.stringify(staleData, null, 2), "utf8");

  // Process 2 arrives while Process 1 is still technically alive in OS:
  const lock2 = new ExecutionOwnershipLock(lockFile, {
    processId: 2002,
    ownerId: "PROC-2",
    leaseTimeoutMs: 30000,
  });
  lock2.isProcessAlive = (pid) => pid === 1001; // Process 1 is alive

  // Process 2 successfully reclaims the lock because lease expired
  assert.ok(lock2.acquire());
  assert.equal(lock2.isHeld, true);

  // Verify file now belongs to Process 2
  const currentContent = JSON.parse(fs.readFileSync(lockFile, "utf8"));
  assert.equal(currentContent.ownerId, "PROC-2");

  lock2.release();
  cleanScratchDir();
});

// ============================================================================
// 3. Simultaneous stale-lock recovery attempts
// ============================================================================
test("Ownership Fencing: Simultaneous stale-lock recovery attempts result in exactly one winner", () => {
  ensureScratchDir();
  const lockFile = path.join(TEST_SCRATCH_DIR, "simul-reclaim.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  // Write an expired stale lock
  const staleData = {
    ownerId: "PROC-STALE",
    processId: 9999,
    acquiredAt: Date.now() - 50000,
    heartbeatAt: Date.now() - 50000,
  };
  fs.writeFileSync(lockFile, JSON.stringify(staleData, null, 2), "utf8");

  const lockA = new ExecutionOwnershipLock(lockFile, {
    processId: 1111,
    ownerId: "PROC-A",
    leaseTimeoutMs: 30000,
  });
  const lockB = new ExecutionOwnershipLock(lockFile, {
    processId: 2222,
    ownerId: "PROC-B",
    leaseTimeoutMs: 30000,
  });

  // Both processes know PID 1111 (Process A) is alive, but PID 9999 (stale) is dead
  lockA.isProcessAlive = (pid) => pid === 1111;
  lockB.isProcessAlive = (pid) => pid === 1111;

  // Process A acquires lock
  const successA = lockA.acquire();
  assert.equal(successA, true);

  // Process B attempts to reclaim at the same time: MUST fail with ExecutionOwnershipError
  assert.throws(
    () => {
      lockB.acquire();
    },
    (err) => {
      assert.ok(err instanceof ExecutionOwnershipError);
      assert.match(err.message, /already held by active process PID 1111/);
      return true;
    },
  );

  assert.equal(lockA.isHeld, true);
  assert.equal(lockB.isHeld, false);

  lockA.release();
  cleanScratchDir();
});

// ============================================================================
// 4. Heartbeat failure immediately before order dispatch
// ============================================================================
test("Ownership Fencing: Heartbeat failure immediately before order dispatch aborts submission", async () => {
  ensureScratchDir();
  const lockFile = path.join(TEST_SCRATCH_DIR, "hb-fail-dispatch.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  const broker = new MockBrokerAdapter({ initialCash: 100000 });
  await broker.connect();

  const lock = new ExecutionOwnershipLock(lockFile, {
    processId: process.pid,
    ownerId: "PROC-HB-TEST",
    leaseTimeoutMs: 30000,
  });

  const coordinator = new BrokerExecutionCoordinator({
    broker,
    executionLock: lock,
  });

  coordinator.acquireExecutionOwnership();
  assert.equal(lock.isHeld, true);

  // Simulate external deletion or corruption of the lock file
  fs.unlinkSync(lockFile);

  // Heartbeat fails
  const hbRes = lock.updateHeartbeat();
  assert.equal(hbRes, false);
  assert.equal(lock.isHeld, false);

  // Coordinator attempts to submit order: MUST be rejected by ownership fencing!
  const submitRes = await coordinator.submitOrder({
    clientOrderId: "FENCED-ORDER-01",
    symbol: "AAPL",
    side: "BUY",
    qty: 10,
    type: "MARKET",
  });

  assert.equal(submitRes.success, false);
  assert.equal(submitRes.code, "EXECUTION_OWNERSHIP_LOST");
  assert.match(submitRes.reason, /ownership/i);

  // Broker must have received ZERO orders!
  const openOrders = await broker.getOpenOrders();
  const executions = broker.executions;
  assert.equal(openOrders.length, 0);
  assert.equal(executions.length, 0);

  coordinator.releaseExecutionOwnership();
  cleanScratchDir();
});

// ============================================================================
// 5. Old owner attempting to submit or cancel orders after losing ownership
// ============================================================================
test("Ownership Fencing: Old owner cannot submit or cancel orders after being superseded", async () => {
  ensureScratchDir();
  const lockFile = path.join(TEST_SCRATCH_DIR, "superseded-owner.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  const broker = new MockBrokerAdapter({ initialCash: 100000 });
  await broker.connect();

  // Process 1 starts and acquires ownership
  const lock1 = new ExecutionOwnershipLock(lockFile, {
    processId: 1001,
    ownerId: "PROC-1",
    leaseTimeoutMs: 30000,
  });
  const coordinator1 = new BrokerExecutionCoordinator({
    broker,
    executionLock: lock1,
  });
  coordinator1.acquireExecutionOwnership();

  broker.setMarketPrice("AAPL", 150);

  // Process 1 places an initial resting limit order legitimately
  const order1 = await coordinator1.submitOrder({
    clientOrderId: "LEGIT-ORDER-01",
    symbol: "AAPL",
    side: "BUY",
    qty: 10,
    type: "LIMIT",
    limitPrice: 140, // resting limit order below 150 market price
  });
  assert.equal(order1.status, ORDER_STATES.ACKNOWLEDGED);

  // Now, Process 1 pauses. Process 2 takes over and supersedes the lock!
  const lock2Data = {
    ownerId: "PROC-2",
    processId: 2002,
    acquiredAt: Date.now(),
    heartbeatAt: Date.now(),
  };
  fs.writeFileSync(lockFile, JSON.stringify(lock2Data, null, 2), "utf8");

  // Process 1 wakes up and attempts to submit a NEW order: MUST BE REJECTED
  const order2 = await coordinator1.submitOrder({
    clientOrderId: "STOLEN-ORDER-02",
    symbol: "AAPL",
    side: "BUY",
    qty: 5,
    type: "MARKET",
  });
  assert.equal(order2.success, false);
  assert.equal(order2.code, "EXECUTION_OWNERSHIP_LOST");
  assert.match(order2.reason, /superseded by PROC-2/);

  // Process 1 attempts to CANCEL the previous order: MUST ALSO BE REJECTED
  const cancelRes = await coordinator1.cancelOrder("LEGIT-ORDER-01");
  assert.equal(cancelRes.success, false);
  assert.equal(cancelRes.code, "EXECUTION_OWNERSHIP_LOST");
  assert.match(cancelRes.reason, /ownership.*(superseded|not held)/i);

  // Verify order on broker was NOT cancelled by superseded Process 1
  const brokerOrd = await broker.getOrder("LEGIT-ORDER-01");
  assert.equal(brokerOrd.status, "OPEN");

  coordinator1.releaseExecutionOwnership();
  cleanScratchDir();
});

// ============================================================================
// 6. Cross-process isolation via child process termination
// ============================================================================
test("Cross-Process OS Isolation: Crashed child process lock is reclaimed by parent", () => {
  ensureScratchDir();
  const lockFile = path.resolve(TEST_SCRATCH_DIR, "child-crash.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  // Spawn an independent OS Node child process that acquires the lock then abruptly exits
  const childScript = `
    const fs = require('node:fs');
    const path = require('node:path');
    const { ExecutionOwnershipLock } = require('./lib/broker/execution-lock.js');
    const lock = new ExecutionOwnershipLock('${lockFile.replace(/\\/g, "/")}', {
      ownerId: 'PROC-CHILD-TERMINATING',
    });
    lock.acquire();
    process.exit(0); // Exit without calling release()
  `;

  const child = spawnSync(process.execPath, ["-e", childScript], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(child.status, 0);
  assert.equal(fs.existsSync(lockFile), true, "Lock file was created by child process");

  // Parent process now attempts to acquire the lock left by the terminated child
  const parentLock = new ExecutionOwnershipLock(lockFile, {
    ownerId: "PROC-PARENT",
  });

  const parentAcquired = parentLock.acquire();
  assert.equal(parentAcquired, true, "Parent safely reclaims lock abandoned by terminated child");
  assert.equal(parentLock.isHeld, true);

  parentLock.release();
  assert.equal(fs.existsSync(lockFile), false);

  cleanScratchDir();
});

// ============================================================================
// 7. Windows Persistence Durability: Interrupted write before rename
// ============================================================================
test("Windows Durability: Interrupted write before rename leaves existing state intact without corruption", () => {
  ensureScratchDir();
  const stateFile = path.resolve(TEST_SCRATCH_DIR, "durability-prior.json");
  if (fs.existsSync(stateFile)) fs.unlinkSync(stateFile);

  const lifecycle = new OrderLifecycleManager({ storagePath: stateFile });
  lifecycle.createOrder({
    clientOrderId: "STABLE-BASE-ORDER",
    symbol: "AAPL",
    side: "BUY",
    qty: 10,
    type: "MARKET",
  });
  lifecycle.saveToDisk();

  // Verify baseline state
  const baseData = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(baseData.orders.length, 1);
  assert.equal(baseData.orders[0].clientOrderId, "STABLE-BASE-ORDER");

  // Simulate an interrupted write (e.g. process termination or crash during tmp write)
  const orphanedTmpFile = `${stateFile}.tmp.${Date.now()}.orphaned`;
  fs.writeFileSync(orphanedTmpFile, '{"orders": [{"clientOrderId": "PARTIAL-INCOMPLETE"', "utf8");

  // Recovery loads stateFile: it MUST load STABLE-BASE-ORDER and ignore orphaned tmp file
  const recoverLifecycle = new OrderLifecycleManager({ storagePath: stateFile });
  const loadRes = recoverLifecycle.loadFromDisk();
  assert.equal(loadRes.ordersCount, 1);
  assert.ok(recoverLifecycle.getOrder("STABLE-BASE-ORDER"));
  assert.equal(recoverLifecycle.getOrder("PARTIAL-INCOMPLETE"), null);

  cleanScratchDir();
});

// ============================================================================
// 8. Windows Persistence Durability: Simulated power-loss corruption fails closed
// ============================================================================
test("Windows Durability: Corrupted file from sudden power loss triggers fail-closed recovery and kill switch", async () => {
  ensureScratchDir();
  const stateFile = path.resolve(TEST_SCRATCH_DIR, "powerloss-corrupted.json");

  // Simulate power loss leaving a truncated 0-byte or corrupted state file
  fs.writeFileSync(stateFile, "\0\0\0\0CORRUPTED_SECTORS_DATA\0\0", "utf8");

  const broker = new MockBrokerAdapter({ initialCash: 100000 });
  await broker.connect();

  const lifecycle = new OrderLifecycleManager();
  const coordinator = new BrokerExecutionCoordinator({ broker, lifecycle });

  // recoverAndReconcile must fail closed rather than starting with blank slate
  const recRes = await coordinator.recoverAndReconcile({ storagePath: stateFile });
  assert.equal(recRes.success, false);
  assert.equal(recRes.killSwitchEngaged, true);
  assert.ok(coordinator.riskGateway.isKillSwitchEngaged());
  assert.match(recRes.error, /corrupted or unreadable/i);

  cleanScratchDir();
});
