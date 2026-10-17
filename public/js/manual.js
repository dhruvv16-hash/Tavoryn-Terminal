// ==========================================================================
// Tavoryn Terminal — Interactive In-App User Manual Component
// Modular institutional reference, search engine, and guide.
// ==========================================================================

export const MANUAL_SECTIONS = [
  {
    id: "getting-started",
    title: "1. Getting Started",
    code: "START",
    summary: "First-use guide, system initialization, and basic navigation workflow.",
    content: `
      <h1>1. Getting Started with Tavoryn Terminal</h1>
      <p class="manual-lead">Tavoryn Terminal is an institutional-grade, zero-runtime-dependency financial research station designed for quantitative analysts, portfolio managers, and market researchers.</p>

      <div class="manual-card info">
        <div class="manual-card-title">RESEARCH EDITION V1.0 ARCHITECTURE</div>
        Tavoryn operates on a local Node.js server engine paired with a high-performance browser interface. It adheres strictly to an offline-first, capital-safe execution model. All paper trading and research operations are safely isolated from live brokers.
      </div>

      <h2>System Initialization</h2>
      <p>When you launch Tavoryn Terminal (via <code>start.bat</code>, <code>start.sh</code>, or <code>node server.js</code>), the terminal starts at <code>http://localhost:3787/</code> and initializes with a default 4-panel Bloomberg-style CRT workspace.</p>

      <div class="manual-screenshot-container">
        <img src="/manual/assets/dashboard-workspace-overview.png" class="manual-screenshot-img" alt="Tavoryn Terminal Overview" />
        <div class="manual-screenshot-caption"><span><b>Figure 1.1</b> — Default 4-Panel Research Workspace</span><span>Viewport: 1400x900 CRT Amber</span></div>
      </div>

      <h2>Quick Start Tutorial (5-Minute Workflow)</h2>
      <ol class="step-list">
        <li><b>Observe Global Markets:</b> Check Panel 1 for <span class="cmd-pill" data-run="WEI">WEI GO</span> (World Equity Indices) to review S&amp;P 500, Nasdaq, Dow Jones, FTSE 100, DAX, Nikkei, and Hang Seng real-time performance.</li>
        <li><b>Analyze a Specific Stock:</b> Click the top global input bar (or press <span class="key-pill">/</span>), type <span class="cmd-pill" data-run="AAPL US EQUITY DES">AAPL US EQUITY DES GO</span>, and press Enter to load Apple Inc. business profile and fundamentals.</li>
        <li><b>Inspect Technical Indicators:</b> In the same or another panel, run <span class="cmd-pill" data-run="SPX INDEX GP">SPX INDEX GP GO</span> to inspect interactive candlestick charts with volume bars, SMA, and Bollinger Bands.</li>
        <li><b>Perform DCF Valuation:</b> Type <span class="cmd-pill" data-run="AAPL US EQUITY DCF">AAPL US EQUITY DCF GO</span> to project 5-year free cash flows and compute intrinsic share value.</li>
        <li><b>Stress Test Your Portfolio:</b> Type <span class="cmd-pill" data-run="PORT STRESS">PORT STRESS GO</span> to evaluate your holdings against 2008 GFC, 2020 COVID, and interest rate crisis scenarios.</li>
      </ol>

      <h2>Recommended Learning Path</h2>
      <table class="manual-table">
        <thead>
          <tr><th>Stage</th><th>Focus Area</th><th>Recommended Functions</th></tr>
        </thead>
        <tbody>
          <tr><td>Level 1: Novice</td><td>Terminal Navigation &amp; Quotes</td><td><code>WEI</code>, <code>TOP</code>, <code>DES</code>, <code>HP</code></td></tr>
          <tr><td>Level 2: Intermediate</td><td>Charting &amp; Fundamental Filings</td><td><code>GP</code>, <code>GIP</code>, <code>FA</code>, <code>CF</code>, <code>ECO</code></td></tr>
          <tr><td>Level 3: Quantitative</td><td>Options, Yield Curves &amp; Valuation</td><td><code>OMON</code>, <code>GC</code>, <code>DCF</code>, <code>BTST</code></td></tr>
          <tr><td>Level 4: Institutional</td><td>Risk Controls &amp; Portfolio Stress</td><td><code>PORT</code>, <code>STRESS</code>, <code>TRAD</code></td></tr>
        </tbody>
      </table>
    `
  },
  {
    id: "understanding-terminal",
    title: "2. Understanding the Terminal",
    code: "SHELL",
    summary: "Bloomberg CRT aesthetics, layout controls, keyboard shortcuts, and command syntax.",
    content: `
      <h1>2. Understanding the Terminal Interface</h1>
      <p class="manual-lead">Tavoryn Terminal combines classic financial terminal ergonomics with modern reactive web engineering. The user interface features an authentic amber CRT phosphor palette, tabular numerals, and dedicated function keys.</p>

      <h2>The Bloomberg Command Line Philosophy</h2>
      <p>Commands in Tavoryn follow the standard institutional convention: <code>[TICKER] [YELLOW KEY] [FUNCTION] &lt;OPTIONS&gt;</code> followed by <b>GO</b> (the Enter key).</p>
      
      <div class="manual-card">
        <div class="manual-card-title">COMMAND SYNTAX EXAMPLES</div>
        <ul>
          <li><span class="cmd-pill" data-run="AAPL US EQUITY DES">AAPL US EQUITY DES</span> — Opens Company Description for Apple Inc.</li>
          <li><span class="cmd-pill" data-run="SPX INDEX GP 1Y">SPX INDEX GP 1Y</span> — Opens 1-Year Price Chart for S&amp;P 500.</li>
          <li><span class="cmd-pill" data-run="EURUSD CURNCY GP">EURUSD CURNCY GP</span> — Opens Euro/USD spot exchange rate chart.</li>
          <li><span class="cmd-pill" data-run="GC1 COMDTY GP">GC1 COMDTY GP</span> — Opens Gold Futures daily chart.</li>
          <li><span class="cmd-pill" data-run="WEI">WEI</span> — Market-wide screen (World Equity Indices), needs no ticker.</li>
        </ul>
      </div>

      <h2>Keyboard Shortcuts &amp; Yellow Keys</h2>
      <table class="manual-table">
        <thead>
          <tr><th>Key</th><th>Function</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><span class="key-pill">F1</span></td><td>HELP / MANUAL</td><td>Opens this in-app User Manual &amp; Interactive Help Center.</td></tr>
          <tr><td><span class="key-pill">F2</span></td><td>GOVT</td><td>Appends government bond security type to command input.</td></tr>
          <tr><td><span class="key-pill">F8</span></td><td>EQUITY</td><td>Appends equity security type to command input.</td></tr>
          <tr><td><span class="key-pill">F9</span></td><td>COMDTY</td><td>Appends commodity security type to command input.</td></tr>
          <tr><td><span class="key-pill">F10</span></td><td>INDEX</td><td>Appends index security type to command input.</td></tr>
          <tr><td><span class="key-pill">F11</span></td><td>CRNCY</td><td>Appends currency / FX security type to command input.</td></tr>
          <tr><td><span class="key-pill">Ctrl/Cmd + 1..4</span></td><td>Switch Panel</td><td>Instantly focuses active panel 1, 2, 3, or 4.</td></tr>
          <tr><td><span class="key-pill">Esc</span></td><td>Back / Close</td><td>Navigates backward in panel history or closes manual view.</td></tr>
          <tr><td><span class="key-pill">/</span></td><td>Global Input</td><td>Jumps cursor directly to the top global command line.</td></tr>
        </tbody>
      </table>

      <h2>Real-Time Clocks &amp; Ticker Tape</h2>
      <p>The top header bar displays synchronized international financial center clocks (New York <b>NYC</b>, London <b>LON</b>, Tokyo <b>TKO</b>, Hong Kong <b>HKG</b>, Sydney <b>SYD</b>). The bottom ticker tape streams real-time prices for major benchmark assets including S&amp;P 500, Nasdaq, Gold, Crude Oil, 10-Year Treasury Yield, EUR/USD, and Bitcoin.</p>
    `
  },
  {
    id: "dashboard-workspace",
    title: "3. Dashboard & Workspace",
    code: "GRID",
    summary: "Multi-panel grid layouts, panel synchronization, data export, and screen controls.",
    content: `
      <h1>3. Dashboard &amp; Multi-Panel Workspace</h1>
      <p class="manual-lead">Tavoryn offers dynamic multi-panel workspaces allowing analysts to cross-examine market indices, fundamental filings, charts, and risk models simultaneously.</p>

      <h2>Panel Layout Controls</h2>
      <p>You can configure your workspace layout at any time by entering one of the layout commands into the global input bar:</p>
      <ul>
        <li><span class="cmd-pill" data-run="LAYOUT 4">LAYOUT 4</span> — Standard 2x2 four-panel grid (default).</li>
        <li><span class="cmd-pill" data-run="LAYOUT 2">LAYOUT 2</span> — 2-panel side-by-side comparative layout.</li>
        <li><span class="cmd-pill" data-run="LAYOUT 1">LAYOUT 1</span> — Focused single-panel full-screen workstation.</li>
      </ul>

      <h2>Individual Panel Controls</h2>
      <p>Each panel in the grid operates as an independent terminal window featuring:</p>
      <ul>
        <li><b>Panel Number Badge:</b> Highlights the active panel. Clicking anywhere inside a panel focuses it.</li>
        <li><b>Local Command Line:</b> Allows running a function specifically in that panel without affecting the others.</li>
        <li><b>Export Button:</b> Downloads every tabular dataset currently rendered on the screen into an Excel-ready CSV file named <code>&lt;FUNCTION&gt;-&lt;SECURITY&gt;-&lt;DATE&gt;.csv</code>.</li>
        <li><b>Back Button (Esc):</b> Traverses backwards through the panel's function history.</li>
        <li><b>Maximize Button (▢):</b> Toggles full-screen view for the panel. Double-clicking the panel title bar achieves the same effect.</li>
      </ul>

      <div class="manual-screenshot-container">
        <img src="/manual/assets/world-markets-wei.png" class="manual-screenshot-img" alt="World Equity Indices WEI" />
        <div class="manual-screenshot-caption"><span><b>Figure 3.1</b> — WEI (World Equity Indices) Full-Screen View</span><span>Americas, EMEA, and Asia-Pacific Benchmarks</span></div>
      </div>
    `
  },
  {
    id: "market-data",
    title: "4. Market Data & Instrument Search",
    code: "MKT",
    summary: "World equity indices, global commodities, FX matrix, crypto monitor, and symbol resolution.",
    content: `
      <h1>4. Market Data &amp; Instrument Search</h1>
      <p class="manual-lead">Comprehensive cross-asset market surveillance covering global equities, sovereign debt, foreign exchange, energy, precious metals, and digital currencies.</p>

      <h2>Core Market Surveillance Functions</h2>
      <table class="manual-table">
        <thead>
          <tr><th>Code</th><th>Name</th><th>Coverage &amp; Characteristics</th></tr>
        </thead>
        <tbody>
          <tr><td><span class="cmd-pill" data-run="WEI">WEI</span></td><td>World Equity Indices</td><td>S&amp;P 500, Nasdaq, Dow Jones, Russell 2000, FTSE, DAX, CAC, Nikkei, Hang Seng, Shanghai.</td></tr>
          <tr><td><span class="cmd-pill" data-run="GLCO">GLCO</span></td><td>Global Commodities</td><td>WTI Crude, Brent, Natural Gas, Gold, Silver, Copper, Platinum, Wheat, Corn.</td></tr>
          <tr><td><span class="cmd-pill" data-run="FXC">FXC</span></td><td>Foreign Exchange Matrix</td><td>Major currency pairs (EUR/USD, USD/JPY, GBP/USD, USD/CHF, AUD/USD, USD/CAD).</td></tr>
          <tr><td><span class="cmd-pill" data-run="CRYPTO">CRYPTO</span></td><td>Digital Asset Monitor</td><td>Real-time streaming crypto quotes for BTC, ETH, SOL, XRP, ADA, DOGE.</td></tr>
          <tr><td><span class="cmd-pill" data-run="MOST">MOST</span></td><td>Active Movers</td><td>Top gainers, top losers, and highest volume equities in US markets.</td></tr>
        </tbody>
      </table>

      <h2>SECF Security Autocomplete Lookup</h2>
      <p>As you type a company or asset name into any command line (e.g. <code>micro</code>, <code>apple</code>, <code>treasury</code>), Tavoryn automatically performs interactive security lookup matching official Bloomberg security codes:</p>
      <ul>
        <li><code>AAPL US EQUITY</code> (Apple Inc.)</li>
        <li><code>MSFT US EQUITY</code> (Microsoft Corporation)</li>
        <li><code>SPX INDEX</code> (S&amp;P 500 Index)</li>
        <li><code>EURUSD CURNCY</code> (Euro / US Dollar)</li>
        <li><code>BTC CRYPTO</code> (Bitcoin Spot)</li>
      </ul>
      <p>Press <span class="key-pill">Tab</span> or the Down Arrow key to select suggestions, then press Enter to execute.</p>
    `
  },
  {
    id: "charts-technical",
    title: "5. Charts & Technical Analysis",
    code: "GP",
    summary: "High-performance candlestick charts, volume profiles, and 87 technical indicators.",
    content: `
      <h1>5. Charts &amp; Technical Analysis (GP / GIP / COMP)</h1>
      <p class="manual-lead">Interactive financial charting powered by TradingView Lightweight Charts™, supporting customizable time horizons, OHLCV bars, volume profiles, and verified technical indicators.</p>

      <div class="manual-screenshot-container">
        <img src="/manual/assets/chart-technical-analysis-gp.png" class="manual-screenshot-img" alt="GP Technical Chart" />
        <div class="manual-screenshot-caption"><span><b>Figure 5.1</b> — SPX INDEX GP with Volume and Moving Averages</span><span>Engine: Lightweight Charts v4.2</span></div>
      </div>

      <h2>Chart Types &amp; Range Options</h2>
      <p>Execute charts using the <code>GP</code> function. You can specify period intervals directly:</p>
      <ul>
        <li><span class="cmd-pill" data-run="AAPL US EQUITY GP 1M">AAPL US EQUITY GP 1M</span> — 1-Month Daily Candlestick Chart.</li>
        <li><span class="cmd-pill" data-run="AAPL US EQUITY GP 1Y">AAPL US EQUITY GP 1Y</span> — 1-Year Daily Candlestick Chart (Default).</li>
        <li><span class="cmd-pill" data-run="AAPL US EQUITY GP 5Y">AAPL US EQUITY GP 5Y</span> — 5-Year Long-Horizon Chart.</li>
        <li><span class="cmd-pill" data-run="AAPL US EQUITY GIP">AAPL US EQUITY GIP</span> — Intraday Minute Bar Chart.</li>
        <li><span class="cmd-pill" data-run="COMP AAPL MSFT NVDA">COMP AAPL MSFT NVDA</span> — Percentage Return Comparative Overlay.</li>
      </ul>

      <h2>Supported Technical Indicators (87 Verified Quant Engines)</h2>
      <table class="manual-table">
        <thead>
          <tr><th>Category</th><th>Key Indicators</th><th>Mathematical Output</th></tr>
        </thead>
        <tbody>
          <tr><td>Trend / Moving Averages</td><td>SMA, EMA, WMA, DEMA, TEMA, Hull MA, VWAP</td><td>Trend filters, support/resistance levels.</td></tr>
          <tr><td>Momentum Oscillators</td><td>RSI, MACD, Stochastic (%K/%D), CCI, Williams %R, ROC</td><td>Overbought (&gt;70) and oversold (&lt;30) bounds.</td></tr>
          <tr><td>Volatility Envelopes</td><td>Bollinger Bands (20, 2&sigma;), ATR, Keltner Channels, Donchian</td><td>Dispersion metrics, breakout bands.</td></tr>
          <tr><td>Volume Dynamics</td><td>OBV, Chaikin Money Flow (CMF), Volume Profile, Accumulation/Distribution</td><td>Institutional capital flow confirmation.</td></tr>
        </tbody>
      </table>
    `
  },
  {
    id: "quant-research",
    title: "6. Quantitative Research & DCF Valuation",
    code: "DCF",
    summary: "Discounted Cash Flow intrinsic valuation, WACC sensitivity grids, and equity bridge.",
    content: `
      <h1>6. Quantitative Research &amp; DCF Valuation Model</h1>
      <p class="manual-lead">An institutional-grade discounted cash flow valuation engine with automated financial statement ingestion, user-tunable cost of capital parameters, and terminal value sensitivity analysis.</p>

      <div class="manual-screenshot-container">
        <img src="/manual/assets/dcf-valuation-model.png" class="manual-screenshot-img" alt="DCF Valuation Screen" />
        <div class="manual-screenshot-caption"><span><b>Figure 6.1</b> — AAPL US EQUITY DCF Valuation Model</span><span>Intrinsic Value per Share vs Market Price</span></div>
      </div>

      <h2>Mathematical Formulation</h2>
      <p>Tavoryn calculates Enterprise Value ($EV$) by projecting Free Cash Flows to Firm ($FCFF$) over an explicit projection horizon ($N=5$ years) and discounting them at the Weighted Average Cost of Capital ($WACC$):</p>

      <div class="math-block">
        EV = &sum;_{t=1}^{N} \\frac{FCFF_t}{(1 + WACC)^t} + \\frac{Terminal\\ Value}{(1 + WACC)^N}
      </div>

      <p>Terminal Value is computed using the Gordon Growth Perpetuity Model:</p>
      <div class="math-block">
        Terminal\\ Value = \\frac{FCFF_N &times; (1 + g)}{WACC - g} \\quad \\text{where } WACC &gt; g
      </div>

      <div class="manual-card warn">
        <div class="manual-card-title">QUANTITATIVE INTEGRITY RULE: WACC &gt; g ENFORCEMENT</div>
        Per institutional finance principles verified in the Phase 9 Quantitative Audit, if user input $WACC \\le g$, the engine halts terminal calculation and issues a clear mathematical warning: <i>"WACC must strictly exceed terminal growth rate g to avoid non-converging or negative perpetuity valuations."</i>
      </div>

      <h2>The Enterprise-to-Equity Value Bridge</h2>
      <p>To determine Intrinsic Value per Diluted Share, Tavoryn bridges Enterprise Value to Equity Value using verified balance sheet inputs:</p>
      <div class="math-block">
        Equity\\ Value = Enterprise\\ Value + Cash\\ &amp;\\ Equivalents - Total\\ Debt
      </div>
      <div class="math-block">
        Intrinsic\\ Value\\ Per\\ Share = \\frac{Equity\\ Value}{Diluted\\ Shares\\ Outstanding}
      </div>

      <h2>Sensitivity Matrix (WACC vs Terminal Growth)</h2>
      <p>The DCF screen generates a dynamic 5x5 sensitivity matrix varying WACC across &plusmn;1.0% steps and terminal growth rate across &plusmn;0.5% steps, illustrating the full range of intrinsic value scenarios.</p>
    `
  },
  {
    id: "backtest-engine",
    title: "7. Strategies & Backtesting",
    code: "BTST",
    summary: "Quantitative strategy backtester, condition parser, equity curves, and performance metrics.",
    content: `
      <h1>7. Strategies &amp; Backtesting Engine (BTST)</h1>
      <p class="manual-lead">An offline-first strategy replay and quantitative validation engine that evaluates rule-based trading signals against historical market bars.</p>

      <div class="manual-screenshot-container">
        <img src="/manual/assets/backtest-replay-engine.png" class="manual-screenshot-img" alt="Backtest Replay Engine" />
        <div class="manual-screenshot-caption"><span><b>Figure 7.1</b> — SPX INDEX BTST Strategy Execution</span><span>Equity Curve, Drawdown, and Trade Register</span></div>
      </div>

      <h2>Strategy Configuration Syntax</h2>
      <p>Enter <code>&lt;TICKER&gt; BTST</code> to open the backtesting console. Strategies are defined using declarative quantitative conditions:</p>
      <ul>
        <li><b>Moving Average Crossover:</b> <code>SMA(20) &gt; SMA(50)</code></li>
        <li><b>RSI Mean Reversion:</b> <code>RSI(14) &lt; 30</code> (Entry), <code>RSI(14) &gt; 70</code> (Exit)</li>
        <li><b>Bollinger Band Breakout:</b> <code>CLOSE &gt; BB_UPPER(20, 2)</code></li>
      </ul>

      <h2>Quantitative Performance Metrics Explained</h2>
      <table class="manual-table">
        <thead>
          <tr><th>Metric</th><th>Formula</th><th>Institutional Interpretation</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Sharpe Ratio</td>
            <td><code>(R_p - R_f) / &sigma;_p</code></td>
            <td>Annualized risk-adjusted excess return over risk-free rate. Values &gt; 1.0 indicate attractive performance.</td>
          </tr>
          <tr>
            <td>Maximum Drawdown (MDD)</td>
            <td><code>(Peak - Trough) / Peak</code></td>
            <td>Peak-to-trough decline during the test horizon. Measures downside capital risk.</td>
          </tr>
          <tr>
            <td>Profit Factor</td>
            <td><code>Gross Profits / Gross Losses</code></td>
            <td>Ratio of cumulative winning trade profits to losing trade losses. Target &gt; 1.5.</td>
          </tr>
          <tr>
            <td>Win Rate</td>
            <td><code>Winning Trades / Total Trades</code></td>
            <td>Percentage of closed round-turn trades with positive net P&amp;L.</td>
          </tr>
        </tbody>
      </table>

      <div class="manual-card warn">
        <div class="manual-card-title">DISCLAIMER ON BACKTEST HYPOTHETICAL RESULTS</div>
        Historical backtest simulations do not represent actual trading and do not guarantee future profitability. Simulations do not account for hidden liquidity vacuums or extreme regime shifts.
      </div>
    `
  },
  {
    id: "portfolio-performance",
    title: "8. Portfolio & Performance",
    code: "PORT",
    summary: "Multi-asset portfolio tracking, mark-to-market accounting, and allocation breakdowns.",
    content: `
      <h1>8. Portfolio &amp; Performance Tracking (PORT)</h1>
      <p class="manual-lead">Real-time mark-to-market valuation, asset allocation monitoring, and P&amp;L accounting for equity, fixed income, currency, and digital asset positions.</p>

      <div class="manual-screenshot-container">
        <img src="/manual/assets/portfolio-holdings-port.png" class="manual-screenshot-img" alt="Portfolio Holdings PORT" />
        <div class="manual-screenshot-caption"><span><b>Figure 8.1</b> — PORT Position Ledger and Mark-to-Market Valuation</span><span>Live P&amp;L Breakdown by Instrument</span></div>
      </div>

      <h2>Portfolio Metrics</h2>
      <ul>
        <li><b>Total Portfolio Value:</b> Cash balance plus aggregate mark-to-market value of all open long positions minus liabilities.</li>
        <li><b>Unrealized P&amp;L:</b> <code>(Current Price - Average Cost Basis) &times; Quantity</code></li>
        <li><b>Realized P&amp;L:</b> Net profit or loss locked in upon trade settlement or position closure.</li>
        <li><b>Asset Allocation:</b> Percentage weights by sector, asset class, and individual issuer.</li>
      </ul>
    `
  },
  {
    id: "risk-stress",
    title: "9. Risk Management & Stress Testing",
    code: "STRESS",
    summary: "Historical crisis scenario shocks, beta-adjusted portfolio vulnerability, and risk gates.",
    content: `
      <h1>9. Risk Management &amp; Stress Testing (STRESS)</h1>
      <p class="manual-lead">Institutional multi-factor stress testing model that applies historical crisis scenarios and macro factor shocks to evaluate tail-risk portfolio vulnerability.</p>

      <div class="manual-screenshot-container">
        <img src="/manual/assets/portfolio-stress-testing.png" class="manual-screenshot-img" alt="Portfolio Stress Testing" />
        <div class="manual-screenshot-caption"><span><b>Figure 9.1</b> — PORT STRESS Crisis Scenarios</span><span>Historical Shock Scenarios and P&amp;L Impact</span></div>
      </div>

      <h2>Pre-Configured Historical Crisis Scenarios</h2>
      <table class="manual-table">
        <thead>
          <tr><th>Scenario Name</th><th>Benchmark Shock</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><b>2008 Global Financial Crisis</b></td><td>-52.6% SPX</td><td>Systemic credit collapse, real estate bust, and liquidity freeze.</td></tr>
          <tr><td><b>2020 COVID-19 Flash Crash</b></td><td>-33.9% SPX</td><td>Sudden global pandemic lockdown and volatility spike (VIX &gt; 80).</td></tr>
          <tr><td><b>2022 Fed Rates Shock</b></td><td>-24.9% SPX</td><td>Rapid central bank monetary tightening and inflation surge.</td></tr>
          <tr><td><b>2000 Dot-Com Tech Wreck</b></td><td>-82.0% NDX</td><td>Speculative valuation collapse across technology and internet equities.</td></tr>
        </tbody>
      </table>

      <h2>Mathematical Stress Calculation</h2>
      <p>For each position $i$ with market value $V_i$ and equity market beta $\\beta_i$, the projected loss under an equity index shock $\\Delta S$ is modeled as:</p>
      <div class="math-block">
        Projected\\ Loss_i = V_i &times; \\beta_i &times; \\Delta S
      </div>
      <div class="math-block">
        Total\\ Portfolio\\ Drawdown = \\sum_{i=1}^{M} Projected\\ Loss_i
      </div>
    `
  },
  {
    id: "paper-trading",
    title: "10. Accounts & Paper Trading",
    code: "TRAD",
    summary: "Simulated paper trading ticket, order validation, and persistent account ledger.",
    content: `
      <h1>10. Accounts &amp; Paper Trading (TRAD)</h1>
      <p class="manual-lead">Risk-free simulated order execution environment designed to practice trade sizing and order execution without risking real capital.</p>

      <div class="manual-screenshot-container">
        <img src="/manual/assets/paper-trading-trad.png" class="manual-screenshot-img" alt="Paper Trading TRAD" />
        <div class="manual-screenshot-caption"><span><b>Figure 10.1</b> — TRAD Order Execution Ticket</span><span>Pre-Trade Risk Checks &amp; Account Ledger</span></div>
      </div>

      <h2>Safety Invariants &amp; Capital Protection</h2>
      <div class="manual-card danger">
        <div class="manual-card-title">MANDATORY CAPITAL SAFETY CONTROLS</div>
        Tavoryn Terminal operates under a frozen non-live execution policy. All order entries executed in TRAD are recorded strictly in the local paper simulation ledger (<code>data/paper-account.json</code>). No live broker connections or real funds are ever engaged.
      </div>

      <h2>Pre-Trade Risk Fencing</h2>
      <p>Before any paper order is executed, Tavoryn enforces 16 institutional risk checks:</p>
      <ol class="step-list">
        <li><b>Cash Sufficiency Check:</b> Verifies available purchasing power covers <code>Price &times; Shares + Estimated Fees</code>.</li>
        <li><b>Maximum Order Size Limit:</b> Prevents inadvertent fat-finger orders exceeding risk thresholds.</li>
        <li><b>Maximum Position Concentration:</b> Caps single-stock exposure to prevent portfolio concentration risk.</li>
        <li><b>Market Data Freshness:</b> Checks feed latency to prevent executing against stale quotes.</li>
      </ol>
    `
  },
  {
    id: "execution-orders",
    title: "11. Execution & Order Management",
    code: "OM",
    summary: "Order ticket controls, fill simulation, fee modeling, and transaction logs.",
    content: `
      <h1>11. Execution &amp; Order Management</h1>
      <p class="manual-lead">Details the order lifecycle, order types, simulated execution mechanics, and audit trail generation.</p>

      <h2>Supported Order Types</h2>
      <table class="manual-table">
        <thead>
          <tr><th>Order Type</th><th>Execution Behavior</th><th>Validation Rules</th></tr>
        </thead>
        <tbody>
          <tr><td><b>MARKET</b></td><td>Fills immediately at prevailing NBBO ask (for buy) or bid (for sell).</td><td>Requires active market feed quote.</td></tr>
          <tr><td><b>LIMIT</b></td><td>Fills only if market price reaches or improves upon specified limit price.</td><td>Must provide positive limit price.</td></tr>
          <tr><td><b>STOP LOSS</b></td><td>Converts to market order once trigger stop price is breached.</td><td>Stop price must be below current market price for long positions.</td></tr>
        </tbody>
      </table>

      <h2>Transaction Journal &amp; Audit Trail</h2>
      <p>Every transaction records timestamp, symbol, side (BUY/SELL), quantity, executed price, notional value, and resultant cash balance in the persistent audit ledger.</p>
    `
  },
  {
    id: "ai-intelligence",
    title: "12. AI & Research Intelligence",
    code: "ASK",
    summary: "Natural language financial intelligence, SEC report summarization, and query engine.",
    content: `
      <h1>12. AI &amp; Research Intelligence (ASK / ASKB)</h1>
      <p class="manual-lead">Natural language synthesis interface enabling analysts to query macroeconomic events, filings, and earnings transcripts.</p>

      <div class="manual-screenshot-container">
        <img src="/manual/assets/ai-research-assistant-ask.png" class="manual-screenshot-img" alt="AI Research Assistant" />
        <div class="manual-screenshot-caption"><span><b>Figure 12.1</b> — ASKB Financial Intelligence Console</span><span>Natural Language Research Ingestion</span></div>
      </div>

      <h2>Example Query Workflows</h2>
      <ul>
        <li><span class="cmd-pill" data-run="ASKB What are Apple's main revenue drivers in 2026?">ASKB What are Apple's main revenue drivers?</span></li>
        <li><span class="cmd-pill" data-run="ASKB Summarize the latest FOMC interest rate decision">ASKB Summarize the latest FOMC interest rate decision</span></li>
        <li><span class="cmd-pill" data-run="ASKB Compare NVIDIA and AMD data center margins">ASKB Compare NVIDIA and AMD data center margins</span></li>
      </ul>
    `
  },
  {
    id: "data-sources",
    title: "13. Data Sources & Integrations",
    code: "DATA",
    summary: "Public market data feeds, SEC EDGAR integration, zero-API-key policy, and latency guarantees.",
    content: `
      <h1>13. Data Sources &amp; Public Integrations (DATA)</h1>
      <p class="manual-lead">Tavoryn Terminal is built on a zero-runtime-dependency, zero-mandatory-API-key philosophy. All market data is retrieved through resilient public endpoints.</p>

      <h2>Feed Inventory</h2>
      <table class="manual-table">
        <thead>
          <tr><th>Provider</th><th>Data Domain</th><th>Latency / Freshness</th></tr>
        </thead>
        <tbody>
          <tr><td><b>Public Exchange Gateways</b></td><td>Equities, Indices, Commodities, FX</td><td>Real-time to 15-minute delayed quotes.</td></tr>
          <tr><td><b>Crypto WebSocket Streams</b></td><td>Digital Assets (BTC, ETH, etc.)</td><td>Sub-second real-time streaming.</td></tr>
          <tr><td><b>SEC EDGAR API</b></td><td>10-K, 10-Q, 8-K, 13F Filings</td><td>Official corporate filings repository.</td></tr>
          <tr><td><b>US Treasury / St. Louis Fed</b></td><td>Yield Curves (GC), Macro Indicators (ECO)</td><td>Daily benchmark release schedules.</td></tr>
        </tbody>
      </table>

      <div class="manual-card info">
        <div class="manual-card-title">DATA SCREEN COMMAND</div>
        Run <span class="cmd-pill" data-run="DATA">DATA GO</span> in any terminal panel to inspect live connection health, active data providers, and feed staleness metrics.
      </div>
    `
  },
  {
    id: "settings-customization",
    title: "14. Settings & Customization",
    code: "CONFIG",
    summary: "Price alerts (ALRT), desktop notifications, user layouts, and custom scripts.",
    content: `
      <h1>14. Settings &amp; Customization</h1>
      <p class="manual-lead">Configure custom price threshold alerts, desktop notifications, workspace persistence, and extensible quantitative plugins.</p>

      <h2>Price Alerts (ALRT)</h2>
      <p>Configure automated price threshold alerts that trigger auditory, visual toast, and operating system desktop notifications:</p>
      <ul>
        <li><span class="cmd-pill" data-run="ALRT AAPL &gt; 250">ALRT AAPL &gt; 250</span> — Alerts when Apple crosses above $250.00.</li>
        <li><span class="cmd-pill" data-run="ALRT BTC &lt; 60000">ALRT BTC &lt; 60000</span> — Alerts when Bitcoin drops below $60,000.</li>
      </ul>

      <h2>Extending Tavoryn with Custom Functions</h2>
      <p>Tavoryn supports user-written extensions placed in the <code>custom/</code> directory. Custom function files automatically load and register without requiring terminal re-compilation.</p>
    `
  },
  {
    id: "troubleshooting",
    title: "15. Troubleshooting & Diagnostics",
    code: "DIAG",
    summary: "Resolution steps for common input errors, rate limits, network interruptions, and recovery.",
    content: `
      <h1>15. Troubleshooting &amp; Diagnostics</h1>
      <p class="manual-lead">Diagnostic guidelines and remediation procedures for common operational and data situations.</p>

      <h2>Common Issues &amp; Solutions</h2>
      <table class="manual-table">
        <thead>
          <tr><th>Symptom</th><th>Root Cause</th><th>Remediation Step</th></tr>
        </thead>
        <tbody>
          <tr>
            <td><code>"No function called XYZ"</code></td>
            <td>Unknown function identifier entered.</td>
            <td>Type <span class="cmd-pill" data-run="HELP">HELP</span> or open this manual to view all 53 registered function codes.</td>
          </tr>
          <tr>
            <td><code>"Need a security"</code></td>
            <td>Function requires a ticker symbol (e.g. <code>DES</code>, <code>DCF</code>, <code>GP</code>).</td>
            <td>Prefix the function with an asset ticker, for example: <span class="cmd-pill" data-run="AAPL US EQUITY DES">AAPL US EQUITY DES</span>.</td>
          </tr>
          <tr>
            <td><code>"WACC must exceed g"</code></td>
            <td>Cost of capital is less than or equal to terminal growth rate.</td>
            <td>Adjust WACC higher or terminal growth rate lower in the DCF parameter fields.</td>
          </tr>
          <tr>
            <td>Quotes appear static or delayed</td>
            <td>Off-market hours or public feed rate limit.</td>
            <td>Check <code>DATA</code> screen for provider health status. Data will refresh when markets reopen.</td>
          </tr>
          <tr>
            <td>Port 3787 already in use</td>
            <td>Another Tavoryn instance is already running.</td>
            <td>Terminate previous Node process or launch on alternate port: <code>PORT=3788 node server.js</code>.</td>
          </tr>
        </tbody>
      </table>
    `
  },
  {
    id: "glossary",
    title: "16. Quantitative & Financial Glossary",
    code: "GLOSS",
    summary: "Definitions of core financial metrics, formulas, and terminology used in the terminal.",
    content: `
      <h1>16. Quantitative &amp; Financial Glossary</h1>
      <p class="manual-lead">A comprehensive reference of financial terminology, quantitative definitions, and formulas used across Tavoryn Terminal.</p>

      <table class="manual-table">
        <thead>
          <tr><th>Term</th><th>Definition &amp; Formula</th></tr>
        </thead>
        <tbody>
          <tr><td><b>OHLCV</b></td><td>Open, High, Low, Close, and Volume: the fundamental bar metrics representing asset price discovery across a discrete time period.</td></tr>
          <tr><td><b>Bid / Ask Spread</b></td><td>The price difference between the highest price a buyer is willing to pay (Bid) and the lowest price a seller is willing to accept (Ask).</td></tr>
          <tr><td><b>Sharpe Ratio</b></td><td><code>(R_portfolio - R_riskfree) / &sigma;_portfolio</code> — Measures risk-adjusted excess return per unit of total portfolio volatility.</td></tr>
          <tr><td><b>Maximum Drawdown (MDD)</b></td><td>The maximum peak-to-trough percentage decline observed in an asset or portfolio equity curve before a new high is attained.</td></tr>
          <tr><td><b>WACC</b></td><td><code>(E/V &times; Re) + (D/V &times; Rd &times; (1 - T))</code> — Weighted Average Cost of Capital: the average after-tax rate of return a company must pay to finance its assets.</td></tr>
          <tr><td><b>Terminal Value (TV)</b></td><td><code>(FCF_{N} &times; (1 + g)) / (WACC - g)</code> — The present value of all future cash flows beyond an explicit multi-year projection horizon.</td></tr>
          <tr><td><b>Free Cash Flow to Firm (FCFF)</b></td><td><code>EBIT &times; (1 - Tax Rate) + D&amp;A - CapEx - &Delta;NWC</code> — Cash generated by operations available to all capital providers.</td></tr>
          <tr><td><b>Implied Volatility (IV)</b></td><td>The market-implied standard deviation of future price returns derived from options pricing models such as Black-Scholes.</td></tr>
          <tr><td><b>Beta (&beta;)</b></td><td><code>Cov(R_asset, R_market) / Var(R_market)</code> — The sensitivity of an asset's returns relative to systematic benchmark market movements.</td></tr>
          <tr><td><b>Profit Factor</b></td><td>Gross Profits divided by Gross Losses across all closed trading operations.</td></tr>
          <tr><td><b>Slippage</b></td><td>The discrepancy between an order's expected price and the actual execution price due to market volatility or liquidity constraints.</td></tr>
        </tbody>
      </table>
    `
  }
];

