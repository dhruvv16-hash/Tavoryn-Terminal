import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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

const TEST_SCRATCH_DIR = "test/fixtures/phase9-race-scratch";

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
// Adversarial Test 1: Demonstrating the Client-Side TOCTOU Race Condition
// on an Unprotected / Legacy Broker that ignores fencing tokens
// ============================================================================
test("Fencing Race Audit: On a legacy broker without fencing enforcement, pause after check permits stale dispatch", async () => {
  ensureScratchDir();
  const lockFile = path.join(TEST_SCRATCH_DIR, "toctou-race.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  const broker = new MockBrokerAdapter({ initialCash: 100000 });
  await broker.connect();

  // Create legacy wrapper that strips fencing tokens (simulating real-world REST brokers like Alpaca/IBKR)
  const legacyBroker = Object.create(broker);
  let pauseTriggered = false;
  let resumeResolve = null;
  const pausePromise = new Promise((resolve) => {
    resumeResolve = resolve;
  });

  // Intercept submitOrder to simulate an asynchronous pause (e.g. GC pause or OS preempt)
  // AFTER all client-side checks passed, right as the socket dispatch begins
  legacyBroker.submitOrder = async (orderSpec) => {
    if (!pauseTriggered) {
      pauseTriggered = true;
      // Wait for adversarial leadership takeover
      await pausePromise;
    }
    // Legacy broker strips fencingToken and executes order unconditionally
    const { fencingToken, ...cleanSpec } = orderSpec;
    return broker.submitOrder(cleanSpec);
  };

  // Process A acquires lock (fencing token 1)
  const lockA = new ExecutionOwnershipLock(lockFile, {
    processId: 1001,
    ownerId: "PROC-A",
    leaseTimeoutMs: 1000, // short lease for testing
  });
  const coordA = new BrokerExecutionCoordinator({
    broker: legacyBroker,
    executionLock: lockA,
  });
  coordA.acquireExecutionOwnership();

  // Process A begins submitting an order: passes assertOwnership(), then pauses at socket layer
  const orderPromiseA = coordA.submitOrder({
    clientOrderId: "RACE-ORDER-A",
    symbol: "AAPL",
    side: "BUY",
    qty: 10,
    type: "MARKET",
  });

  // Wait until Process A is paused inside the dispatch window
  while (!pauseTriggered) {
    await new Promise((r) => setTimeout(r, 10));
  }

  // ADVERSARIAL ACTION: Process B reclaims the lock while Process A is suspended!
  const lockB = new ExecutionOwnershipLock(lockFile, {
    processId: 2002,
    ownerId: "PROC-B",
    leaseTimeoutMs: 1000,
  });
  // Simulate dead PID 1001 or lease expiry
  lockB.isProcessAlive = () => false;
  assert.ok(lockB.acquire(), "Process B successfully reclaims the lock");
  assert.equal(lockB.getFencingToken(), 2);

  // Now, Process A wakes up and resumes its pending dispatch:
  resumeResolve();
  const resultA = await orderPromiseA;

  // FINDING 1: Process A's order SUCCEEDED on the legacy broker despite Process A having lost ownership!
  assert.equal(resultA.success, true);
  assert.equal(resultA.order.state, ORDER_STATES.FILLED);

  // FINDING 2: The broker executed the order from the superseded owner!
  const executions = broker.executions;
  assert.equal(executions.length, 1);
  assert.equal(executions[0].qty, 10);

  // This empirically proves: On any broker that does not validate fencing tokens,
  // client-side lock checks cannot eliminate the race condition.
  coordA.releaseExecutionOwnership();
  lockB.release();
  cleanScratchDir();
});

// ============================================================================
// Adversarial Test 2: Downstream Fencing Token Enforcement
// Demonstrates that broker-level fencing prevents the race condition
// ============================================================================
test("Fencing Race Audit: Downstream broker with fencing token support REJECTS stale dispatch after pause", async () => {
  ensureScratchDir();
  const lockFile = path.join(TEST_SCRATCH_DIR, "fencing-enforced.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  const broker = new MockBrokerAdapter({ initialCash: 100000 });
  await broker.connect();

  let pauseTriggered = false;
  let resumeResolve = null;
  const pausePromise = new Promise((resolve) => {
    resumeResolve = resolve;
  });

  const wrappedBroker = Object.create(broker);
  wrappedBroker.submitOrder = async (orderSpec) => {
    if (!pauseTriggered) {
      pauseTriggered = true;
      await pausePromise;
    }
    // Downstream broker validates fencingToken
    return broker.submitOrder(orderSpec);
  };

  // Process A acquires lock (fencing token 1)
  const lockA = new ExecutionOwnershipLock(lockFile, {
    processId: 1001,
    ownerId: "PROC-A",
  });
  const coordA = new BrokerExecutionCoordinator({
    broker: wrappedBroker,
    executionLock: lockA,
  });
  coordA.acquireExecutionOwnership();
  assert.equal(lockA.getFencingToken(), 1);

  // Process A begins submission and pauses
  const orderPromiseA = coordA.submitOrder({
    clientOrderId: "STALE-ORDER-A",
    symbol: "AAPL",
    side: "BUY",
    qty: 10,
    type: "MARKET",
  });

  while (!pauseTriggered) {
    await new Promise((r) => setTimeout(r, 10));
  }

  // Process B reclaims lock and its fencingToken increments to 2
  const lockB = new ExecutionOwnershipLock(lockFile, {
    processId: 2002,
    ownerId: "PROC-B",
  });
  lockB.isProcessAlive = () => false;
  assert.ok(lockB.acquire());
  assert.equal(lockB.getFencingToken(), 2);

  const coordB = new BrokerExecutionCoordinator({
    broker,
    executionLock: lockB,
  });

  // Process B submits an order with fencing token 2
  const orderB = await coordB.submitOrder({
    clientOrderId: "VALID-ORDER-B",
    symbol: "AAPL",
    side: "BUY",
    qty: 20,
    type: "MARKET",
  });
  assert.equal(orderB.success, true);
  assert.equal(broker.highestFencingToken, 2);

  // Now Process A resumes with stale fencing token 1:
  resumeResolve();
  const resultA = await orderPromiseA;

  // FINDING 3: Broker rejected Process A's order due to stale fencing token!
  assert.equal(resultA.success, false);
  assert.equal(resultA.code, "ORDER_REJECTED");
  assert.match(resultA.reason, /stale fencing token 1/i);

  // Verify broker only executed Process B's order
  assert.equal(broker.executions.length, 1);
  assert.equal(broker.executions[0].qty, 20);

  coordA.releaseExecutionOwnership();
  coordB.releaseExecutionOwnership();
  cleanScratchDir();
});

// ============================================================================
// Adversarial Test 3: Last-Mile Fencing Check Catches Mid-Risk Evaluation Pause
// ============================================================================
test("Fencing Race Audit: Last-mile check aborts dispatch if leadership is lost during async risk checks", async () => {
  ensureScratchDir();
  const lockFile = path.join(TEST_SCRATCH_DIR, "mid-risk-pause.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  const broker = new MockBrokerAdapter({ initialCash: 100000 });
  await broker.connect();

  let pauseTriggered = false;
  let resumeResolve = null;
  const pausePromise = new Promise((resolve) => {
    resumeResolve = resolve;
  });

  // Price provider pauses during price resolution (between step 0 check and step 5 dispatch)
  const delayedPriceProvider = async (sym) => {
    pauseTriggered = true;
    await pausePromise;
    return 150.0;
  };

  const lockA = new ExecutionOwnershipLock(lockFile, {
    processId: 1001,
    ownerId: "PROC-A",
  });
  const coordA = new BrokerExecutionCoordinator({
    broker,
    priceProvider: delayedPriceProvider,
    executionLock: lockA,
  });
  coordA.acquireExecutionOwnership();

  const orderPromise = coordA.submitOrder({
    clientOrderId: "MID-RISK-ORDER",
    symbol: "AAPL",
    side: "BUY",
    qty: 15,
    type: "MARKET",
  });

  while (!pauseTriggered) {
    await new Promise((r) => setTimeout(r, 10));
  }

  // Leadership superseded while price resolution was in flight
  const lockB = new ExecutionOwnershipLock(lockFile, {
    processId: 2002,
    ownerId: "PROC-B",
  });
  lockB.isProcessAlive = () => false;
  lockB.acquire();

  // Process A resumes
  resumeResolve();
  const result = await orderPromise;

  // Last-mile check immediately before dispatch caught the ownership loss!
  assert.equal(result.success, false);
  assert.equal(result.code, "EXECUTION_OWNERSHIP_LOST");
  assert.match(result.reason, /execution ownership fencing.*superseded by PROC-B/i);

  // Broker received 0 orders
  assert.equal(broker.executions.length, 0);

  coordA.releaseExecutionOwnership();
  lockB.release();
  cleanScratchDir();
});

// ============================================================================
// Adversarial Test 4: Cancellation Race Under Pause
// ============================================================================
test("Fencing Race Audit: Cancellation under pause is rejected by fencing-aware broker", async () => {
  ensureScratchDir();
  const lockFile = path.join(TEST_SCRATCH_DIR, "cancel-race.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  const broker = new MockBrokerAdapter({ initialCash: 100000 });
  await broker.connect();
  broker.setMarketPrice("MSFT", 300);

  let pauseTriggered = false;
  let resumeResolve = null;
  const pausePromise = new Promise((resolve) => {
    resumeResolve = resolve;
  });

  const wrappedBroker = Object.create(broker);
  wrappedBroker.cancelOrder = async (clientOrderId, brokerOrderId, options) => {
    if (!pauseTriggered) {
      pauseTriggered = true;
      await pausePromise;
    }
    return broker.cancelOrder(clientOrderId, brokerOrderId, options);
  };

  const lockA = new ExecutionOwnershipLock(lockFile, { processId: 101, ownerId: "PROC-A" });
  const coordA = new BrokerExecutionCoordinator({ broker: wrappedBroker, executionLock: lockA });
  coordA.acquireExecutionOwnership();

  // Submit resting limit order
  const ord = await coordA.submitOrder({
    clientOrderId: "RESTING-CANCEL-TEST",
    symbol: "MSFT",
    side: "BUY",
    qty: 10,
    type: "LIMIT",
    limitPrice: 280,
  });
  assert.equal(ord.status, ORDER_STATES.ACKNOWLEDGED);

  // Attempt cancel and pause at socket layer
  const cancelPromise = coordA.cancelOrder("RESTING-CANCEL-TEST");

  while (!pauseTriggered) {
    await new Promise((r) => setTimeout(r, 10));
  }

  // Process B takes over with fencing token 2 and advances broker's token
  const lockB = new ExecutionOwnershipLock(lockFile, { processId: 202, ownerId: "PROC-B" });
  lockB.isProcessAlive = () => false;
  lockB.acquire();
  assert.equal(lockB.getFencingToken(), 2);

  const coordB = new BrokerExecutionCoordinator({ broker, executionLock: lockB });
  await coordB.submitOrder({ clientOrderId: "ORD-B", symbol: "MSFT", side: "BUY", qty: 5, type: "MARKET" });
  assert.equal(broker.highestFencingToken, 2);

  // Process A resumes cancel with stale token 1
  resumeResolve();
  const cancelResult = await cancelPromise;

  assert.equal(cancelResult.success, false);
  assert.match(cancelResult.reason, /stale fencing token 1/i);

  coordA.releaseExecutionOwnership();
  coordB.releaseExecutionOwnership();
  cleanScratchDir();
});

// ============================================================================
// Adversarial Test 5: Queued Orders and Kill Switch Under Suspension
// ============================================================================
test("Fencing Race Audit: Queued orders behind an in-flight pause fail closed on assertOwnership", async () => {
  ensureScratchDir();
  const lockFile = path.join(TEST_SCRATCH_DIR, "queued-fencing.lock");
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);

  const broker = new MockBrokerAdapter({ initialCash: 100000 });
  await broker.connect();

  let pauseTriggered = false;
  let resumeResolve = null;
  const pausePromise = new Promise((resolve) => {
    resumeResolve = resolve;
  });

  const wrappedBroker = Object.create(broker);
  wrappedBroker.submitOrder = async (orderSpec) => {
    if (!pauseTriggered) {
      pauseTriggered = true;
      await pausePromise;
    }
    return broker.submitOrder(orderSpec);
  };

  const lockA = new ExecutionOwnershipLock(lockFile, { processId: 101, ownerId: "PROC-A" });
  const coordA = new BrokerExecutionCoordinator({ broker: wrappedBroker, executionLock: lockA });
  coordA.acquireExecutionOwnership();

  // Queue Order 1 (pauses in flight) and Order 2 (waiting in queue)
  const p1 = coordA.submitOrder({ clientOrderId: "Q-ORD-1", symbol: "AAPL", side: "BUY", qty: 5, type: "MARKET" });

  while (!pauseTriggered) {
    await new Promise((r) => setTimeout(r, 10));
  }

  const p2 = coordA.submitOrder({ clientOrderId: "Q-ORD-2", symbol: "AAPL", side: "BUY", qty: 5, type: "MARKET" });

  // Process B supersedes the lock
  const lockB = new ExecutionOwnershipLock(lockFile, { processId: 202, ownerId: "PROC-B" });
  lockB.isProcessAlive = () => false;
  lockB.acquire();

  resumeResolve();
  const [res1, res2] = await Promise.all([p1, p2]);

  // Order 2 ran after Order 1, evaluated assertOwnership(), and was rejected!
  assert.equal(res2.success, false);
  assert.equal(res2.code, "EXECUTION_OWNERSHIP_LOST");
  assert.match(res2.reason, /superseded by PROC-B/);

  coordA.releaseExecutionOwnership();
  lockB.release();
  cleanScratchDir();
});
