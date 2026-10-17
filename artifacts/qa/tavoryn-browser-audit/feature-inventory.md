# Tavoryn Terminal — Feature Inventory & QA Mapping

## 1. Application Shell & Workspace Infrastructure

| ID | Feature Name | Component / Route | Implementation Description | QA Test Mapping |
| :--- | :--- | :--- | :--- | :--- |
| `SH-01` | **Brand Identity & Header** | `header.top .brand` | `<span class="logo">TAVORYN</span><span class="sub">TERMINAL</span>` masthead and `<title>Tavoryn Terminal</title>` document title. | `test/browser-qa.test.js` (Test 1), Screenshot `01-shell-dashboard-4panel.png` |
| `SH-02` | **Global Command Line** | `header.top form#globalCmd` | Bloomberg-style command input `#gInput` with `.go` button. Dispatches ticker and function pairs to active panel. | Interactive Browser Test, Form evaluation |
| `SH-03` | **Global Financial Clocks** | `header.top #clocks` | Multi-timezone real-time financial market clocks: New York (NY), London (LDN), Tokyo (TKY). | DOM verification, Screenshot `01-shell-dashboard-4panel.png` |
| `SH-04` | **Function Key Row** | `#keys.keys` | Bloomberg yellow key shortcuts (`F2 GOVT`, `F8 EQUITY`, `F9 CMDTY`, `F10 INDEX`, `F11 CRNCY`) and screen pills. | DOM evaluation & click dispatch |
| `SH-05` | **Panel Layout Switcher** | `#keys .layout` | Dynamic quadrant arrangement switcher: `1` (single fullscreen), `2` (split), `4` (2x2 quadrant grid). | Screenshot `25-layout-1panel-fullscreen.png`, interactive layout tests |
| `SH-06` | **Streaming Ticker Tape** | `footer.tape #tape` | Real-time bottom market ticker displaying major asset prices and directional % change. | DOM verification & ticker rendering |
| `SH-07` | **Panel Header & Actions** | `.panel .pbar` | Panel identifier (1-4), command input, `Export` CSV button, `◂` Back button, `▢` Fullscreen toggle. | Screen interaction & export tests |

---

## 2. Market Workspace & Real-Time Screens (29 Discovered Functions)

