# Amber Terminal — Phase 9 Baseline Freeze & Governance Report

> [!NOTE]
> **Rebrand Notice & Governance Addendum (October 2026)**
> The quantitative finance platform historically developed under the name **Amber Terminal** has been officially rebranded to **Tavoryn** (parent product: **Tavoryn**, workspace: **Tavoryn Terminal**, quantitative research: **Tavoryn Research**, execution & paper trading: **Tavoryn Execution**).
> This document is a historical audit and verification record preserved under strict cryptographic and governance invariants. All historical evidence, verified test counts, audit findings, and mathematical calculations recorded herein remain immutable and valid under the Tavoryn platform identity.

**Date:** October 17, 2026  
**Repository Directory:** `D:\G_BLOOM\amber-terminal`  
**Host Runtime:** Node.js v24.19.0 on Windows (`win32-x64`)  
**Package Version:** `1.0.0` (from `package.json`)  
**Scope:** Phase 9 Release-Gate Baseline Freeze, Account Integrity Verification, Safety Invariant Audit, and Non-Live Operational Governance  
**Final Release-Gate Disposition:** **PASS WITH LIMITATIONS** (Live execution strictly disabled)

---

## 1. Repository Identity and Working-Tree Status

- **Working-Tree Location:** `D:\G_BLOOM\amber-terminal`
- **Version Control Status:** The repository workspace is an unversioned local directory (no `.git` directory present).
- **Working-Tree Integrity:** All application modules (`lib/`), test suites (`test/`), operational scripts (`scripts/`), public terminal UI (`public/`), and documentation (`docs/`) are intact, preserved, and free of uncommitted data loss.
- **Node.js Environment:** `v24.19.0` (V8 13.4.114.21-node.28, uv 1.50.0).
- **Operating System:** Windows 11 / Windows NT `10.0.26200.0` (`win32-x64`).
- **Live Trading Mode:** Permanently disabled (`isLive = false`, `isSandbox = true`).

---

## 2. Test Suite Execution & Baseline Reproduction

### 2.1 Regression Execution
The entire test suite was executed offline and deterministically via the standard project test command:

- **Command:** `npm test` (invoking `node scripts/test.js`)
- **Exit Code:** `0`
- **Execution Time:** `~2.43s`
- **Test Results Summary:**
  - **Passed Tests:** **572**
  - **Failed Tests:** **0**
  - **Skipped Tests:** **0**
  - **Cancelled Tests:** **0**
  - **Total Test Suites Executed:** **38 test suites**

### 2.2 Progression History & Baseline Verification
- **Phase 4.1 Baseline:** 472 passing tests.
- **Phase 5 (Out-of-Sample Validation):** 488 passing tests (+16 tests).
- **Phase 6 (Real-Time Market Data Infrastructure):** 506 passing tests (+18 tests).
- **Phase 7 (Broker Integration Layer):** 528 passing tests (+22 tests).
- **Phase 8 (Production Hardening & Fault Injection):** 541 passing tests (+13 tests).
- **Phase 9 (Initial Extended Paper Validation):** 549 passing tests (+8 tests in `test/phase9-operational-validation.test.js`).
- **Phase 9 (Final Audit & Cash Conservation):** 559 passing tests (+10 tests in `test/phase9-final-audit.test.js`).
- **Phase 9 (Targeted Fencing & Durability):** 567 passing tests (+8 tests in `test/phase9-ownership-fencing.test.js`).
- **Phase 9 (Execution-Fencing Race Review):** **572 passing tests** (+5 deterministic adversarial tests in `test/phase9-fencing-race.test.js`).
- **Verification:** 100% test pass rate maintained with zero skipped tests and zero regressions.

---

## 3. Account Data File Immutability

The SHA-256 cryptographic digest of the primary paper account file was recorded and verified before and after all test runs and verification operations:

- **Target File:** `data/paper-account.json`
- **Algorithm:** SHA-256
- **Pre-Validation SHA-256 Hash:**  
  `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`
- **Post-Validation SHA-256 Hash:**  
  `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`
