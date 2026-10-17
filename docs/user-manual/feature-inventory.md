# Tavoryn Terminal — Feature Inventory & Implementation Catalog

**Release Target:** Tavoryn Terminal Research Edition v1.0  
**Baseline:** Phase 9 Frozen Baseline  
**Total Cataloged Functions:** 53 Functions + 8 Shell Features = 61 Capabilities  
**Documentation Status:** 100% Fully Documented / Zero Undocumented Features  

---

## 1. Executive Summary

This inventory catalogs every functional screen, analytics engine, and system service implemented in Tavoryn Terminal. Each capability is derived directly from the application source code (`public/js/fn/`, `lib/fn/`, `server.js`) and verified against the running application at `http://localhost:3787/`.

---

## 2. Core Functional Modules (53 Functions)

### A. Markets Domain (5 Functions)
| Code | Function Name | Scope | Inputs | Expected Output | Provider | Screenshot Asset |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `WEI` | World Equity Indices | Market | None | Global benchmark index tables by region (Americas, EMEA, APAC). | Public Exchange | `world-markets-wei.png` |
| `GLCO` | Global Commodities | Market | None | Energy, metals, and agricultural futures prices with net/pct change. | Public Gateway | `world-markets-wei.png` |
| `FXC` | Foreign Exchange Matrix | Market | None | Cross-currency matrix and major USD/EUR/GBP/JPY spot pairs. | FX Public Feed | `world-markets-wei.png` |
| `CRYPTO` | Digital Asset Monitor | Market | None | Real-time streaming quotes for BTC, ETH, SOL, XRP, ADA, DOGE. | Crypto WS | `world-markets-wei.png` |
| `CT` | Contract Table | Market | Commodity | Futures curve strip and delivery contract expiries. | Public Feeds | `rates-curve-gc.png` |

### B. Equities Domain (16 Functions)
| Code | Function Name | Scope | Inputs | Expected Output | Provider | Screenshot Asset |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `DES` | Security Description | Equity | Ticker | Business overview, capitalization, P/E, 52W range, dividend yield. | Public/Yahoo | `dashboard-workspace-overview.png` |
| `BQ` | Bloomberg Quote | Equity | Ticker | Real-time bid, ask, size, last, day high/low, volume. | Public Feed | `dashboard-workspace-overview.png` |
| `FA` | Financial Analysis | Equity | Ticker, Period | Multi-year income statement, balance sheet, cash flow ratios. | SEC EDGAR/Yahoo | `financial-analysis-fa.png` |
| `DCF` | Discounted Cash Flow | Equity | Ticker, WACC, $g$ | 5-year FCFF projections, WACC discount factors, sensitivity matrix. | Internal Quant | `dcf-valuation-model.png` |
| `MOST` | Most Active / Movers | Market | Category | Top gainers, top losers, and volume leaders. | Public Feed | `world-markets-wei.png` |
| `ERN` | Earnings History | Equity | Ticker | Historical reported EPS vs consensus estimates and surprise %. | Public Feed | `sec-filings-cf.png` |
| `CF` | Corporate Filings | Equity | Ticker, Type | SEC EDGAR 10-K, 10-Q, 8-K document browser with live text links. | SEC EDGAR | `sec-filings-cf.png` |
| `INSD` | Insider Transactions | Equity | Ticker | Form 4 insider purchases and sales by corporate executives. | SEC EDGAR | `sec-filings-cf.png` |
| `HDS` | Institutional Holdings | Equity | Ticker | 13F institutional ownership breakdowns and top hedge fund positions. | SEC EDGAR | `sec-filings-cf.png` |
| `DS` | Document Search | Equity | Query | Keyword text search across corporate annual and quarterly filings. | Local Engine | `sec-filings-cf.png` |
| `OMON` | Option Monitor | Equity | Ticker, Expiry | Full calls and puts options chain with strikes, IV, and volume. | Options Engine | `options-chain-omon.png` |
| `OVDV` | Option Volatility Surface | Equity | Ticker | Implied volatility smile and term structure across expiries. | Quant Vol | `options-chain-omon.png` |
| `EQS` | Equity Screener | Market | Filters | Multi-metric stock screening by market cap, P/E, and sector. | Local Screener | `screener-equity-scrn.png` |
| `DVD` | Dividend History | Equity | Ticker | Dividend payout history, ex-dividend dates, and yield metrics. | Public Feed | `financial-analysis-fa.png` |
| `EE` | Earnings Estimates | Equity | Ticker | Consensus forward EPS and revenue analyst projections. | Public Feed | `financial-analysis-fa.png` |
| `ANR` | Analyst Recommendations | Equity | Ticker | Buy, Hold, Sell analyst consensus breakdown and price targets. | Public Feed | `financial-analysis-fa.png` |