| ID | Screen Function | Scope / Source | Description | QA Evidence |
| :--- | :--- | :--- | :--- | :--- |
| `SC-01` | **`GP` (Price Graph)** | Nasdaq / Yahoo Finance / Binance | Candlestick and line charts, multi-timeframe bar resampling (1D to MAX), volume bars, overlays (SMA, EMA, Bollinger, RSI, MACD), levels tool. | Screenshot `01-shell-dashboard-4panel.png` |
| `SC-02` | **`GLCO` (Commodities)** | Yahoo Finance | Global commodity pricing across Energy (WTI, Brent, Natural Gas), Metals (Gold, Silver, Copper), and Agriculture. | Screenshot `01-shell-dashboard-4panel.png` |
| `SC-03` | **`WEI` (World Indices)** | Yahoo Finance | Benchmark equity indices across Americas (Dow, S&P 500, Nasdaq, Russell), EMEA (FTSE, DAX, CAC), and Asia-Pacific. | Screenshot `05-screen-wei-world-equity.png` |
| `SC-04` | **`TOP` (Top News)** | CNBC, MarketWatch, Bloomberg, SEC | Real-time financial news stream with category filtering (ALL, TECH, CRYPTO, ECON) and publisher badges. | Screenshot `06-screens-macro-grid.png` |
| `SC-05` | **`ECO` (Economic Calendar)** | Nasdaq / Consensus Feeds | Global macroeconomic events, releases, consensus surveys, and prior values with local time adjustments. | Screenshot `06-screens-macro-grid.png` |
| `SC-06` | **`GC` (Yield Curves)** | US Treasury / Central Banks | Multi-country government bond yield curve visualization, 2s10s spread calculation, and inversion tracking. | Screenshot `06-screens-macro-grid.png` |
| `SC-07` | **`BTMM` (Money Markets)** | New York Fed / US Treasury | US Treasury and short-term financing rates: SOFR, EFFR, OBFR, T-bills, and repo liquidity. | Screenshot `09-screens-rates-fx-crypto.png` |
| `SC-08` | **`WIRP` (Fed Rate Path)** | CME FedWatch / Fed Futures | Fed Funds futures-implied policy rate path, meeting-by-meeting probability distribution of rate hikes/cuts. | Screenshot `09-screens-rates-fx-crypto.png` |
| `SC-09` | **`FXC` (Currency Crosses)** | Yahoo Finance / Interbank | 8x8 foreign exchange cross rates matrix (USD, EUR, JPY, GBP, CHF, CAD, AUD, CNY) with dollar strength meter. | Screenshot `09-screens-rates-fx-crypto.png` |
| `SC-10` | **`CRYPTO` (Crypto Monitor)** | Binance / Kraken | Real-time 24-hour cryptocurrency tickers, turnover, market capitalization, and percentage change. | Screenshot `09-screens-rates-fx-crypto.png` |
| `SC-11` | **`MOST` (Active Stocks)** | Nasdaq / Consolidated Tape | High-volume equities, most traded securities, percentage gainers, and percentage decliners. | Verified via `/api/fn/most` |
| `SC-12` | **`EQS` / `SCRN` (Screener)** | Multi-Provider Aggregator | Multi-asset screener filtering across Crypto, Forex, ETFs, and Stocks with customizable technical filters. | Screenshot `01-shell-dashboard-4panel.png` |
| `SC-13` | **`OMON` (Option Monitor)** | CBOE / Option Exchanges | Complete option chain by expiration, strike matrix, bid/ask spreads, Delta, Open Interest, IV30 surface. | Screenshot `15-screens-equity-analysis.png` |
| `SC-14` | **`DES` (Description)** | Nasdaq Company Profile | Corporate profile, sector, industry, market cap, shares outstanding, 52-week range, dividend metrics. | Screenshot `15-screens-equity-analysis.png` |
| `SC-15` | **`CF` (Company Filings)** | SEC EDGAR Direct API | Real-time regulatory filings (10-K, 10-Q, 8-K, Form 4, Form 144) with direct clickable document links. | Screenshot `15-screens-equity-analysis.png` |
| `SC-16` | **`HDS` (Holders)** | SEC Form 13F / Nasdaq | Institutional ownership concentration, top asset managers (Vanguard, BlackRock, State Street), net buying. | Screenshot `15-screens-equity-analysis.png` |
| `SC-17` | **`INSD` (Insider Trades)** | SEC Form 4 | C-suite and director open-market stock purchases and sales with reported transaction prices. | Verified via `/api/fn/insd?symbol=AAPL` |
| `SC-18` | **`FA` (Financial Analysis)** | SEC / Financial Statements | Balance sheet, income statement, free cash flow trends, and financial performance ratios. | Verified via `/api/fn/fa?symbol=AAPL` |
| `SC-19` | **`DVD` (Dividends)** | Exchange Records | Historical cash dividend payment record, yield on cost, frequency, and ex-dividend dates. | Verified via `/api/fn/dvd?symbol=AAPL` |
| `SC-20` | **`ERN` (Earnings)** | SEC / Consensus Estimates | Historical quarterly EPS reports, revenue surprises, and scheduled announcement dates. | Verified via `/api/fn/ern?symbol=AAPL` |
| `SC-21` | **`HP` (Historical Prices)** | Market Exchanges | Raw tabular historical price history (Open, High, Low, Close, Volume) with single-click CSV export. | Verified via `/api/fn/hp?symbol=AAPL` |
| `SC-22` | **`ANR` (Analyst Ratings)** | Wall Street Consensus | Buy/Hold/Sell analyst consensus breakdown, average price targets, and high/low estimate spreads. | Verified via `/api/fn/anr?symbol=AAPL` |
| `SC-23` | **`RV` (Relative Valuation)** | Peer Group Engine | Peer comparative valuation metrics: P/E, P/S, EV/EBITDA, and margin comparisons against sector peers. | Verified via `/api/fn/rv?symbol=AAPL` |
| `SC-24` | **`CCB` (Central Banks)** | Central Bank Disclosures | Benchmark policy interest rates across global central banks (Fed, ECB, BoE, BoJ, SNB, PBoC, RBA, BoC). | Verified via `/api/fn/cbrt` |
| `SC-25` | **`ECST` (Economic Stats)** | FRED / St. Louis Fed | Macroeconomic time series: CPI, PPI, Unemployment, Real GDP, Retail Sales, Industrial Production. | Verified via `/api/fn/ecst` |
| `SC-26` | **`COT` (Commitments of Traders)** | CFTC Weekly Reports | Commercial vs non-commercial speculator net positioning across equity index and commodity futures. | Verified via `/api/fn/cot` |
| `SC-27` | **`MEME` (Retail Sentiment)** | Social Sentiment Feed | Retail sentiment tracking, trending tickers, and discussion volume on equities and crypto. | Verified via `/api/fn/meme` |
| `SC-28` | **`MGMT` (Management)** | SEC Disclosures | Key corporate executive team members, roles, executive compensation, and tenure. | Verified via `/api/fn/mgmt?symbol=AAPL` |
| `SC-29` | **`ALRT` (Price Alerts)** | Local Event Engine | Server-side price threshold watcher with desktop notification dispatch and browser event bus integration. | Screenshot `27-modal-alrt-alerts.png` |

