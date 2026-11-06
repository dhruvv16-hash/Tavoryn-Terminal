# Tavoryn Terminal Desktop Architecture Audit & Migration Analysis

**Document Version:** 1.0.0  
**Audit Date:** 2026-11-06  
**Auditor:** Desktop Architecture & Engineering Team  
**Target Platform:** Tauri 2 Cross-Platform Desktop (Windows x64/ARM64, macOS Apple Silicon/Intel, Linux x64/ARM64)  
**Baseline Test Status:** 637 / 637 Passed (100%), 0 Failures, 0 Skipped  

---

## 1. Executive Summary

Tavoryn Terminal is an institutional-grade financial workspace and quantitative research terminal inspired by Bloomberg and modern financial systems. It features a four-panel workspace, CRT amber phosphor design aesthetics (with optional Daylight Titanium light mode), technical charting via Lightweight Charts, paper trading execution engine, backtesting validation harness, and extensive macroeconomic/market data integration.

A comprehensive audit was performed across the codebase (`server.js`, `lib/`, `data/`, `public/`, `netlify/`, `scripts/`, `test/`). The application has zero external npm runtime dependencies and runs entirely on Node.js 18+ standard libraries (`node:http`, `node:fs`, `node:path`, `node:crypto`, `node:stream`). 

The desktop conversion objective is to encapsulate this application within a native Tauri 2 desktop shell, bundling a platform-specific Node.js runtime as an external binary/sidecar, managing dynamic loopback port allocation, isolating persistent storage to OS standard directories, providing native tray and notification controls, and packaging native installers (`.msi`/`.exe`, `.dmg`, `.deb`/`.AppImage`).

---

## 2. Quantitative Codebase Inventory

| Subsystem / Layer | File Count | Primary Languages / Formats | Key Responsibilities |
| :--- | :---: | :--- | :--- |
| **Server Entrypoint** | 1 | JavaScript (Node.js ESM) | `server.js` (661 lines): HTTP routing, loopback enforcement, static server, SSE alert bus |
| **Backend Core (`lib/`)** | 27 | JavaScript (Node.js ESM) | Market data pipeline, providers, backtesting metrics, robust validation, paper trading, storage |
| **Backend Functions (`lib/fn/`)** | 36 | JavaScript (Node.js ESM) | Specialized terminal endpoints (`dcf`, `stress`, `btst`, `des`, `cf`, `insd`, `top`, `eco`, `gc`, etc.) |
| **Broker Layer (`lib/broker/`)** | 8 | JavaScript (Node.js ESM) | Mutex execution locking (`execution-lock.js`), risk limits, order state machine, session coordinator |
| **Frontend Shell (`public/`)** | 1 | HTML5 | `public/index.html`: Self-contained SPA container, pre-render theme check, four-panel mount |
| **Frontend Logic (`public/js/`)** | 13 | JavaScript (ESM) | `app.js`, `api.js`, `commands.js`, `securities.js`, `manual.js`, `tour.js`, `auth.js`, `login-page.js` |
| **Frontend Views (`public/js/fn/`)**| 36 | JavaScript (ESM) | Client-side visualizers for all Bloomberg-style function codes |
| **Frontend Styles (`public/css/`)**| 5 | CSS3 | `terminal.css` (CRT amber + light mode), `manual.css`, `tour.css`, `auth.css`, `login-page.css` |
| **Frontend Vendor (`public/vendor/`)**| 1 | JavaScript | `lightweight-charts.standalone.production.js` (standalone canvas chart engine) |
| **Data Layer (`data/`)** | 6+ | JSON / Filesystem | `paper-account.json`, `alerts.json`, `state.json`, `demo-requests.json`, `btst-snapshots/` |
| **Netlify Adapter (`netlify/`)** | 1 | JavaScript (ESM) | `netlify/functions/api.js`: Streaming serverless adapter for web deployment |
| **Scripts & Diagnostics (`scripts/`)**| 10 | JavaScript (Node.js) | Test harness, doctor, smoke test, benchmark comparisons, launch/stop lifecycle |
| **Automated Tests (`test/`)** | 48 | JavaScript (node:test) | 637 automated tests covering quant calculations, lookahead bias prevention, security, and UI |

