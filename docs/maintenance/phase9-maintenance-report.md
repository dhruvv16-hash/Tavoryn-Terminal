# Tavoryn Terminal — Phase 9 Maintenance & Regression Verification Report

**Document Reference:** `docs/maintenance/phase9-maintenance-report.md`  
**Execution Timestamp:** 2026-10-17  
**Auditor / Engineer:** Principal Quantitative Systems Architect & Independent QA Auditor  
**Repository Path:** `D:\G_BLOOM\Tavoryn-Terminal`  
**Environment:** Windows x64 / Node.js v24.19.0  
**Phase Baseline:** Phase 9 Frozen Baseline  
**Official Final Disposition:** **PASS WITH LIMITATIONS**  

---

## 1. Executive Summary

In accordance with Phase 9 Maintenance Governance, an exhaustive maintenance audit and reproducibility verification was performed for Tavoryn Terminal. All claims from the preceding release-gate sign-off were independently re-tested against the actual source files, test runners, data feeds, and protected state files.

### Key Audit Outcomes
1. **Protected State Intact:** Cryptographic SHA-256 and byte size of `data/paper-account.json` were verified before and after all operations. The file remained 100% byte-for-byte identical (2,386 bytes, 0 delta).
2. **Offline Suite Pass Rate:** All **604 offline unit tests** passed with 0 failures across 39 test suites (exit code 0).
3. **Data Source Feeds:** All **6 public upstream feeds** responded successfully with latencies under 510 ms (exit code 0).
4. **Live Smoke Screens:** All **19 live application screens** passed smoke testing against live endpoints.
5. **Runtime Dependency Boundary:** Zero runtime dependencies (`"dependencies": {}`) preserved.
6. **Code Defect Remediated:** Identified and resolved a runtime `ReferenceError` on undeclared `sharesSource` / `sharesNote` in `lib/fn/dcf.js`, and added Test 12 to `test/dcf.test.js` to prevent unit-scaling regressions.
7. **Phase 9 Freeze Preserved:** No Phase 10 / Phase 11 multi-broker code was introduced; live trading remains strictly disabled.

---

## 2. Baseline Environment & Initial Repository State

- **Repository Root:** `D:\G_BLOOM\Tavoryn-Terminal`
- **Catalog Architecture:** Managed directly on disk without a local `.git` catalog directory.
- **Node.js Runtime:** `v24.19.0` (win32-x64), satisfying `engines: { "node": ">=18" }`.
- **Pre-Execution Protected Account Ledger:**
  - File: `data/paper-account.json`
  - Byte Size: `2,386` bytes
  - SHA-256 Hash: `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`
- **Server State:** Local test daemon running on `http://localhost:3787` (task-4339).

---

## 3. Exact Commands Executed & Evidence Log

All commands were run directly in PowerShell in `D:\G_BLOOM\Tavoryn-Terminal`.

| Command | Category | Start / End Status | Exit Code | Tests / Feeds Passing | Network / Determinism |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `node --test test/dcf.test.js test/stress.test.js` | Targeted Offline Suite | Completed | `0` | **24 Passed / 0 Failed** (97 ms) | 100% Offline / Deterministic |
| `npm test` *(executes `scripts/test.js`)* | Full Offline Regression | Completed | `0` | **604 Passed / 0 Failed** (6,525 ms) | 100% Offline / Deterministic |
| `node doctor.js` | Root Command Check | **Failed** | `1` | `MODULE_NOT_FOUND` | N/A (Script absent from root) |
| `node scripts/doctor.js` *(or `npm run doctor`)* | Public Data Source Probes | Completed | `0` | **6 Feeds OK / 0 Failed** | Network / Live Endpoints |
| `npm run check` *(executes `scripts/check.js`)* | Consolidated Quality Gate | Completed | `0` | **604 Offline PASS, 6 Feeds OK, 19 Smoke PASS** | Hybrid (Offline + Live) |

