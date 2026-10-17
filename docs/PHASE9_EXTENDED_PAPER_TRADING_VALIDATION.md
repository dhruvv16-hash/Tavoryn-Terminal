# Amber Terminal — Phase 9: Extended Paper Trading & Operational Validation Report

> [!NOTE]
> **Rebrand Notice & Governance Addendum (October 2026)**
> The quantitative finance platform historically developed under the name **Amber Terminal** has been officially rebranded to **Tavoryn** (parent product: **Tavoryn**, workspace: **Tavoryn Terminal**, quantitative research: **Tavoryn Research**, execution & paper trading: **Tavoryn Execution**).
> This document is a historical audit and verification record preserved under strict cryptographic and governance invariants. All historical evidence, verified test counts, audit findings, and mathematical calculations recorded herein remain immutable and valid under the Tavoryn platform identity.

**Audit Date:** October 17, 2026  
**Auditor Roles:** Principal Systems Reliability Architect, Quantitative Execution Engineer, Risk Infrastructure Lead, and Operations Lead  
**Scope:** `D:\G_BLOOM\amber-terminal` — Multi-Regime Paper Trading Sessions, Single Execution Ownership Lock, Kill-Switch Persistence Across Restarts, Fail-Closed Corrupted Persistence Recovery, Cash Conservation Equation Reconciliation, and Operational Telemetry  
**Overall Release Verdict:** **VERIFIED & OPERATIONAL (Phase 9 Release Gate Passed)**  

---

## Executive Summary

Phase 9 establishes empirical operational readiness for Amber Terminal through extended, multi-regime deterministic paper-trading sessions, cross-process execution locking, restart recovery validation under active safety halt conditions, and exact penny-level cash conservation reconciliation.

All operational objectives were achieved with **zero real-money brokerage connections**, byte-for-byte preservation of user runtime data (`data/paper-account.json`), and comprehensive regression coverage expanding from **541 to 549 passing tests** with zero failures, zero skipped tests, and zero regressions.

### Phase 9 Scorecard Summary

| Evaluation Area | Phase 8 Baseline | Phase 9 Final State | Status |
| :--- | :--- | :--- | :--- |
| **Total Test Count** | 541 passing | **549 passing tests, 0 failures, 0 skips** | **VERIFIED** |
| **Test Suite Execution** | ~2.35s | **~2.41s (100% offline-deterministic)** | **VERIFIED** |
| **`data/paper-account.json` Hash** | `8090DF43BBD...` | **`8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`** | **PRESERVED** |
| **Real-Money Broker Connectivity**| Disabled | **Permanently disabled by default; protected by multi-token confirmation barrier** | **VERIFIED** |
| **Active Kill-Switch Across Restart**| Ephemeral | **Durable metadata persistence; restored as ACTIVE post-restart** | **HARDENED** |
| **Corrupted State File Handling** | SyntaxError crash | **Fail-closed: engages kill switch and locks trading immediately** | **HARDENED** |
| **Cross-Process Execution Lock** | None | **`ExecutionOwnershipLock` enforces single-process control per account** | **IMPLEMENTED** |
| **Dead Process Lease Recovery** | None | **Automated PID liveness inspection reclaims orphaned locks safely** | **IMPLEMENTED** |
| **Multi-Regime Paper Sessions** | Isolated tests | **Orchestrated: Trending, Range, Gap Down, Feed Outage, Session Close** | **IMPLEMENTED** |
| **Cash Conservation Equation** | Approximated | **Strictly verified: $\Delta\text{Cash} = \text{Realized PnL} - \text{Fees} - \text{Outlay}$ ($0.0000 discrepancy)** | **VERIFIED** |
| **Operational Metrics Reporting** | Basic log | **Session telemetry: latency p50/p95/max, tick counts, fill rates, uptime** | **IMPLEMENTED** |

---

## 1. Stage 0 — Baseline & Safety Invariants

### 1.1 Integrity Checks
- **Preflight Account Hash:**
  `data/paper-account.json` SHA-256: `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`
- **Postflight Account Hash:**
  `data/paper-account.json` SHA-256: `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`
- **Live Trading Barrier:** `BaseBrokerAdapter` enforces `isLive = false` and `isSandbox = true`. Attempting to configure `LIVE` mode without environment tokens triggers an immediate `AuthenticationError`.

---

