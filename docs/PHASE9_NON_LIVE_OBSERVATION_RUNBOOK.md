# Amber Terminal — Phase 9 Non-Live Observation Runbook

> [!NOTE]
> **Rebrand Notice & Governance Addendum (October 2026)**
> The quantitative finance platform historically developed under the name **Amber Terminal** has been officially rebranded to **Tavoryn** (parent product: **Tavoryn**, workspace: **Tavoryn Terminal**, quantitative research: **Tavoryn Research**, execution & paper trading: **Tavoryn Execution**).
> This document is a historical audit and verification record preserved under strict cryptographic and governance invariants. All historical evidence, verified test counts, audit findings, and mathematical calculations recorded herein remain immutable and valid under the Tavoryn platform identity.

**Date:** October 17, 2026  
**Repository Directory:** `D:\G_BLOOM\amber-terminal`  
**Target Environment:** Node.js v24.19.0 on Windows (`win32-x64`)  
**Scope:** Operational Runbook, Multi-Day Observation Procedure, Telemetry Collection, Fault Escalation, and Results Reporting  
**Status:** **OPERATIONAL & GOVERNED** (Live execution strictly disabled)

---

## 1. Prerequisites and Safe Startup Procedure

### 1.1 Preflight Verification
Before initiating any observation session, the operator must verify environment safety:

1. **Verify Node.js Version:**
   ```powershell
   node -v
   ```
   *Requirement:* Node.js `>= 18.0.0` (Node `v24.19.0` confirmed in baseline).

2. **Verify Account File SHA-256 Hash:**
   ```powershell
   powershell -Command "Get-FileHash data/paper-account.json -Algorithm SHA256"
   ```
   *Requirement:* Must exactly match:  
   `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`.  
   If the hash differs, **HALT IMMEDIATELY**. Do not proceed.

3. **Confirm Zero Real-Money Broker Credentials:**
   Ensure no live environment variables are set:
   ```powershell
   powershell -Command "Get-ChildItem env:AMBER_*"
   ```
   *Requirement:* `AMBER_LIVE_BROKER_CONFIRM` must NOT equal `"YES_I_UNDERSTAND_THE_RISKS"`. `isLive` must remain `false`.

4. **Verify Offline Test Baseline:**
   ```powershell
   npm test
   ```
   *Requirement:* All 572 tests must pass with 0 failures and 0 skipped tests.

### 1.2 Safe Server Startup
Amber Terminal can be started locally without external side effects:

- **Interactive Console Mode:**
  ```powershell
  node server.js
  ```
  Starts local HTTP server on `http://localhost:3787` (or next available port).
- **Background Daemon Mode:**
  ```powershell
  node scripts/launch.js --no-open
  ```
  Launches server in background and writes stdout/stderr to `data/server.log`.

---

## 2. Verified Operational Commands

The following commands exist in the repository and have been verified to execute safely without side effects:

| Command | Purpose | Expected Output / Result |
| :--- | :--- | :--- |
| `npm test` (`node scripts/test.js`) | Executes complete 572-test deterministic regression suite | `pass 572, fail 0, skipped 0, exit 0` |
| `npm run doctor` (`node scripts/doctor.js`) | Probes local environment and public upstream data sources | Outputs provider reachability table |
| `npm run smoke` (`node scripts/smoke.js`) | Spins up ephemeral test server, checks endpoints, stops server | Tests 15 core screen functions, exit 0 |
| `npm run check` (`node scripts/check.js`) | Executes full preflight gate: offline tests, doctor, smoke test | PASS across all three stages |
| `node scripts/benchmark-market-data.js` | Ingestion benchmark of 50,000 canonical events | Outputs events/sec throughput and p50/p95/p99 latency |
| `node scripts/launch.js --no-open` | Starts background server without launching browser | Prints running URL, appends to `data/server.log` |
| `node scripts/stop.js` | Sends authenticated shutdown request to running server | `Stopped Amber Terminal on port 3787` |
| `curl.exe -s http://127.0.0.1:3787/api/health` | Queries server health, provider status, and alerts count | JSON payload with `"ok": true` |
| `curl.exe -s http://127.0.0.1:3787/api/market-data/health` | Queries real-time pipeline continuity, queue, and gap count | JSON payload with pipeline metrics |

