# AMBER TERMINAL / G_BLOOM — COMPREHENSIVE ENGINEERING AUDIT
**Date:** October 2026  
**Auditor:** Principal Software Engineer, Quantitative Finance Engineer, and QA Lead  
**Scope:** Core Architecture, Financial Quant Engines, Paper Trading Execution, Concurrency, Security, and Offline Determinism

---

## Executive Summary

A comprehensive engineering audit was conducted across the entire Amber Terminal / G_BLOOM codebase. All confirmed critical and high-severity quantitative, accounting, concurrency, and reliability defects have been identified, diagnosed to their root causes, and fixed with deterministic, automated test verification.

The test suite expanded from **384 baseline tests to 396 passing tests across 25 suites** (100% pass rate, 0 failures, 0 regressions, 0 skipped), executing fully offline in under 2.0 seconds.

---

## 1. Audit Findings & Confirmed Fixes by Priority

### [P0 — Critical] Realized P&L Erased on Position Close
- **Severity:** P0 (Financial Accounting Defect)
- **File / Code Path:** `lib/paper-trading.js` lines 132-143, 306
- **Root Cause:**
  When a position was completely closed (`remainingQty <= 0.000001`), `delete acc.positions[posKey]` removed the position object from `acc.positions`. In `syncAndValuate()`, total realized P&L was computed solely by iterating through currently open positions (`totalRealizedPnl += (pos.realizedPnl || 0)`). Consequently, the moment a winning or losing trade was fully closed, its realized P&L disappeared from account metrics, reverting `realizedPnl` to zero.
- **Confirmed Fix:**
  Introduced durable, account-level cumulative realized P&L tracking (`acc.realizedPnl`). Whenever any quantity is sold (partial or full close), realized gain/loss is credited/debited to `acc.realizedPnl` as well as logged to the immutable transaction ledger (`acc.journal`). Closing a position preserves lifetime realized P&L.
- **Verification:**
  `test/fn-trad.test.js`: Verified full close of 15 AAPL shares deletes the position while permanently preserving +$1,050.00 cumulative realized P&L and total equity.

---

### [P0 — Critical] Cash Overspending & Race Conditions on Concurrent Orders
- **Severity:** P0 (Data Integrity & Concurrency Race Condition)
- **File / Code Path:** `lib/paper-trading.js` lines 83-170
- **Root Cause:**
  `placeOrder` performed asynchronous price resolution (`await fetchCurrentPrice(symbol)`) before reading the account state. Under concurrent incoming orders, multiple asynchronous quote fetches interleaved, reading stale available cash balances and resulting in double-spending and corrupted state. Furthermore, pending limit orders did not reserve buying power (`reservedCash`), allowing accounts to exceed available cash when pending orders triggered.
- **Confirmed Fix:**
  1. Implemented a serialized execution queue (`runLocked(fn)`) that wraps all order validations, quote lookups, buying-power reservations, and state updates into atomic FIFO execution tasks.
  2. Implemented strict buying-power reservation rules: pending BUY limit orders immediately reserve `limitPrice * qty` in `acc.reservedCash`.
  3. `availableCash = Math.max(0, acc.cash - acc.reservedCash)` prevents overspending.
  4. Cancelling an order immediately releases reserved funds back to available cash.
- **Verification:**
  `test/fn-trad.test.js`: Verified firing 5 concurrent BUY market orders executes without race conditions, and pending limit orders properly reserve and release buying power upon cancellation.

---

### [P0 — Critical] Options Risk Engine Misrepresented Maximum Profit as Finite
- **Severity:** P0 (Quantitative Risk & Derivatives Pricing Defect)
- **File / Code Path:** `lib/fn/opay.js` lines 102-152
- **Root Cause:**
  Maximum profit and loss were approximated by evaluating payoff across an arbitrary finite spot interval ($0.75 \times S$ to $1.25 \times S$) and checking `maxProfitVal > 1e4 ? "Unlimited" : maxProfitVal`. For standard strategies with unlimited upside (such as Long Call or Long Straddle), the sampled maximum at $+25\%$ spot was finite (e.g. \$86.25 for AAPL \$345 Call), misreporting theoretical risk as strictly capped rather than theoretically unlimited.
- **Confirmed Fix:**
  Replaced heuristic price sampling with exact analytical piecewise linear strategy risk bounds:
  - Calculated asymptotic terminal slope as $S \to \infty$ ($\text{slope}_{\infty} = \sum_{\text{calls}} \text{sign}_i \cdot \text{qty}_i$).
  - If $\text{slope}_{\infty} > 0$, Max Profit is strictly `"Unlimited"`.
  - If $\text{slope}_{\infty} < 0$, Max Loss is strictly `"Unlimited"`.
  - Evaluated exact critical strike breakpoints and $S = 0$ for bounded strategies (Long Put, Spreads, Iron Condors).
