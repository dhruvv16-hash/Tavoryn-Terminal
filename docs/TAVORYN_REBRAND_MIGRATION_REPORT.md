# Tavoryn Terminal — Complete Brand Realignment & Architecture Migration Report

**Date:** October 17, 2026  
**Repository Directory:** `D:\G_BLOOM\Tavoryn-Terminal`  
**Package Identifier:** `tavoryn-terminal` (v1.0.0)  
**Release Gate Disposition:** `PASS WITH LIMITATIONS` (Phase 9 Frozen)  
**Live Execution Status:** `STRICTLY DISABLED`  
**Paper Account Invariant SHA-256:** `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`  
**Automated Test Suite Status:** `572 PASSED / 0 FAILED / 0 SKIPPED` (2,074 ms)  
**Smoke Test Status:** `19/19 CHECKS PASSED (SMOKE TEST PASSED)`  

---

## 1. Executive Summary & Brand Realignment

This report certifies the successful, repository-wide brand transformation and architectural realignment of the quantitative finance platform from legacy monikers (**Amber Terminal** and early prototype **Dhruv Terminal**) to its official identity: **Tavoryn**.

The rebrand was executed across all tiers—frontend UI, terminal layouts, backend API routing, Claude MCP protocol tooling, automation scripts, technical documentation, and test assertions—under strict zero-regression and security-preservation governance:
1. **Mathematical & Research Invariance:** All 104 quantitative indicators, formulaic derivations, backtesting models, and statistical routines remain identical to their validated formulations.
2. **Deterministic Accounting Preservation:** The benchmark paper-trading ledger (`data/paper-account.json`) was preserved with zero byte-level mutations, retaining its audited SHA-256 hash.
3. **Operational Safeguards Unbroken:** Localhost network isolation, loopback origin guards, custom header enforcement (`x-qt: 1`), cross-process execution-fencing tokens, and mandatory live-broker blocks remain fully active.
4. **Non-Breaking Backward Compatibility:** Complete dual-state resolution was established for environment variables (`TAVORYN_*` with fallback to `AMBER_*`), storage keys (`tavoryn` and `amber` mirrors), and event bus dispatches.

---

## 2. Brand Architecture & Subsystem Mapping

The brand ecosystem is structured around a unified quantitative hierarchy anchored by the official brand tagline:

> *"Research with rigor. Risk with discipline. Execution with control."*

| Brand Component | Role & Scope | Subsystem Mapping & Implementation |
| :--- | :--- | :--- |
| **Tavoryn** | Parent product and overall quantitative ecosystem umbrella. | Package identity (`tavoryn-terminal`), repository root, global architecture documentation, and system metadata. |
| **Tavoryn Terminal** | Primary 4-panel financial workspace and desktop application. | Web interface (`public/index.html`), window title, top bar masthead, command directory (`lib/fn/askb.js`), and server banner. |
| **Tavoryn Research** | Quantitative research, backtesting, strategy evaluation, and model validation. | Backtest execution engine (`lib/fn/btst.js`, `lib/replay-engine.js`), indicator suite (`lib/indicators/`), and research notebooks. |
| **Tavoryn Intelligence** | AI-assisted market analysis, natural-language command interpretation, and analytical synthesis. | Analytical assistant (`ASKB`), LLM integration layer (`public/js/fn/ai.js`, `lib/fn/askb.js`), and prompt playbooks. |
| **Tavoryn Risk** | Portfolio exposure monitoring, risk limits, drawdowns, and capital protection. | Portfolio risk evaluator (`public/js/fn/equity.js`, `lib/fn/eq-port.js`), pre-trade risk checks, and margin accounting. |
| **Tavoryn Execution** | Simulated paper execution and isolated broker coordination. | Paper trading engine (`lib/paper-trading.js`, `public/js/fn/trading.js`), execution coordinator (`lib/broker/`), and fencing mechanisms. |

---

## 3. User Interface & Visual Terminal Experience

### 3.1 Preservation of CRT Amber Phosphor Aesthetics
A foundational requirement of the terminal experience is its classic financial terminal aesthetic. All CSS design tokens in `public/css/terminal.css` referencing `--amber` (`--amber: #ffa028`, `--amber-2: #ffb54d`, `--amber-dim: #7a4808`, `--amber-glow: rgba(255, 160, 40, 0.22)`) designate the **CRT amber phosphor display palette** (monochrome P3 phosphor simulation) and have been retained untouched. Visual branding was updated without disturbing color-variable semantics:
- Top bar brand banner: `<span class="logo">TAVORYN</span><span class="sub">TERMINAL</span>`.
- Document window title: `<title>Tavoryn Terminal</title>`.
- Desktop alert notifications: `Tavoryn Terminal alert: ...`.