---

## 3. Observation Scenarios and Expected Behaviors

During extended observation sessions, the operator observes the 9 core operational scenarios:

### Scenario 1: Normal Market-Data Ingestion
- **Mechanism:** Ingestion of normalized candle and quote bars through `MarketDataPipeline` (`lib/market-data-pipeline.js`).
- **Expected Behavior:** Events are queued in memory, sequence numbers increment monotonically, `feedAgeMs` remains within `staleThresholdMs` (30,000ms), and pipeline status reports `HEALTHY`.
- **Telemetry Metric:** `pipeline.getHealth().metrics.processedEventsCount`.

### Scenario 2: Stale Feeds, Disconnections, and Recovery
- **Mechanism:** Upstream feed heartbeat drops or exceeds 30 seconds without updates.
- **Expected Behavior:** Pipeline transitions from `HEALTHY` to `STALE` or `DEGRADED`; `canTrade` becomes `false`. Pre-trade risk gateway immediately rejects any order submission with `STALE_OR_DEGRADED_FEED`. Once feed events resume, pipeline resets feed age and returns to `HEALTHY`.
- **Telemetry Metric:** `pipeline.getHealth().status` and risk rejection code `STALE_OR_DEGRADED_FEED`.

### Scenario 3: Duplicate, Out-of-Order, and Missing Events
- **Mechanism:** Ingestion of events with repeated sequence numbers or historical timestamps.
- **Expected Behavior:** Duplicate events are suppressed by the pipeline's rolling deduplication window (`dedupWindowSize`); out-of-order events trigger warning anomalies without crashing; gaps in sequence numbers increment `activeGapsCount` and emit gap recovery events.
- **Telemetry Metric:** `pipeline.getHealth().anomalies` and `metrics.duplicateEventsSuppressed`.

### Scenario 4: Process Restarts and Persistence Recovery
- **Mechanism:** Host process crashes or restarts while orders are active in `OrderLifecycleManager`.
- **Expected Behavior:** On startup, `BrokerExecutionCoordinator.recoverAndReconcile()` reads atomic storage (`filePath`), restores orders, and verifies metadata. If the state file was partially written or corrupted during the crash, recovery **fails closed**, engages the emergency kill switch, and locks trading.
- **Telemetry Metric:** `recoverAndReconcile().recoveredOrdersCount` and `killSwitchEngaged`.

### Scenario 5: Partial Fills, Late Fills, and Duplicate Execution Reports
- **Mechanism:** Upstream broker emits repeated execution reports or late fills on cancelled orders.
- **Expected Behavior:** `OrderRecord.applyExecutionReport()` checks `processedExecutionIds`. Duplicate reports are silently discarded without altering filled quantities. Late fills on cancelled orders update cash and cumulative VWAP without creating phantom duplicate positions.
- **Telemetry Metric:** `coordinator.lifecycle.getOrder(clientOrderId).executions`.

### Scenario 6: Reconciliation Mismatches and Kill-Switch Persistence
- **Mechanism:** Injected discrepancy between local order records and upstream broker open orders.
- **Expected Behavior:** `coordinator.reconcile()` detects `MISSING_OPEN_ORDER` or position mismatch, records discrepancy in audit log, and engages the emergency kill switch. An active kill switch **survives process restart** and is **never cleared implicitly** by subsequent successful reconciliation.
- **Telemetry Metric:** `reconResult.discrepancies` and `riskGateway.isKillSwitchEngaged()`.

### Scenario 7: Simulated Order-Submission Timeouts
- **Mechanism:** Broker adapter fails to acknowledge order within `timeoutMs` (5,000ms).
- **Expected Behavior:** Order transitions to `SUBMISSION_TIMEOUT` instead of blind re-dispatch. Subsequent reconciliation queries broker to discover whether the order reached the exchange, transitioning to `ACKNOWLEDGED`, `FILLED`, or `REJECTED` deterministically.
- **Telemetry Metric:** `order.state === ORDER_STATES.SUBMISSION_TIMEOUT`.

