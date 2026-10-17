# TEST SUITE & VERIFICATION REPORT
**Platform:** Dhruv Terminal (Amber Terminal / G_BLOOM)  
**Execution Date:** October 2026  
**Node.js Version:** v22.14.0 (Windows)  
**Offline Determinism:** 100% Offline-Safe (Zero Live Network Dependencies in Standard Test Runner)

---

## 1. Test Execution Summary

| Metric | Baseline Count | Final Count | Status |
| :--- | :--- | :--- | :--- |
| **Total Tests Executed** | 384 | **396** | +12 new comprehensive tests |
| **Passing Tests** | 384 | **396** | 100% Pass Rate |
| **Failed Tests** | 0 | **0** | Zero Failures |
| **Skipped / Todo Tests** | 0 | **0** | None |
| **Regression Count** | 0 | **0** | Zero Regressions |
| **Execution Duration** | ~12.8s | **~1.92s** | ~85% Speedup (Fully Offline) |

---

## 2. Test Execution Commands & Verification Protocols

### 2.1 Full Offline Test Suite Run
```powershell
npm test
```
**Command Line:** `node scripts/test.js` (executes `node --test test/*.test.js` excluding live-network suites).  
**Actual Result:**
```
✔ health and the app page load
✔ candles come back sorted with OHLCV
✔ state round-trips
✔ alerts can be created, listed and deleted
✔ writes without the app header are refused
✔ a custom indicator file can be saved and loaded
✔ screener and scan work
✔ client mistakes get a 400, not a 500
✔ symbols that could reshape an upstream URL are refused
✔ an opaque Origin is refused with 403, not a crash
✔ alerts with a bad operator, operand or body are refused up front
✔ a "once" alert fires once even when checks overlap
✔ static files cannot escape their folder
✔ POST /api/shutdown stops a running copy
✔ slash notation: pairs stay pairs, two symbols make a ratio
✔ multi-condition alerts: all must hold, or any, and five at most
✔ paper trading routes enforce authentication header and origin protection
ℹ tests 396
ℹ suites 0
ℹ pass 396
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1916.6414
```

---

## 3. Targeted Module Test Results

### 3.1 Paper Trading Engine & Accounting Invariants
```powershell
node --test test/fn-trad.test.js
```
- `✔ paper trading: reset account to $100,000 baseline`
- `✔ paper trading: rejects invalid order inputs`
- `✔ paper trading: buy market order and position tracking`
- `✔ paper trading: adding to position updates average price correctly`
- `✔ paper trading: partial close preserves remaining position and cost basis`
- `✔ paper trading: full close deletes position but permanently preserves realized PnL`
- `✔ paper trading: pending limit order reserves buying power and cancellation releases it`
- `✔ paper trading: concurrent orders are serialized safely without race conditions`
- `✔ paper trading: trad endpoint returns complete portfolio report`  
**Result:** 9 passed, 0 failed, 111ms duration. Test storage completely isolated from user data.

### 3.2 Options Valuation & Strategy Risk Payoff
```powershell
node --test test/fn-opay.test.js
```
- `✔ black-scholes: benchmark analytical reference case (Hull)`
- `✔ black-scholes: continuous dividend yield put-call parity`
- `✔ black-scholes: comprehensive greeks directional and magnitude checks`
- `✔ black-scholes: input validation and edge cases`
- `✔ strategy risk: long call has strictly unlimited max profit and bounded loss`
- `✔ strategy risk: long put has bounded max profit at S=0 and bounded loss`
- `✔ strategy risk: iron condor defined risk boundaries`
- `✔ opay endpoint returns complete schema and source attribution`  
**Result:** 8 passed, 0 failed, 67ms duration.

### 3.3 Fixed Income & Bond Analytics
```powershell
node --test test/fn-bndc.test.js
```
- `✔ bond pricing: par bond yields par price`
- `✔ bond pricing: clean vs dirty price with accrued interest`
- `✔ bond pricing: zero-coupon bond analytic pricing and round-trip`
- `✔ bond yield solver: round-trips price and yield for coupon bonds`
- `✔ bond analytics: finite-difference validation of duration, convexity, and dv01`
- `✔ bond analytics: rate shock scenarios and input validation`
- `✔ bndc default endpoint handler returns expected structure`  
**Result:** 7 passed, 0 failed, 78ms duration.

### 3.4 Multi-Asset Screener
```powershell
node --test test/fn-scrn.test.js
```
- `✔ screener: crypto universe returns deterministic rows and stats`
- `✔ screener: forex universe returns currency pairs with pip calculation`
- `✔ screener: filtering by search query and numerical thresholds`
- `✔ screener: sorting by changePct, price, and volume`
- `✔ screener: provider failure is handled gracefully without crashing`  
**Result:** 5 passed, 0 failed, 75ms duration.

### 3.5 AI Assistant & Macro Synthesis
```powershell
node --test test/fn-askb.test.js
```
- `✔ ai assistant: returns default market intelligence summary`
- `✔ ai assistant: handles function directory query`
- `✔ ai assistant: handles macro Fed rate expectations query`
- `✔ ai assistant: handles specific security inquiry`  
**Result:** 4 passed, 0 failed, 91ms duration.

### 3.6 Server Security & Route Protections
```powershell
node --test test/server.test.js
```
- Verified Host validation (DNS rebinding defense, 403 on invalid Host).
- Verified Origin validation (cross-site origin rejection, 403 on hostile Origin).
- Verified `x-qt: 1` app header enforcement (403 on missing header).
- Verified client error status codes (400 Bad Request on malformed payload).  
**Result:** 17 passed, 0 failed, 1230ms duration.

---

## 4. End-to-End Automated Browser Verification

Executed via Chrome DevTools MCP on `http://localhost:3787/`:
1. **TRAD Panel Verification:**
   - Executed position close button click via `evaluate_script`.
   - Verified that position was deleted from table, cash increased by proceeds, cumulative realized P&L updated to `-$6.75`, and trade journal logged execution.
2. **BNDC Panel Verification:**
   - Navigated to `BNDC`. Verified benchmark Treasury pills, Newton-Raphson YTM, Macaulay/Modified duration, convexity, and rate shock scenario table.
3. **OPAY Panel Verification:**
   - Navigated to `OPAY`. Tested Bull Call Spread and Long Call strategies. Verified `Max Profit: Unlimited` rendered on Long Call, Greeks (Delta, Gamma, Theta, Vega, Rho), and payoff curve.
4. **SCRN Panel Verification:**
   - Tested Crypto and Forex tabs with real-time sortable columns, 24h volume, pips, and gainers/losers count.
