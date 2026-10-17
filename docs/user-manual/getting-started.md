# Tavoryn Terminal — Getting Started Guide

**Target Audience:** Quantitative Researchers, Portfolio Managers, Risk Officers, Market Analysts  
**Applicable Version:** Tavoryn Terminal Research Edition v1.0  
**Baseline:** Phase 9 Frozen Baseline (Capital-Safe, Non-Live Broker Fence)  

---

## 1. What Tavoryn Terminal Is Designed to Do

Tavoryn Terminal is a multi-asset financial analytics and quantitative research workstation. It emulates the ergonomics and depth of tier-one institutional financial terminals (e.g., Bloomberg Professional, FactSet, Refinitiv Eikon) within a zero-runtime-dependency, lightweight, offline-first web architecture.

Key capabilities include:
- **Global Market Surveillance:** Real-time and delayed quotes across global equities, commodities, sovereign debt yield curves, FX matrices, and cryptocurrencies.
- **Deep Fundamental Analysis:** SEC EDGAR 10-K, 10-Q, 8-K filings browser (`CF`), multi-period financial ratio statements (`FA`), insider transactions (`INSD`), and institutional holdings (`HDS`).
- **Institutional Valuation Modeling:** Discounted Cash Flow (`DCF`) intrinsic valuation with 5-year free cash flow projections, WACC cost-of-capital tuning, and terminal value sensitivity grids.
- **Portfolio & Risk Management:** Live mark-to-market portfolio accounting (`PORT`) paired with a historical crisis scenario stress testing engine (`STRESS`).
- **Quantitative Strategy Backtesting:** Rule-based technical condition replay engine (`BTST`) computing Sharpe ratios, maximum drawdowns, and trade logs.
- **Capital-Safe Paper Trading:** Simulated execution engine (`TRAD`) enforcing 16 pre-trade risk controls with local persistence in `data/paper-account.json`.

---

## 2. Navigating the Main Workspace

![Tavoryn Terminal 4-Panel Workspace](assets/dashboard-workspace-overview.png)
*Figure 2.1: Default Tavoryn Terminal 4-Panel Research Workspace.*

The terminal workspace is composed of four primary horizontal regions:

1. **Top Header Bar:**
   - **Brand Logo (`TAVORYN TERMINAL`):** Clicking returns to the 4-panel terminal grid (`/`).
   - **Global Command Input (`#gInput`):** Primary command prompt. Pressing <kbd>/</kbd> anywhere focuses this bar.
   - **Clocks (`#clocks`):** Synchronized real-time clocks for New York (NYC), London (LON), and Tokyo (TKO).
   - **Help Link (`HELP`):** Navigates to `/user-manual` to open the interactive user manual.

2. **Function Keys Bar (`#keys`):**
   - Quick-access buttons for yellow asset class keys (`GOVT`, `EQUITY`, `CMDTY`, `INDEX`, `CRNCY`).
   - Function shortcuts (`WEI`, `TOP`, `ECO`, `GC`, `BTMM`, `WIRP`, `FXC`, `GLCO`, `CRYPTO`, `MOST`, `EQS`, `SCRN`, `W`, `ALRT`, `TRAD`, `ASKB`, `HELP`, `DATA`).
   - Grid layout switchers (`1`, `2`, `4`).

3. **Multi-Panel Grid (`#grid`):**
   - In 4-panel mode (`LAYOUT 4`), panels 1 to 4 form a 2x2 grid.
   - In 2-panel mode (`LAYOUT 2`), panels 1 and 2 display side-by-side.
   - In 1-panel mode (`LAYOUT 1`), panel 1 displays full screen.
   - Switching panels: Click any panel, or use <kbd>Ctrl/Cmd + 1..4</kbd>.

4. **Bottom Ticker Tape (`#tape`):**
   - Streams live prices and percentage changes for S&P 500, Nasdaq 100, Dow Jones, FTSE 100, DAX, Nikkei 225, Gold, WTI Crude, 10-Year Treasury Yield, EUR/USD, and Bitcoin.

