# Amber Terminal — Release Gate Execution-Fencing Sign-Off Report

> [!NOTE]
> **Rebrand Notice & Governance Addendum (October 2026)**
> The quantitative finance platform historically developed under the name **Amber Terminal** has been officially rebranded to **Tavoryn** (parent product: **Tavoryn**, workspace: **Tavoryn Terminal**, quantitative research: **Tavoryn Research**, execution & paper trading: **Tavoryn Execution**).
> This document is a historical audit and verification record preserved under strict cryptographic and governance invariants. All historical evidence, verified test counts, audit findings, and mathematical calculations recorded herein remain immutable and valid under the Tavoryn platform identity.

**Date:** October 17, 2026  
**Repository Directory:** `D:\G_BLOOM\amber-terminal`  
**Host Environment:** Node.js v24.19.0 on Windows (`win32-x64`)  
**Scope:** Phase 9 Execution-Fencing Race Review, Persistence Durability, Baseline Verification, Safety Invariant Audit, and Final Release-Gate Disposition  
**Final Release-Gate Disposition:** **PASS WITH LIMITATIONS** (Live execution remains strictly disabled)

---

## 1. Commit and Working-Tree Status

- **Version Control Status:** Workspace directory `D:\G_BLOOM\amber-terminal` is an untracked repository directory (no `.git` directory initialized in workspace).
- **Working-Tree Integrity:** All existing application source code (`lib/broker/`), test suites (`test/`), configuration files, and documentation (`docs/`) are intact and preserved without data loss.
- **Runtime Environment:** Node.js `v24.19.0` (V8 13.4.114.21-node.28, uv 1.50.0).
- **Execution Safeguard:** Real-money trading credentials and live broker connectivity are permanently disabled (`isLive = false`, `isSandbox = true`).

---

## 2. Test Suite Execution & Baseline Reproduction

### 2.1 Complete Automated Regression Suite
The complete repository regression suite was executed via the project's standard command:

- **Command:** `npm test`
- **Exit Code:** `0`
- **Duration:** `2120.78 ms (~2.12s)`
- **Actual Results:**
  - **Tests Passed:** **572**
  - **Tests Failed:** **0**
  - **Tests Skipped:** **0**
  - **Tests Cancelled:** **0**
  - **Test Files Run:** **38 test suites**

### 2.2 Baseline Explanation
- **Phase 8 Baseline:** 541 passing tests.
- **Phase 9 Initial Baseline:** 549 passing tests (+8 tests for operational validation, persistence restart, and multi-regime sessions in `test/phase9-operational-validation.test.js`).
- **Phase 9 Final Audit:** 559 passing tests (+10 tests for lock atomicity, PID reuse guards, reconciliation kill-switch invariants, and cash conservation in `test/phase9-final-audit.test.js`).
- **Phase 9 Targeted Fencing Audit:** 567 passing tests (+8 tests for ownership fencing under lease expiry and Windows durability in `test/phase9-ownership-fencing.test.js`).
- **Final Fencing Race Review:** **572 passing tests** (+5 deterministic adversarial race tests in `test/phase9-fencing-race.test.js`).
- **Total Count Verified:** 572 passing tests across 38 suites, zero skips, zero failures.

### 2.3 Targeted Test Suite Verification
The targeted safety and execution suites were independently executed and passed 100%:
1. `test/phase9-fencing-race.test.js`: 5 / 5 passed (32.5ms legacy broker pause race, 35.8ms downstream fencing token rejection, 25.7ms last-mile risk check abort, 14.0ms cancellation race, 30.2ms queued order serialization).
2. `test/phase9-ownership-fencing.test.js`: 8 / 8 passed (lease expiry detection, live-process lease reclamation, simultaneous recovery atomicity, heartbeat dispatch failure, superseded submission/cancellation rejection, child process crash isolation, Windows partial write recovery, power-loss corruption fail-closed).
3. `test/phase9-final-audit.test.js`: 10 / 10 passed (account integrity, lock atomicity, PID reuse protection, non-owner release safety, kill-switch reconciliation persistence, fsync durability, long/short penny accounting, 100+ event observation).
4. `test/phase9-operational-validation.test.js`: 8 / 8 passed.
5. `test/phase8-production-hardening.test.js` & `test/phase7-broker-integration.test.js`: 35 / 35 passed.

---

## 3. Account File Byte-for-Byte Immutability

The SHA-256 hash of `data/paper-account.json` was verified via PowerShell `Get-FileHash` before and after all testing and sign-off activities:

- **Pre-Validation SHA-256:**  
  `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`
- **Post-Validation SHA-256:**  
  `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`