- **Byte Delta:** **0 bytes modified** (exact byte-for-byte identity preserved).
- **Safeguard Enforcement:** Automated test suites run in isolated scratch directories (`test/fixtures/`) or use isolated store keys (`AMBER_PAPER_STORE_KEY`), strictly protecting production user paper state.

---

## 4. Live-Execution Status & Safety Barriers

- **Live Trading Flag:** `isLive = false`.
- **Sandbox Environment:** `isSandbox = true`.
- **Safety Barriers Enforced:**
  1. `BaseBrokerAdapter` (`lib/broker/broker-adapter.js`): If `environment === "LIVE"` is provided without `AMBER_LIVE_BROKER_CONFIRM === "YES_I_UNDERSTAND_THE_RISKS"`, the adapter immediately throws an unhandled `AuthenticationError`.
  2. `ShadowTradingEngine` (`lib/shadow-engine.js`): `connectBroker()` unconditionally throws `Security Violation: Live broker execution is disabled in ShadowTradingEngine`.
  3. **Zero Credentials:** No real brokerage API keys, secrets, or live credentials exist in repository configuration files or environment variables.
  4. **Network Isolation:** All automated test suites operate strictly offline using deterministic in-memory fixtures (`MockBrokerAdapter`) and recorded candle bars.

---

## 5. Existing Non-Live Observation Entry Points

The repository provides the following verified capabilities that run without broker credentials or external side effects:

### 5.1 Telemetry and Health-Check Endpoints
- `GET /api/health` (`server.js`): Returns server status, version, Node.js version, provider reachability, feeds status, yahoo rate limiting status, and active alerts count.
- `GET /api/market-data/health` (`server.js`): Exposes `MarketDataPipeline.getHealth()` containing `isHealthy`, `status` (`HEALTHY`, `DEGRADED`, `STALE`), `continuityStatus`, `canTrade`, `feedAgeMs`, `queueDepth`, `maxQueueDepth`, `metrics`, `activeGapsCount`, and `anomalies`.
- `GET /api/probe` (`server.js`): Non-mutating read-only probe of public market-data endpoints (`lib/providers.js`).

### 5.2 Deterministic Simulation & Replay Modules
- `PaperTradingSession` (`lib/broker/paper-session.js`): Orchestrates multi-regime market sessions (Trending, Range-bound, Volatile Gap Down, Feed Outage, Session Boundary Close) against `MockBrokerAdapter`, measures latency percentiles (p50, p95, max), and performs penny-exact cash conservation reconciliation.
- `DeterministicReplayEngine` (`lib/replay-engine.js`): Chronological bar-by-bar historical replay simulation strictly preventing lookahead bias; enforces Phase 2 risk controls (`maxOrderNotional`, `maxPositionNotional`, `maxDailyLoss`), gap-through stops, slippage/fee models, and intrabar path resolution (`worst`, `ohlc`, `optimistic`, `magnifier`).
- `ShadowTradingEngine` (`lib/shadow-engine.js`): Connects to live or synthetic `MarketDataPipeline` feeds, executes orders against a simulated matching engine, tracks anomalies (stale, missing, duplicate, out-of-order bars), and generates append-only audit trails.
- `BrokerExecutionCoordinator` (`lib/broker/execution-coordinator.js`): Coordinates pre-trade risk evaluation, order lifecycle states, timeout recovery, broker reconciliation, and emergency kill-switch flattening.
- `ExecutionOwnershipLock` (`lib/broker/execution-lock.js`): Single-process execution lock file with lease expiry, heartbeat refresh, and dead PID detection via OS signal 0.
- `ResearchLedger` (`lib/research-ledger.js`): Append-only SHA-256 hash-chained ledger storing frozen strategy definitions, out-of-sample evaluations, and promotion decisions.