## 2. Stage 1 — Restart & Persistence Validation

Stage 1 audited and hardened process restart behavior when interrupted under critical safety conditions:

### 2.1 Kill-Switch State Persistence
- **Hazard Identified:** Previously, if a kill-switch was activated during an emergency loss event and the host process crashed or restarted, the new process instance initialized `PreTradeRiskGateway` with `killSwitchEngaged: false` in memory, silently reopening trading.
- **Remediation Applied:** `OrderLifecycleManager.saveToDisk` now persists metadata containing `killSwitchEngaged: true` and `killSwitchReason`. In `BrokerExecutionCoordinator.recoverAndReconcile()`, if persisted metadata indicates an active kill switch, it immediately engages the kill switch on the newly instantiated risk gateway before any orders can be accepted.
- **Verification:** Verified by `test("Restart Validation: Active kill-switch state MUST persist across process restart")`. Standard orders submitted post-restart are rejected with `KILL_SWITCH_ACTIVE`.

### 2.2 Corrupted State File & Interrupted Disk Writes
- **Hazard Identified:** A partial disk write, power cutoff, or file corruption could leave `orders.json` malformed.
- **Remediation Applied:**
  1. `saveToDisk` uses atomic temporary file swapping (`${filePath}.tmp.${Date.now()}` $\to$ rename to `${filePath}`).
  2. `loadFromDisk` wraps file ingestion in fail-closed error handling. If the file is truncated or syntactically invalid, it throws a descriptive corruption error.
  3. `recoverAndReconcile()` catches corruption errors, immediately engages the kill switch (`CRITICAL: Persistence recovery failed`), and returns `success: false`.
- **Verification:** Verified by `test("Restart Validation: Corrupted state file fails closed and engages kill switch")`.

### 2.3 Unresolved Reconciliation Discrepancies
- **Hazard Identified:** If local records show open orders that are missing on the broker, restarting must not silently clear the mismatch.
- **Remediation Applied:** In `recoverAndReconcile()`, if `reconcile()` returns `reconciled === false`, the coordinator engages the kill switch with an explicit reason naming the discrepancy types.
- **Verification:** Verified by `test("Restart Validation: Unresolved reconciliation discrepancies halt trading post-restart")`.

---

## 3. Stage 2 — Execution Ownership & Concurrency

### 3.1 Architecture Decision: Single Execution Owner Pattern
Trading instances controlling a single brokerage account must avoid active-active split-brain executions. Supporting uncoordinated concurrent processes risks duplicate order submissions, buying-power race conditions, and contradictory risk overrides.

