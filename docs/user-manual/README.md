# Tavoryn Terminal — Interactive In-App User Manual & Documentation Center

**Release Version:** Tavoryn Terminal Research Edition v1.0  
**Baseline:** Phase 9 Frozen Baseline (Offline-First / Capital-Safe)  
**Access Routes:** `/user-manual`, `/help`, `/manual`  
**Terminal Commands:** `HELP`, `MANUAL`, `F1`  
**Last Updated:** October 2026  

---

## 1. Executive Overview

The Tavoryn Terminal In-App User Manual is an institutional-grade, integrated reference and learning center embedded directly within the Tavoryn Terminal shell. It provides quantitative researchers, portfolio managers, and financial analysts with:

1. **Step-by-Step Operational Walkthroughs:** End-to-end guidance for all 53 terminal functions and cross-asset workflows.
2. **Mathematical & Quantitative Formulations:** Exact formulas, assumptions, units, and boundary conditions for intrinsic DCF valuation, portfolio stress testing, risk-adjusted backtesting, and options pricing.
3. **Real In-App Screenshots:** High-resolution CRT amber screenshots captured directly from the live application showing initial states, configured inputs, executed outputs, and sensitivity tables.
4. **Instant Client-Side Search:** Sub-millisecond full-text search indexing across functions, inputs, formulas, metric definitions, and error codes.
5. **Capital Safety & Paper Trading Governance:** Complete operational boundaries detailing the local paper simulation ledger (`data/paper-account.json`), pre-trade risk controls, and the frozen live-broker fence.

---

## 2. Directory & Documentation Structure

The User Manual documentation suite is organized across structured markdown documents, tabular coverage matrices, and captured visual assets:

```text
docs/user-manual/
├── README.md                  # System overview, navigation guide, and architectural reference
├── getting-started.md         # Novice walkthrough, 5-minute quickstart, and learning pathways
├── feature-inventory.md       # Complete catalog of all 53 implemented functions and capabilities
├── troubleshooting.md         # Diagnostic runbook, error dictionary, and operational recovery
├── glossary.md                # Quantitative, statistical, and financial terminology dictionary
├── coverage-matrix.csv        # Machine-readable feature-to-documentation verification matrix
├── verification-report.md     # Independent release gate verification evidence and test results
└── assets/                    # High-resolution screenshots captured from localhost:3787
    ├── dashboard-workspace-overview.png
    ├── world-markets-wei.png
    ├── chart-technical-analysis-gp.png
    ├── dcf-valuation-model.png
    ├── portfolio-stress-testing.png
    ├── backtest-replay-engine.png
    ├── options-chain-omon.png
    ├── sec-filings-cf.png
    ├── economic-calendar-eco.png
    ├── rates-curve-gc.png
    ├── paper-trading-trad.png
    ├── portfolio-holdings-port.png
    ├── financial-analysis-fa.png
    ├── screener-equity-scrn.png
    ├── ai-research-assistant-ask.png
    ├── user-manual-interface.png
    ├── user-manual-search.png
    └── user-manual-mobile.png
```

---

## 3. In-App Navigation Architecture

The in-app manual is integrated seamlessly into Tavoryn's single-page application (SPA) architecture:

1. **Header Help Link:** Clicking `HELP` in the top header transitions the view from the 4-panel terminal grid to the User Manual while preserving clocks, ticker tape, and command bar.
2. **URL Routing & Refresh Support:** Navigating directly to `http://localhost:3787/user-manual`, `/help`, or `/manual` renders the User Manual directly. Browser refreshes, bookmarking, and `history.back()` / `history.forward()` are fully supported.
3. **Keyboard Shortcuts:**
   - Pressing <kbd>F1</kbd> anywhere in the application immediately opens the User Manual.
   - Pressing <kbd>Esc</kbd> while viewing the User Manual immediately returns to the active terminal workspace.
4. **Command Line Integration:** Typing `MANUAL GO` or `HELP GO` in the top global command line or any panel command prompt opens the documentation center.
5. **Brand Logo Return:** Clicking the `TAVORYN TERMINAL` brand logo in the upper-left corner returns the analyst to the 4-panel terminal grid (`/`).

---

## 4. Quantitative & Financial Integrity Principles

In strict adherence to the Phase 9 Frozen Baseline:

- **Mathematical Proofs Over Claims:** Every quantitative engine (such as DCF $EV$-to-equity bridge and Stress factor shocks) documents the exact formula implemented in `lib/` and `public/js/`.
- **WACC vs Terminal Growth Constraint:** The DCF model requires $WACC > g$. When $WACC \le g$, the engine surfaces an explicit mathematical warning to prevent infinite or negative perpetuity values.
- **Zero Runtime Dependencies:** The User Manual introduces zero external npm dependencies, using native web standards and local styling.
- **Account Protection:** The paper account ledger (`data/paper-account.json`) remains completely untouched during all documentation, testing, and screenshot capture operations.