// --------------------------------------------------------------------------
// In-App User Manual Component Controller
// --------------------------------------------------------------------------

export class UserManual {
  constructor(containerEl, onRunCommand, onBackToTerminal) {
    this.el = containerEl;
    this.onRun = onRunCommand || (() => {});
    this.onBack = onBackToTerminal || (() => {});
    this.activeSection = MANUAL_SECTIONS[0].id;
    this.searchQuery = "";
    this.renderShell();
  }

  renderShell() {
    this.el.innerHTML = `
      <div class="manual-header-bar">
        <div class="manual-title-block">
          <span class="manual-title">TAVORYN USER MANUAL</span>
          <span class="manual-badge">Research Edition v1.0</span>
          <span class="manual-updated">Updated: Oct 2026</span>
        </div>
        <div class="manual-search-box">
          <input
            type="text"
            class="manual-search-input"
            id="manualSearch"
            placeholder="Search manual (e.g. DCF, WACC, BTST, Sharpe, WEI, Stress, Keys)..."
            autocomplete="off"
            spellcheck="false"
          />
          <button class="manual-search-clear" id="manualClearSearch" title="Clear search" hidden>&times;</button>
        </div>
        <div class="manual-actions">
          <button class="manual-btn primary" id="manualBackBtn" title="Return to 4-panel terminal (Esc)">
            &larr; Back to Terminal (Esc)
          </button>
        </div>
      </div>
      <div class="manual-body">
        <nav class="manual-sidebar">
          <div class="manual-nav-header">Table of Contents</div>
          <ul class="manual-nav-list" id="manualNavList"></ul>
        </nav>
        <main class="manual-main" id="manualMain"></main>
      </div>
    `;

    this.searchInput = this.el.querySelector("#manualSearch");
    this.clearBtn = this.el.querySelector("#manualClearSearch");
    this.navList = this.el.querySelector("#manualNavList");
    this.mainArea = this.el.querySelector("#manualMain");
    this.backBtn = this.el.querySelector("#manualBackBtn");

    this.backBtn.onclick = () => this.onBack();
    this.searchInput.oninput = (e) => this.handleSearch(e.target.value);
    this.clearBtn.onclick = () => {
      this.searchInput.value = "";
      this.handleSearch("");
      this.searchInput.focus();
    };

    this.renderNav();
    this.renderSection(this.activeSection);
  }