- **Verification:**
  `test/fn-opay.test.js`: Verified Long Call reports `Max Profit: 'Unlimited'`, Long Put reports `Max Profit: Strike - Premium`, and Iron Condor correctly reports defined net credit and spread width boundaries.

---

### [P0 — High] Black-Scholes-Merton Theta Omitted Continuous Dividend Yield Contribution
- **Severity:** P0 (Financial Mathematics Defect)
- **File / Code Path:** `lib/fn/opay.js` lines 47-48
- **Root Cause:**
  When continuous dividend yield $q > 0$, the Black-Scholes-Merton theta formula omitted the continuous dividend drift component ($+q S e^{-qT} N(d_1)$ for calls and $-q S e^{-qT} N(-d_1)$ for puts). Additionally, Rho ($\rho$) was omitted from the returned Greek sensitivities.
- **Confirmed Fix:**
  1. Implemented complete Merton continuous dividend yield formulas for Theta:
     $$\Theta_{\text{call}} = \frac{-\frac{S e^{-qT} \phi(d_1) \sigma}{2 \sqrt{T}} + q S e^{-qT} N(d_1) - r K e^{-rT} N(d_2)}{365}$$
     $$\Theta_{\text{put}} = \frac{-\frac{S e^{-qT} \phi(d_1) \sigma}{2 \sqrt{T}} - q S e^{-qT} N(-d_1) + r K e^{-rT} N(-d_2)}{365}$$
  2. Implemented interest rate sensitivity Greek Rho ($\rho_{\text{call}}$ and $\rho_{\text{put}}$).
  3. Added comprehensive input validation rejecting nonpositive underlying prices, nonpositive strikes, nonpositive volatilities, and negative times to expiry.
- **Verification:**
  `test/fn-opay.test.js`: Validated Put-Call Parity with $q=2.5\%$, benchmarked against textbook reference cases (Hull), verified directional Greek signs, and verified input validation throws.

---

### [P1 — High] Fixed Income Clean Price vs. Dirty Price Were Identical
- **Severity:** P1 (Fixed Income Analytics Defect)
- **File / Code Path:** `lib/fn/bndc.js` lines 98-99
- **Root Cause:**
  `cleanPrice` and `dirtyPrice` were set to identical values because accrued interest between coupon settlement dates was not modeled.
- **Confirmed Fix:**
  1. Implemented accrued interest calculation supporting arbitrary settlement days into the period:
     $$AI = \frac{\text{couponPct}}{\text{freq}} \times \frac{\text{settlementDays}}{\text{periodDays}} \times \frac{\text{face}}{100}$$
  2. Clean price and dirty price now correctly differ whenever accrued interest is nonzero: $\text{Dirty Price} = \text{Clean Price} + AI$.
  3. Cash flow present value discounting accounts for fractional period to next coupon ($t - f$).
  4. Upgraded YTM solver to a hybrid Newton-Raphson / bisection algorithm with closed-form analytic solution for zero-coupon bonds.
- **Verification:**
  `test/fn-bndc.test.js`: Verified par bonds, zero-coupon bonds, clean vs dirty price divergence with accrued interest, and finite-difference validation of Modified Duration, Convexity, and DV01.

---

### [P1 — High] Non-Deterministic Tests Dependent on Live External APIs
- **Severity:** P1 (Test Reliability & CI/CD Stability)
- **File / Code Path:** `test/fn-scrn.test.js`, `test/fn-trad.test.js`, `test/fn-askb.test.js`
- **Root Cause:**
  Tests made live HTTP requests to public external APIs (Binance, Yahoo Finance), causing tests to fail or hang when network access was intermittent, rate-limited, or unavailable.
- **Confirmed Fix:**
  1. Decoupled data fetching from business logic in `lib/fn/scrn.js` with `setScreenerProviders({ crypto, forex, nasdaq })`.
  2. Implemented `paper.setQuoteResolver(fn)` in `lib/paper-trading.js` for deterministic simulated price feeds.
  3. Added `process.env.QT_OFFLINE` guards in `lib/fn/askb.js` to ensure immediate deterministic fallback without network calls.
- **Verification:**
  `npm test`: All 396 tests execute 100% offline in 1.9 seconds with zero external network connectivity required.