---

## 3. Detailed Audit Determinations

### 1. Frontend Boundary
The frontend is completely static and located in `public/`:
- **HTML:** `public/index.html` (mounts `#grid`, `#manualView`, `#authGate`, `#loginPageView`, `#tape`).
- **Styling:** `public/css/terminal.css` defines the phosphor CRT amber theme tokens, Daylight Titanium light tokens, typography, grid panels, status bars, and UI components.
- **Client Scripting:** Pure ESM modules in `public/js/`. All HTTP requests are channeled through `public/js/api.js`, which wraps `window.fetch` with the `x-qt: 1` header.
- **Routing:** Handled client-side in `public/js/app.js` using the HTML5 History API (`pushState`, `popstate`) for `/`, `/user-manual`, `/manual`, and `/help`.

### 2. Backend Boundary
The backend consists of:
- `server.js`: Node.js HTTP server without external framework dependencies (no Express, no Fastify).
- `lib/`: Business logic, quant financial formulas, historical data ingestion, feeds, alert processing, and broker orchestration.
- `lib/fn/`: Modular handlers invoked dynamically or statically mapped via `loadFn(name)`.
- `lib/store.js`: Local filesystem persistence abstraction.

### 3. Application Startup Lifecycle
- Triggered via `node server.js` (or `node server.js --open`).
- `server.js` resolves root directory using `findRoot()`.
- Reads `package.json` for version metadata.
- Pre-loads custom user indicators from `custom/*.js`.
- Binds to `HOST` (`127.0.0.1`) and `START_PORT` (`3787`). If port is busy (`EADDRINUSE`), sequentially increments up to 20 times (`start(port + 1, tries - 1)`).
- Initializes alert scheduler (`alerts.start()`).
- Launches browser if `--open` or `QT_OPEN=1` is configured.

### 4. Backend-to-Frontend Asset Delivery
`server.js` handles both static file serving and API routing in `handle(req, res)`:
- Requests not prefixed with `/api/` are routed to `serveStatic(res, PUBLIC, relPath)`.
- SPA routes (`/`, `/user-manual`, `/help`, `/manual`) serve `public/index.html`.
- Custom indicators are served from `/custom/`.
- User manual screenshot assets are served from `/manual/assets/` (`docs/user-manual/assets`).
- MIME types are mapped strictly via a built-in dictionary with `no-cache` policies for dynamic assets and `max-age=86400` for vendor scripts.

### 5. Frontend API Invocations
The frontend invokes the following REST & streaming endpoints:
- `GET /api/health`: System health, version, node version, platform, feed status, alert counts.
- `GET /api/market-data/health`, `GET /api/market-data/status`: Streaming pipeline telemetry.
- `GET /api/candles`: Historical OHLCV bars.
- `GET /api/quotes`: Multi-symbol ticker quote snapshots.
- `GET /api/spread`: Real-time bid/ask spread estimation.
- `GET /api/search`, `GET /api/resolve`: Symbol lookup and ticker resolution.
- `GET /api/calendar`: Economic release calendar.
- `GET /api/earnings`, `/api/dividends`, `/api/news`, `/api/financials`: Fundamental datasets.
- `GET /api/screener`, `POST /api/scan`: Quant scanner and universe screening.
- `GET /api/state`, `PUT /api/state`: Terminal layout and panel state persistence.
- `GET /api/events`: Server-Sent Events (SSE) stream for real-time alerts.
- `GET /api/alerts`, `POST /api/alerts`, `DELETE /api/alerts/:id`, `PATCH /api/alerts/:id`: Alert configuration.
- `POST /api/trad/order`, `POST /api/trad/cancel`, `POST /api/trad/reset`, `GET|POST /api/trad/risk-limits`: Paper trading order submission, cancellation, account reset, and risk controls.
- `GET /api/custom`, `POST /api/custom`, `DELETE /api/custom/:file`: User-defined technical indicators.
- `POST /api/shutdown`: Graceful server termination.
- `GET /api/bdp`, `GET /api/bdh`: Bloomberg data point and historical data Excel emulation.
- `GET /api/fn/:name`: Dynamic terminal views (`wei`, `des`, `top`, `eco`, `gc`, `btst`, `dcf`, `stress`, etc.).