### C. Charts Domain (4 Functions)
| Code | Function Name | Scope | Inputs | Expected Output | Provider | Screenshot Asset |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `GP` | Graphical Price Chart | Security | Ticker, Period | Interactive candlestick chart with volume, SMA, and indicators. | Lightweight Charts | `chart-technical-analysis-gp.png` |
| `GIP` | Intraday Price Chart | Security | Ticker | High-resolution 1-minute to 5-minute intraday bar chart. | Lightweight Charts | `chart-technical-analysis-gp.png` |
| `HP` | Historical Price Table | Security | Ticker, Range | Tabular daily OHLCV prices with net change and volume. | Public Feed | `chart-technical-analysis-gp.png` |
| `COMP` | Comparative Returns | Security | Tickers | Normalized percentage return overlay comparing multiple assets. | Internal Engine | `chart-technical-analysis-gp.png` |

### D. News & Corporate Events (2 Functions)
| Code | Function Name | Scope | Inputs | Expected Output | Provider | Screenshot Asset |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `CN` | Company News | Equity | Ticker | Curated real-time company headline stream with timestamps. | News Wire Feed | `sec-filings-cf.png` |
| `TOP` | Top Global News | Market | Category | Major financial headlines, macroeconomic developments, and policy. | Global Wire | `dashboard-workspace-overview.png` |

### E. Economics & Fixed Income (10 Functions)
| Code | Function Name | Scope | Inputs | Expected Output | Provider | Screenshot Asset |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `ECO` | Economic Calendar | Market | Date/Region | Global economic releases (CPI, Nonfarm Payrolls, GDP, PMI). | Economic Feed | `economic-calendar-eco.png` |
| `SURP` | Economic Surprises | Market | None | Actual vs consensus economic release deviations. | Macro Feed | `economic-calendar-eco.png` |
| `ECST` | Economic Statistics | Market | Country | Macroeconomic trend series (unemployment, debt-to-GDP). | St. Louis Fed | `economic-calendar-eco.png` |
| `COT` | Commitments of Traders | Commodity | Market | CFTC commercial vs non-commercial speculative positioning. | CFTC Public | `economic-calendar-eco.png` |
| `GC` | Government Curve | Sovereign | Country | Sovereign yield curve (1M to 30Y) with maturity spread analysis. | US Treasury | `rates-curve-gc.png` |
| `BTMM` | Treasury Money Markets | Sovereign | None | Short-term Treasury bill yields and repo rate benchmarks. | US Treasury | `rates-curve-gc.png` |
| `WIRP` | World Interest Rate Probs | Sovereign | Meeting | Implied central bank interest rate hike/cut probabilities. | Rates Engine | `rates-curve-gc.png` |
| `CBRT` | Central Bank Policy Rates | Sovereign | None | Current benchmark interest rates across Fed, ECB, BoE, BoJ. | Central Banks | `rates-curve-gc.png` |
| `CRED` | Credit Spreads | Fixed Inc | Sector | Investment grade and high-yield corporate credit spreads over Treasuries. | Fixed Income | `rates-curve-gc.png` |
| `AUCT` | Treasury Auctions | Sovereign | None | Recent US Treasury auction results, bid-to-cover ratios, yields. | US Treasury | `rates-curve-gc.png` |