---

### [P2 — Medium] Test Suite Overwriting Real User Paper Trading Account
- **Severity:** P2 (Runtime Data Protection)
- **File / Code Path:** `lib/paper-trading.js` line 7, `test/fn-trad.test.js`
- **Root Cause:**
  `lib/paper-trading.js` hardcoded `STORE_KEY = "paper-account"`. When automated tests ran `paper.resetAccount(100000)`, they directly overwrote the user's real paper trading ledger in `data/paper-account.json`.
- **Confirmed Fix:**
  1. `lib/paper-trading.js` dynamically reads `process.env.AMBER_PAPER_STORE_KEY || "paper-account"`.
  2. In `test/fn-trad.test.js`, `process.env.AMBER_PAPER_STORE_KEY = "test-paper-account-isolated"` isolates test state.
  3. User's real `data/paper-account.json` was restored from backup and is protected from automated tests.
- **Verification:**
  Ran `npm test`, confirmed `data/paper-account.json` remained untouched.

---

### [P2 — Medium] Server Security & Input Validation Regression Coverage
- **Severity:** P2 (API Security & Error Handling)
- **File / Code Path:** `server.js`, `test/server.test.js`
- **Root Cause:**
  Paper trading API endpoints lacked regression coverage for missing `x-qt: 1` headers, cross-site Origin attacks, disallowed Host headers (DNS rebinding), and malformed client orders.
- **Confirmed Fix:**
  1. Attached `{ status: 400 }` to all client-side order validation errors in `lib/paper-trading.js` so client mistakes return HTTP 400 instead of HTTP 500.
  2. Added security regression tests in `test/server.test.js` verifying that requests lacking `x-qt: 1`, requests with malicious Origins, and requests with disallowed Host headers are rejected with HTTP 403 Forbidden.
- **Verification:**
  `test/server.test.js`: All 17 server security and regression tests pass.

---

## 2. Summary of File Modifications

| File | Change Type | Lines / Purpose |
| :--- | :--- | :--- |
| `lib/paper-trading.js` | Refactored | Concurrency mutex, buying-power reservation, cumulative realized P&L persistence, status 400 error codes, and test storage isolation. |
| `test/fn-trad.test.js` | Refactored | Deterministic offline accounting tests covering invariants, partial/full close P&L, reservations, cancellations, and concurrent order serialization. |
| `lib/fn/opay.js` | Refactored | Analytical piecewise linear profit/loss boundaries, Black-Scholes continuous dividend yield theta, Rho Greek, and input validation. |
| `test/fn-opay.test.js` | Refactored | Hull benchmark analytical cases, Put-Call Parity with dividend yield, Greek sensitivities, and theoretical risk boundary checks. |
| `lib/fn/bndc.js` | Refactored | Accrued interest, clean vs dirty price divergence, zero-coupon analytical solver, and hybrid Newton-Raphson/bisection solver. |
| `test/fn-bndc.test.js` | Refactored | Clean vs dirty pricing, zero-coupon YTM round-trip, and finite-difference duration/convexity/DV01 verification. |
| `lib/fn/scrn.js` | Refactored | Provider dependency injection (`setScreenerProviders`), failure containment, timestamping, and status transparency. |
| `test/fn-scrn.test.js` | Refactored | Offline deterministic screener tests covering sorting, filtering, and provider error recovery. |
| `lib/fn/askb.js` | Refactored | Offline execution guards (`QT_OFFLINE`) for instant test execution without network delays. |
| `test/fn-askb.test.js` | Refactored | Offline testing enablement for AI assistant function routing and synthesis. |
| `test/server.test.js` | Refactored | Added security regression tests for paper trading routes, Origin enforcement, Host header validation, and HTTP 400 client error responses. |
| `docs/ENGINEERING_AUDIT.md` | Created | Comprehensive audit documentation covering findings, root causes, confirmed fixes, and verification evidence. |

---

## 3. Remaining Limitations & Operating Guidelines

1. **Simulation Boundaries:**
   - Paper trading is simulated locally for testing and educational purposes. No orders are sent to real exchanges or brokerages.
   - Default fee model assumes zero commission and zero slippage; customizable fee schedules can be configured in `lib/paper-trading.js`.
2. **Fixed Income Conventions:**
   - Day-count convention assumes semi-annual periodic compounding and 30/360 or Actual/Actual day counts typical of US Treasury benchmark notes.
3. **Options Model:**
   - The Black-Scholes-Merton model applies to European exercise options. American option early exercise premiums are not modeled.