### 6. External Network Integrations
External network access is required exclusively for real-time and fundamental market data feeds:
- **Binance API** (`api.binance.com`): Primary crypto candles and order book data.
- **Coinbase API** (`api.coinbase.com`): Crypto secondary/fallback data.
- **Kraken API** (`api.kraken.com`): Forex pairs and crypto feeds.
- **Nasdaq API** (`api.nasdaq.com`): US equity quotes, market summary, and ETF screener.
- **Yahoo Finance** (`query1.finance.yahoo.com`, `query2.finance.yahoo.com`): Global equity historical bars, intraday quotes, options chains, holders, news.
- **SEC EDGAR** (`data.sec.gov`): Corporate financial statements and insider transaction filings (Form 4).
- **US Treasury & Federal Reserve (FRED)**: Fixed income yield curves and macroeconomic time series.
- **CFTC**: Commitments of Traders (COT) market positioning.
- **Firebase Auth CDN** (`gstatic.com`): Optional identity authentication; seamlessly degrades to mock local session when offline.

### 7. Paper Trading Persistence & Ledger State
- Stored as structured JSON in `${QT_DATA_DIR}/paper-account.json` (defaults to `data/paper-account.json`).
- Schema tracks account equity, available cash, reserved margin, active positions, open orders, trade history, and risk thresholds (`maxOrderNotional`, `maxDailyLoss`, `maxPositionPercent`).
- **Atomic Writes:** Uses two-phase writes via temporary files (`${file}.${pid}.${timestamp}.tmp`) followed by atomic filesystem replacement (`fs.renameSync`).
- **Transient Lock Handling:** Includes bounded retries (5 attempts, 15ms backoff) to withstand Windows antivirus/indexer file locks (`EPERM`, `EBUSY`, `EACCES`).
- **Corruption Resilience:** If JSON parsing fails due to incomplete writes or disk corruption, the file is automatically archived to `${storeKey}.corrupted.${Date.now()}.json` and a clean ledger is initialized without crashing.

### 8. Database Migration Evaluation
- **Determination:** No database migration is necessary or recommended.
- **Rationale:** The existing filesystem JSON store (`lib/store.js`) is zero-dependency, atomic, crash-resilient, human-inspectable, and covered by comprehensive regression tests. Introducing SQLite would introduce native binary compilation dependencies (`better-sqlite3` or Rust FFI), add architectural complexity without performance benefit for single-user desktop workloads, and jeopardize backwards compatibility.

### 9. Port Allocation & Binding
- Currently binds to `HOST` (`127.0.0.1`) and `START_PORT` (`3787`).
- Implements port collision detection: if `EADDRINUSE` occurs, it tries `port + 1` up to 20 times.
- **Desktop Requirement:** The desktop shell must dynamically manage port selection, spawn the sidecar with an allocated free port (or pass `PORT=0` / specific port), verify the port via handshake (`GET /health`), and inform the frontend.

### 10. Netlify Dependencies & Decoupling
- The codebase is completely decoupled from Netlify.
- `netlify/functions/api.js` is merely a translation shim converting Netlify serverless invocations to `server.handle(req, res)`.
- `server.js` only inspects `process.env.NETLIFY` to redirect `/custom` and `/data` to `/tmp` when running in AWS Lambda environments. On desktop, standard OS application directories are utilized.