---

## 5. Visual Feature Guide & Live Screenshots

Every core domain of Tavoryn Terminal is documented with real in-app screenshots captured from the running application:

### A. 4-Panel Research Workspace
![Default 4-Panel Research Workspace](assets/dashboard-workspace-overview.png)
*Figure 1: Default 4-Panel Bloomberg-Style CRT Workspace (`LAYOUT 4`, `LAYOUT 2`, `LAYOUT 1`).*

### B. Global Market Surveillance (`WEI`, `GLCO`, `FXC`, `CRYPTO`, `MOST`)
![Global Markets Surveillance](assets/world-markets-wei.png)
*Figure 2: Real-time global market monitoring across world indices, commodities, currencies, and digital assets.*

### C. Interactive Technical Charting & 87 Studies (`GP`, `GIP`, `HP`, `COMP`)
![Interactive Technical Charting](assets/chart-technical-analysis-gp.png)
*Figure 3: Multi-timeframe candlestick charting with synchronized volume histograms and 87 technical studies.*

### D. Quantitative DCF Valuation Engine (`DCF`)
![DCF Valuation Model](assets/dcf-valuation-model.png)
*Figure 4: 5-year Free Cash Flow to Firm projections, WACC discounting, and two-dimensional sensitivity matrix.*

### E. Institutional Portfolio Stress Testing (`STRESS`)
![Portfolio Stress Testing](assets/portfolio-stress-testing.png)
*Figure 5: Empirical crisis scenario evaluation (2008 GFC, 2020 COVID, Rates Shock) and factor vulnerability ranking.*

### F. Event-Driven Strategy Backtesting Replay (`BTST`)
![Backtest Replay Engine](assets/backtest-replay-engine.png)
*Figure 6: Historical rule-based strategy execution replay with equity curves, drawdown analysis, and Sharpe ratio.*

### G. Real-Time Options Chains & Volatility Surface (`OMON`, `OVDV`, `OPAY`)
![Options Chain](assets/options-chain-omon.png)
*Figure 7: Full expiration options chain with Black-Scholes implied volatility, options greeks, and spread payoff diagrams.*

### H. SEC Filings, Insiders & Ownership (`CF`, `INSD`, `HDS`, `DS`)
![SEC Filings and Insiders](assets/sec-filings-cf.png)
*Figure 8: SEC EDGAR 10-K, 10-Q, 8-K filings browser with Form 4 insider transactions and 13F ownership.*

### I. Macroeconomic Calendar & Economic Statistics (`ECO`, `SURP`, `ECST`, `COT`)
![Economic Calendar](assets/economic-calendar-eco.png)
*Figure 9: Global macroeconomic announcement calendar, surprise metrics, and CFTC Commitments of Traders.*

### J. Sovereign Yield Curves & Money Markets (`GC`, `BTMM`, `WIRP`, `CBRT`, `CRED`)
![Yield Curves and Rates](assets/rates-curve-gc.png)
*Figure 10: Sovereign yield curve (1M to 30Y), 2s10s spread, fed funds futures rate path, and central bank policy rates.*

### K. Simulated Paper Trading Ticket & Risk Gateway (`TRAD`, `OM`)
![Paper Trading](assets/paper-trading-trad.png)
*Figure 11: Capital-safe paper trading ticket with 16 automated pre-trade risk checks and local simulation ledger.*

### L. Portfolio Accounting & Mark-to-Market Performance (`PORT`)
![Portfolio Holdings](assets/portfolio-holdings-port.png)
*Figure 12: Real-time portfolio accounting, cash balance, unrealized P&L, portfolio Beta, and annualized volatility.*

### M. Financial Statements & Ratio Analysis (`FA`, `BQ`, `DES`, `DVD`, `EE`, `ANR`)
![Financial Analysis](assets/financial-analysis-fa.png)
*Figure 13: 4-year and 4-quarter comparative Income Statement, Balance Sheet, Cash Flow, and financial ratios.*

### N. Stock & ETF Screener (`SCRN`, `EQS`)
![Stock Screener](assets/screener-equity-scrn.png)
*Figure 14: Multi-metric equity universe screening by fundamental valuation multiples and technical indicators.*

### O. AI Market Intelligence & Context Synthesis (`ASK`, `ASKB`)
![AI Research Assistant](assets/ai-research-assistant-ask.png)
*Figure 15: Natural language market query assistant synthesizing real-time quotes, news, and regulatory filings.*

### P. In-App User Manual & Interactive Help Center (`HELP`, `F1`, `/user-manual`)
![User Manual Interface](assets/user-manual-interface.png)
*Figure 16: Integrated 16-module user manual, sub-millisecond full-text search, and clickable command pills.*