### F. Strategy, Portfolio & Risk (5 Functions)
| Code | Function Name | Scope | Inputs | Expected Output | Provider | Screenshot Asset |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `BTST` | Backtest Replay Engine | Security | Ticker, Strategy | Strategy replay equity curve, Sharpe, Win Rate, Drawdown. | Internal Quant | `backtest-replay-engine.png` |
| `PORT` | Portfolio Management | Portfolio | None | Mark-to-market position ledger, unrealized P&L, allocation. | Paper Ledger | `portfolio-holdings-port.png` |
| `STRESS` | Portfolio Stress Test | Portfolio | Scenario | Projected losses under 2008 GFC, 2020 COVID, Rates Shock. | Internal Quant | `portfolio-stress-testing.png` |
| `TRAD` | Paper Trading Ticket | Security | Ticker, Order | Order entry ticket, pre-trade risk checks, transaction log. | Paper Engine | `paper-trading-trad.png` |
| `BNDC` | Bond Calculator | Fixed Inc | Yield/Coupon | Clean price, dirty price, duration, and convexity metrics. | Fixed Income | `rates-curve-gc.png` |

### G. Workspace, Derivatives & Screener (6 Functions)
| Code | Function Name | Scope | Inputs | Expected Output | Provider | Screenshot Asset |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `W` | Watchlist Manager | Market | List Name | Custom multi-asset watchlist monitor with live updates. | Local Storage | `world-markets-wei.png` |
| `ALRT` | Price Alert System | Security | Threshold | Visual, auditory, and desktop notifications upon price breach. | Event Stream | `dashboard-workspace-overview.png` |
| `OPAY` | Options Payoff Profile | Options | Strategy | Profit/Loss expiration graph for single-leg and multi-leg spreads. | Derivatives | `options-chain-omon.png` |
| `SCRN` | Stock & ETF Screener | Market | Universe | Filter equity universes by fundamental and technical criteria. | Screener Engine | `screener-equity-scrn.png` |
| `DRAW` | Chart Annotation Engine | Security | Ticker | Trendline and Fibonacci drawing tools overlaying GP chart. | Local Canvas | `chart-technical-analysis-gp.png` |
| `PLAY` | Interactive Playbooks | Help | Playbook ID | Institutional trading playbooks and sizing guidelines. | Static Playbook | `user-manual-interface.png` |

### H. Intelligence & Terminal Administration (5 Functions)
| Code | Function Name | Scope | Inputs | Expected Output | Provider | Screenshot Asset |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `ASK` | AI Financial Search | Research | Question | Natural language research queries synthesizing financial events. | Local Engine | `ai-research-assistant-ask.png` |
| `ASKB` | AI Research Assistant | Research | Question | Detailed financial context analysis with structured citations. | Local Engine | `ai-research-assistant-ask.png` |
| `API` | Terminal API Reference | Help | None | OpenAPI documentation for Tavoryn's local HTTP endpoints. | Internal Server | `user-manual-interface.png` |
| `HELP` | Function Directory | Help | None | Categorized directory of all functions and yellow keys. | Internal UI | `user-manual-interface.png` |
| `DATA` | Data Source Health | Help | None | Operational status, staleness metrics, and upstream providers. | Local Server | `user-manual-interface.png` |

---

## 3. Terminal Shell & Workspace Features (8 Capabilities)

1. **In-App Interactive User Manual:** Full-screen responsive Help Center accessible via `/user-manual`, `/help`, `MANUAL`, `HELP`, or <kbd>F1</kbd>.
2. **Multi-Panel Dynamic Layouts:** 1, 2, and 4-panel configurations (`LAYOUT 1`, `LAYOUT 2`, `LAYOUT 4`).
3. **One-Click CSV Data Export:** Universal data table export to Excel-compatible CSV across all screens.
4. **Interactive Security Autocomplete (SECF):** Real-time symbol query matching equity, commodity, index, currency, and crypto tickers.
5. **Real-Time Synchronized Clocks:** Precision market clocks for New York, London, and Tokyo.
6. **Streaming Benchmark Ticker Tape:** Real-time cross-asset price tape streaming across major global indices, gold, oil, and bitcoin.
7. **Pre-Trade Risk Gateway:** 16 automated pre-trade risk checks verifying purchasing power, position sizing, and feed freshness.
8. **Local Paper Trading Persistence:** Zero-risk simulation ledger in `data/paper-account.json`.