### 3.2 Dual-Event Dispatch & Global Shim
- **Browser Event Bus:** When system alerts trigger, the event dispatcher fires both `'tavoryn:alert'` and `'amber:alert'` via `window.dispatchEvent(new CustomEvent(...))`, ensuring third-party scripts, custom indicator hooks, or legacy extensions continue to receive signals.
- **Global API Object:** `window.tavoryn` is exported globally, with `window.amber` aliased directly to `window.tavoryn` (`window.amber = window.tavoryn`) for unbroken console scripting.

### 3.3 Prompt Playbooks & Function Registry
- All 11 pre-configured prompt playbooks in `public/js/playbooks.js` were migrated to reference Tavoryn Terminal prompts.
- Function directory title in `lib/fn/askb.js` updated to `### Tavoryn Terminal Function Directory`.
- Subsystem source signatures updated across all screens:
  - `ASKB`: `Tavoryn Intelligence · Live Market Synthesis & Analytical Knowledgebase`
  - `TRAD`: `Tavoryn Execution · Local Simulated Portfolio (No External API Key Required)`
  - `SCRN`: `Tavoryn Screener Engine`
  - `DRAW`: `Tavoryn Charting & Technical Drawing State Engine`

---

## 4. Core Engine, Server & CLI Transformations

### 4.1 Package & Server Routing
- **`package.json`:** `"name": "tavoryn-terminal"`, `"description": "Tavoryn Terminal — Financial market workspace. 4-panel Bloomberg-style terminal with 29 real-time screens, backtesting, SEC EDGAR integration, and quantitative analytics."`.
- **`server.js`:**
  - Forbidden request barrier: `"Forbidden: Tavoryn Terminal only answers to this computer."`
  - `/api/health` and `/api/about` output: `app: "tavoryn-terminal"`, `legacyApp: "amber-terminal"`, `version: "1.0.0"`.
  - Console boot banner: `Tavoryn Terminal 1.0.0 is running at http://localhost:3700`.

### 4.2 Claude Model Context Protocol (MCP) Integration
- **`scripts/mcp.js`:**
  - Protocol server identification: `name: "tavoryn"`, `title: "Tavoryn Terminal"`.
  - Command-line installation directive: `claude mcp add --scope user tavoryn -- node <path>/scripts/mcp.js`.
  - Helper & field resolution updated in `lib/bloomberg-fields.js`.

### 4.3 External Regulatory & Upstream Compliance
- **SEC EDGAR User-Agent (`lib/fn/cf.js`):** Updated to `TavorynTerminal/1.0 (+https://part-timequant.com/bloomberg)` pursuant to SEC EDGAR fair-access policy.
- **PTQ Strategy Integration (`lib/ptq.js`):** Manifest identifier updated to `Tavoryn Terminal: ...` with tracking tag `utm_source=tavoryn-terminal`.

### 4.4 Operational CLI Scripts & Utilities
- **`scripts/launch.js`:** Detects both `tavoryn-terminal` and legacy `amber-terminal` running processes, logging `Tavoryn Terminal is already running`.
- **`scripts/stop.js`:** Scans for and cleanly stops processes matching either `tavoryn-terminal` or `amber-terminal`.
- **`scripts/doctor.js`:** System diagnostic script checks environment under `Tavoryn Terminal diagnostic`.
- **`scripts/smoke.js`:** Verifies page title, chart rendering, candle fetching, and all 13 financial data feeds under Tavoryn branding.
- **`start.bat` / `start.command` / `start.sh`:** Updated launcher comments, display banners, and command invocations.

---

## 5. Backward Compatibility & Migration Guarantees

To ensure seamless migration with zero disruption to existing user configurations, research workflows, or external tools, a multi-tier compatibility matrix was implemented:

### 5.1 Environment Variable Resolution
Every backend loader and configuration reader resolves the official `TAVORYN_*` environment variable first, falling back to legacy `AMBER_*`:
```javascript
// Broker API Credentials
const apiKey = process.env.TAVORYN_BROKER_API_KEY || process.env.AMBER_BROKER_API_KEY;
const apiSecret = process.env.TAVORYN_BROKER_API_SECRET || process.env.AMBER_BROKER_API_SECRET;
const liveConfirm = process.env.TAVORYN_LIVE_BROKER_CONFIRM || process.env.AMBER_LIVE_BROKER_CONFIRM;

// Paper Storage Key
const storeKey = process.env.TAVORYN_PAPER_STORE_KEY || process.env.AMBER_PAPER_STORE_KEY || 'paper-account';
```