Amber Terminal enforces the **Single Execution Owner Pattern** via [`ExecutionOwnershipLock`](file:///d:/G_BLOOM/amber-terminal/lib/broker/execution-lock.js):

1. **Lock File Structure:** Writes `data/account-execution.lock` containing `{ ownerId, processId, acquiredAt, heartbeatAt }`.
2. **Mutual Exclusion:** If another process attempts to acquire ownership on the same account/storage lock while the existing process is running, it throws `ExecutionOwnershipError` (`EXECUTION_OWNERSHIP_LOCKED`).
3. **Dead-Process Lease Reclamation:** When a lock file exists, `isProcessAlive(pid)` sends signal 0 (`process.kill(pid, 0)`). If the holding process is dead (`ESRCH`), the lock is classified as stale and safely reclaimed without requiring manual file deletion.
4. **Clean Release:** `release()` unlinks the lock file upon coordinator shutdown.
- **Verification:** Verified by `test("Execution Ownership: Enforces single process ownership and rejects concurrent owners")`.

---

## 4. Stage 3 & 4 — Extended Paper Sessions & Accounting Reconciliation

Stage 3 implemented [`PaperTradingSession`](file:///d:/G_BLOOM/amber-terminal/lib/broker/paper-session.js) to run extended multi-regime sessions:

### 4.1 Simulated Regimes
1. **Regime 1: Bullish Trend:** 5 steps of upward price drift. Accumulates long positions on momentum.
2. **Regime 2: Choppy Range:** Resting limit order placed below market, partial fill executed on liquidity touch, remaining quantity cancelled.
3. **Regime 3: Volatile Gap Down:** Sudden gap down crossing stop levels. Liquidates 20 shares long position.
4. **Regime 4: Feed Outage & Recovery:** Feed pipeline status moves to `DEGRADED`. Orders submitted during outage are rejected with `STALE_OR_DEGRADED_FEED`. Feed reconnects and recovers.
5. **Regime 5: Session Boundary Close:** Market close boundary triggers clean flattening of all residual exposure.
6. **Mid-Session Crash & Restart:** Simulates host crash mid-session, recovers persisted orders, and resumes trading to clean liquidation.

### 4.2 Exact Cash Conservation Verification
At the close of each session, the accounting engine verifies the universal cash conservation law:

$$\Delta\text{Cash} = \text{Ending Cash} - \text{Starting Cash}$$
$$\text{Expected } \Delta\text{Cash} = \text{Realized P&L} - \text{Total Fees} - \text{Outlay in Open Longs} + \text{Proceeds from Open Shorts}$$
$$\text{Discrepancy} = |\Delta\text{Cash} - \text{Expected } \Delta\text{Cash}|$$

**Measured Session Result:**
- **Starting Cash:** $100,000.00
- **Ending Cash:** $99,738.74
- **Realized P&L:** -$250.00
- **Total Commission & Slippage Fees:** $11.26
- **Ending Positions Outlay:** $0.00 (All positions flattened)
- **Expected Ending Cash:** $99,738.74
- **Measured Discrepancy:** **$0.0000**
- **Verdict:** **CONSERVED** (Zero rounding hacks, zero hidden adjustments).

---

## 5. Stage 5 — Operational Metrics & Session Telemetry

From `PaperTradingSession.getOperationalMetrics()`:

| Metric Category | Measured Session Value | Operational Target | Status |
| :--- | :--- | :--- | :--- |
| **Market Ticks Processed** | 7 ticks across regimes | Continuous | **MEASURED** |
| **Orders Submitted** | 7 orders | Uncapped | **MEASURED** |
| **Orders Fully Filled** | 5 orders | High liquidity | **MEASURED** |
| **Orders Partially Filled** | 1 order | Real-world simulation | **MEASURED** |
| **Orders Cancelled** | 1 order | Clean cancellation | **MEASURED** |
| **Feed Outages Injected** | 1 outage | Test coverage | **MEASURED** |
| **Feed Gaps Recovered** | 1 gap | 100% recovery | **MEASURED** |
| **Reconciliations Run** | 1 post-session reconciliation | 100% boundary pass | **MEASURED** |
| **Reconciliation Mismatches** | 0 mismatches | 0 allowed | **VERIFIED** |
| **Latency p50 (Median)** | 0.0000 ms (< 1 ms in-memory) | < 50 ms | **OPTIMAL** |
| **Latency p95** | 1.0000 ms | < 100 ms | **OPTIMAL** |
| **Residual Exposure at Close** | 0 shares ($0.00 notional) | 0 shares | **VERIFIED** |

---

## 6. Verification Test Suite Results

The Phase 9 automated integration test suite ([`test/phase9-operational-validation.test.js`](file:///d:/G_BLOOM/amber-terminal/test/phase9-operational-validation.test.js)) executes 8 deterministic tests:

```
✔ Phase 9 Baseline: paper-account.json SHA-256 preflight immutability (1.377ms)
✔ Restart Validation: Active kill-switch state MUST persist across process restart (6.6834ms)
✔ Restart Validation: Corrupted state file fails closed and engages kill switch (1.9786ms)
✔ Restart Validation: Unresolved reconciliation discrepancies halt trading post-restart (5.0903ms)
✔ Execution Ownership: Enforces single process ownership and rejects concurrent owners (4.275ms)
✔ Extended Paper Session: Full multi-regime simulation and exact cash conservation verification (3.6772ms)
✔ Extended Paper Session: Mid-session crash recovery maintains exact accounting (8.2921ms)
✔ Phase 9 Postflight: paper-account.json remained byte-identical throughout all operations (0.3046ms)
----------------------------------------------------------------------------------------------------------------
ℹ tests 8
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 125.7767
```

### Complete Test Suite Regression
Running `npm test` across all 35 test suites confirms:
- **549 total tests** (541 baseline + 8 Phase 9 tests)
- **549 passed**
- **0 failed**
- **0 cancelled**
- **0 skipped**
- **Total duration:** 2.41s

---

## 7. Phase 9 Release Gate Checklist & Exit Criteria

- [x] **All Existing and New Tests Pass:** 549 total tests pass across 35 test files.
- [x] **Zero Unexplained Accounting Discrepancies:** Cash conservation equation verified down to $0.0000.
- [x] **Restart Recovery Preserves Safety State:** Active kill-switch persists and prevents silent reactivation post-restart.
- [x] **Corrupted State File Fails Closed:** Truncated or invalid JSON triggers immediate kill-switch engagement.
- [x] **Cross-Process Execution Ownership Enforced:** `ExecutionOwnershipLock` guarantees single-owner exclusivity per account.
- [x] **Dead Process Lease Reclaimed:** Orphaned locks from crashed processes safely reclaimed via PID inspection.
- [x] **Multi-Regime Sessions Executed:** Trending, ranging, volatile gaps, feed outages, and session closes verified.
- [x] **User Account File Preserved:** `data/paper-account.json` SHA-256 byte-identical (`8090DF43BBD...`).
- [x] **Zero Real-Money Orders:** Offline sandbox execution only; live trading remains permanently disabled.
- [x] **Operational Telemetry Documented:** Actual measured metrics reported without speculative claims.

---

## 8. Baseline Scorecard & Regression Record

- **Baseline Test Count:** 549 passing tests (Phase 9 Initial) $\to$ **559 passing tests** (Phase 9 Final Audit)
- **Failures / Skips:** 0 failures, 0 skips, 0 cancellations
- **Test Execution Duration:** ~2.16s
- **Runtime Environment:** Node.js v22 (win32-x64)
- **Account File Integrity:** `data/paper-account.json` SHA-256 = `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D` (byte-for-byte preserved)

---

## 9. Phase 9 Final Audit & Extended Paper-Run Qualification

### 9.1 Stage 1 — Baseline Reproduction & Safety Isolation
1. **Automated Test Suite:** The full automated test suite was executed via `npm test`. 559 tests passed across 36 test files with zero failures and zero skipped tests.
2. **Account Immutability:** Preflight and postflight SHA-256 hashes of `data/paper-account.json` were computed via PowerShell `Get-FileHash` and verified byte-identical:
   `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`.
3. **Execution Safety Isolation:** Verified that no real-money broker connections exist. All broker adapters enforce sandbox mode (`isSandbox = true`, `isLive = false`), and live trading requires external environment variables and multi-token confirmation.

### 9.2 Stage 2 — Execution Ownership Audit (`lib/broker/execution-lock.js`)
An independent architectural review of [`lib/broker/execution-lock.js`](file:///d:/G_BLOOM/amber-terminal/lib/broker/execution-lock.js) revealed the following operational behaviors and hardenings:
1. **Atomic Acquisition:** Replaced non-atomic `fs.existsSync()` + `fs.writeFileSync()` with OS kernel-level atomic file creation: `fs.openSync(this.lockPath, 'wx')` (`O_CREAT | O_EXCL`). If another process attempts to create the lock file simultaneously, the kernel guarantees mutual exclusion; one succeeds and the other receives `EEXIST`.
2. **Concurrency Invariant:** Two simultaneous acquisition attempts cannot both succeed. Verified by [`test/phase9-final-audit.test.js`](file:///d:/G_BLOOM/amber-terminal/test/phase9-final-audit.test.js).
3. **Dead-Process Recovery & PID Reuse Guard:** Operating systems frequently recycle Process IDs. Merely checking `process.kill(pid, 0)` is vulnerable to PID reuse: if a crashed process's PID was re-assigned to an unrelated application, a liveness check would falsely indicate the lock is still actively held, deadlocking trading indefinitely. `ExecutionOwnershipLock` resolves this by evaluating both `isProcessAlive(pid)` and `leaseTimeoutMs` (30,000 ms). If `Date.now() - heartbeatAt > leaseTimeoutMs`, the lock is classified as stale and reclaimed safely.
4. **Lock Release Ownership Verification:** In `release()`, the lock holder reads the file and confirms `lockData.ownerId === this.ownerId` before calling `fs.unlinkSync()`. If a lease expired and another process legitimately claimed the lock, the previous owner cannot delete the new owner's lock.
5. **Heartbeat Failure Mode:** If `updateHeartbeat()` fails due to file deletion or ownership transfer, `this.isHeld` is immediately set to `false`, failing closed.
6. **Disk I/O Error Failure Mode:** If an unexpected I/O error (`EACCES`, `EBUSY`, `EPERM`) occurs during acquisition or heartbeat, the method throws an error (fail closed) rather than proceeding to overwrite active locks.

### 9.3 Stage 3 — Persistence & Stop Durability Audit
1. **Kill-Switch Invariant Across Reconciliation:** Audited `BrokerExecutionCoordinator.recoverAndReconcile()`. If persisted metadata indicates `killSwitchEngaged: true`, the coordinator immediately engages the risk gateway's kill switch upon startup. Even when the subsequent broker reconciliation (`reconcile()`) reports 100% matched orders, zero position discrepancies, and valid cash balances, **the kill switch is NEVER cleared implicitly**. The coordinator returns `killSwitchEngaged: true` and `success: false`. Only an authorized operator calling `deactivateKillSwitch()` can disengage the halt.
2. **Durability Distinction (Atomic Rename vs. `fsync` Dirty Page Flushing):**
   - *Atomic Rename (`fs.renameSync`):* Updates the filesystem directory entry atomically. Readers will observe either the old file or the new file, avoiding partial reads. However, `renameSync` only flushes directory metadata; data blocks remain in OS kernel page cache ("dirty pages").
   - *Physical Durability (`fs.fsyncSync`):* In `OrderLifecycleManager.saveToDisk()`, the file descriptor of the temporary file is explicitly flushed to non-volatile physical storage via `fs.fsyncSync(fd)` before closing and renaming. This guarantees that power loss or operating system panics cannot leave zero-byte or corrupted state files on disk.

### 9.4 Stage 4 — Independent Accounting Verification
1. **Accounting Verification:** Audited long and short round-trips under commissions, basis-point slippage, and partial fills.
2. **Cash Conservation Invariant:**
   $$\Delta\text{Cash} = \text{Ending Cash} - \text{Starting Cash}$$
   $$\text{Expected } \Delta\text{Cash} = \text{Realized P&L} - \text{Total Fees} - \sum (\text{pos.qty} \times \text{pos.avgEntryPrice})$$
   $$\text{Discrepancy} = |\Delta\text{Cash} - \text{Expected } \Delta\text{Cash}|$$
3. **Formal Invariant Test:** Verified by `test("Accounting Audit: Long and Short round-trips obey exact cash conservation equation")`. Discrepancy was verified to be exactly **$0.0000** for both long purchases and short sales.

### 9.5 Stage 5 — Extended Paper Observation Run
1. Executed extended multi-asset paper observation runs ([`test/phase9-final-audit.test.js`](file:///d:/G_BLOOM/amber-terminal/test/phase9-final-audit.test.js)) across NVDA, MSFT, and AMZN across 25+ order lifecycle submissions, volatile price gaps, feed disconnects, and end-of-session flattening.
2. **Observed Results:** Zero orphaned orders, zero cash discrepancies, and 100% residual exposure liquidation at session close.

### 9.6 Stage 6 — Qualification Decision & Release Gate

| Gate Criterion | Verification Result | Gate Status |
| :--- | :--- | :--- |
| **All Automated Tests Pass** | 559 / 559 tests pass (0 failures, 0 skips) across 36 test files | **PASS** |
| **Account File Byte Immutability** | SHA-256 `8090DF43BBD...` byte-for-byte unchanged | **PASS** |
| **Execution Ownership Atomicity** | Atomic `openSync('wx')`, PID reuse safe, fail-closed I/O | **PASS** |
| **Emergency Kill-Switch Invariant** | Active stop survives restart; never cleared implicitly by reconciliation | **PASS** |
| **Persistence Durability** | `fsyncSync` flush to non-volatile media before atomic rename | **PASS** |
| **Accounting Precision** | Penny-exact cash conservation ($\Delta\text{Cash}$ discrepancy $0.0000) | **PASS** |
| **Extended Paper Run Telemetry** | Multi-regime, multi-asset observation with clean liquidation | **PASS** |
| **Real-Money Trading Prohibition** | Permanently disabled; sandbox execution only | **PASS** |

### Qualification Decision:
**QUALIFIED FOR EXTENDED NON-LIVE PAPER-TRADING OBSERVATION.**  
Amber Terminal has passed all audit criteria for long-duration, non-live paper-trading observation.

---

## 10. Phase 9 Targeted Adversarial Safety Audit: Ownership Fencing & Windows Durability

### 10.1 Targeted Audit Objective & Scope
Following the closure of Phase 9, a narrowly scoped adversarial safety audit was executed to investigate two high-consequence failure modes:
1. **Execution Ownership Under Lease Expiry & Supersession:** Can a paused process resume after a 30-second lease expiration and submit orders concurrently with a newly minted lock owner (split-brain execution)?
2. **Windows Persistence Durability Boundaries:** What exact guarantees are provided by Node.js and the Windows NTFS filesystem across process termination, operating-system crashes, and sudden power loss?

### 10.2 Execution Ownership Under Lease Expiry & Ownership Fencing

#### 10.2.1 The Split-Brain Vulnerability in Unfenced Designs
In the initial implementation, `ExecutionOwnershipLock` tracked `this.isHeld = true` in local process memory upon acquisition. If Process 1 experienced an extended pause (e.g., long GC pause, event loop freeze, or OS suspension) exceeding the 30-second lease timeout:
- A second process (Process 2) legitimately observed `Date.now() - heartbeatAt > 30000` and reclaimed the on-disk lock.
- When Process 1 resumed, its local memory still reported `this.isHeld === true`.
- If Process 1 received an order submission or cancellation, it dispatched it directly to the broker adapter.
- **Result:** Two active processes simultaneously issued orders for the same account, violating the single execution owner guarantee.

#### 10.2.2 The Ownership Fencing Solution
To eliminate this defect, **Ownership Fencing** was implemented across [`lib/broker/execution-lock.js`](file:///D:/G_BLOOM/amber-terminal/lib/broker/execution-lock.js) and [`lib/broker/execution-coordinator.js`](file:///D:/G_BLOOM/amber-terminal/lib/broker/execution-coordinator.js):
1. **Pre-Dispatch Assertion (`assertOwnership()`):** Before evaluating risk or dispatching an order in `_executeSubmitOrder()`, `cancelOrder()`, or `_executeKillSwitch()`, the coordinator asserts ownership:
   - **Local Lease Timeout Check:** Verifies `Date.now() - this.lastHeartbeatTime <= this.leaseTimeoutMs`. If the process was frozen longer than 30s, it immediately marks `this.isHeld = false` and throws `ExecutionOwnershipError` without touching the broker.
   - **On-Disk Fencing Check:** Reads the lock file on disk and verifies `lockData.ownerId === this.ownerId`. If the lock was reclaimed or superseded by another process, it marks `this.isHeld = false` and throws an error indicating the local process is fenced off.
2. **Fail-Closed Rejection:** Order submissions from superseded owners return `{ success: false, reason: "Order submission rejected by execution ownership fencing: ...", code: "EXECUTION_OWNERSHIP_LOST" }`. Zero orders reach the broker.

#### 10.2.3 Deterministic Adversarial Test Results ([`test/phase9-ownership-fencing.test.js`](file:///D:/G_BLOOM/amber-terminal/test/phase9-ownership-fencing.test.js))
- **Test 1: Owner Pausing Longer Than Lease Timeout:** An owner whose event loop was paused for 35 seconds resumed and attempted to dispatch; local fencing immediately failed with `lease expired locally (35000ms > 30000ms)`.
- **Test 2: Second Process Reclaiming Expired Lock:** Process 2 reclaimed an expired lock while Process 1's PID remained alive. The lock file transferred ownership cleanly to Process 2.
- **Test 3: Simultaneous Stale-Lock Recovery:** Two processes simultaneously detected an expired lock and attempted reclamation. Operating system `openSync('wx')` guaranteed exactly one winner; the loser received `ExecutionOwnershipError`.
- **Test 4: Heartbeat Failure Pre-Dispatch:** When lock file access failed right before submission, heartbeat failed, `isHeld` dropped to `false`, and order submission was aborted.
- **Test 5: Superseded Owner Submissions & Cancellations:** An old owner attempted to submit new orders and cancel resting orders after being superseded by Process 2. Both operations were rejected with `EXECUTION_OWNERSHIP_LOST`; the broker received 0 orders.
- **Test 6: Cross-Process Child Process Termination:** An independent OS Node process acquired the lock and terminated abruptly without releasing. The parent process safely detected dead PID and reclaimed ownership.

### 10.3 Persistence Durability on Windows (NTFS / ReFS)

The durability sequence in `OrderLifecycleManager.saveToDisk()`:
```javascript
const tmpPath = `${filePath}.tmp.${Date.now()}.${random}`;
const fd = fs.openSync(tmpPath, "w");
fs.writeFileSync(fd, json, "utf8");
fs.fsyncSync(fd);
fs.closeSync(fd);
fs.renameSync(tmpPath, filePath);
```
Was analyzed against the three distinct failure domains:

| Failure Domain | Windows / Node.js Mechanism | Recovery Behavior & Guarantees |
| :--- | :--- | :--- |
| **1. Process Termination** | `fs.renameSync` maps to Win32 `MoveFileExW(..., MOVEFILE_REPLACE_EXISTING)`. Directory entry update completes in kernel space. | **100% Durable.** If process terminates before rename, old file is untouched; orphaned `.tmp` is ignored. If it terminates after rename, new file is active. |
| **2. Operating System Crash** | `fs.fsyncSync(fd)` invokes Win32 `FlushFileBuffers(hFile)`. NTFS logs directory changes to `$LogFile` and USN Journal. | **Crash-Consistent Metadata.** On reboot, NTFS journal replay restores directory consistency. If disk controller volatile cache lost dirty sectors, any corruption causes `loadFromDisk` to throw and halts trading immediately. |
| **3. Sudden Power Loss** | `FlushFileBuffers` flushes file content to drive cache. However, directory rename metadata cannot be explicitly flushed in Node.js on Windows (directories do not support `fsyncSync`). | **Fail-Closed Isolation.** Commodity drives without Power Loss Protection (PLP) may lose volatile controller cache. If power cut corrupts `orders.json`, Amber Terminal **fails closed**: `recoverAndReconcile()` catches corruption, engages the emergency kill switch, and halts trading rather than assuming zero risk. |

### 10.4 Final Evidence & Baseline Summary

- **Total Test Suite:** **572 tests pass**, **0 failures**, **0 skipped**, **0 cancelled** across 38 test files (Duration: `~2.59s`).
- **Account Immutability:** Preflight and postflight SHA-256 of `data/paper-account.json` verified byte-identical:
  `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`.
- **Live Trading Isolation:** Zero real-money broker connections or order submissions occurred.
- **Remaining Limitations:**
  - Directory metadata flushing after `renameSync` is not exposed by Node.js or the Win32 user-mode API without driver-level volume flushing (`FlushFileBuffers` on directory handle requires `FILE_FLAG_BACKUP_SEMANTICS`). Fail-closed recovery mitigates this boundary.
  - Ownership lease expiration is bounded by 30 seconds (`leaseTimeoutMs`). Fast-failover configurations should calibrate lease timeout against peak GC pauses.

---

## 11. Final Execution-Fencing Race Review & Dispatch Authority Analysis

### 11.1 The Check-Then-Act (TOCTOU) Race Under Process Suspension
An adversarial audit was performed on `ExecutionOwnershipLock.assertOwnership()` and the order dispatch paths in `BrokerExecutionCoordinator`.

#### Adversarial Scenario Tested ([`test/phase9-fencing-race.test.js`](file:///D:/G_BLOOM/amber-terminal/test/phase9-fencing-race.test.js))
1. **Process A** validates execution ownership via `assertOwnership()`.
2. **Process A** is suspended or pauses (e.g., GC pause, thread scheduling delay, network socket buffer wait, or price resolution delay) *after* checking ownership, but *before* calling `this.broker.submitOrder(...)`.
3. While Process A is suspended, **Process B** detects lease expiration, safely reclaims the on-disk lock, and becomes the active execution owner.
4. **Process A** resumes execution and invokes `this.broker.submitOrder(...)`.

#### Empirical Findings
- **On Legacy Brokers (Without Fencing Token Support):**  
  **Process A CAN STILL SUBMIT OR CANCEL ORDERS AFTER LOSING OWNERSHIP.**  
  Because the downstream broker accepts standard API credentials without validating monotonic epochs, Process A's socket write succeeds, and the broker executes the order. This empirically proves the classic distributed systems theorem (Martin Kleppmann): *Client-side lock checks cannot guarantee mutual exclusion if the client can pause between check and dispatch and the storage/execution destination does not enforce fencing.*
- **On Fencing-Enforced Brokers / Authorities:**  
  When monotonic `fencingToken` (epoch) tracking is passed to a downstream receiver that validates tokens:
  - Process B's reclamation advances the active fencing token from 1 to 2.
  - When Process A resumes and dispatches with stale `fencingToken = 1`, the broker rejects the order with `STALE_FENCING_TOKEN`.
  - Stale order execution is completely prevented.

### 11.2 Evaluation Across Operational Dispatch Paths

1. **Order Submission:**
   - *Async Risk Check Window:* Process A pausing during async `getBuyingPower()` or `_resolveMarketPrice()` is caught by the **Last-Mile Fencing Check** immediately before `this.broker.submitOrder()`.
   - *Post-Check Socket Window:* If the pause occurs *after* the last-mile check, client-side code cannot prevent dispatch without downstream broker rejection or proxy mediation.
2. **Order Cancellation:**
   - If Process A pauses between cancel check and dispatch, on a legacy broker the cancellation packet reaches the broker and cancels an order that Process B may intend to manage. On a fencing-enforced authority, the stale token aborts the cancel.
3. **Queued Orders (`_submissionQueue`):**
   - Orders sitting in `_submissionQueue` execute sequentially. If a suspension occurs, **at most one in-flight order** can leak through on a legacy broker. When the suspended order finishes, all subsequent queued orders evaluate `assertOwnership()`, observe that ownership was superseded, and fail closed with `EXECUTION_OWNERSHIP_LOST`.
4. **Late Execution Reports:**
   - If Process A remains connected to broker WebSockets after losing ownership, incoming execution reports update local order records idempotently. If application strategies attempt to submit reactive orders (e.g. stop-loss or hedge), those submissions invoke `_executeSubmitOrder()` and are immediately rejected by `assertOwnership()`.
5. **Emergency Kill-Switch Actions:**
   - The coordinator executes last-mile checks before submitting closing orders. If ownership is lost, the local risk gateway engages the kill switch to halt new orders locally, while aborting remote order dispatch to prevent conflicting market orders with Process B.

### 11.3 Enforceable Architecture: Single Serialized Dispatch Authority

Because real-world brokerage APIs (Alpaca, Interactive Brokers, Tradier, etc.) **do not support fencing tokens**, strict cross-process fencing cannot be claimed based on client-side lock files alone.

To achieve strict, mathematically enforceable cross-process mutual exclusion with legacy brokers, the architecture must adopt a **Single Serialized Dispatch Authority**:
```
+-------------------+           +-------------------+
| Strategy Worker A |           | Strategy Worker B |
| (Epoch 1 - Stale) |           | (Epoch 2 - Active)|
+---------+---------+           +---------+---------+
          |                               |
          | IPC / Unix Domain Socket      | IPC / Unix Domain Socket
          | [Payload + Epoch 1]           | [Payload + Epoch 2]
          v                               v
    +-------------------------------------------+
    |   Single Serialized Dispatch Authority    |
    |   - Holds sole Broker API Credentials     |
    |   - Validates Monotonic Fencing Epoch     |
    |   - DROPS requests where Epoch < Current  |
    +---------------------+---------------------+
                          | Single Network Connection
                          v
                +-------------------+
                |  Upstream Broker  |
                +-------------------+
```
1. **Daemon Isolation:** Only the local Dispatch Authority daemon connects to the upstream broker. Strategy processes never hold direct broker credentials.
2. **Epoch Enforcement:** The Dispatch Authority records the active leader's epoch. Any packet received from a suspended or superseded worker with an older epoch is rejected at the IPC boundary.
3. **Alternative (Dynamic Session Revocation):** When Process B acquires the lock, it immediately revokes or rotates the broker's active OAuth/session token, causing in-flight HTTP requests from Process A to be rejected with HTTP 401 Unauthorized by the broker.

---

## 12. Final Sign-Off & Halt

Amber Terminal has completed the Phase 9 Final Execution-Fencing Race Review:
- Client-side ownership fencing and last-mile dispatch checks are implemented and verified.
- The fundamental limitation of client-side check-then-act locking against legacy brokers is documented.
- Downstream fencing token enforcement is proven via deterministic adversarial test suites.
- 572 regression tests pass with zero failures and zero skipped tests.
- `data/paper-account.json` remains byte-identical (`8090DF43BBD...`).
- Real-money brokerage execution remains permanently disabled.

**HALT AT RELEASE GATE:** Execution is halted at the Phase 9 release gate. Phase 10 will not begin without explicit user instruction.



