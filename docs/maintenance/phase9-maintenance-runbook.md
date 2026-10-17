# Tavoryn Terminal — Phase 9 Maintenance & Verification Runbook

**Document Reference:** `docs/maintenance/phase9-maintenance-runbook.md`  
**Release Baseline:** Phase 9 Frozen Baseline  
**Gate Status:** PASS WITH LIMITATIONS  
**Operating Environment:** Windows x64 / Node.js (>= 18)  
**Execution Mode:** Offline-First, Maintenance-Only, Capital-Safe  

---

> [!CAUTION]
> **NO LIVE TRADING AUTHORIZATION**  
> This runbook is strictly for non-destructive maintenance, regression auditing, and operational health verification of Tavoryn Terminal under the frozen Phase 9 release baseline. It **does NOT authorize** live broker connections, automated order routing, capital deployment, or Phase 10 / Phase 11 multi-broker live capabilities. Live broker order placement remains disabled.

---

## 1. Purpose and Scope

This runbook establishes a deterministic, repeatable maintenance and regression-verification protocol for Tavoryn Terminal. The protocol enables engineering leads, quantitative auditors, and operations personnel to:
1. Verify analytical and quantitative invariants across valuation and stress-testing engines.
2. Detect regressions across the 600+ offline unit test suite before releases.
3. Validate upstream free data-feed health and identify rate-limiting or schema drifts.
4. Guarantee protected paper trading state integrity with cryptographic hash verification.
5. Troubleshoot operational failures safely without introducing dependencies or mutating account records.

---

## 2. Command Architecture & Execution Hierarchy

The verification protocol is structured into four distinct execution layers, ordered from fastest, zero-network deterministic checks to external live functional smoke tests.

### Layer 1: Deterministic Offline Unit Tests (Zero Network Access)
These tests require **no internet access**, make no network requests, and validate pure financial arithmetic, formulas, transforms, and security validations against deterministic fixtures.

| Step | Scope | Command | Expected Result | Execution Time |
| :---: | :--- | :--- | :---: | :---: |
| **1A** | **DCF & Stress Engine Tests** | `node --test test/dcf.test.js test/stress.test.js` | 24 passed / 0 failed (exit code 0) | ~90 ms |
| **1B** | **Full Repository Offline Suite** | `npm test`<br>*(or `node scripts/test.js`)* | 604 passed / 0 failed across 39 suites (exit code 0) | ~7,000 ms |

> [!NOTE]
> `npm test` executes `node scripts/test.js`, which automatically gathers every `test/*.test.js` file excluding `test/live.test.js`.

### Layer 2: Public Data Source Doctor & Reachability (Network-Dependent)
Probes the 6 free public, keyless data providers used by Tavoryn Terminal to verify endpoint reachability, latency, and firewall status.

| Step | Scope | Canonical Command | Expected Result |
| :---: | :--- | :--- | :---: |
| **2A** | **Data Source Doctor** | `npm run doctor`<br>*(or `node scripts/doctor.js`)* | Node.js OK, 6/6 feeds OK (exit code 0) |

> [!WARNING]
> **Command Path Warning:**  
> Do **NOT** run `node doctor.js` in the repository root. `doctor.js` is located under `scripts/doctor.js`. Running `node doctor.js` directly produces `MODULE_NOT_FOUND` (exit code 1). Always use `npm run doctor` or `node scripts/doctor.js`.

### Layer 3: Live Application Smoke Test (Network-Dependent)
Validates that live data parsers, chart engines, SEC filings, options chains, and macro series endpoints successfully retrieve and structure upstream data across 19 application screens.

| Step | Scope | Canonical Command | Expected Result |
| :---: | :--- | :--- | :---: |
| **3A** | **Functional Smoke Suite** | `npm run smoke`<br>*(or `node scripts/smoke.js`)* | 19/19 screens PASS (exit code 0) |

### Layer 4: Consolidated All-In-One Gate Verification
Runs Layer 1, Layer 2, and Layer 3 in a unified single-command runner.