### 11. Browser-Specific APIs & Webview Compatibility
- `localStorage`: Used for user theme and session persistence. Fully supported in Tauri webview (`WKWebView` on macOS, `WebView2` on Windows, `WebKitGTK` on Linux).
- `EventSource`: Used for `/api/events` server-sent alert events. Supported natively across all target webviews.
- `window.fetch`: Used for all REST API communication.
- `HTML5 History API`: `pushState` / `popstate` used for SPA manual routing. Supported natively.
- External hyperlinks: Currently open in place or via default browser. On desktop, external links must be intercepted and forwarded to the operating system's default browser via Tauri's opener/shell capabilities to maintain security isolation.

### 12. Security Audit & Threat Modeling
- **Loopback Enforcement:** `server.js` validates that incoming requests originate from `localhost`, `127.0.0.1`, `::1`.
- **Write Verification:** All mutating HTTP verbs (`POST`, `PUT`, `DELETE`, `PATCH`) require the custom header `x-qt: 1` and validate the `Origin` header matches the `Host` header.
- **Desktop Security Hardening:**
  1. Frontend must not have unrestricted shell or filesystem access via Tauri IPC.
  2. The bundled backend must only bind to `127.0.0.1` and never `0.0.0.0`.
  3. Tauri Content Security Policy (CSP) must restrict script execution to local bundle assets and whitelisted market data endpoints.
  4. Per-session handshake tokens should be injected so no external local processes can tamper with the running backend.

---

## 4. Baseline Test & Verification Record

All existing test suites were executed on the clean development branch (`desktop-native`):

```bash
npm test
```
**Results:**
- Total Tests: 637
- Passing Tests: 637 (100%)
- Failing Tests: 0
- Skipped: 0
- Test Duration: ~7.6 seconds
- Scope Covered: Bloomberg format parsing, BDH/BDP Excel emulation, lookahead bias prevention, execution realism, risk gateways, paper trading ledger integrity, quant calculations, technical indicators, terminal functions, theme switching, user manual routing, and security guards.

```bash
npm run check
```
**Results:**
- Offline Tests: PASS (637/637)
- Data Sources Doctor: PASS (Coinbase, Nasdaq, Economic Calendar, Kraken, Yahoo Finance, Binance)
- Live Smoke Test: PASS (All core market endpoints respond with valid schemas)

---

## 5. Architectural Recommendations for Tauri 2 Implementation

1. **Sidecar Packaging:**
   - Package a platform-specific standalone Node.js binary (v20+ LTS) as a Tauri external binary sidecar (`node-${target_triple}`).
   - Pass `server.js` and application files to the sidecar via the application resource directory.
2. **Data Directory Resolution:**
   - Configure `QT_DATA_DIR` and `QT_CUSTOM_DIR` pointing to:
     - Windows: `%APPDATA%\Tavoryn\data`
     - macOS: `~/Library/Application Support/Tavoryn/data`
     - Linux: `~/.local/share/tavoryn/data` (or `$XDG_DATA_HOME/tavoryn/data`)
   - Pre-populate default data (`paper-account.json`, `alerts.json`, `state.json`) from template assets on initial run if not present.
3. **Health Handshake:**
   - Implement an explicit polling handshake in Rust on startup: query `http://127.0.0.1:<PORT>/api/health` with a 15-second timeout before displaying or loading the main webview.
4. **Lifecycle & Clean Shutdown:**
   - Register Rust window close and application exit hooks to send `POST /api/shutdown` with `x-qt: 1` header, followed by child process kill on timeout to guarantee zero orphaned Node.js background processes.
5. **Native Integration:**
   - System tray menu with Open, Status, Restart Backend, and Quit.
   - Native notifications for updates, alerts, and market connection status.
   - Native menu shortcuts for Zoom, Fullscreen, Refresh, and Developer Tools.