- **Delta:** **0 bytes modified** (exact byte-for-byte identity preserved).

---

## 4. Live-Trading & Broker-Connectivity Status

- **Status:** **PERMANENTLY DISABLED**
- `BaseBrokerAdapter` declares `isLive = false` and `isSandbox = true`.
- Attempting to instantiate a broker adapter with environment `LIVE` throws an immediate `AuthenticationError` unless protected multi-token confirmation barriers are provided in the environment.
- No live broker endpoints, live API keys, or live network sockets were accessed during any testing. All executions utilized the in-memory, deterministic `MockBrokerAdapter`.

---

## 5. Verification of Core Safety Invariants

| Invariant | Test Evidence | Verification Status |
| :--- | :--- | :--- |
| **1. Live Execution Disabled** | `BaseBrokerAdapter` constructor and `test/phase7-broker-integration.test.js` | **VERIFIED** |
| **2. Zero Real Broker Credentials** | Code inspection across all adapters; mock fixtures only | **VERIFIED** |
| **3. Kill Switch Durability** | `test/phase9-final-audit.test.js`: Successful broker reconciliation with 0 discrepancies leaves `riskGateway.isKillSwitchEngaged() === true`. Reconciliation NEVER implicitly clears active halt. | **VERIFIED** |
| **4. Fail-Closed Recovery** | `test/phase9-operational-validation.test.js` & `test/phase9-ownership-fencing.test.js`: Truncated, 0-byte, or corrupted state files immediately engage kill switch and reject trading. | **VERIFIED** |
| **5. Stale-Owner Fencing** | `assertOwnership()` verifies local lease expiry and on-disk owner; rejects superseded submissions with `EXECUTION_OWNERSHIP_LOST`. | **VERIFIED** |
| **6. Idempotent Execution Reports** | `OrderRecord.applyExecutionReport()` dedupes processed execution IDs; handles late fills on cancelled orders without VWAP drift or double-counting. | **VERIFIED** |
| **7. Account Immutability** | SHA-256 `8090DF43BBD...` byte-identical before and after all executions. | **VERIFIED** |

---

## 6. Execution-Fencing Limitations & Adversarial Analysis

The adversarial audit in `test/phase9-fencing-race.test.js` proved that execution fencing depends strictly on downstream capabilities. Two distinct regimes exist:

### Case A: Downstream Fencing Enforcement Exists
- **Mechanism:** The receiver (broker, execution gateway, or proxy daemon) validates a monotonically increasing fencing token (`fencingToken` / epoch) attached to each request.
- **Guarantee:** If Process A pauses after validating ownership and Process B reclaims leadership (incrementing the epoch from 1 to 2), any subsequent request dispatched by Process A with stale `fencingToken = 1` is **authoritatively rejected by the receiver** with `STALE_FENCING_TOKEN`.
- **Verdict:** Strict cross-process mutual exclusion is **guaranteed** when downstream enforcement exists.

### Case B: The Broker Does NOT Enforce Fencing (Real-World Legacy Brokers)
- **Mechanism:** Real-world retail and institutional broker APIs (Alpaca, Interactive Brokers, Tradier, Binance, Schwab, etc.) accept API keys/bearer tokens and do not validate fencing tokens or process epochs.
- **Limitation:** In any asynchronous runtime (Node.js) or preemptive OS, a process can be suspended (due to a major V8 GC pause, event loop blockage, or OS thread descheduling) *after* CPU execution of `assertOwnership()`, right as socket I/O begins.
- **Consequence:** If Process B reclaims the lock during Process A's suspension, when Process A wakes up, its socket write reaches the legacy broker, and the broker **executes the stale order or cancellation**.
- **Important Invariant:** *Local lock files, heartbeats, PID checks, or lease expiration CANNOT be described as a strict mutual-exclusion guarantee against unfenced brokers.*

### Impact Across Operational Paths on Unfenced Brokers:
1. **In-Flight Order Submission:** If paused after the last-mile check, exactly one in-flight order can leak through to the broker.
2. **Queued Orders:** All subsequent orders waiting in `_submissionQueue` evaluate `assertOwnership()` sequentially upon waking, detect leadership loss, and fail closed (`EXECUTION_OWNERSHIP_LOST`).
3. **Order Cancellation:** A stale cancellation packet can reach the broker and cancel an order that Process B intended to manage.
4. **Late Execution Reports:** A superseded process receiving WebSocket execution reports updates local state idempotently; any reactive order generation (brackets/hedges) is blocked by `assertOwnership()`.
5. **Emergency Kill-Switch Flattening:** Last-mile checks prevent superseded processes from submitting closing market orders that would liquidate Process B's newly established positions.

