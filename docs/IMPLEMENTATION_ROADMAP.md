# Implementation Roadmap — Tavoryn Terminal

## Overview & Execution Strategy
The progression of Tavoryn Terminal into an institution-grade financial intelligence and quant research platform proceeds in verified, incremental milestones. Each milestone delivers concrete, end-to-end functionality (backend data fetcher/calculator, frontend UI renderer, automated test suite validation, and browser verification via Chrome DevTools).

---

## Milestone 0: Baseline & Repository Inventory (COMPLETED)
- [x] Full codebase audit and feature inventory.
- [x] Baseline test verification: 362 passing tests, 0 failures.
- [x] Initial documentation: `FEATURE_MATRIX.md`, `IMPLEMENTATION_ROADMAP.md`.

---

## Milestone 1: Fixed Income & Bond Analytics (`BNDC`)
*Objective:* Implement Domain C capabilities for institutional bond valuation, duration, convexity, and risk sensitivity.
- **Backend:** `lib/fn/bndc.js`
  - Yield to Maturity (YTM) solver using Newton-Raphson approximation.
  - Maculay duration, Modified duration, and Convexity calculation.
  - Dollar Duration (DV01) and basis point value.
  - Cash-flow schedule generation (accrued interest, clean vs dirty price).
- **Frontend:** `public/js/fn/fixedincome.js`
  - Bond analytics screen: interactive coupon, maturity, yield inputs, price sensitivity curve, and cash-flow breakdown.
- **Verification:** Unit tests with reference bond cases (e.g., 10Y 4.5% Treasury benchmark) + Browser test.

---

## Milestone 2: Derivatives Strategy Builder & Payoff Diagram (`OPAY`)
*Objective:* Extend Domain E with multi-leg options strategy construction, profit/loss profiles, and breakeven analytics.
- **Backend:** `lib/fn/opay.js`
  - Analytical Black-Scholes pricing model with Greeks (Delta, Gamma, Theta, Vega, Rho).
  - Multi-leg strategy presets: Bull Call Spread, Bear Put Spread, Long Straddle, Strangle, Iron Condor, Calendar Spread.
  - Dynamic payoff curve calculation at expiry and before expiry across underlying spot variations.
- **Frontend:** `public/js/fn/derivatives.js`
  - Interactive strike selection, strategy selector, and SVG/Canvas payoff graph with breakeven lines and max gain/loss markers.
- **Verification:** Mathematical unit test vs known Black-Scholes benchmark cases + Browser test.

---

## Milestone 3: Paper Trading & Order Execution Engine (`TRAD`)
*Objective:* Implement Domain J & N for simulated execution, position sizing, order books, and trade history.
- **Backend:** `lib/fn/trad.js` & `lib/paper-trading.js`
  - Virtual account balance management ($100,000 initial equity).
  - Order types: Market, Limit, Stop-loss.
  - Slippage and commission models (0.05% slippage, $0.005/share).
  - Real-time mark-to-market position valuation and trade journal logging in `data/trades.json`.
- **Frontend:** `public/js/fn/trading.js`
  - Order entry ticket (Buy/Sell, Shares, Limit price).
  - Open positions table with live unrealized P&L.
  - Order history and trade log.
- **Verification:** Automated unit test for order fill simulation + Browser test.

---

## Milestone 4: Multi-Asset Screener (`SCRN` for Crypto & FX)
*Objective:* Complete Domain I by adding multi-asset screening for Digital Assets and Forex alongside Equity `EQS`.
- **Backend:** `lib/fn/scrn.js`
  - Multi-asset filtering: Crypto by 24h volume, price momentum, market cap; FX by spread, volatility, and interest-rate differentials.
- **Frontend:** `public/js/fn/screener.js` (or extensions to `equity.js`)
  - Filter controls and sortable ranking tables.
- **Verification:** Automated tests + Browser test.

---

## Milestone 5: Terminal-Integrated AI Assistant & Research Screen (`ASKB`)
*Objective:* Implement Domain O as an interactive in-terminal AI dialogue screen for immediate financial Q&A, formula explanations, and morning briefs.
- **Backend:** `lib/fn/askb.js`
  - Financial research prompt synthesis integrating real terminal feeds (WIRP, GC, TOP, WEI, OMON).
- **Frontend:** `public/js/fn/ai-terminal.js`
  - Terminal interactive prompt console with quick execution buttons for institutional morning brief, earnings move, and Fed surprise.
- **Verification:** Automated test + Browser test.

---

## Milestone 6: Interactive Chart Drawing Tools & Levels
*Objective:* Enhance Domain H with chart annotations, swing points, and support/resistance visualization.
- **Frontend:** `public/js/drawing.js`
  - Overlay support for horizontal price levels, trend lines, and Fibonacci retracements on Lightweight Charts.
- **Verification:** Browser automated test.

---

## Milestone 7: Enterprise Architecture, Documentation & Production Hardening
*Objective:* Deliver complete documentation set and verify all 362+ baseline tests plus new domain test suites.
- Production documentation:
  - `docs/ARCHITECTURE.md`
  - `docs/DATA_PROVIDERS.md`
  - `docs/API_REFERENCE.md`
  - `docs/SECURITY.md`
  - `docs/TEST_REPORT.md`
  - `docs/DEPLOYMENT.md`
  - `docs/KNOWN_LIMITATIONS.md`
- Full regression suite execution and zero-failure gate.
