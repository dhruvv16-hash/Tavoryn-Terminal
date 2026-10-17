# Known Limitations & Data Disclaimers — Tavoryn Terminal

## 1. Data Freshness & Redistribution
- **Equity & Futures Quotes:** Sourced from public feeds and may be delayed up to 15 minutes by exchange rules.
- **Options Chains:** Sourced from CBOE delayed feeds (approximately 15 minutes behind).
- **Single Bonds & CDS:** Sourced as aggregate indices (ICE BofA Option-Adjusted Spreads and US Treasury Par Yield Curves) rather than individual dealer-quoted illiquid corporate bonds or CDS contracts.
- **Order Book Depth:** Full Level 2/3 market depth requires direct exchange licenses and is not provided via public scraping feeds.

## 2. Execution & Broker Connectivity
- Built-in trading is provided as **Simulated Paper Trading** with transparent fee and slippage models.
- Real-money live trade execution requires explicit user authorization and configuration with an external broker adapter or PTQ.
- Not affiliated with, sponsored by, or endorsed by Bloomberg L.P.
