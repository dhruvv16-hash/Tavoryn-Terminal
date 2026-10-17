# FEATURE VERIFICATION MATRIX
**Platform:** Dhruv Terminal (Amber Terminal / G_BLOOM)  
**Verification Date:** October 2026  
**Auditor:** Principal Software Engineer & QA Lead  
**Test Suite:** 396 Passing Tests Across 25 Test Files (0 Failures, 0 Regressions)

---

## Verification Status Classification
- **Verified & Tested:** Fully implemented, verified with offline deterministic unit/integration tests, and verified end-to-end via automated Chrome DevTools browser tests.
- **Implemented & Functional:** Fully implemented and functional against public market data, tested with unit tests and live feeds.
- **Simulated & Isolated:** Operational in local simulation mode with isolated state protection and zero real broker exposure.

---

| Feature Name | Implementation Files | Verification Method | Test Evidence | Status | Gaps / Future Enhancements |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Paper Trading Accounting (`TRAD`)** | `lib/paper-trading.js`<br>`lib/fn/trad.js`<br>`public/js/fn/trading.js` | Unit tests & Browser automation | `test/fn-trad.test.js` (9 tests passing)<br>Browser order execution & close | **Verified & Tested** | Multi-account support and customizable margin leverage models. |
| **Concurrency & Buying-Power Reservation** | `lib/paper-trading.js` | Concurrent Promise tests | `test/fn-trad.test.js`<br>Serialized order queue test | **Verified & Tested** | Distributed lock if scaled across multi-process clusters. |
| **Options Greeks & BSM Engine (`OPAY`)** | `lib/fn/opay.js`<br>`public/js/fn/derivatives.js` | Analytical benchmark tests | `test/fn-opay.test.js` (8 tests passing)<br>Hull benchmark & parity tests | **Verified & Tested** | Binomial tree / American option early exercise pricing. |
| **Options Strategy Risk Payoff** | `lib/fn/opay.js`<br>`public/js/fn/derivatives.js` | Piecewise slope analysis | `test/fn-opay.test.js`<br>Long Call 'Unlimited' check | **Verified & Tested** | Volatility surface skew / smile interpolation. |
| **Fixed Income & YTM Solver (`BNDC`)** | `lib/fn/bndc.js`<br>`public/js/fn/fixedincome.js` | Finite difference checks | `test/fn-bndc.test.js` (7 tests passing)<br>Duration & Convexity tests | **Verified & Tested** | Inflation-protected securities (TIPS) and call/put schedule pricing. |
| **Accrued Interest & Clean/Dirty Pricing** | `lib/fn/bndc.js`<br>`public/js/fn/fixedincome.js` | Day-fraction tests | `test/fn-bndc.test.js`<br>Settlement day tests | **Verified & Tested** | European / UK Gilt Actual/Actual ICMA day count variants. |
| **Multi-Asset Screener (`SCRN`)** | `lib/fn/scrn.js`<br>`public/js/fn/screener.js` | Mock provider injection | `test/fn-scrn.test.js` (5 tests passing)<br>Crypto, Forex, ETF sorting | **Verified & Tested** | Custom user-authored formula screening rules. |
| **In-Terminal AI Assistant (`ASKB`)** | `lib/fn/askb.js`<br>`public/js/fn/ai.js` | Offline model tests | `test/fn-askb.test.js` (4 tests passing)<br>WIRP & security synthesis | **Verified & Tested** | Custom LLM API key integration for open-domain reasoning. |
| **Interactive Chart Drawings (`DRAW` / `GP`)** | `lib/fn/draw.js`<br>`public/js/fn/security.js` | State persistence & Lightweight Charts | Browser automation<br>Price line rendering on chart | **Verified & Tested** | Fibonacci retracements and trendline drawing tools. |
| **Server Security & Origin Validation** | `server.js` | Raw HTTP & fuzzing tests | `test/server.test.js` (17 tests passing)<br>Origin, Host, and 400 tests | **Verified & Tested** | Public cloud deployment authentication tokens (JWT). |
| **World Equity Indices (`WEI`)** | `lib/fn/wei.js`<br>`public/js/fn/macro.js` | Live feeds & snapshot tests | `test/fn-equity.test.js`<br>`test/reference.test.js` | **Implemented & Functional** | Real-time WebSocket tick feeds from proprietary exchanges. |
| **World Interest Rate Probabilities (`WIRP`)** | `lib/fn/wirp.js`<br>`public/js/fn/rates.js` | CME FedWatch futures parser | `test/fn-rates.test.js`<br>Meeting probability checks | **Implemented & Functional** | ECB, BoE, and BoJ rate path curves. |
| **Top Financial News (`TOP`)** | `lib/fn/top.js`<br>`public/js/fn/news.js` | RSS / headline feed parser | `test/fn-newsfilings.test.js` | **Implemented & Functional** | Sentiment score NLP tagging. |
| **Company Filings & Fundamentals (`SEC`, `FA`)** | `lib/fn/sec.js`<br>`lib/fn/fa.js` | SEC EDGAR full-text search | `test/fn-docsearch.test.js` | **Implemented & Functional** | Real-time SEC RSS feed webhook ingestion. |
| **Quantitative Backtester (`BTST`)** | `lib/backtest.js`<br>`public/js/fn/quant.js` | Vectorized strategy runner | `test/backtest.test.js`<br>`test/btst-snapshot.test.js` | **Implemented & Functional** | Monte Carlo permutation walk-forward optimization. |
| **Technical Indicators (68+ TA indicators)** | `lib/indicators.js` | TradingView reference formulas | `test/indicators.test.js`<br>`test/reference.test.js` | **Verified & Tested** | User-defined custom indicators in `/custom`. |