---

## 7. Windows NTFS Persistence Durability Boundaries

The durability sequence in `OrderLifecycleManager.saveToDisk()`:
```javascript
const tmpPath = `${filePath}.tmp.${Date.now()}.${random}`;
const fd = fs.openSync(tmpPath, "w");
fs.writeFileSync(fd, json, "utf8");
fs.fsyncSync(fd);
fs.closeSync(fd);
fs.renameSync(tmpPath, filePath);
```
provides the following guarantees under Windows NTFS:
1. **Process Termination:** **100% Durable.** Atomic rename (`MoveFileExW`) completes in kernel space; orphaned `.tmp` files are safely ignored on reboot.
2. **Operating System Crash:** **Crash-Consistent Metadata.** `fsyncSync` calls Win32 `FlushFileBuffers(hFile)` pushing data to disk controller cache. NTFS journal replay preserves directory consistency. If volatile disk cache dropped uncommitted sectors, `loadFromDisk` throws, and recovery fails closed.
3. **Sudden Power Loss:** **Fail-Closed Boundary.** Flushing the temporary file flushes data blocks, but directory rename metadata cannot be flushed in user-mode Node.js on Windows (directories do not support `fsyncSync`). On consumer drives lacking Power Loss Protection (PLP), power cuts may corrupt unwritten disk blocks. Amber Terminal mitigates this by failing closed: `recoverAndReconcile` engages the emergency kill switch and halts trading rather than running with corrupted state.

---

## 8. Prerequisites for Reconsidering Live Execution

Before live-money execution can ever be authorized in a future phase, the following architectural prerequisites must be implemented and independently audited:

1. **Single Serialized Dispatch Authority:**  
   Strategy workers must not hold direct broker credentials or dispatch orders directly to the broker. All order submissions and cancellations must route through a dedicated, single-process local Dispatch Authority daemon via IPC (e.g. Unix domain socket or named pipe).
2. **Epoch Validation at the Dispatch Authority:**  
   The Dispatch Authority must record the active leader's epoch and drop any request originating from an older epoch.
3. **Dispatch Authority Single-Owner Design:**  
   The Dispatch Authority itself must have an enforceable single-instance design (e.g. OS service manager exclusivity or active/passive consensus); moving dispatch into a daemon does not eliminate split-brain if two daemons can run concurrently.
4. **Risk-Reducing / Flattening Path on Ownership Loss:**  
   An explicit, audited protocol must govern how open risk is handled when an owner is superseded. The former owner must not blindly flatten positions that may conflict with the new leader.
5. **Dynamic Credential Rotation / Session Invalidation:**  
   Leadership handover must invalidate the superseded worker's session tokens, with the documented understanding that token revocation does not guarantee in-flight socket packets are cancelled.
6. **Broker-Side Fencing Enforcement:**  
   Wherever strict stale-owner rejection is claimed, the upstream broker API must natively support and enforce monotonic fencing tokens.
7. **Extended Non-Live Observation Period:**  
   A multi-day observation run under realistic simulated network latency, feed disconnects, and process failovers must demonstrate zero unhandled exceptions, zero split-brain executions, and zero cash discrepancies.

---

## 9. Final Release-Gate Disposition

### Disposition: **PASS WITH LIMITATIONS**

### Justification:
- **Criteria Passed:**
  - 572 / 572 automated regression tests pass (100% pass rate, 0 failures, 0 skips).
  - SHA-256 hash of `data/paper-account.json` is byte-for-byte identical.
  - Active kill-switch durability survives restarts and is never cleared implicitly by reconciliation.
  - Cash conservation equation is verified down to $0.0000 discrepancy.
  - Atomic OS lock acquisition (`openSync('wx')`), PID reuse expiration, and last-mile fencing checks are verified.
  - Live trading remains permanently disabled.
- **Limitations Mandating `PASS WITH LIMITATIONS` (Not Unconditional PASS):**
  - Commercial retail brokers do not support fencing tokens. On unfenced broker endpoints, client-side lock checks cannot eliminate the time-of-check/time-of-use (TOCTOU) race if a process pauses between validation and socket dispatch.
  - Node.js on Windows does not support directory `fsync`, leaving physical durability dependent on NTFS journal replay and fail-closed crash recovery.
  - Live trading is **NOT AUTHORIZED**.

---

## 10. Execution Halt

**Phase 9 is formally closed.**  
Execution is halted at the Phase 9 release gate in compliance with safety instructions. Phase 10 will not begin without explicit human authorization.