### 5.2 State Store Dual-Writing & Reading
State persistence in `data/state.json` maintains dual keys:
- **Load Precedence:** `data.tavoryn ?? data.amber`.
- **Dual Persistence:** When saving workspace layout, drawings, studies, watchlists, or portfolio entries, the client writes to both `tavoryn` and `amber` objects.
- **Drawing & Studies Storage:** `localStorage` checks `tavorynDrawings` before falling back to `amberDrawings`, and mirrors writes to both keys.

---

## 6. Security, Origin & Network Boundaries

All security boundaries established during Phases 1–9 remain intact and hardened:
1. **Host & Port Binding:** Tavoryn Terminal binds strictly to loopback interface `127.0.0.1` (or `localhost`). External network binding is prohibited.
2. **DNS Rebinding & Origin Protection:** Middleware validates inbound requests against an authorized whitelist (`localhost`, `127.0.0.1`). Opaque, external, or malformed `Origin` headers are immediately rejected with HTTP 403 Forbidden.
3. **Application Header Verification:** State-altering mutations (POST, PUT, DELETE) require the proprietary custom application header (`x-qt: 1`). Requests lacking this header are rejected with HTTP 403.
4. **Path Traversal Shield:** Static file handlers prohibit directory traversal (`..` escapes), confining asset resolution strictly to the `public/` directory tree.
5. **Execution Fencing:** Broker and paper execution dispatch enforce lease-backed ownership tokens (`ExecutionOwnershipLock.assertOwnership()`) preventing dual-instance collision.

---

## 7. Quantitative Models, Backtesting & Research Provenance

### 7.1 Indicator Verification Against TradingView Ground Truth
All 104 quantitative indicators across overlap studies, momentum oscillators, volume indicators, volatility bands, and statistical filters were executed against their 400-bar golden reference fixtures:
- Moving Averages: SMA, EMA, WMA, DEMA, TEMA, HMA, RMA, VWMA, ALMA, KAMA, LSMA, McGinley Dynamic.
- Oscillators & Momentum: RSI, Stochastic, StochRSI, MACD, CCI, Williams %R, ROC, Momentum, MFI, Chande Momentum, TRIX, Awesome Oscillator, Ultimate Oscillator, TSI, PPO, Coppock, Elder Ray, Balance of Power.
- Bands & Channels: Bollinger Bands, Bollinger %B, BandWidth, Keltner Channels, Donchian Channels, Price Envelopes.
- Volatility: ATR, Standard Deviation, Historical Volatility, Chande Kroll Stop, Supertrend, Volatility Stop.
- Directional & Trend: ADX, DMI, Aroon, Vortex, Choppiness Index, Mass Index, Trend Strength, Guppy MMA, Ichimoku Kinko Hyo, Parabolic SAR.
- Volume: Volume, OBV, Chaikin Money Flow, Accumulation/Distribution, Price Volume Trend, Ease of Movement, Net Volume, Volume Oscillator, Chaikin Oscillator, Klinger Volume Oscillator.
- Advanced: Anchored VWAP, TWAP, Markov Regime Switching, ZigZag, Williams Fractals, Pivot Points High/Low, Connors RSI, Rank Correlation Index, Fisher Transform.

### 7.2 Research & Replay Engine Identifiers
The deterministic backtesting and replay engine reports its execution signature as:
```javascript
version: "tavoryn-execution-v4.0"
```

---

## 8. Paper Execution, Accounting & Safeguard Invariants

### 8.1 Paper Account Immutability
The canonical reference paper-trading ledger `data/paper-account.json` was strictly preserved throughout the entire rebranding and migration process:
- **Pre-Migration SHA-256:** `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`
- **Post-Migration SHA-256:** `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`
- **Status:** **EXACT MATCH — 0 BYTES MUTATED**

### 8.2 Execution Safeguards
- **Real-Money Brokerage:** Strictly blocked. The live execution coordinator requires affirmative multi-stage environment flag activation (`TAVORYN_LIVE_BROKER_CONFIRM=YES_I_UNDERSTAND_THE_RISKS`) that is disabled in production baseline configurations.
- **Deterministic Fill Engine:** Slippage, commission models, borrow fees, and execution latency simulation operate in strict accordance with the audited Phase 9 specifications.

---

## 9. Documentation & Operational Runbook Audit

All operational and architectural documentation was audited and updated to reflect Tavoryn architecture:
- `README.md` — Complete brand overhaul, architectural layout, command catalog.
- `docs/ARCHITECTURE.md` — Updated quantitative design principles, component diagrams.
- `docs/API_REFERENCE.md` — API endpoints and schemas updated to Tavoryn Terminal.
- `docs/DATA_PROVIDERS.md` — Provider fallback matrix under Tavoryn architecture.
- `docs/DEPLOYMENT.md` — Desktop and server deployment runbook for Tavoryn Terminal.
- `docs/SECURITY.md` — Security boundaries and localhost attack mitigation.
- `docs/FEATURE_MATRIX.md` — Feature catalog and screen capabilities.
- `docs/KNOWN_LIMITATIONS.md` — Limitations and non-live operational boundaries.
- `docs/IMPLEMENTATION_ROADMAP.md` — Multi-phase evolution history.

