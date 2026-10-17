# Architecture Specification — Tavoryn Terminal (Quantitative Market OS)

## 1. Architectural Philosophy
Tavoryn Terminal is designed as an ultra-high-performance, zero-external-dependency local financial workstation and quantitative research environment.
It utilizes native modern Node.js (>= 18 ESM) built-in modules (`node:http`, `node:fs`, `node:child_process`, `node:url`, native `fetch`) to eliminate supply-chain attack surfaces, minimize runtime memory footprints, and achieve sub-second cold starts.

### Brand Architecture
- **Tavoryn**: Core parent platform identity and quantitative research infrastructure.
- **Tavoryn Terminal**: 4-panel financial workspace and desktop OS.
- **Tavoryn Research**: Backtesting, indicator validation, and statistical robustness models.
- **Tavoryn Intelligence**: AI analytical assistant and market synthesis engine (`ASKB`).
- **Tavoryn Risk**: Risk gateway, drawdown monitors, and exposure enforcement.
- **Tavoryn Execution**: Simulated paper trading portfolio (`TRAD`) and isolated broker coordinator.

## 2. Component Architecture

```
+-------------------------------------------------------------------------------+
|                       Browser Frontend (Vanilla ES Modules)                   |
|  - 4-Panel Grid Dispatcher (public/js/app.js)                                 |
|  - Bloomberg Command Parser (public/js/commands.js)                           |
|  - Financial Chart Engine (TradingView Lightweight Charts Standalone)        |
|  - Technical Indicators (public/lib/indicators.js - 50+ math formulas)        |
|  - Quant Verification Engine (public/lib/quant.js - PBO, Deflated Sharpe)     |
|  - UI Helpers (public/js/ui.js - dense tables, sparklines, tabs, tickers)     |
+-------------------------------------------------------------------------------+
                                      |
                                  HTTP / REST
                                      v
+-------------------------------------------------------------------------------+
|                        Node.js Server Engine (server.js)                      |
|  - Static Assets & Security Filter (Origin, Host, Content-Security checks)     |
|  - Function Router (/api/fn/<name> -> lib/fn/<name>.js)                       |
|  - Bloomberg API Emulator (/api/bdp, /api/bdh -> lib/bloomberg-fields.js)     |
|  - Background Alert Daemon (lib/alerts.js - 15-second tick loop)              |
|  - State Persistence Manager (lib/store.js -> data/state.json)                |
+-------------------------------------------------------------------------------+
                                      |
                         Multi-Provider Data Pipeline
                                      v
+-------------------------------------------------------------------------------+
|                     Provider Fallback Chain (lib/providers.js)                |
|  - Equity Quotes & Candles: Alpaca/Polygon (if keyed) -> Nasdaq -> Yahoo      |
|  - Digital Assets: Binance WebSocket/REST -> Coinbase -> Kraken               |
|  - Options: CBOE 15-min Delayed Data Pipeline                                 |
|  - Rates & Macro: US Treasury, Federal Reserve Bank of NY, FRED, BIS          |
|  - Regulatory Filings: SEC EDGAR Full-Text & Form 4 Pipelines                 |
+-------------------------------------------------------------------------------+
                                      |
                           AI Assistant Layer (MCP)
                                      v
+-------------------------------------------------------------------------------+
|                    Model Context Protocol Server (scripts/mcp.js)             |
|  - Stdio JSON-RPC 2.0 Interface for Claude Code, Cursor, and Local LLMs       |
|  - Exposes: terminal_function, quote, history, search_security, backtest...   |
+-------------------------------------------------------------------------------+
```

## 3. Storage & State Model
- **`data/state.json`**: Persists active panel layouts, active panel index, and user workspace preferences.
- **`data/server.log`**: Server process stdout and stderr logs for detached daemon executions.
- **`data/feeds.json`**: Optional private API keys (Alpaca, Polygon). Never committed to version control.
- **`data/paper-account.json`**: Paper trading transaction journal, orders, positions, and configurable risk limits. Uses atomic file writes with quarantine recovery for corrupted states (`*.corrupted.<timestamp>.json`).
