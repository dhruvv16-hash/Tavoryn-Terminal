# Tavoryn Terminal — Phase 9 Quantitative Regression & Invariant Matrix

**Document Reference:** `docs/maintenance/phase9-regression-matrix.md`  
**Release Baseline:** Phase 9 Frozen Baseline  
**Gate Status:** PASS WITH LIMITATIONS  
**Audit Date:** 2026-10-17  
**Engine Scope:** DCF Valuation, Portfolio Stress Testing, Free Market Data Feeds, State Integrity  

---

## 1. Overview & Verification Methodology

This matrix establishes the definitive institutional regression boundary for Tavoryn Terminal at the Phase 9 freeze. Every core financial invariant, mathematical law, data-feed assumption, and execution boundary is explicitly mapped to:
1. The authoritative implementation file and line reference.
2. The automated test file and specific test case validating it.
3. The empirical test execution status reproduced under the audit.

---

## 2. Discounted Cash Flow (DCF) Valuation Invariants

| ID | Quantitative Invariant | Implementation File | Verification Test | Status |
| :---: | :--- | :--- | :--- | :---: |
| **DCF-01** | **Strict Gordon Growth Boundary ($WACC > g_{term}$)**<br>When $WACC \le g_{term}$, calculation is strictly rejected (`isValid: false`, `intrinsicValue: null`). Zero plausible numbers exposed. | `lib/fn/dcf.js`<br>lines 105–137 | `test/dcf.test.js`<br>`Test 5: WACC vs Terminal Growth boundary conditions` | **PASS** |
| **DCF-02** | **Sensitivity Grid Invalid Cell Marking**<br>Any matrix cell where $WACC \le g_{term}$ is marked `isValid: false`, `intrinsicValue: null`, and rendered in the UI as **"N/A"**. | `lib/fn/dcf.js`<br>lines 71–82<br>`public/js/fn/dcf.js`<br>lines 206–208 | `test/dcf.test.js`<br>`Test 9: 5x5 Sensitivity Matrix structure, invalid cell handling` | **PASS** |
| **DCF-03** | **No Silent Clamping / Rate Substitution**<br>User-supplied WACC is used directly for both explicit forecast discounting ($1/(1+WACC)^t$) and terminal value discounting. No hidden overrides. | `lib/fn/dcf.js`<br>lines 35–37, 52, 142 | `test/dcf.test.js`<br>`Test 5: WACC vs Terminal Growth boundary conditions` | **PASS** |
| **DCF-04** | **Narrow Spread Sensitivity Disclosure**<br>When $WACC - g_{term} < 1.0\%$, the calculation sets `spreadWarning` alerting user to extreme model sensitivity. | `lib/fn/dcf.js`<br>lines 153–157<br>`public/js/fn/dcf.js`<br>lines 67–75 | `test/dcf.test.js`<br>`Test 5: WACC vs Terminal Growth boundary conditions` | **PASS** |
| **DCF-05** | **Enterprise to Equity Bridge Reconciliation**<br>$$\text{Equity Value} \equiv \text{Enterprise Value} + \text{Cash} - \text{Debt}$$ holds identically across all capital structures. | `lib/fn/dcf.js`<br>lines 145–146 | `test/dcf.test.js`<br>`Test 3: Enterprise to Equity value bridge reconciliation` | **PASS** |
| **DCF-06** | **Diluted Per-Share Value Scaling**<br>Per-share intrinsic value equals $\text{Equity Value} / \text{Diluted Shares}$. Scaled inversely with share count. | `lib/fn/dcf.js`<br>line 149 | `test/dcf.test.js`<br>`Test 4: Diluted per-share calculations scale linearly` | **PASS** |
| **DCF-07** | **Margin of Safety Mathematical Symmetry**<br>$$\text{MoS} = \frac{\text{Intrinsic Value} - \text{Price}}{\text{Price}} \times 100$$<br>Negative for overvalued, positive for undervalued. | `lib/fn/dcf.js`<br>lines 150–151 | `test/dcf.test.js`<br>`Test 1: Manually verified DCF benchmark example` | **PASS** |
| **DCF-08** | **Negative Free Cash Flow Transparency**<br>Cash-burning firms yield negative Enterprise Value, negative Intrinsic Value, and explicit warning banner without crashing. | `lib/fn/dcf.js`<br>lines 173, 295–296<br>`public/js/fn/dcf.js`<br>lines 77–86 | `test/dcf.test.js`<br>`Test 10: Negative Free Cash Flow transparently produces negative intrinsic value` | **PASS** |
| **DCF-09** | **Statement Unit Scaling Homogeneity**<br>Nasdaq financial statements in thousands of USD are converted to Millions ($M) by dividing by 1,000 **exactly once** upon ingestion. | `lib/fn/dcf.js`<br>lines 249, 252, 269, 271 | `test/dcf.test.js`<br>`Test 12: Financial statement unit scaling and shares derivation invariants` | **PASS** |
| **DCF-10** | **Diluted Shares Provenance Labeling**<br>Derived shares are labeled **"Diluted Shares Outstanding (Implied from Mkt Cap / Price)"** with metadata `sharesSource: 'derived_from_market_cap'`. | `lib/fn/dcf.js`<br>lines 235–238, 357–358<br>`public/js/fn/dcf.js`<br>lines 230 | `test/dcf.test.js`<br>`Test 12: Financial statement unit scaling and shares derivation invariants` | **PASS** |
| **DCF-11** | **Missing / Non-Finite Input Resilience**<br>Omitted debt, cash, non-finite or NaN inputs default safely to 0 or trigger explicit validation errors rather than returning NaN. | `lib/fn/dcf.js`<br>lines 33–43 | `test/dcf.test.js`<br>`Test 6: Non-finite, missing, and negative input resilience`<br>`Test 7: Missing capital structure fields default safely` | **PASS** |
| **DCF-12** | **Scenario Hierarchy Preservation**<br>$$\text{Conservative Intrinsic Value} < \text{Base Value} < \text{Optimistic Value}$$ strictly holds under normal conditions. | `lib/fn/dcf.js`<br>lines 325–346 | `test/dcf.test.js`<br>`Test 8: Conservative, Base, and Optimistic scenario hierarchy` | **PASS** |