  renderNav() {
    this.navList.innerHTML = "";
    MANUAL_SECTIONS.forEach((sec) => {
      const li = document.createElement("li");
      li.className = `manual-nav-item${sec.id === this.activeSection ? " active" : ""}`;
      li.dataset.id = sec.id;
      li.innerHTML = `
        <span class="manual-nav-label">${sec.title}</span>
        <span class="manual-nav-code">${sec.code}</span>
      `;
      li.onclick = () => {
        this.selectSection(sec.id);
      };
      this.navList.appendChild(li);
    });
  }

  selectSection(id) {
    this.activeSection = id;
    this.renderNav();
    this.renderSection(id);
    this.mainArea.scrollTop = 0;
  }

  handleSearch(query) {
    this.searchQuery = query.trim().toLowerCase();
    this.clearBtn.hidden = !this.searchQuery;

    if (!this.searchQuery) {
      this.renderSection(this.activeSection);
      return;
    }

    const matches = [];
    MANUAL_SECTIONS.forEach((sec) => {
      const inTitle = sec.title.toLowerCase().includes(this.searchQuery);
      const inCode = sec.code.toLowerCase().includes(this.searchQuery);
      const inSummary = sec.summary.toLowerCase().includes(this.searchQuery);
      const inContent = sec.content.toLowerCase().includes(this.searchQuery);

      if (inTitle || inCode || inSummary || inContent) {
        let snippet = sec.summary;
        if (!inSummary && inContent) {
          const idx = sec.content.toLowerCase().indexOf(this.searchQuery);
          const start = Math.max(0, idx - 40);
          const end = Math.min(sec.content.length, idx + 100);
          snippet = "..." + sec.content.substring(start, end).replace(/<[^>]+>/g, " ") + "...";
        }
        matches.push({ sec, snippet, relevance: inTitle ? 3 : inCode ? 2 : 1 });
      }
    });

    matches.sort((a, b) => b.relevance - a.relevance);

    this.mainArea.innerHTML = `
      <div class="manual-article">
        <div class="search-results-overlay">
          <div class="search-results-header">Search Results for "${this.searchQuery}" (${matches.length} matches)</div>
          ${
            matches.length === 0
              ? `<p class="dim">No matching manual sections or metrics found. Try searching for "DCF", "WACC", "Sharpe", "WEI", "BTST", or "Stress".</p>`
              : matches
                  .map(
                    (m) => `
              <div class="search-result-item" data-goto="${m.sec.id}">
                <div class="search-result-title">${m.sec.title} [${m.sec.code}]</div>
                <div class="search-result-snippet">${m.snippet}</div>
              </div>
            `
                  )
                  .join("")
          }
        </div>
      </div>
    `;

    this.mainArea.querySelectorAll(".search-result-item").forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.goto;
        this.selectSection(id);
      };
    });
  }

  renderSection(id) {
    const secIdx = MANUAL_SECTIONS.findIndex((s) => s.id === id);
    if (secIdx === -1) return;
    const sec = MANUAL_SECTIONS[secIdx];
    const prev = secIdx > 0 ? MANUAL_SECTIONS[secIdx - 1] : null;
    const next = secIdx < MANUAL_SECTIONS.length - 1 ? MANUAL_SECTIONS[secIdx + 1] : null;

    this.mainArea.innerHTML = `
      <article class="manual-article">
        ${sec.content}
        <div class="manual-footer-nav">
          ${
            prev
              ? `<button class="manual-nav-btn" data-nav="${prev.id}"><span class="sub">&larr; Previous</span><span class="lbl">${prev.title}</span></button>`
              : `<div></div>`
          }
          ${
            next
              ? `<button class="manual-nav-btn" data-nav="${next.id}" style="text-align: right;"><span class="sub">Next &rarr;</span><span class="lbl">${next.title}</span></button>`
              : `<div></div>`
          }
        </div>
      </article>
    `;

    // Hook up command pills
    this.mainArea.querySelectorAll(".cmd-pill").forEach((pill) => {
      pill.onclick = () => {
        const cmd = pill.dataset.run || pill.textContent.trim();
        this.onRun(cmd);
      };
    });

    // Hook up footer nav buttons
    this.mainArea.querySelectorAll(".manual-nav-btn").forEach((btn) => {
      btn.onclick = () => {
        const targetId = btn.dataset.nav;
        if (targetId) this.selectSection(targetId);
      };
    });
  }
}