### Investigation of `node doctor.js` Failure
The command `node doctor.js` was evaluated as requested by the prompt. It exited with code 1:
```
Error: Cannot find module 'D:\G_BLOOM\Tavoryn-Terminal\doctor.js'
code: 'MODULE_NOT_FOUND'
```
**Finding:** `doctor.js` does not reside in the repository root. The canonical script defined in `package.json` (`"doctor": "node scripts/doctor.js"`) is located at [`scripts/doctor.js`](file:///D:/G_BLOOM/Tavoryn-Terminal/scripts/doctor.js). Running `node scripts/doctor.js` succeeds with exit code 0.

---

## 4. Public Data-Feed Diagnostic Results

Probed via `node scripts/doctor.js`:
- **Binance (crypto):** `OK` (184 ms)
- **Yahoo (global, intraday stocks):** `OK` (182 ms)
- **Economic calendar:** `OK` (191 ms)
- **Coinbase (crypto fallback):** `OK` (194 ms)
- **Nasdaq (US stocks):** `OK` (501 ms)
- **Kraken (crypto + forex):** `OK` (504 ms)

### Data-Feed Quality Analysis
1. **Retrieval vs. Usable Data:** Upstream payloads are parsed into strongly typed numeric structures. For stock quotes, `price`, `change`, and `volume` are validated. For statement data, statement row labels and periods are parsed.
2. **Stale vs. Fresh Data:** Intraday bars and quotes use low TTL cache intervals. Historical statements are cached by annual filing period. Weekend market closures return the official last-traded price without producing synthetic ticks.
3. **Missing Values vs. Legitimate Zeros:** `parseNum` distinguishes `"0"` ($0.0$) from `null`, `"N/A"`, or `" — "`. Capital structure fields (total debt, cash) explicitly treat 0 as zero net debt rather than falling back to defaults.
4. **Error Handling vs. Empty Responses:** Upstream HTTP 4xx/5xx errors and timeouts trigger `hostDownUntil` with a 60-second cooldown. Empty search results return `[]` without triggering server errors.
5. **Offline Isolation:** `npm test` executes strictly without network calls. Tests never rely on upstream live availability.
6. **Credentials & Privacy:** All 6 public feeds are keyless. No secrets, tokens, or private endpoints exist in the codebase.

---

## 5. Quantitative Model Regression Findings

### A. DCF Valuation Model (`lib/fn/dcf.js`, `public/js/fn/dcf.js`)
- **Runtime Scope Defect Fixed:** During direct execution of the default handler (`/api/fn/dcf?symbol=AAPL`), `sharesSource` and `sharesNote` were assigned without `let` declarations in function scope, throwing `ReferenceError: sharesSource is not defined`. Added explicit declarations:
  ```javascript
  let sharesSource = "derived_from_market_cap";
  let sharesNote = "";
  ```
  Verified that execution succeeds and returns correct provenance metadata.
- **Strict Boundary Enforcement ($WACC \le g_{term}$):** Confirmed that when $WACC \le g_{term}$, `calculateDCF` returns `isValid: false`, `intrinsicValue: null`, `enterpriseValue: null`, and sensitivity cells render as **"N/A"**.
- **Statement Unit Scaling:** Confirmed Nasdaq statement values in thousands of USD are divided by 1,000 **exactly once** upon ingestion ($111.48B OCF, $12.72B CapEx, $98.76B FCF for Apple Inc.).
- **New Test Added:** Added Test 12 ("Financial statement unit scaling and shares derivation invariants") to `test/dcf.test.js`, expanding suite to 12 passing tests.

### B. Portfolio Stress Testing (`lib/fn/stress.js`, `public/js/fn/stress.js`)
- **Universal Signed Position Valuation:** Stressed position value formula $V_{\text{stressed}} = V \times \max(0, 1 + r)$ verified across long and short equity holdings, cash, bonds, commodities, and crypto.
- **Accounting Reconciliation:** Starting Value + $\sum$ P&L $\equiv$ Stressed Value reconciles within $10^{-4}$ tolerance across multi-asset portfolios (`reconciles: true`).
- **Cash Beta Shock:** Cash exposure ($0.0\%$ beta shock) confirmed across all crisis scenarios.
- **Empty State Truthfulness:** Confirmed empty portfolios return `empty: true` with zero fabricated holdings.
- **Benchmark Separation:** Institutional 5-asset benchmark explicitly badged in the UI.

---

## 6. Source and Documentation Changes Summary

### Source Code Modifications
1. [`lib/fn/dcf.js`](file:///D:/G_BLOOM/Tavoryn-Terminal/lib/fn/dcf.js): Declared `let sharesSource` and `let sharesNote` in function scope.
2. [`test/dcf.test.js`](file:///D:/G_BLOOM/Tavoryn-Terminal/test/dcf.test.js): Added Test 12 validating financial statement unit scaling and shares derivation.

### Documentation Created
1. [`docs/maintenance/phase9-maintenance-runbook.md`](file:///D:/G_BLOOM/Tavoryn-Terminal/docs/maintenance/phase9-maintenance-runbook.md): Complete actionable verification runbook.
2. [`docs/maintenance/phase9-regression-matrix.md`](file:///D:/G_BLOOM/Tavoryn-Terminal/docs/maintenance/phase9-regression-matrix.md): Invariant mapping across DCF, stress engine, data feeds, and security boundaries.
3. [`docs/maintenance/phase9-maintenance-report.md`](file:///D:/G_BLOOM/Tavoryn-Terminal/docs/maintenance/phase9-maintenance-report.md): This comprehensive verification report.

---

## 7. Protected State Comparison & Integrity Verification

| Metric | Pre-Verification Baseline | Post-Verification Result | Variance | Integrity Status |
| :--- | :---: | :---: | :---: | :---: |
| **Target File** | `data/paper-account.json` | `data/paper-account.json` | — | Target Preserved |
| **File Byte Size** | `2,386` bytes | `2,386` bytes | `0` bytes | **IDENTICAL** |
| **SHA-256 Hash** | `8090DF43BBD04EC8254...` | `8090DF43BBD04EC8254...` | `0` bits | **BYTE-FOR-BYTE IDENTICAL** |
| **Full SHA-256** | `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D` | `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D` | Identical | **VERIFIED PASS** |

---

## 8. Known Limitations & Blocked Checks

1. **Root `node doctor.js` Unavailability:** The command `node doctor.js` fails with `MODULE_NOT_FOUND` because the script is located at `scripts/doctor.js`. Use `node scripts/doctor.js` or `npm run doctor`.
2. **Linear Factor Sensitivity in Stress Testing:** The stress testing engine uses a linear beta factor model ($r = \beta \times r_{\text{mkt}}$). It does not model nonlinear option convexities (Gamma, Vega, Theta) or broker margin liquidation cascades.
3. **Derived Diluted Share Count:** Diluted shares are derived via $\text{Market Cap} / \text{Price}$ when financial summary statistics omit reported share counts. Explicitly labeled in the UI as **"Diluted Shares Outstanding (Implied from Mkt Cap / Price)"**.
4. **Live Trading Isolation:** Live trading and broker order routing are disabled by policy under Phase 9.

---

## 9. Final Release Gate Determination

```
========================================================================================
PHASE 9 MAINTENANCE AUDIT DISPOSITION: PASS WITH LIMITATIONS
========================================================================================
Phase Baseline:         Phase 9 Frozen Baseline (Preserved)
Phase 10 Status:        NOT STARTED / STRICTLY DEFERRED
Live Trading Status:    DISABLED / CAPITAL-SAFE
Offline Tests:          604 / 604 PASS (100% Pass Rate)
Targeted Engine Tests:  24 / 24 PASS (100% Pass Rate)
Live Smoke Screens:     19 / 19 PASS (100% Pass Rate)
Upstream Data Feeds:    6 / 6 OK (Binance, Yahoo, Nasdaq, Eco, Kraken, Coinbase)
Protected Ledger State: 8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D (0 delta)
Runtime Dependencies:   Zero runtime dependencies (package.json dependencies: {})
========================================================================================
```