| Step | Scope | Canonical Command | Expected Result |
| :---: | :--- | :--- | :---: |
| **4A** | **Complete Release Check** | `npm run check`<br>*(or `node scripts/check.js`)* | PASS Offline tests, PASS Data sources, PASS Live smoke test (exit code 0) |

---

## 3. Protected Account State Integrity Procedure

The primary paper trading ledger [`data/paper-account.json`](file:///D:/G_BLOOM/Tavoryn-Terminal/data/paper-account.json) is protected release state. It holds historical balances, execution logs, and positions that must never be altered by maintenance or audit activities.

### Pre-Execution Verification
Before running tests or editing documentation, record the baseline hash and file size:
```powershell
powershell -Command "
Get-Item 'data/paper-account.json' | Select-Object Length, LastWriteTime
(Get-FileHash 'data/paper-account.json' -Algorithm SHA256).Hash
"
```
**Baseline Standard:**
- **File Size:** Exactly `2,386` bytes
- **SHA-256 Hash:** `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`

### Post-Execution Verification
After completing tests or documentation updates, recalculate the hash:
```powershell
powershell -Command "(Get-FileHash 'data/paper-account.json' -Algorithm SHA256).Hash"
```

### Strict Violation Stop Rule
If the file size differs from `2,386` bytes or the hash differs from `8090...CC4D`:
1. Mark the verification run as **FAIL (ACCOUNT INTEGRITY VIOLATION)**.
2. Halt all testing immediately.
3. Do **NOT** automatically overwrite, reset, or restore the file without investigating the cause.
4. Inspect git diffs or file system write access logs to identify the unauthorized mutation.

---

## 4. Failure Handling & Diagnostic Runbook

### Case 1: Offline Unit Test Failure
- **Symptom:** `npm test` reports one or more failed assertions with exit code 1.
- **Action:**
  1. Inspect the stack trace to determine the failing file and line number.
  2. Verify whether the test checks a financial invariant (e.g. Gordon Growth denominator $WACC \le g_{term}$, cash beta $= 0$, signed position P&L).
  3. Never alter test assertions to hide engine regression; locate the defect in `lib/` and remediate the root mathematical cause.

### Case 2: Upstream Data Source Failure in `doctor.js`
- **Symptom:** `Yahoo (global, intraday stocks)` or `Binance (crypto)` shows `FAIL` or timeout in `npm run doctor`.
- **Diagnostics:**
  - **Yahoo Rate Limiting:** Yahoo periodically blocks requests from certain datacenter IP addresses or high-frequency loops. Tavoryn Terminal automatically falls back to Nasdaq public API for US stock data.
  - **Binance Regional Blocking:** Binance blocks US IP addresses. Tavoryn Terminal automatically routes crypto requests through Coinbase and Kraken.
  - **Temporary Network Outage:** `lib/providers.js` implements a 60-second cooldown (`hostDownUntil`) to prevent cascade timeouts.

### Case 3: Port Conflict on Launch
- **Symptom:** Application server fails to bind to port 3787 (`EADDRINUSE`).
- **Action:**
  - Execute `node scripts/stop.js` to terminate running instances gracefully.
  - Re-launch using `node scripts/launch.js` or `npm start`.

---

## 5. Maintenance Checklist Before Tagging or Freezing

1. [ ] Confirm Node.js version $\ge 18.0.0$ (`node -v`).
2. [ ] Confirm `package.json` has `"dependencies": {}` (Zero runtime dependencies).
3. [ ] Verify `data/paper-account.json` SHA-256 is `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`.
4. [ ] Run `node --test test/dcf.test.js test/stress.test.js` (24 passed / 0 failed).
5. [ ] Run `npm test` (604 passed / 0 failed).
6. [ ] Run `npm run doctor` (All active data sources reachable).
7. [ ] Confirm live trading remains disabled in configuration.
8. [ ] Verify Phase 9 baseline status in documentation.