### Scenario 8: Simulated Process Failover and Ownership Loss
- **Mechanism:** Primary process pauses longer than lease timeout (30 seconds) and second process reclaims ownership.
- **Expected Behavior:** Process 2 writes new lease and increments monotonic `fencingToken`. When Process 1 wakes up, `assertOwnership()` detects expired lease and disk mismatch, throwing `EXECUTION_OWNERSHIP_LOST` and aborting all pending/queued submissions.
- **Telemetry Metric:** Audit action `ORDER_OWNERSHIP_FENCED` and `code: "EXECUTION_OWNERSHIP_LOST"`.

### Scenario 9: Cash Conservation and Clean Flattening
- **Mechanism:** Extended multi-regime trading session followed by session-boundary emergency flattening.
- **Expected Behavior:** `activateKillSwitch({ cancelOpenOrders: true, flattenPositions: true })` closes all positions with market orders and verifies residual positions equal zero. Ending cash strictly matches:
  $$\Delta\text{Cash} = \text{Realized P&L} - \text{Total Fees} - \text{Open Outlay}$$
  with **zero accounting discrepancy** ($\text{cashDiscrepancy} < \$0.01$).
- **Telemetry Metric:** `session.reconcileAccounting().cashDiscrepancy === 0.0`.

---

## 4. Telemetry and Evidence Locations

When conducting observation sessions, evidence is recorded at the following locations:

| Telemetry Data | Location / Extraction Method | Format |
| :--- | :--- | :--- |
| **Server Health & Feed Status** | `GET /api/health` and `GET /api/market-data/health` | JSON HTTP response |
| **Server Console & Error Log** | `data/server.log` (when launched via `launch.js`) | Plaintext UTF-8 log |
| **Coordinator Audit Log** | `coordinator.getAuditLogs()` | In-memory JSON array (redacted) |
| **Persistent Research Ledger** | `data/research-ledger.jsonl` | Append-only SHA-256 chained JSONL |
| **Operational Session Metrics** | `session.getOperationalMetrics()` | JSON object (latencies, counts) |
| **Order State Snapshots** | Passed to `lifecycle.saveToDisk(path)` | Atomic JSON file |

---

## 5. Safe Shutdown and Recovery Procedures

### 5.1 Safe Shutdown
1. **Background Server Shutdown:**
   ```powershell
   node scripts/stop.js
   ```
   Or via authenticated HTTP shutdown:
   ```powershell
   curl.exe -X POST http://127.0.0.1:3787/api/shutdown -H "x-qt: 1"
   ```
2. **Execution Lock Cleanup:**  
   If an in-process coordinator holds an active lock, invoke `coordinator.releaseExecutionOwnership()`, which unlinks the lock file.

### 5.2 Failure Recovery Procedure
If an observation session encounters an unexpected halt or engaged kill switch:
1. **Do Not Delete State Files:** Preserve all `.json` and `.log` files in `data/`.
2. **Inspect the Kill-Switch Reason:** Check `coordinator.riskGateway.killSwitchReason` or server logs to identify the trigger (e.g. `STALE_FEED`, `RECONCILIATION_MISMATCH`, `CORRUPTED_PERSISTENCE`).
3. **Run Health Diagnostic:**
   ```powershell
   node scripts/doctor.js
   ```
4. **Run Regression Verification:**
   ```powershell
   npm test
   ```
5. **Verify Account Hash:** Re-verify that `data/paper-account.json` remains unaltered.
6. **Explicit Operator Deactivation:** If the cause is understood and resolved, clear the halt explicitly via `coordinator.deactivateKillSwitch()`. Never bypass the kill switch programmatically.

---

## 6. Failure Escalation and Hard Stop Conditions

The operator must **immediately stop the observation run** if any of the following critical safety violations occur:

1. **Cash Conservation Discrepancy:** Any session ending with $|\text{Cash Discrepancy}| \ge \$0.01$.
2. **Residual Exposure After Flattening:** Any non-zero position remaining after `activateKillSwitch({ flattenPositions: true })`.
3. **Execution Under Safety Halt:** Any order submitted or accepted while the kill switch is active or feed pipeline is `DEGRADED`.
4. **Implicit Kill-Switch Clearing:** Any process restart or reconciliation clearing an active kill switch without explicit operator intervention.
5. **Account File Mutation:** Any byte modification to `data/paper-account.json` (SHA-256 hash change).
6. **Live Broker Contact:** Any attempt to transmit orders to a live exchange endpoint or initialize an adapter with real-money credentials.

---

## 7. Manual Multi-Day Observation Procedure

> [!NOTE]
> Amber Terminal provides fully deterministic multi-regime simulation modules (`PaperTradingSession`), replay modules, and web servers, but does **not** include an autonomous background cron scheduler daemon. To conduct an extended multi-day observation period, the operator executes the following structured schedule across consecutive observation sessions:

### Observation Schedule Matrix

| Day / Session | Focus Area | Procedure / Command | Expected Evidence |
| :--- | :--- | :--- | :--- |
| **Day 1: Baseline** | Ingestion & Telemetry | Run `npm run check`, start server, query `/api/health` and `/api/market-data/health` | Clean health response, 0 gaps, 0 active anomalies |
| **Day 2: Multi-Regime** | Order Execution & Accounting | Execute `PaperTradingSession.runSession()`, record latency stats | All 5 regimes pass, cash discrepancy = $0.00 |
| **Day 3: Fault Injection** | Feed Drops & Timeout | Simulate feed outage, verify order rejection; simulate broker timeout, verify reconciliation | Orders rejected with `STALE_OR_DEGRADED_FEED`, timeout reconciled |
| **Day 4: Restart & Recovery** | Process Crash & Persistence | Activate kill switch, terminate process, restart, verify kill switch persists; inject corrupted JSON, verify fail-closed | `killSwitchEngaged === true` restored post-restart, corrupt state halted |
| **Day 5: Fencing & Sign-Off** | Process Failover & Final Hash | Execute `test/phase9-fencing-race.test.js`, verify `data/paper-account.json` hash | Stale owner rejected, SHA-256 hash identical |

---

## 8. Observation Results Template

Operators must record the findings of each observation session using the following structured template:

```markdown
### Observation Session Log

- **Session Identifier:** `OBS-YYYYMMDD-SESSION_XX`
- **Execution Date & Time:** `YYYY-MM-DDTHH:MM:SSZ`
- **Operator Name / Role:** `[Operator Name]`
- **Node.js & Platform:** `v24.19.0 (win32-x64)`
- **`data/paper-account.json` SHA-256 Hash:** `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`
- **Live Trading Disabled Confirmed:** `[YES / NO]`

#### Operational Telemetry
- **Observation Duration:** `[e.g. 3,600,000 ms (1 hour)]`
- **Events Ingested:** `[Count]`
- **Data Gaps Detected:** `[Count]`
- **Orders Submitted:** `[Count]`
- **Orders Filled / Partial:** `[Filled / Partial]`
- **Orders Cancelled / Rejected:** `[Cancelled / Rejected]`
- **Submission Timeouts:** `[Count]`
- **Latency Percentiles:** `p50: [X] ms | p95: [Y] ms | max: [Z] ms`

#### Accounting & Risk Verification
- **Starting Cash:** `$100,000.00`
- **Ending Cash:** `$[Ending Cash]`
- **Realized P&L:** `$[Realized PnL]`
- **Total Fees Paid:** `$[Total Fees]`
- **Open Position Outlay:** `$[Outlay]`
- **Calculated Expected Ending Cash:** `$[Expected Cash]`
- **Cash Discrepancy:** `$[Discrepancy] (Must be 0.0000)`
- **Residual Positions After Close:** `0 (Must be 0)`
- **Kill-Switch Activations Observed:** `[Count]`
- **Did Kill Switch Persist Across Restarts:** `[YES / NO]`
- **Unhandled Exceptions / Crashes:** `0`

#### Deviations and Anomalies
- `[List any observed deviation, latency spike, or feed discontinuity, or state "None observed"]`

#### Session Verdict
- **Disposition:** `[PASS / PASS WITH LIMITATIONS / FAIL]`
- **Operator Sign-Off:** `[Signature / Date]`
```