---

## 3. Portfolio Stress Testing Invariants

| ID | Quantitative Invariant | Implementation File | Verification Test | Status |
| :---: | :--- | :--- | :--- | :---: |
| **STR-01** | **Universal Signed Position Valuation**<br>$$V_{\text{stressed}} = V \times \max(0, 1 + r)$$<br>Correctly values both long ($V > 0$) and short ($V < 0$) positions under price shocks. | `lib/fn/stress.js`<br>lines 278–281 | `test/stress.test.js`<br>`Test 1: Manually calculated portfolio stress test scenario loss`<br>`Test 3: Short positions gain value during market crashes` | **PASS** |
| **STR-02** | **Short Position Gain Symmetry**<br>Under a $-50\%$ market shock, short equity position of $-\$10,000$ revalues to $-\$5,000$, producing a positive dollar gain of $+\$5,000$. | `lib/fn/stress.js`<br>lines 278–280 | `test/stress.test.js`<br>`Test 3: Short positions gain value and reduce portfolio drawdown` | **PASS** |
| **STR-03** | **Limited-Liability Price Floor ($m \ge 0$)**<br>For shocks $< -100\%$, asset price multiplier is clamped at $0$, capping short gains at $100\%$ of initial liability without negative prices. | `lib/fn/stress.js`<br>line 278 | `test/stress.test.js`<br>`Test 3d: Underlying decline below -100% (150% drop)` | **PASS** |
| **STR-04** | **Cash Zero-Beta Shock Immunity**<br>Cash and USD holdings have $0.0\%$ beta shock across equity and commodity crises; principal is $100\%$ preserved. | `lib/fn/stress.js`<br>lines 214–216 | `test/stress.test.js`<br>`Test 4: Cash holdings preserve 100% of value across market shocks` | **PASS** |
| **STR-05** | **Portfolio Accounting Identity Reconciliation**<br>$$V_{\text{start}} + \sum \text{P\&L} \equiv V_{\text{stressed}}$$<br>Reconciles within $10^{-4}$ tolerance across multi-asset hedged portfolios (`reconciles: true`). | `lib/fn/stress.js`<br>line 312 | `test/stress.test.js`<br>`Test 3f: Hedged portfolio with known holdings and manually calculated net P&L` | **PASS** |
| **STR-06** | **Asset-Class Differentiated Shock Routing**<br>Bonds route to `ratesShock`, commodities route to `commodityShock`, crypto routes to `cryptoShock`, technology/banks route to sector shocks. | `lib/fn/stress.js`<br>lines 218–253 | `test/stress.test.js`<br>`Test 10: Sector and asset-specific shock differentiation` | **PASS** |
| **STR-07** | **Truthful Empty Portfolio Handling**<br>If portfolio has 0 positions and benchmark is not explicitly requested, engine returns `empty: true` and 0 values; does not fabricate positions. | `lib/fn/stress.js`<br>lines 260–266, 365–381<br>`public/js/fn/stress.js`<br>lines 40–57 | `test/stress.test.js`<br>`Test 6: Empty portfolio produces clear zero-drawdown structure` | **PASS** |
| **STR-08** | **Explicit Benchmark vs. Portfolio Separation**<br>Institutional 5-asset benchmark (SPY, QQQ, TLT, GLD, BTC) is explicitly badged in the UI as a reference benchmark, NOT user holdings. | `lib/fn/stress.js`<br>lines 197–203, 383–384<br>`public/js/fn/stress.js`<br>lines 60–76 | `test/stress.test.js`<br>`Test 7: Institutional benchmark portfolio has valid multi-asset allocation` | **PASS** |
| **STR-09** | **Complete Scenario Inventory**<br>All 8 historical crisis scenarios and 4 macroeconomic factor shocks are present, calibrated, and have documented limitations. | `lib/fn/stress.js`<br>lines 6–194 | `test/stress.test.js`<br>`Test 8: Complete inventory of 8 historical crisis scenarios`<br>`Test 9: Complete inventory of 4 macroeconomic factor shocks` | **PASS** |
| **STR-10** | **Constituent Vulnerability Ranking**<br>Holdings are sorted deterministically from greatest dollar loss to smallest loss across all crisis simulations. | `lib/fn/stress.js`<br>lines 318–344 | `test/stress.test.js`<br>`Test 11: Vulnerability ranking orders holdings from greatest to smallest dollar loss` | **PASS** |
| **STR-11** | **Strict Determinism & Idempotency**<br>Repeated evaluations of the same portfolio produce byte-identical JSON results with zero random variance. | `lib/fn/stress.js`<br>lines 256–350 | `test/stress.test.js`<br>`Test 12: Stress calculations are strictly deterministic and idempotent` | **PASS** |

