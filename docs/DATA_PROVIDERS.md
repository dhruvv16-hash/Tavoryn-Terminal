# Data Providers & Freshness — Tavoryn Terminal

## 1. Provider Directory & Attribution

| Asset Class | Primary Provider | Fallback Provider | Freshness / Delay | Authentication Required | Notes |
|---|---|---|---|---|---|
| **US Equities** | Nasdaq | Yahoo Finance | Live to 15 min delayed | None | Free public market quotes |
| **Global Equities & Indices** | Yahoo Finance | — | 15 min delayed | None | Covers Americas, EMEA, and APAC |
| **Digital Assets (Crypto)** | Binance | Coinbase / Kraken | Live / Sub-second | None | Order book & tick data |
| **Options Chains & Greeks** | CBOE | — | 15 min delayed | None | CBOE delayed options chain quotes |
| **Fed Rate Probabilities** | CME (via Yahoo) | NY Fed | 10 min delayed | None | 30-Day Fed Funds Futures (`ZQ`) |
| **US Treasury Yield Curve** | US Treasury Dept | — | Nightly Close | None | Par yield curve from 1M to 30Y |
| **Credit Spreads (OAS)** | ICE BofA (via FRED) | — | Daily (T-1) | None | St. Louis Fed FRED public data |
| **SEC Corporate Filings** | SEC EDGAR | — | Real-time | None | 10-K, 10-Q, 8-K, Form 4 |
| **Economic Calendar** | Nasdaq Calendar | Forex Factory | Live on release | None | Macro event schedule & surveys |
| **Macro Statistics** | FRED | BLS, BEA, Fed | Periodic / On release | None | GDP, CPI, Payrolls, Sentiment |
| **Central Bank Rates** | BIS | — | Daily / On revision | None | Global policy rates |
| **Futures Positioning** | CFTC | — | Weekly (Friday) | None | Commitments of Traders (COT) |

## 2. Private Feed Plugs (`data/feeds.json`)
Users who hold direct API subscriptions can inject their keys without code changes:
- **Alpaca:** Live SIP feed (`"feed": "sip"`) or free IEX feed.
- **Polygon (Massive):** 15-minute delayed or real-time equity market data.
Keys are stored exclusively in the local, uncommitted `data/` directory and are transmitted strictly via provider HTTP headers.