### Historical Audit Integrity Preserved
In accordance with quantitative audit standards, historical signed reports from Phases 4 through 9 were preserved intact. Each document has been affixed with a standardized **Brand Realignment & Governance Addendum** certifying that historical conclusions, test signatures, and audit findings remain valid under the Tavoryn umbrella.

---

## 10. Verification, Test Suite & Telemetry Proof

### 10.1 Automated Unit & Integration Suite
Execution of the test suite in the renamed repository (`D:\G_BLOOM\Tavoryn-Terminal`) confirms complete operational health:
```
✔ all 104 indicators match TradingView formulas on the last 400 bars
✔ Markov regime labels states by trailing return and its odds never look ahead
✔ anchored VWAP: starts at the anchor bar and is the volume-weighted mean of hlc3
✔ health and the app page load
✔ state round-trips
✔ alerts can be created, listed and deleted
✔ writes without the app header are refused
✔ screener and scan work
✔ symbols that could reshape an upstream URL are refused
✔ an opaque Origin is refused with 403, not a crash
✔ static files cannot escape their folder
✔ POST /api/shutdown stops a running copy
✔ paper trading routes enforce authentication header and origin protection

ℹ tests 572
ℹ suites 0
ℹ pass 572
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2074.3822
```

### 10.2 Comprehensive End-to-End Smoke Test
Direct execution of `scripts/smoke.js` launched the live server on an ephemeral loopback port and exercised core screens and live upstream data providers:
```
PASS  app page (39 ms)
PASS  chart engine (4 ms)
PASS  health (4 ms)
PASS  crypto candles (BTCUSDT 1h) (1132 ms)
PASS  stock candles (AAPL 1D) (679 ms)
PASS  watchlist quotes (129 ms)
PASS  source: world prices (WEI, GLCO, FXC) (115 ms)
PASS  source: news (TOP) (2539 ms)
PASS  source: company profile (DES) (343 ms)
PASS  source: SEC filings (CF, INSD) (1627 ms)
PASS  source: holders (HDS) (149 ms)
PASS  source: options (OMON) (1716 ms)
PASS  source: economic calendar (ECO) (237 ms)
PASS  source: Treasury yields (GC) (1536 ms)
PASS  source: money markets (BTMM) (1909 ms)
PASS  source: Fed rate path (WIRP) (1413 ms)
PASS  source: macro series (ECST) (1008 ms)
PASS  source: central banks (CBRT) (2760 ms)
PASS  source: positioning (COT) (2509 ms)

crypto via Binance, stocks via Nasdaq
Every screen's source is reachable.
SMOKE TEST PASSED
```

---

## 11. Remaining Limitations & Non-Live Scope Boundaries

The formal disposition of Tavoryn Terminal remains unchanged from the Phase 9 release gate:

1. **Disposition:** `PASS WITH LIMITATIONS`.
2. **Phase Boundary:** Phase 9 remains officially closed and frozen. Phase 10 has **NOT** been initiated.
3. **Live Trading Prohibition:** Real-money trading, live order routing, and exchange connectivity remain disabled. The platform is qualified strictly for research, simulation, and extended paper observation.
4. **Execution Fencing Tokenization:** The execution-ownership lock guarantees single-process ownership on a cooperative file-system lease basis; external broker-level fencing token support remains contingent upon future broker API capabilities.

---

## 12. Final Sign-Off & Official Brand Release Gate

The repository-wide rebranding and architectural migration to **Tavoryn** is complete, verified, and officially signed off.

```
+-------------------------------------------------------------------------------+
|                       TAVORYN TERMINAL RELEASE GATE                           |
|-------------------------------------------------------------------------------|
|  Product Name:         Tavoryn Terminal                                       |
|  Repository:           D:\G_BLOOM\Tavoryn-Terminal                            |
|  Package ID:           tavoryn-terminal (1.0.0)                               |
|  Tagline:              Research with rigor. Risk with discipline.             |
|                        Execution with control.                                |
|  Paper Hash SHA-256:   8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD488... |
|  Test Suite:           572 passed / 0 failed / 0 skipped (2,074 ms)           |
|  Smoke Suite:          19/19 checks passed (SMOKE TEST PASSED)                |
|  Backward Compat:      Active (TAVORYN_* / AMBER_* dual-resolution)          |
|  Gate Disposition:     PASS WITH LIMITATIONS (Phase 9 Frozen)                 |
|  Live Trading:         DISABLED (Paper Trading & Research Observation Only)  |
+-------------------------------------------------------------------------------+
```