---

## 4. Market Data-Feed Invariants & Health Probes

| ID | Data Feed / Probe | Endpoint / Method | Fallback Chain | Verification Status |
| :---: | :--- | :--- | :--- | :---: |
| **FEED-01** | **Binance (Crypto)** | `/api/v3/ping` | Binance Mirror $\to$ Binance.US $\to$ Coinbase $\to$ Kraken | **OK** (184 ms) |
| **FEED-02** | **Yahoo (Equities / Indices)** | `query1.finance.yahoo.com/v8/finance/chart/SPY` | Nasdaq Public API (for US equities) | **OK** (182 ms) |
| **FEED-03** | **Nasdaq (US Stocks)** | `api.nasdaq.com/api/quote/AAPL/info` | Primary intraday & statement source when Yahoo rate-limits | **OK** (501 ms) |
| **FEED-04** | **Economic Calendar** | `nfs.faireconomy.media/ff_calendar_thisweek.json` | Keyless macroeconomic event feed | **OK** (191 ms) |
| **FEED-05** | **Kraken (Crypto / Forex)** | `api.kraken.com/0/public/Time` | Forex and crypto fallback | **OK** (504 ms) |
| **FEED-06** | **Coinbase (Crypto)** | `api.exchange.coinbase.com/products/BTC-USD/ticker` | Institutional crypto fallback | **OK** (194 ms) |

---

## 5. Security, State & Platform Boundary Invariants

| ID | Boundary Invariant | Target File | Enforcement Mechanism | Status |
| :---: | :--- | :--- | :--- | :---: |
| **SEC-01** | **Zero Runtime Dependencies** | `package.json` | `"dependencies": {}`. Zero third-party npm packages; standard Node.js APIs only. | **PASS** |
| **SEC-02** | **Protected Account State** | `data/paper-account.json` | Cryptographic SHA-256 hash locked at `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D` (2,386 bytes). | **PASS** |
| **SEC-03** | **Live Trading Disabled** | `server.js`<br>`lib/paper.js` | Live broker routing disabled; order execution routes require local application header and origin verification. | **PASS** |
| **SEC-04** | **Directory Traversal Guard** | `server.js` | Static file requests cannot escape the `public/` web root. | **PASS** |
| **SEC-05** | **Offline Test Isolation** | `scripts/test.js` | `npm test` runs 100% offline without live network dependencies. | **PASS** |