### 5.3 Diagnostic & Benchmark CLI Scripts
- `node scripts/test.js` (`npm test`): Complete 572-test deterministic regression suite.
- `node scripts/doctor.js` (`npm run doctor`): Environment and data-source diagnostics.
- `node scripts/smoke.js` (`npm run smoke`): Ephemeral server smoke verification.
- `node scripts/check.js` (`npm run check`): Unified preflight gate (test + doctor + smoke).
- `node scripts/benchmark-market-data.js`: High-volume pipeline benchmark processing 50,000 canonical events.
- `node scripts/launch.js` / `node scripts/stop.js`: Background server process management.

---

## 6. Immutable Safety Invariants

| Invariant | Implementation Mechanism | Test & Code Verification |
| :--- | :--- | :--- |
| **1. Live Execution Disabled** | `BaseBrokerAdapter` throws `AuthenticationError` unless multi-token confirmation barrier is satisfied. | `lib/broker/broker-adapter.js` & `test/phase7-broker-integration.test.js` |
| **2. Zero Broker Credentials** | Code inspection confirms zero real-money credentials, bearer tokens, or live exchange URLs. | Audited across all adapters |
| **3. Kill Switch Durability** | Stored in persistent metadata; restored as ACTIVE on restart; **never** implicitly cleared by broker reconciliation even with 0 discrepancies. | `test/phase9-final-audit.test.js` & `test/phase9-operational-validation.test.js` |
| **4. Fail-Closed Persistence** | Corrupted, truncated, or unreadable state files immediately trigger the emergency kill switch and reject trading. | `test/phase9-operational-validation.test.js` |
| **5. Idempotent Executions** | Execution reports are deduplicated by `executionId`; late fills on cancelled orders update cash/VWAP without double-counting. | `lib/broker/order-lifecycle.js` & `test/phase8-production-hardening.test.js` |
| **6. Penny Cash Conservation** | $\Delta\text{Cash} = \text{Ending Cash} - \text{Starting Cash}$ matches $\text{Realized P&L} - \text{Fees} - \text{Outlay}$ down to $\$0.0000$. | `test/phase9-final-audit.test.js` & `test/phase9-operational-validation.test.js` |
| **7. Account Immutability** | `data/paper-account.json` remains byte-identical (`8090DF43BBD...`). | Verified before and after all executions |
| **8. Documented Fencing Limitation** | Local lock files cannot guarantee cross-process mutual exclusion against unfenced brokers under process pauses. | `test/phase9-fencing-race.test.js` & Section 7 below |

---

## 7. Known Limitations and Verification Boundaries

1. **Downstream Execution Fencing Boundary:**
   - **Fenced Brokers:** When downstream brokers or execution authorities validate monotonic fencing tokens (`fencingToken`), superseded owners are authoritatively rejected (`STALE_FENCING_TOKEN`).
   - **Legacy Unfenced Brokers:** Commercial retail/institutional broker APIs (Alpaca, IBKR, Tradier, etc.) do NOT validate fencing tokens or process epochs. In an asynchronous event loop (Node.js) or preemptive OS, an owner pausing (major GC pause, thread descheduling) immediately after `assertOwnership()` will still dispatch upon waking, permitting a race condition. Client-side locks cannot eliminate this TOCTOU race.
2. **Windows NTFS Durability Boundary:**
   - User-mode Node.js on Windows does not support directory `fsync` (`EISDIR`/`EPERM`). While temporary file flushing (`FlushFileBuffers`) and atomic renaming (`MoveFileExW`) protect against process crashes, power-loss resilience depends on NTFS journal replay and Amber Terminal's fail-closed corrupt-file loader.
3. **No Unattended Multi-Day Daemon Scheduler:**
   - The repository provides deterministic session runners (`PaperTradingSession`), replay modules, and web servers, but does not include a background cron daemon that autonomously executes multi-day paper trading unattended. Multi-day observation must be driven via the manual observation runbook.

---

## 8. Release-Gate Governance Status

- **Status:** **PASS WITH LIMITATIONS**
- **Justification:** All 572 automated regression tests pass, account data is pristine, safety invariants are rigorously proven, and known boundaries are documented. Live trading remains strictly prohibited.
- **Phase Boundary:** Phase 9 is closed. Phase 10 has not begun.