---

## 3. Quant Research & Backtesting (`Tavoryn Research` — `BTST`)

| ID | Feature Name | Description | Verification Method |
| :--- | :--- | :--- | :--- |
| `RS-01` | **Strategy Selection** | 5 built-in quantitative strategies (EMA Crossover, RSI Mean Reversion, Supertrend, MACD+EMA Trend, Bollinger Breakout). | Interactive click test, Screenshot `16-research-risk-execution-ai.png` |
| `RS-02` | **Timeframe Resolution** | Multi-timeframe bar selection (Daily `D`, Hourly `H`, Weekly `W`) across up to 3,000 historical bars. | Interactive UI selection |
| `RS-03` | **Quantitative Checks (5 of 5)** | Institutional robustness battery: Walk-forward validation, PBO (Probability of Backtest Overfitting), Deflated Sharpe, Cost stress testing, Parameter neighbourhood stability. | Automated calculation verification, Screenshot `16-research-risk-execution-ai.png` |
| `RS-04` | **Equity Curve & Drawdown** | Real-time canvas rendering of strategy equity curve vs Buy-and-Hold benchmark with synchronized tooltips. | Screenshot `25-layout-1panel-fullscreen.png` |
| `RS-05` | **Execution Realism** | Deterministic friction model: 0.1% transaction fee, 0.05% slippage per side, next-bar execution fill realism. | Verified via `test/execution-realism-robustness.test.js` |

---

## 4. Risk & Portfolio Analytics (`Tavoryn Risk` — `PORT`)

| ID | Feature Name | Description | Verification Method |
| :--- | :--- | :--- | :--- |
| `RK-01` | **Position Book** | Multi-asset portfolio tracking: ticker, shares/contracts, average cost basis, live market value, unrealized P&L. | Interactive UI verification, Screenshot `16-research-risk-execution-ai.png` |
| `RK-02` | **Manual Position Management** | In-panel and command-line position mutations (`PORT ADD NVDA 10 120`, `PORT DEL NVDA`). | Form input validation |
| `RK-03` | **CSV Portfolio Ingestion** | One-click import tool parsing standard broker position CSV files. | Button and schema check |
| `RK-04` | **Benchmark Risk Sizing** | Beta, volatility, and exposure calculations evaluated against S&P 500 benchmark. | Backend risk evaluator check |

---

## 5. Execution & Paper Trading (`Tavoryn Execution` — `TRAD`)

| ID | Feature Name | Description | Verification Method |
| :--- | :--- | :--- | :--- |
| `EX-01` | **Simulated Order Entry** | Order ticket form supporting Symbol, Side (BUY/SELL), Type (MARKET/LIMIT), Quantity, and Limit Price. | Form validation, Screenshot `01-shell-dashboard-4panel.png` |
| `EX-02` | **Real-Time Portfolio Accounting** | Double-entry accounting tracking Account Equity, Cash Available, Holdings Value, Unrealized P&L, Realized P&L, and Total Return. | Screenshot `01-shell-dashboard-4panel.png` |
| `EX-03` | **Pending Order Book & Cancellation** | Order queue tracking unfilled Limit orders with instant cancellation and reservation release. | Verified via `test/fn-trad.test.js` |
| `EX-04` | **Audit Journal & Transaction Log** | Immutable chronologically ordered transaction log tracking every fill price, fee, and realized P&L event. | Verified via `test/fn-trad.test.js` |
| `EX-05` | **Safety & Fencing Invariants** | Lease-backed multi-process execution lock preventing simultaneous double-order dispatch; live broker submission blocked. | Verified via `test/browser-qa.test.js` (Test 6) |

---

## 6. Analytical Intelligence (`Tavoryn Intelligence` — `ASKB`)

| ID | Feature Name | Description | Verification Method |
| :--- | :--- | :--- | :--- |
| `AI-01` | **Market Synthesis Assistant** | Conversational quantitative market analysis synthesizing real-time data across rates, equities, and crypto. | Screenshot `16-research-risk-execution-ai.png` |
| `AI-02` | **Pre-Configured Playbooks** | One-click topic analysis: Market Overview, Fed Rate Path, Tech Momentum, Function Cheat Sheet, Fixed Income Analysis. | Interactive button click, Screenshot `16-research-risk-execution-ai.png` |
| `AI-03` | **Recommended Navigation Pills** | Dynamic terminal function buttons (WEI, TOP, SCRN, TRAD) embedded in intelligence output for instant 1-click execution. | Interactive UI verification |