---

## 3. Command Syntax & Yellow Keys

Tavoryn Terminal uses the standard institutional command pattern:

$$\text{[TICKER]} \quad \text{[YELLOW KEY]} \quad \text{[FUNCTION]} \quad \text{<OPTIONS>} \quad \text{[GO]}$$

### Examples:
- `AAPL US EQUITY DES <GO>` — Opens Apple Inc. Description.
- `SPX INDEX GP 1Y <GO>` — 1-Year daily candlestick chart for the S&P 500 Index.
- `EURUSD CURNCY GP <GO>` — Spot Euro/US Dollar exchange rate chart.
- `GC1 COMDTY GP <GO>` — Front-month Gold Futures chart.
- `WEI <GO>` — World Equity Indices (market-wide screen; no ticker required).
- `ECO <GO>` — Economic Calendar release schedule.
- `PORT STRESS <GO>` — Multi-factor historical stress testing on current portfolio.

### Yellow Keys Mapping:
- <kbd>F2</kbd> = `GOVT` (Government Debt / Treasuries)
- <kbd>F8</kbd> = `EQUITY` (Common Stocks)
- <kbd>F9</kbd> = `COMDTY` (Commodities & Futures)
- <kbd>F10</kbd> = `INDEX` (Equity Indices)
- <kbd>F11</kbd> = `CRNCY` (Foreign Exchange & Currencies)

---

## 4. 5-Minute Guided First-Use Walkthrough

Follow these five steps to verify all core terminal subsystems:

### Step 1: Check Global Market Pulse
In Panel 1, type `WEI` and press Enter. Review North American, European, and Asian benchmark index levels, daily net changes, and percentage moves.

![World Equity Indices WEI](assets/world-markets-wei.png)
*Figure 4.1: WEI World Equity Indices.*

### Step 2: Open an Equity Description
In Panel 2, type `AAPL US EQUITY DES` and press Enter. Inspect Apple's market capitalization, P/E ratio, 52-week high/low range, dividend yield, and corporate summary.

### Step 3: Launch an Interactive Technical Chart
In Panel 3, type `SPX INDEX GP 1Y` and press Enter. Interact with the candlestick chart, inspect volume profiles, and examine moving averages.

![GP Technical Chart](assets/chart-technical-analysis-gp.png)
*Figure 4.2: SPX INDEX GP 1-Year Candlestick Chart.*

### Step 4: Perform a DCF Valuation
In Panel 4, type `AAPL US EQUITY DCF` and press Enter. Review the 5-year projected Free Cash Flows to Firm ($FCFF$), the discount factors based on WACC, the terminal value computation, and the sensitivity matrix.

![DCF Valuation Screen](assets/dcf-valuation-model.png)
*Figure 4.3: AAPL US EQUITY DCF Valuation Model.*

### Step 5: Stress Test Holdings
Type `PORT STRESS` into the global command line and press Enter. Inspect how your portfolio holdings would perform under a 2008 GFC (-52.6%), 2020 COVID-19 (-33.9%), or 2022 Fed Rate Shock (-24.9%).

![Portfolio Stress Testing](assets/portfolio-stress-testing.png)
*Figure 4.4: PORT STRESS Multi-Factor Stress Testing.*

---

## 5. Exporting Data to Excel

Every tabular screen in Tavoryn Terminal includes an automated CSV export feature:
1. Focus the panel containing the table.
2. Click the **Export** button in the upper-right corner of the panel header bar.
3. Tavoryn generates a formatted CSV file named `<FUNCTION>-<SECURITY>-<DATE>.csv` and triggers an immediate browser download.

---

## 6. Accessing Help

- **In-App Manual:** Click `HELP` in the top header or press <kbd>F1</kbd> to open the full documentation center.
- **In-Panel Function List:** Run `HELP` in any panel to view a categorized list of all functions.
- **Data Source Health:** Run `DATA` to inspect upstream provider latencies and API status.
