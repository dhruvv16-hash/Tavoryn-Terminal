// Tavoryn Terminal — Dedicated Institutional Gateway & Authentication Interface
// Production-grade landing, feature showcase, and dual Login / Sign Up station.

import {
  signInWithGoogle,
  signInWithGitHub,
  sendPhoneOtp,
  verifyPhoneOtp,
  signOutUser,
  onAuthChanged,
  getCurrentUser,
} from "./auth.js";
import { startTour } from "./tour.js";

export function detectUserOS() {
  if (typeof window === "undefined" || !window.navigator) return "windows";
  const ua = (navigator.userAgent || "").toLowerCase();
  const platform = (navigator.userAgentData?.platform || navigator.platform || "").toLowerCase();
  if (platform.includes("mac") || ua.includes("macintosh") || ua.includes("mac os")) return "macos";
  if (platform.includes("linux") || ua.includes("linux") || ua.includes("x11")) return "linux";
  return "windows";
}

const CORE_SUITE = [
  {
    id: "showcase-research",
    title: "Research",
    suiteBg: "/screenshots/suite/suite-research.webp",
    suiteBgFallback: "/screenshots/suite/suite-research.png",
    cardCrop: "/screenshots/card-crop-research.webp",
    cardCropFallback: "/screenshots/card-crop-research.png",
    thumb: "/screenshots/bb-company.webp",
    fallback: "/manual/assets/financial-analysis-fa.png",
    videoMp4: "/video/feat-research.mp4",
    videoWebm: "/video/feat-research.webm",
    videoPoster: "/video/feat-research-poster.webp",
    actionPrompt: "<Search All Research and Data>",
    actionTag: "TAVORYN INTELLIGENCE",
    caption: "Fundamentals, DCF Valuation & Filings",
    badge: "RESEARCH // FA · DCF · EST · CF · INSD",
    headline: "Research at your fingertips.",
    lead: "Tavoryn Intelligence provides interactive financial statements, consensus estimates, and exclusive quantitative outlooks across 170+ global markets from our deterministic institutional engine.",
    bullets: [
      "<strong>Full Financial Statements:</strong> GAAP and non-GAAP historical financials with revenue segmentation.",
      "<strong>Intrinsic DCF Engine:</strong> Live sensitivity matrices for terminal growth rates versus weighted cost of capital.",
      "<strong>SEC EDGAR Integration:</strong> Direct text extraction across 10-K, 10-Q, and 8-K regulatory filings.",
      "<strong>Consensus Tracking:</strong> Wall Street consensus EPS and revenue revisions with earnings surprise history.",
    ],
  },
  {
    id: "showcase-news",
    title: "News",
    suiteBg: "/screenshots/suite/suite-news.webp",
    suiteBgFallback: "/screenshots/suite/suite-news.png",
    cardCrop: "/screenshots/card-crop-news.webp",
    cardCropFallback: "/screenshots/card-crop-news.png",
    thumb: "/screenshots/bb-news.webp",
    fallback: "/manual/assets/economic-calendar-eco.png",
    videoMp4: "/video/feat-news.mp4",
    videoWebm: "/video/feat-news.webm",
    videoPoster: "/video/feat-news-poster.webp",
    actionPrompt: "<Stream Breaking Financial Wires & Macro Events>",
    actionTag: "TAVORYN WIRES",
    caption: "Real-Time Wires & Macro Calendar",
    badge: "NEWS & MACRO // NEWS · ECO · CBRT · TOP",
    headline: "Real-Time Financial Wires & Macro Intelligence",
    lead: "Track breaking market-moving headlines and high-impact macroeconomic releases. Filter wire feeds by ticker, sector, or central bank speech with zero latency.",
    bullets: [
      "<strong>Global Financial Wires:</strong> Streaming headlines categorized by asset class and market impact.",
      "<strong>Economic Calendar:</strong> Real-time macro release indicators comparing consensus forecasts to actual prints.",
      "<strong>Central Bank Policy Tracker:</strong> Benchmark interest rates across the Federal Reserve, ECB, BoE, and BoJ.",
      "<strong>Macroeconomic Series:</strong> Historical GDP, inflation, payrolls, and PMI tracking across global economies.",
    ],
  },
  {
    id: "showcase-access",
    title: "Access",
    suiteBg: "/screenshots/suite/suite-access.webp",
    suiteBgFallback: "/screenshots/suite/suite-access.png",
    cardCrop: "/screenshots/card-crop-access.webp",
    cardCropFallback: "/screenshots/card-crop-access.png",
    thumb: "/screenshots/bb-markets.webp",
    fallback: "/manual/assets/world-markets-wei.png",
    videoMp4: "/video/feat-access.mp4",
    videoWebm: "/video/feat-access.webm",
    videoPoster: "/video/feat-access-poster.webp",
    actionPrompt: "<Cross-Asset Global Surveillance & Yield Curves>",
    actionTag: "TAVORYN ACCESS",
    caption: "Cross-Asset Global Surveillance",
    badge: "ACCESS // WEI · GC · BTMM · WIRP · CRED",
    headline: "Cross-Asset Surveillance & Sovereign Yield Curves",
    lead: "Monitor global markets across equities, sovereign bonds, money markets, and foreign exchange. Observe US Treasury curve inversions and central bank policy rate probabilities with mathematical precision.",
    bullets: [
      "<strong>World Equities Board (WEI):</strong> Global benchmark indices across Americas, EMEA, and APAC.",
      "<strong>Sovereign Yield Curves (GC):</strong> US Treasury par yields from 1-month to 30-year with 2s10s spread detection.",
      "<strong>Money Markets (BTMM):</strong> Treasury bills, commercial paper, SOFR funding, and repo rate benchmarks.",
      "<strong>Rate Probabilities (WIRP):</strong> Market-implied FOMC hike and cut probabilities priced by fed funds futures.",
    ],
  },
  {
    id: "showcase-charts",
    title: "Charts",
    suiteBg: "/screenshots/suite/suite-charts.webp",
    suiteBgFallback: "/screenshots/suite/suite-charts.png",
    cardCrop: "/screenshots/card-crop-charts.webp",
    cardCropFallback: "/screenshots/card-crop-charts.png",
    thumb: "/screenshots/bb-panels.webp",
    fallback: "/manual/assets/chart-technical-analysis-gp.png",
    videoMp4: "/video/feat-charts.mp4",
    videoWebm: "/video/feat-charts.webm",
    videoPoster: "/video/feat-charts-poster.webp",
    actionPrompt: "<Sub-Millisecond Multi-Pane Technical Analytics>",
    actionTag: "TAVORYN CHARTS",
    caption: "Multi-Pane Technical Diagnostics",
    badge: "CHARTS // GP · GPO · PANELS · VOL · RSI",
    headline: "Sub-Millisecond Multi-Pane Technical Analytics",
    lead: "Engineered on HTML5 canvas hardware-accelerated graphics, Tavoryn charts execute millions of price points without stutter. Build multi-pane comparative studies and layer moving average ribbons with immediate response.",
    bullets: [
      "<strong>Institutional Indicator Stack:</strong> RSI, MACD, Bollinger Bands, ATR, Moving Average Ribbons, and VWAP.",
      "<strong>Multi-Quadrant Split Screens:</strong> 1, 2, or 4 synchronized panels for multi-timeframe correlation.",
      "<strong>Tick-Level Precision:</strong> Intraday candles, volume profiles, and spread visualization.",
      "<strong>Custom Math Formulas:</strong> Define custom ratio pairs and technical expressions directly in the command bar.",
    ],
  },
  {
    id: "showcase-collaboration",
    title: "Collaboration Tools",
    suiteBg: "/screenshots/suite/suite-collaboration.webp",
    suiteBgFallback: "/screenshots/suite/suite-collaboration.png",
    cardCrop: "/screenshots/card-crop-collaboration.webp",
    cardCropFallback: "/screenshots/card-crop-collaboration.png",
    thumb: "/screenshots/bb-workspace.webp",
    fallback: "/manual/assets/dashboard-workspace-overview.png",
    videoMp4: "/video/feat-collaboration.mp4",
    videoWebm: "/video/feat-collaboration.webm",
    videoPoster: "/video/feat-collaboration-poster.webp",
    actionPrompt: "<Modular Workspaces & Multi-Monitor Grids>",
    actionTag: "TAVORYN WORKSPACE",
    caption: "Modular Workspaces & Custom Grids",
    badge: "WORKSPACE // MULTI-MONITOR · KEYS · LAYOUT",
    headline: "Modular Workspaces & Multi-Monitor Workstation",
    lead: "Configure your trading desk geometry with full workspace persistence. Switch between focused single-panel view and quad-panel institutional layouts with dedicated keyboard hotkeys.",
    bullets: [
      "<strong>Custom Grid Geometries:</strong> Save, recall, and export tailored multi-panel workspace templates.",
      "<strong>Command-Line Navigation:</strong> Universal command bar supporting rapid security and function shortcuts.",
      "<strong>Hardware Multi-Monitor Support:</strong> Tear off panels or orchestrate multi-screen monitor layouts.",
      "<strong>Local Station Storage:</strong> Workspace profiles, custom watchlists, and alerts stored securely on your machine.",
    ],
  },
  {
    id: "showcase-education",
    title: "Education",
    suiteBg: "/screenshots/suite/suite-education.webp",
    suiteBgFallback: "/screenshots/suite/suite-education.png",
    cardCrop: "/screenshots/card-crop-education.webp",
    cardCropFallback: "/screenshots/card-crop-education.png",
    thumb: "/screenshots/bb-ask.webp",
    fallback: "/manual/assets/ai-research-assistant-ask.png",
    videoMp4: "/video/feat-education.mp4",
    videoWebm: "/video/feat-education.webm",
    videoPoster: "/video/feat-education-poster.webp",
    actionPrompt: "<Query Quantitative Financial Models & Ratios>",
    actionTag: "TAVORYN AI DESK",
    caption: "AI Financial Intelligence & Formulas",
    badge: "EDUCATION // ASK · HELP · BTST · FORMULAS",
    headline: "AI Financial Intelligence & Quantitative Manual",
    lead: "Query financial data and quantitative models using natural language. The integrated AI assistant analyzes SEC filings, sovereign yields, and valuation models, returning cited answers backed by verifiable math.",
    bullets: [
      "<strong>AI Research Desk Assistant:</strong> Ask natural questions about company filings, capital structure, and macro trends.",
      "<strong>Comprehensive User Manual:</strong> In-depth documentation covering all function keys, indicators, and APIs.",
      "<strong>Event-Driven Strategy Backtester:</strong> Test quantitative trading rules with historical replay and slip modeling.",
      "<strong>Formulas Encyclopedia:</strong> Black-Scholes, Nelson-Siegel, CAPM, and DuPont model definitions.",
    ],
  },
  {
    id: "showcase-portfolio",
    title: "Portfolio Analytics",
    suiteBg: "/screenshots/suite/suite-portfolio.webp",
    suiteBgFallback: "/screenshots/suite/suite-portfolio.png",
    cardCrop: "/screenshots/card-crop-portfolio.webp",
    cardCropFallback: "/screenshots/card-crop-portfolio.png",
    thumb: "/screenshots/bb-omon.webp",
    fallback: "/manual/assets/options-chain-omon.png",
    videoMp4: "/video/feat-portfolio.mp4",
    videoWebm: "/video/feat-portfolio.webm",
    videoPoster: "/video/feat-portfolio-poster.webp",
    actionPrompt: "<Crisis Lab Stress Testing & Options Matrix>",
    actionTag: "TAVORYN RISK LAB",
    caption: "Crisis Stress Testing & Options Chains",
    badge: "RISK & DERIVATIVES // STRESS · OMON · PORT · CRED",
    headline: "Crisis Lab Stress Testing & Options Derivatives",
    lead: "Stress-test portfolios against historical tail-risk events: the 1987 Black Monday crash, 2008 Global Financial Crisis, and 2020 Liquidity Dislocation. Price multi-leg options strategies with real-time Greeks and volatility surfaces.",
    bullets: [
      "<strong>Deterministic Crisis Replay:</strong> Quantify potential drawdown, beta shocks, and factor sensitivities.",
      "<strong>Options Chains (OMON):</strong> Real-time calls/puts across all maturities, strikes, and implied volatility levels.",
      "<strong>Mathematical Greeks:</strong> Sub-second calculations for Delta, Gamma, Theta, Vega, and Rho.",
      "<strong>Credit Spreads (CRED):</strong> High-yield and investment-grade corporate credit spread monitoring.",
    ],
  },
];

export class LoginPage {
  constructor() {
    this.container = document.getElementById("loginPageView") || this.createContainer();
    this.authMode = "login"; // "login" | "signup"
    this.activeTab = "social"; // "social" | "phone" | "email"
    this.phoneStep = "input"; // "input" | "code"
    this.phoneNumber = "";
    this.loading = false;
    this.errorMsg = "";
    this.successMsg = "";
    this.clockInterval = null;
    this.lightboxImg = null;

    this.init();
  }

  createContainer() {
    const el = document.createElement("div");
    el.id = "loginPageView";
    el.className = "login-page";
    document.body.prepend(el);
    return el;
  }

  init() {
    onAuthChanged((user) => {
      if (user) {
        document.documentElement.classList.add("authenticated");
        document.body.classList.add("authenticated");
        this.hide();
      } else {
        document.documentElement.classList.remove("authenticated");
        document.body.classList.remove("authenticated");
        this.show();
      }
    });

    const user = getCurrentUser();
    if (user) {
      document.documentElement.classList.add("authenticated");
      document.body.classList.add("authenticated");
      this.hide();
    } else {
      document.documentElement.classList.remove("authenticated");
      document.body.classList.remove("authenticated");
      this.show();
    }
  }

  show() {
    this.container.hidden = false;
    this.container.style.display = "flex";
    document.documentElement.classList.remove("authenticated");
    document.body.classList.remove("authenticated");

    const top = document.querySelector("header.top");
    const grid = document.getElementById("grid");
    const keys = document.getElementById("keys");
    const tape = document.querySelector("footer.tape");

    if (top) top.style.display = "none";
    if (grid) grid.style.display = "none";
    if (keys) keys.style.display = "none";
    if (tape) tape.style.display = "none";

    this.render();
    this.startClocks();
  }

  hide() {
    this.container.hidden = true;
    this.container.style.display = "none";
    document.documentElement.classList.add("authenticated");
    document.body.classList.add("authenticated");

    const top = document.querySelector("header.top");
    const grid = document.getElementById("grid");
    const keys = document.getElementById("keys");
    const tape = document.querySelector("footer.tape");

    if (top) top.style.display = "";
    if (grid) grid.style.display = "";
    if (keys) keys.style.display = "";
    if (tape) tape.style.display = "";

    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
  }

  setLoading(val) {
    this.loading = val;
    if (getCurrentUser()) {
      this.hide();
      return;
    }
    this.render();
  }

  setError(msg) {
    this.errorMsg = msg;
    this.successMsg = "";
    this.render();
  }

  setSuccess(msg) {
    this.successMsg = msg;
    this.errorMsg = "";
    this.render();
  }

  startClocks() {
    if (this.clockInterval) clearInterval(this.clockInterval);
    const update = () => {
      const now = new Date();
      const getT = (tz) =>
        now.toLocaleTimeString("en-US", {
          timeZone: tz,
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

      const ny = document.getElementById("loginClockNY");
      const lon = document.getElementById("loginClockLON");
      const tky = document.getElementById("loginClockTKY");
      const sgp = document.getElementById("loginClockSGP");

      if (ny) ny.textContent = getT("America/New_York");
      if (lon) lon.textContent = getT("Europe/London");
      if (tky) tky.textContent = getT("Asia/Tokyo");
      if (sgp) sgp.textContent = getT("Asia/Singapore");
    };
    update();
    this.clockInterval = setInterval(update, 1000);
  }

  openLightbox(src, fallback, title, desc) {
    this.lightboxImg = { src, fallback, title, desc };
    const modal = document.getElementById("terminalLightbox");
    if (modal) {
      const imgEl = modal.querySelector(".lightbox-img");
      const titleEl = modal.querySelector(".lightbox-title");
      const descEl = modal.querySelector(".lightbox-desc");
      if (imgEl) {
        imgEl.onerror = () => {
          imgEl.onerror = null;
          if (fallback) imgEl.src = fallback;
        };
        imgEl.src = src;
      }
      if (titleEl) titleEl.textContent = title || "Tavoryn Terminal Station";
      if (descEl) descEl.textContent = desc || "";
      modal.hidden = false;
      modal.classList.add("active");
    }
  }

  closeLightbox() {
    this.lightboxImg = null;
    const modal = document.getElementById("terminalLightbox");
    if (modal) {
      modal.hidden = true;
      modal.classList.remove("active");
      const imgEl = modal.querySelector(".lightbox-img");
      if (imgEl) imgEl.removeAttribute("src");
    }
  }

  render() {
    const isLogin = this.authMode === "login";
    const isLight = document.documentElement.classList.contains("theme-light");
    const userOS = detectUserOS();
    let heroDlText = "Download for Windows (.exe)";
    let heroDlParam = "windows-exe";
    let heroDlSize = "77 MB";
    if (userOS === "macos") {
      heroDlText = "Download for macOS (.dmg)";
      heroDlParam = "macos-arm64";
      heroDlSize = "Universal";
    } else if (userOS === "linux") {
      heroDlText = "Download for Linux (.AppImage)";
      heroDlParam = "linux-appimage";
      heroDlSize = "82 MB";
    }

    this.container.innerHTML = `
      <div class="login-bg-glow"></div>
      <div class="login-bg-glow-left"></div>
      <div class="login-grid-overlay"></div>

      <!-- Institutional Navigation Bar -->
      <header class="login-nav">
        <a href="/" class="login-logo">
          <span class="login-logo-brand">TAVORYN</span>
          <span class="login-logo-sub">TERMINAL</span>
        </a>

        <nav class="login-nav-center">
          <a href="#features-pillars" class="login-nav-link">Capabilities</a>
          <a href="#core-tools-suite" class="login-nav-link">Platform Tools</a>
          <a href="#showcase-deep-dive" class="login-nav-link">Terminal Views</a>
          <a href="#performance-metrics" class="login-nav-link">Performance</a>
        </nav>

        <div class="login-nav-right">
          <a href="#download-station" class="login-nav-download-btn" id="navDirectDownloadBtn" title="Download Tavoryn Terminal Desktop">
            <span class="nav-dl-icon">⬇</span>
            <span>Download</span>
          </a>
          <div class="login-status-indicator">
            <span class="login-status-pulse"></span>
            <span>REAL-TIME ENGINE ACTIVE</span>
          </div>
          <button class="login-theme-btn" id="loginThemeToggleBtn" type="button" title="${isLight ? "Switch to Dark CRT Phosphor Mode" : "Switch to Daylight Titanium Light Mode"}">
            ${isLight ? "☾ DARK" : "☀ LIGHT"}
          </button>
          <button class="login-nav-btn secondary ${isLogin ? "btn-nav-active" : ""}" data-action="set-mode" data-mode="login">
            Log In
          </button>
          <button class="login-nav-btn primary ${!isLogin ? "btn-nav-active" : ""}" data-action="set-mode" data-mode="signup">
            Sign Up
          </button>
        </div>
      </header>

      <!-- Scrollable Main Content -->
      <div class="login-content-wrapper">
        <!-- Hero Section -->
        <section class="hero-section">
          <div class="hero-container">
            <div class="hero-badge">
              <span class="badge-icon">✦</span>
              <span>INSTITUTIONAL FINANCIAL INTELLIGENCE</span>
            </div>

            <h1 class="hero-title">
              The financial world is unified here.
              <span class="hero-highlight">In 170+ global markets, engineered for high-conviction decision-makers.</span>
            </h1>

            <p class="hero-lead">
              A high-performance quantitative workstation engineered for portfolio managers, equity research analysts, and macro strategists. Unifying cross-asset market surveillance, fundamental DCF valuation, sovereign yield curves, and deterministic crisis modeling.
            </p>

            <div class="hero-cta-group">
              <a href="#download-station" class="hero-btn download-btn" id="heroDownloadBtn" title="Download Tavoryn Terminal Desktop">
                <span class="btn-icon">⬇</span>
                <span>Download</span>
              </a>
              <button class="hero-btn ghost-btn" data-action="set-mode" data-mode="signup">
                <span>Sign Up Free</span>
                <span class="btn-arrow">→</span>
              </button>
            </div>
            <div class="hero-dl-sub">
              <span>✦ Zero Node.js install required · Self-contained native binary · Local AppData storage</span>
            </div>

            <!-- Global Financial Centers Live Clocks -->
            <div class="hero-clocks-bar">
              <div class="clock-badge">
                <span class="clock-city">NEW YORK</span>
                <span class="clock-time" id="loginClockNY">--:--:--</span>
              </div>
              <span class="clock-divider">/</span>
              <div class="clock-badge">
                <span class="clock-city">LONDON</span>
                <span class="clock-time" id="loginClockLON">--:--:--</span>
              </div>
              <span class="clock-divider">/</span>
              <div class="clock-badge">
                <span class="clock-city">TOKYO</span>
                <span class="clock-time" id="loginClockTKY">--:--:--</span>
              </div>
              <span class="clock-divider">/</span>
              <div class="clock-badge">
                <span class="clock-city">SINGAPORE</span>
                <span class="clock-time" id="loginClockSGP">--:--:--</span>
              </div>
            </div>

            <!-- Hero Workstation Perspective Visual with Radiant Ambient Glow -->
            <div class="hero-station-display">
              <div class="station-ambient-glow"></div>
              <div class="station-glass-frame">
                <div class="station-top-bar">
                  <div class="station-dots">
                    <span class="dot red"></span>
                    <span class="dot yellow"></span>
                    <span class="dot green"></span>
                  </div>
                  <div class="station-title">TAVORYN TERMINAL // MULTI-PANEL QUADRANT WORKSPACE</div>
                  <div class="station-meta">SUB-15MS LOCAL EXECUTION</div>
                </div>
                <div class="station-img-wrapper" data-action="open-lightbox" data-src="/screenshots/bb-panels.webp" data-fallback="/manual/assets/dashboard-workspace-overview.png" data-title="Tavoryn Terminal Multi-Panel Workstation" data-desc="Institutional multi-pane financial charting, global watchlist, and cross-asset execution display.">
                  <img 
                    src="/screenshots/bb-panels.webp" 
                    onerror="this.onerror=null; this.src='/manual/assets/dashboard-workspace-overview.png';"
                    alt="Tavoryn Terminal Institutional Workstation" 
                    class="station-preview-img" 
                    loading="eager" 
                  />
                  <div class="station-magnify-hint">
                    <span class="mag-icon">🔍</span>
                    <span>Click to Expand Full Resolution</span>
                  </div>
                </div>
              </div>

              <!-- Floating Metric Badges -->
              <div class="floating-stat-card card-top-left">
                <div class="stat-badge-label">STREAMING COVERAGE</div>
                <div class="stat-badge-val">170+ Global Markets Active</div>
              </div>

              <div class="floating-stat-card card-top-right">
                <div class="stat-badge-label">CRISIS STRESS LAB</div>
                <div class="stat-badge-val">Deterministic Scenario Shocks</div>
              </div>

              <div class="floating-stat-card card-bottom-left">
                <div class="stat-badge-label">US TREASURY 2s10s SPREAD</div>
                <div class="stat-badge-val">-42.8 bps <span class="stat-badge-tag invert">INVERTED</span></div>
              </div>

              <div class="floating-stat-card card-bottom-right">
                <div class="stat-badge-label">OPTIONS VOLATILITY SURFACE</div>
                <div class="stat-badge-val">IV 24.6% <span class="stat-badge-tag normal">SKEW +1.8%</span></div>
              </div>
            </div>
          </div>
        </section>

        <!-- 4 Core Value Pillars -->
        <section class="section-pillars" id="features-pillars">
          <div class="section-container">
            <div class="section-header-centered">
              <div class="section-eyebrow">MISSION-CRITICAL INFRASTRUCTURE</div>
              <h2 class="section-heading">Built for High-Frequency Quantitative Workflow</h2>
              <p class="section-sub">Four integrated architectural pillars delivering institutional depth without latency.</p>
            </div>

            <div class="pillars-grid">
              <div class="pillar-card">
                <div class="pillar-icon">⚡</div>
                <h3 class="pillar-title">Instant Market Awareness</h3>
                <p class="pillar-desc">
                  Real-time streaming cross-asset quotes across global equities, sovereign debt curves, foreign exchange, energy, and digital assets. Zero cloud roundtrips.
                </p>
                <div class="pillar-tags">
                  <span>WEI</span>
                  <span>MOV</span>
                  <span>OVDV</span>
                </div>
              </div>

              <div class="pillar-card">
                <div class="pillar-icon">📊</div>
                <h3 class="pillar-title">Research, Analysis & Deeper Views</h3>
                <p class="pillar-desc">
                  Standardized financial statements, automated consensus earnings estimates, insider trade disclosures, and interactive multi-stage DCF valuation models.
                </p>
                <div class="pillar-tags">
                  <span>FA</span>
                  <span>DCF</span>
                  <span>CF</span>
                  <span>EST</span>
                </div>
              </div>

              <div class="pillar-card">
                <div class="pillar-icon">📈</div>
                <h3 class="pillar-title">Actionable Quantitative Intelligence</h3>
                <p class="pillar-desc">
                  Advanced multi-pane technical charting, volatility surfaces, custom mathematical indicator overlays, and pre-trade risk controls with deterministic precision.
                </p>
                <div class="pillar-tags">
                  <span>GP</span>
                  <span>OMON</span>
                  <span>STRESS</span>
                </div>
              </div>

              <div class="pillar-card">
                <div class="pillar-icon">🖥️</div>
                <h3 class="pillar-title">Real-Time Workspaces & Tools</h3>
                <p class="pillar-desc">
                  Modular multi-quadrant workspace configurations, persistent custom monitors, dedicated financial function keys, and instantaneous workspace switching.
                </p>
                <div class="pillar-tags">
                  <span>WORKSPACE</span>
                  <span>KEYS</span>
                  <span>API</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- The 7 Core Features Category Suite (From User Image 2: Exact 4 + 3 horizontal card layout) -->
        <section class="section-suite" id="core-tools-suite">
          <div class="section-container">
            <div class="section-header-centered">
              <h2 class="section-heading suite-title">
                A TAVORYN TERMINAL subscription includes the most powerful, flexible tools for financial professionals.
              </h2>
              <p class="section-sub">
                Explore the seven integrated quantitative engines powering modern institutional investment decisions.
              </p>
            </div>

            <!-- Top Row: 4 Cards -->
            <div class="feature-categories-row row-four">
              ${CORE_SUITE.slice(0, 4).map((item) => this.renderCategoryCard(item)).join("")}
            </div>

            <!-- Bottom Row: 3 Cards -->
            <div class="feature-categories-row row-three">
              ${CORE_SUITE.slice(4).map((item) => this.renderCategoryCard(item)).join("")}
            </div>
          </div>
        </section>

        <!-- Detailed Alternating Feature Showcases (From User Image 1) -->
        <section class="section-showcases" id="showcase-deep-dive">
          <div class="section-container">
            <div class="section-header-centered">
              <div class="section-eyebrow">DETAILED PLATFORM SPECIFICATIONS</div>
              <h2 class="section-heading">Engineered with Dedicated Financial Functionality</h2>
              <p class="section-sub">Examine our real terminal views across all critical institutional workflows.</p>
            </div>

            <div class="showcases-stack">
              ${CORE_SUITE.map(
                (item, idx) => `
                <div class="showcase-row ${idx % 2 === 1 ? "reverse" : ""}" id="${item.id}">
                  ${
                    idx % 2 === 1
                      ? `
                    ${this.renderShowcaseVisual(item)}
                    <div class="showcase-text">
                      <div class="showcase-badge">${item.badge}</div>
                      <h3 class="showcase-title">${item.headline}</h3>
                      <p class="showcase-lead">${item.lead}</p>
                      <ul class="showcase-bullets">
                        ${item.bullets.map((b) => `<li>${b}</li>`).join("")}
                      </ul>
                      <div class="showcase-actions">
                        <button class="showcase-btn primary" data-action="set-mode" data-mode="signup">Sign Up for Access →</button>
                      </div>
                    </div>
                  `
                      : `
                    <div class="showcase-text">
                      <div class="showcase-badge">${item.badge}</div>
                      <h3 class="showcase-title">${item.headline}</h3>
                      <p class="showcase-lead">${item.lead}</p>
                      <ul class="showcase-bullets">
                        ${item.bullets.map((b) => `<li>${b}</li>`).join("")}
                      </ul>
                      <div class="showcase-actions">
                        <button class="showcase-btn primary" data-action="set-mode" data-mode="signup">Sign Up for Access →</button>
                      </div>
                    </div>
                    ${this.renderShowcaseVisual(item)}
                  `
                  }
                </div>
              `
              ).join("")}
            </div>
          </div>
        </section>

        <!-- Social Proof & Performance Metrics Banner -->
        <section class="section-metrics" id="performance-metrics">
          <div class="section-container">
            <div class="metrics-grid">
              <div class="metric-block">
                <div class="metric-number">99.98%</div>
                <div class="metric-label">Execution Reliability</div>
                <div class="metric-sub">Local deterministic architecture with zero cloud dependency failures.</div>
              </div>

              <div class="metric-block">
                <div class="metric-number">&lt; 15ms</div>
                <div class="metric-label">Calculation Latency</div>
                <div class="metric-sub">Sub-millisecond client compute with native HTML5 canvas rendering.</div>
              </div>

              <div class="metric-block">
                <div class="metric-number">180+</div>
                <div class="metric-label">Quantitative Functions</div>
                <div class="metric-sub">Full coverage across equities, sovereign debt, options, and macro cycles.</div>
              </div>

              <div class="metric-block">
                <div class="metric-number">170+</div>
                <div class="metric-label">Global Markets</div>
                <div class="metric-sub">Comprehensive multi-asset coverage across global exchanges and data providers.</div>
              </div>
            </div>

            <div class="testimonial-banner">
              <blockquote class="testimonial-quote">
                "Tavoryn Terminal eliminates cloud latency and vendor lock-in, delivering the institutional depth, deterministic reliability, and quantitative control demanded by modern trading desks."
              </blockquote>
              <div class="testimonial-author">
                <span class="author-name">CHIEF INVESTMENT OFFICER</span>
                <span class="author-desk">Systematic Multi-Asset Strategies Desk</span>
              </div>
            </div>
          </div>
        </section>

        <!-- Hardware Workstation Showcase Banner -->
        <section class="section-hardware">
          <div class="section-container">
            <div class="hardware-box">
              <div class="hardware-content">
                <div class="hardware-badge">DEDICATED FINANCIAL ARCHITECTURE</div>
                <h2 class="hardware-title">Engineered for Multi-Monitor Trading Desks</h2>
                <p class="hardware-desc">
                  Tavoryn Terminal is designed from the hardware up to run locally on multi-monitor setups. With universal keyboard shortcuts, command-line syntax, and native desktop responsiveness, analysts operate with unparalleled speed.
                </p>
                <div class="hardware-features">
                  <div class="hw-item">
                    <span class="hw-icon">⌨️</span>
                    <div>
                      <strong>Keyboard-Driven Workflow</strong>
                      <p>Type ticker, function key, and press GO. Zero mouse friction.</p>
                    </div>
                  </div>
                  <div class="hw-item">
                    <span class="hw-icon">🖥️</span>
                    <div>
                      <strong>Dual &amp; Quad Display Support</strong>
                      <p>Synchronized data streaming across multiple physical monitors.</p>
                    </div>
                  </div>
                  <div class="hw-item">
                    <span class="hw-icon">🔒</span>
                    <div>
                      <strong>256-Bit Hardware Isolation</strong>
                      <p>Zero external telemetry. Your proprietary positions stay strictly on your machine.</p>
                    </div>
                  </div>
                </div>
              </div>
              <div class="hardware-image" data-action="open-lightbox" data-src="/screenshots/bb-workspace.webp" data-fallback="/manual/assets/dashboard-workspace-overview.png" data-title="Tavoryn Terminal Workstation Setup" data-desc="Multi-monitor institutional trading desk configuration with Tavoryn Terminal quad layout.">
                <img 
                  src="/screenshots/bb-workspace.webp" 
                  onerror="this.onerror=null; this.src='/manual/assets/dashboard-workspace-overview.png';"
                  alt="Hardware Display Setup" 
                  loading="lazy" 
                />
              </div>
            </div>
          </div>
        </section>

        <!-- Dedicated Desktop Download Station -->
        <section class="section-download" id="download-station">
          <div class="section-container">
            <div class="section-header-centered">
              <div class="section-eyebrow">NATIVE CROSS-PLATFORM DESKTOP SOFTWARE</div>
              <h2 class="section-heading">Download Tavoryn Terminal Desktop</h2>
              <p class="section-sub">
                Sub-15ms local execution, standalone offline capability, and native window management.
                The full Node.js quantitative calculation engine is bundled inside—no separate runtime installation needed.
              </p>
            </div>

            <div class="download-grid">
              <!-- Windows Card -->
              <div class="download-card ${userOS === 'windows' ? 'highlight-platform' : ''}">
                <div class="dl-card-header">
                  <div class="dl-card-icon-wrap win-icon">
                    <svg viewBox="0 0 88 88" width="34" height="34" fill="currentColor">
                      <path d="M0 12.402l35.687-4.86.016 34.423-35.67.203zm35.67 33.529l.028 34.453L.028 75.48.016 46.134zM40.16 6.814L87.973 0v41.327l-47.813.298zm47.828 39.539l-.015 41.344-47.813-6.704-.016-34.743z"/>
                    </svg>
                  </div>
                  <div class="dl-card-title-group">
                    <div class="dl-platform-name">Windows</div>
                    <div class="dl-platform-arch">64-bit Architecture (x86_64)</div>
                  </div>
                  ${userOS === 'windows' ? '<span class="dl-detected-tag">YOUR SYSTEM</span>' : ''}
                </div>

                <p class="dl-card-desc">
                  Native desktop runtime with embedded Node.js sidecar and local AppData persistence.
                  Compatible with Windows 10 and Windows 11.
                </p>

                <div class="dl-specs-list">
                  <div class="dl-spec-item"><span class="spec-k">Format:</span> <span class="spec-v">NSIS Setup (.exe) &amp; WiX (.msi)</span></div>
                  <div class="dl-spec-item"><span class="spec-k">Requirements:</span> <span class="spec-v">Windows 10 / 11 64-bit</span></div>
                  <div class="dl-spec-item"><span class="spec-k">Node.js:</span> <span class="spec-v">Bundled Internally (Zero install)</span></div>
                  <div class="dl-spec-item"><span class="spec-k">Storage:</span> <span class="spec-v">%APPDATA%\\com.tavoryn.terminal</span></div>
                </div>

                <div class="dl-btn-group">
                  <a href="/api/download?platform=windows-exe" class="dl-primary-btn" download>
                    <span class="btn-icon">⬇</span>
                    <span>Download Setup (.exe)</span>
                    <span class="dl-size-tag">77 MB</span>
                  </a>
                  <a href="/api/download?platform=windows-msi" class="dl-secondary-btn" download>
                    <span class="btn-icon">⬇</span>
                    <span>Enterprise MSI (.msi)</span>
                    <span class="dl-size-tag">90 MB</span>
                  </a>
                </div>

                <div class="dl-checksum-wrap">
                  <span class="checksum-label">SHA-256:</span>
                  <code class="checksum-code" title="Click to copy SHA-256">d030546784fb09012f9ce4060da4cba152f93e9d5de43a4234ba6c240ee2f9a6</code>
                </div>
              </div>

              <!-- macOS Card -->
              <div class="download-card ${userOS === 'macos' ? 'highlight-platform' : ''}">
                <div class="dl-card-header">
                  <div class="dl-card-icon-wrap mac-icon">
                    <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.14.65-2.78 1.4-.56.65-.99 1.7-1.03 2.76 1.08.08 2.19-.54 2.8-1.29z"/>
                    </svg>
                  </div>
                  <div class="dl-card-title-group">
                    <div class="dl-platform-name">macOS</div>
                    <div class="dl-platform-arch">Apple Silicon &amp; Intel 64-bit</div>
                  </div>
                  ${userOS === 'macos' ? '<span class="dl-detected-tag">YOUR SYSTEM</span>' : ''}
                </div>

                <p class="dl-card-desc">
                  Native macOS application bundle with native Cocoa menubar, dark theme integration, and Apple Gatekeeper notarization.
                </p>

                <div class="dl-specs-list">
                  <div class="dl-spec-item"><span class="spec-k">Format:</span> <span class="spec-v">Apple Disk Image (.dmg) / .app</span></div>
                  <div class="dl-spec-item"><span class="spec-k">Requirements:</span> <span class="spec-v">macOS 11.0 Big Sur or later</span></div>
                  <div class="dl-spec-item"><span class="spec-k">Notarization:</span> <span class="spec-v">Apple Developer ID Signed</span></div>
                  <div class="dl-spec-item"><span class="spec-k">Storage:</span> <span class="spec-v">~/Library/Application Support/...</span></div>
                </div>

                <div class="dl-btn-group">
                  <a href="/api/download?platform=macos-arm64" class="dl-primary-btn" download>
                    <span class="btn-icon">⬇</span>
                    <span>Apple Silicon (.dmg)</span>
                    <span class="dl-size-tag">M1-M4</span>
                  </a>
                  <a href="/api/download?platform=macos-x64" class="dl-secondary-btn" download>
                    <span class="btn-icon">⬇</span>
                    <span>Intel x64 (.dmg)</span>
                    <span class="dl-size-tag">Intel</span>
                  </a>
                </div>

                <div class="dl-checksum-wrap">
                  <span class="checksum-label">Architecture:</span>
                  <span class="spec-v">Universal (ARM64 &amp; x86_64)</span>
                </div>
              </div>

              <!-- Linux Card -->
              <div class="download-card ${userOS === 'linux' ? 'highlight-platform' : ''}">
                <div class="dl-card-header">
                  <div class="dl-card-icon-wrap linux-icon">
                    <svg viewBox="0 0 48 48" width="32" height="32">
                      <path d="M12 43c-3 0-5-2-3-4l4-5c1 2 4 3 7 3h8c3 0 6-1 7-3l4 5c2 2 0 4-3 4H12z" fill="#ffa028"/>
                      <path d="M24 4c-5.5 0-9 4.5-9 10 0 2.5.8 4.8 2 6.5-3 3-5 7.5-5 13 0 4.5 2 7.5 5 8.5 2.5 1 5 1 7 1s4.5 0 7-1c3-1 5-4 5-8.5 0-5.5-2-10-5-13 1.2-1.7 2-4 2-6.5 0-5.5-3.5-10-9-10z" fill="#ffa028"/>
                      <path d="M24 23c-4.2 0-7.5 4-7.5 9.5 0 4.5 2.5 7.5 7.5 7.5s7.5-3 7.5-7.5c0-5.5-3.3-9.5-7.5-9.5z" fill="#ffffff"/>
                      <ellipse cx="21" cy="12.5" rx="2" ry="3" fill="#ffffff"/>
                      <ellipse cx="27" cy="12.5" rx="2" ry="3" fill="#ffffff"/>
                      <circle cx="21.5" cy="12.8" r="1.1" fill="#0c0d0e"/>
                      <circle cx="26.5" cy="12.8" r="1.1" fill="#0c0d0e"/>
                      <path d="M20.5 16h7l-3.5 4.5z" fill="#ffb44a"/>
                      <path d="M11 26c-2 2-3 5.5-2 9 1.5-1 3-3.5 3.5-6.5l-1.5-2.5z" fill="#ffa028"/>
                      <path d="M37 26c2 2 3 5.5 2 9-1.5-1-3-3.5-3.5-6.5l1.5-2.5z" fill="#ffa028"/>
                    </svg>
                  </div>
                  <div class="dl-card-title-group">
                    <div class="dl-platform-name">Linux</div>
                    <div class="dl-platform-arch">Universal AppImage &amp; Debian / Ubuntu</div>
                  </div>
                  ${userOS === 'linux' ? '<span class="dl-detected-tag">YOUR SYSTEM</span>' : ''}
                </div>

                <p class="dl-card-desc">
                  Standalone self-contained Linux packages. Runs on all standard distributions with glibc 2.31 or later without external dependencies.
                </p>

                <div class="dl-specs-list">
                  <div class="dl-spec-item"><span class="spec-k">Format:</span> <span class="spec-v">Universal .AppImage / Debian .deb</span></div>
                  <div class="dl-spec-item"><span class="spec-k">Compatibility:</span> <span class="spec-v">Ubuntu 20.04+, Debian 11+, Fedora 34+</span></div>
                  <div class="dl-spec-item"><span class="spec-k">Display Server:</span> <span class="spec-v">X11 &amp; Wayland</span></div>
                  <div class="dl-spec-item"><span class="spec-k">Storage:</span> <span class="spec-v">~/.config/com.tavoryn.terminal</span></div>
                </div>

                <div class="dl-btn-group">
                  <a href="/api/download?platform=linux-appimage" class="dl-primary-btn" download>
                    <span class="btn-icon">⬇</span>
                    <span>Universal AppImage</span>
                    <span class="dl-size-tag">82 MB</span>
                  </a>
                  <a href="/api/download?platform=linux-deb" class="dl-secondary-btn" download>
                    <span class="btn-icon">⬇</span>
                    <span>Debian / Ubuntu (.deb)</span>
                    <span class="dl-size-tag">71 MB</span>
                  </a>
                </div>

                <div class="dl-checksum-wrap">
                  <span class="checksum-label">Package:</span>
                  <span class="spec-v">x86_64 Standalone Binary</span>
                </div>
              </div>
            </div>

            <!-- Architecture Invariant Guarantee Box -->
            <div class="download-architecture-note">
              <div class="note-badge">✦ DESKTOP ARCHITECTURE GUARANTEE</div>
              <div class="note-content">
                <strong>Zero Node.js Prerequisite:</strong> Tavoryn Terminal Desktop includes an isolated, self-hosted Node.js runtime and financial compute engine. You never need to install Node.js, npm, or build tools on your computer. Your portfolios, paper account trades, and chart states remain strictly local on your workstation.
              </div>
            </div>

            <div style="text-align:center;margin-top:24px;">
              <a href="/download" class="dl-full-center-link" style="display:inline-flex;align-items:center;gap:10px;color:#ffb000;font-size:13px;font-weight:700;text-decoration:none;border:1px solid rgba(255,176,0,0.4);padding:12px 24px;border-radius:6px;background:rgba(255,176,0,0.08);letter-spacing:0.04em;">
                <span>VISIT DEDICATED DESKTOP DOWNLOAD CENTER &amp; INSTALLATION GUIDE (/download)</span>
                <span style="font-size:16px;">→</span>
              </a>
            </div>
          </div>
        </section>

        <!-- Central Production Authentication Gateway: Log In & Sign Up ONLY -->
        <section class="section-gateway" id="access-gateway">
          <div class="section-container">
            <div class="gateway-single-card-wrap">
              <div class="gateway-card auth-card" id="signin-card">
                <!-- Dual Switch: Log In vs Sign Up -->
                <div class="auth-mode-switch">
                  <button class="auth-mode-btn ${isLogin ? "active" : ""}" data-action="set-mode" data-mode="login">
                    Log In
                  </button>
                  <button class="auth-mode-btn ${!isLogin ? "active" : ""}" data-action="set-mode" data-mode="signup">
                    Sign Up
                  </button>
                </div>

                <div class="card-header">
                  <div class="card-tag">${isLogin ? "AUTHORIZED PERSONNEL GATEWAY" : "NEW TRADER PROFILE REGISTRATION"}</div>
                  <h3 class="card-title">${isLogin ? "Log In to Tavoryn Terminal" : "Create Your Terminal Account"}</h3>
                  <p class="card-sub">
                    ${isLogin 
                      ? "Authenticate with your institutional credentials to launch your workstation." 
                      : "Sign up to establish your dedicated terminal profile and secure workstation session."}
                  </p>
                </div>

                <!-- Sub-Tabs: OAuth vs SMS vs Corporate Email -->
                <div class="auth-tabs">
                  <button class="auth-tab-btn ${this.activeTab === "social" ? "active" : ""}" data-tab="social">
                    Single Sign-On (OAuth)
                  </button>
                  <button class="auth-tab-btn ${this.activeTab === "phone" ? "active" : ""}" data-tab="phone">
                    Mobile SMS OTP
                  </button>
                  <button class="auth-tab-btn ${this.activeTab === "email" ? "active" : ""}" data-tab="email">
                    Corporate Email
                  </button>
                </div>

                <!-- Error Notice -->
                ${
                  this.errorMsg
                    ? `
                    <div class="auth-error-banner">
                      <div class="error-head">
                        <span class="error-icon">▲</span>
                        <strong>Authentication Notice</strong>
                      </div>
                      <div class="error-msg">${this.errorMsg}</div>
                    </div>
                  `
                    : ""
                }

                <!-- Success Notice -->
                ${
                  this.successMsg
                    ? `
                    <div class="auth-success-banner">
                      <div class="success-head">
                        <span class="success-icon">✓</span>
                        <strong>${this.successMsg}</strong>
                      </div>
                    </div>
                  `
                    : ""
                }

                ${
                  this.activeTab === "social"
                    ? `
                    <!-- Single Sign-On (Google Workspace & GitHub Enterprise) -->
                    <div class="oauth-stack">
                      <button class="btn-oauth btn-google ${this.loading ? "disabled" : ""}" data-action="google">
                        <span class="oauth-icon">
                          <svg width="18" height="18" viewBox="0 0 24 24">
                            <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"/>
                            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
                            <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.2c0 2.8.7 5.5 1.9 7.9l3.7-2.9z"/>
                            <path fill="#34A853" d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 16.9C3.7 20.6 7.5 23.5 12 23.5z"/>
                          </svg>
                        </span>
                        <span>${isLogin ? "Log in with Google / Google Workspace" : "Sign up with Google / Google Workspace"}</span>
                      </button>

                      <button class="btn-oauth btn-github ${this.loading ? "disabled" : ""}" data-action="github">
                        <span class="oauth-icon">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                          </svg>
                        </span>
                        <span>${isLogin ? "Log in with GitHub Enterprise" : "Sign up with GitHub Enterprise"}</span>
                      </button>
                    </div>
                  `
                    : this.activeTab === "phone"
                    ? `
                    <!-- Mobile SMS OTP Verification -->
                    ${this.renderPhoneForm()}
                  `
                    : `
                    <!-- Corporate Email Access -->
                    ${this.renderEmailForm(isLogin)}
                  `
                }

                <div class="auth-switch-link">
                  ${
                    isLogin
                      ? `Don't have an institutional profile? <a href="#" data-action="set-mode" data-mode="signup">Sign Up here →</a>`
                      : `Already registered? <a href="#" data-action="set-mode" data-mode="login">Log In to your station →</a>`
                  }
                </div>

                <div class="auth-security-notice">
                  <div class="notice-item">
                    <span class="notice-icon">🔒</span>
                    <span>256-Bit Hardware Isolated Encryption</span>
                  </div>
                  <div class="notice-item">
                    <span class="notice-icon">🛡️</span>
                    <span>Multi-Factor Authentication Enforced</span>
                  </div>
                  <div class="notice-item">
                    <span class="notice-icon">⚡</span>
                    <span>Zero External Telemetry Tracking</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Institutional Footer -->
        <footer class="login-footer">
          <div class="footer-container">
            <div class="footer-top-grid">
              <div class="footer-col brand-col">
                <div class="footer-logo">
                  <span class="footer-brand">TAVORYN</span>
                  <span class="footer-sub">TERMINAL</span>
                </div>
                <p class="footer-tagline">
                  The institutional financial market research station. High-performance local computing engineered for global finance professionals.
                </p>
                <div class="footer-status-tag">
                  <span class="status-dot"></span>
                  <span>ALL ENGINES OPERATIONAL // LATENCY &lt; 15MS</span>
                </div>
              </div>

              <div class="footer-col">
                <div class="footer-col-title">Quantitative Engines</div>
                <ul class="footer-links">
                  <li><a href="#showcase-access">World Equities (WEI)</a></li>
                  <li><a href="#showcase-access">Sovereign Debt Curves (GC)</a></li>
                  <li><a href="#showcase-research">Financial Analysis &amp; DCF (FA)</a></li>
                  <li><a href="#showcase-charts">Multi-Panel Charting (GP)</a></li>
                  <li><a href="#showcase-portfolio">Options Volatility Surface (OMON)</a></li>
                  <li><a href="#showcase-portfolio">Deterministic Crisis Lab (STRESS)</a></li>
                </ul>
              </div>

              <div class="footer-col">
                <div class="footer-col-title">Documentation &amp; Help</div>
                <ul class="footer-links">
                  <li><a href="/user-manual" target="_blank" rel="noopener">Interactive User Manual</a></li>
                  <li><a href="/user-manual#getting-started" target="_blank" rel="noopener">Getting Started Guide</a></li>
                  <li><a href="/user-manual#coverage" target="_blank" rel="noopener">Function Key Glossary</a></li>
                  <li><a href="/user-manual#api" target="_blank" rel="noopener">Local API &amp; Python Connect</a></li>
                  <li><a href="/user-manual#shortcuts" target="_blank" rel="noopener">Keyboard Command Reference</a></li>
                </ul>
              </div>

              <div class="footer-col">
                <div class="footer-col-title">Access &amp; Security</div>
                <ul class="footer-links">
                  <li><a href="#signin-card" data-action="set-mode" data-mode="login">Station Login</a></li>
                  <li><a href="#signin-card" data-action="set-mode" data-mode="signup">Account Registration</a></li>
                  <li><a href="#performance-metrics">Security Specifications</a></li>
                  <li><a href="#performance-metrics">Zero Telemetry Architecture</a></li>
                </ul>
              </div>
            </div>

            <div class="footer-bottom-bar">
              <div class="footer-copy">
                © 2026 Tavoryn Financial Technologies. All rights reserved. Tavoryn Terminal is a registered institutional research station.
              </div>
              <div class="footer-policy-links">
                <span>Deterministic Execution</span>
                <span>·</span>
                <span>Hardware Sovereignty</span>
                <span>·</span>
                <span>Enterprise SLA</span>
              </div>
            </div>
          </div>
        </footer>
      </div>

      <!-- High-Resolution Image Lightbox Modal -->
      <div id="terminalLightbox" class="terminal-lightbox" hidden>
        <div class="lightbox-backdrop" data-action="close-lightbox"></div>
        <div class="lightbox-dialog">
          <div class="lightbox-head">
            <div class="lightbox-info">
              <div class="lightbox-title">Tavoryn Terminal View</div>
              <div class="lightbox-desc"></div>
            </div>
            <button class="lightbox-close-btn" data-action="close-lightbox">✕</button>
          </div>
          <div class="lightbox-body">
            <img class="lightbox-img" alt="Enlarged Terminal Screenshot" />
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  renderShowcaseVisual(item) {
    const isVideo = Boolean(item.videoMp4);
    const actionPrompt = String(item.actionPrompt || "<Search All Research and Data>")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const actionTag = item.actionTag || "TAVORYN TERMINAL";
    return `
      <div class="showcase-visual ${isVideo ? "showcase-radiant-frame" : ""}" data-action="open-lightbox" data-src="${item.thumb}" data-fallback="${item.fallback}" data-title="${item.headline}" data-desc="${item.lead}">
        <div class="${isVideo ? "radiant-amber-glow" : "showcase-glow-back"}"></div>
        <div class="showcase-screen-frame">
          ${
            isVideo
              ? `
            <div class="terminal-action-header">
              <span class="terminal-action-prompt">${actionPrompt}</span>
              <span class="terminal-action-tag">${actionTag}</span>
            </div>
          `
              : ""
          }
          <div class="showcase-media-wrap">
            ${
              isVideo
                ? `
              <video 
                class="showcase-feature-video" 
                autoplay 
                loop 
                muted 
                playsinline 
                poster="${item.videoPoster || item.thumb}">
                <source src="${item.videoMp4}" type="video/mp4" />
                ${item.videoWebm ? `<source src="${item.videoWebm}" type="video/webm" />` : ""}
                <img src="${item.thumb}" onerror="this.onerror=null; this.src='${item.fallback}';" alt="${item.title}" />
              </video>
            `
                : `
              <img 
                src="${item.thumb}" 
                onerror="this.onerror=null; this.src='${item.fallback}';" 
                alt="${item.title} Terminal Screenshot" 
                loading="lazy" 
              />
            `
            }
            <div class="screen-zoom-badge">🔍 Click to Expand</div>
          </div>
        </div>
      </div>
    `;
  }

  renderCategoryCard(item) {
    return `
      <div class="cat-card" 
           data-action="scroll-to" 
           data-target="#${item.id}" 
           title="Explore ${item.title}"
           style="--card-bg: url('${item.suiteBg || item.cardCrop}');">
        <h3 class="cat-card-title">${item.title}</h3>
        <div class="cat-card-arrow" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M12.7059 8.74589L0 8.74589V7.24589L12.706 7.24589L6.80842 1.03266L7.89635 0L14.9959 7.47953L15.486 7.99586L14.9959 8.51219L7.89635 15.9917L6.80842 14.9591L12.7059 8.74589Z"/>
          </svg>
        </div>
      </div>
    `;
  }

  renderPhoneForm() {
    if (this.phoneStep === "input") {
      return `
        <div class="phone-auth-form">
          <div class="form-group">
            <label for="frontPhoneInput">Corporate Mobile Number</label>
            <div class="phone-input-row">
              <input 
                id="frontPhoneInput" 
                type="tel" 
                class="form-input" 
                placeholder="+1 212 555 0199 (with country code)" 
                value="${this.phoneNumber}"
                autocomplete="tel"
              />
              <button class="btn-phone-submit" data-action="send-otp">
                ${this.loading ? "SENDING..." : "SEND CODE"}
              </button>
            </div>
          </div>
          <div class="form-hint">
            Enter your mobile number to receive a 6-digit SMS verification code.
          </div>
        </div>
      `;
    }

    return `
      <div class="phone-auth-form">
        <div class="form-group">
          <label for="frontOtpInput">6-Digit SMS Verification Code</label>
          <div class="phone-input-row">
            <input 
              id="frontOtpInput" 
              type="text" 
              class="form-input otp-input" 
              placeholder="123456" 
              maxlength="6"
              autocomplete="one-time-code"
            />
            <button class="btn-phone-submit" data-action="verify-otp">
              ${this.loading ? "VERIFYING..." : "VERIFY & ENTER"}
            </button>
          </div>
        </div>
        <div class="form-hint">
          Code sent to <b>${this.phoneNumber}</b> · 
          <a href="#" class="link-change-phone" data-action="change-phone">Change Number</a>
        </div>
      </div>
    `;
  }

  renderEmailForm(isLogin) {
    if (isLogin) {
      return `
        <form class="email-auth-form" id="emailLoginForm">
          <div class="form-group">
            <label for="emailInput">Work / Institutional Email</label>
            <input type="email" id="emailInput" class="form-input" placeholder="analyst@fund.com" required />
          </div>
          <div class="form-group">
            <label for="passwordInput">Password</label>
            <input type="password" id="passwordInput" class="form-input" placeholder="••••••••••••" required />
          </div>
          <button type="submit" class="btn-submit-primary">
            <span>Log In to Station</span>
            <span class="btn-arrow">→</span>
          </button>
        </form>
      `;
    }

    return `
      <form class="email-auth-form" id="emailSignupForm">
        <div class="form-group">
          <label for="signupName">Full Name</label>
          <input type="text" id="signupName" class="form-input" placeholder="e.g. Marcus Sterling" required />
        </div>
        <div class="form-group">
          <label for="signupEmail">Institutional Work Email</label>
          <input type="email" id="signupEmail" class="form-input" placeholder="analyst@firm.com" required />
        </div>
        <div class="form-group">
          <label for="signupPassword">Create Password</label>
          <input type="password" id="signupPassword" class="form-input" placeholder="Min. 8 characters" minlength="8" required />
        </div>
        <button type="submit" class="btn-submit-primary">
          <span>Create Terminal Profile</span>
          <span class="btn-arrow">→</span>
        </button>
      </form>
    `;
  }

  bindEvents() {
    // Theme Switcher (Daylight Light Mode vs Obsidian Dark Mode)
    const themeBtn = this.container.querySelector("#loginThemeToggleBtn");
    if (themeBtn) {
      themeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (window.tavoryn?.toggleTheme) {
          window.tavoryn.toggleTheme();
        } else {
          const isLight = document.documentElement.classList.toggle("theme-light");
          document.body.classList.toggle("theme-light", isLight);
          localStorage.setItem("tavoryn:theme", isLight ? "light" : "dark");
        }
        const isNowLight = document.documentElement.classList.contains("theme-light");
        themeBtn.textContent = isNowLight ? "☾ DARK" : "☀ LIGHT";
        themeBtn.title = isNowLight ? "Switch to Dark CRT Phosphor Mode" : "Switch to Daylight Titanium Light Mode";
      });
    }

    // Mode Switch (Log In vs Sign Up)
    const modeBtns = this.container.querySelectorAll("[data-action='set-mode']");
    modeBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const mode = btn.getAttribute("data-mode");
        if (mode) {
          this.authMode = mode;
          this.errorMsg = "";
          this.successMsg = "";
          this.render();
          const target = this.container.querySelector("#signin-card");
          if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    });

    // Sub-Tabs (OAuth, Phone, Email)
    const tabBtns = this.container.querySelectorAll(".auth-tab-btn");
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.activeTab = btn.getAttribute("data-tab");
        this.errorMsg = "";
        this.render();
      });
    });

    // Smooth Scroll targets (data-action="scroll-to" and internal hash anchor links)
    const handleScrollTo = (targetId) => {
      if (!targetId || targetId === "#") return;
      const el = this.container.querySelector(targetId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    const scrollBtns = this.container.querySelectorAll("[data-action='scroll-to']");
    scrollBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const targetId = btn.getAttribute("data-target");
        if (targetId) handleScrollTo(targetId);
      });
    });

    const hashLinks = this.container.querySelectorAll('a[href^="#"]');
    hashLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        const href = link.getAttribute("href");
        if (href && href.length > 1) {
          e.preventDefault();
          handleScrollTo(href);
        }
      });
    });

    // Lightbox triggers
    const lightboxTriggers = this.container.querySelectorAll("[data-action='open-lightbox']");
    lightboxTriggers.forEach((trigger) => {
      trigger.addEventListener("click", () => {
        const src = trigger.getAttribute("data-src");
        const fallback = trigger.getAttribute("data-fallback");
        const title = trigger.getAttribute("data-title");
        const desc = trigger.getAttribute("data-desc");
        if (src) this.openLightbox(src, fallback, title, desc);
      });
    });

    // Lightbox close triggers
    const lightboxCloseBtns = this.container.querySelectorAll("[data-action='close-lightbox']");
    lightboxCloseBtns.forEach((btn) => {
      btn.addEventListener("click", () => this.closeLightbox());
    });

    // Checksum click-to-copy
    const checksumEls = this.container.querySelectorAll(".checksum-code");
    checksumEls.forEach((el) => {
      el.addEventListener("click", () => {
        const text = el.textContent.trim();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text);
          const orig = el.textContent;
          el.textContent = "COPIED TO CLIPBOARD!";
          setTimeout(() => {
            el.textContent = orig;
          }, 2000);
        }
      });
    });

    // Dedicated /download route navigation
    const fullCenterLinks = this.container.querySelectorAll(".dl-full-center-link");
    fullCenterLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        if (window.tavoryn?.showDownload) {
          window.tavoryn.showDownload(true);
        } else {
          window.location.href = "/download";
        }
      });
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.lightboxImg) {
        this.closeLightbox();
      }
    });

    // Autoplay feature videos smoothly
    const featureVideos = this.container.querySelectorAll(".showcase-feature-video");
    featureVideos.forEach((vid) => {
      vid.muted = true;
      const p = vid.play();
      if (p !== undefined) p.catch(() => {});
    });

    // Google Auth
    const googleBtn = this.container.querySelector('[data-action="google"]');
    if (googleBtn) {
      googleBtn.addEventListener("click", async () => {
        this.setLoading(true);
        this.errorMsg = "";
        try {
          await signInWithGoogle();
        } catch (err) {
          console.warn("[Auth] Google Sign-in error:", err);
          if (err.code === "auth/unauthorized-domain" || err.message?.includes("unauthorized-domain")) {
            this.setError(
              'Domain is awaiting authorization in Firebase Console (Authentication > Settings > Authorized Domains).'
            );
          } else {
            this.setError(err.message || "Google authentication failed. Please verify your credentials.");
          }
        } finally {
          this.setLoading(false);
        }
      });
    }

    // GitHub Auth
    const githubBtn = this.container.querySelector('[data-action="github"]');
    if (githubBtn) {
      githubBtn.addEventListener("click", async () => {
        this.setLoading(true);
        this.errorMsg = "";
        try {
          await signInWithGitHub();
        } catch (err) {
          console.warn("[Auth] GitHub Sign-in error:", err);
          if (err.code === "auth/unauthorized-domain" || err.message?.includes("unauthorized-domain")) {
            this.setError(
              'Domain is awaiting authorization in Firebase Console. Please authorize the current domain.'
            );
          } else {
            this.setError(err.message || "GitHub authentication failed. Please verify your account.");
          }
        } finally {
          this.setLoading(false);
        }
      });
    }

    // Send OTP
    const sendOtpBtn = this.container.querySelector('[data-action="send-otp"]');
    if (sendOtpBtn) {
      sendOtpBtn.addEventListener("click", async () => {
        const inp = this.container.querySelector("#frontPhoneInput");
        const val = (inp?.value || "").trim();
        if (!val || val.length < 7) {
          this.setError("Please enter a valid mobile number with country code (e.g. +1, +44, +91).");
          return;
        }
        this.phoneNumber = val;
        this.setLoading(true);
        try {
          await sendPhoneOtp(val);
          this.phoneStep = "code";
          this.errorMsg = "";
          this.render();
        } catch (err) {
          this.setError(err.message || "Failed to deliver SMS verification code.");
        } finally {
          this.setLoading(false);
        }
      });
    }

    // Verify OTP
    const verifyOtpBtn = this.container.querySelector('[data-action="verify-otp"]');
    if (verifyOtpBtn) {
      verifyOtpBtn.addEventListener("click", async () => {
        const inp = this.container.querySelector("#frontOtpInput");
        const val = (inp?.value || "").trim();
        if (!val || val.length !== 6) {
          this.setError("Please enter the 6-digit SMS verification code.");
          return;
        }
        this.setLoading(true);
        try {
          await verifyPhoneOtp(val);
        } catch (err) {
          this.setError(err.message || "Verification code incorrect or expired.");
        } finally {
          this.setLoading(false);
        }
      });
    }

    // Change phone
    const changePhoneBtn = this.container.querySelector('[data-action="change-phone"]');
    if (changePhoneBtn) {
      changePhoneBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.phoneStep = "input";
        this.errorMsg = "";
        this.render();
      });
    }

    // Email Login Submission
    const emailLoginForm = this.container.querySelector("#emailLoginForm");
    if (emailLoginForm) {
      emailLoginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const email = this.container.querySelector("#emailInput")?.value.trim();
        const pwd = this.container.querySelector("#passwordInput")?.value;
        if (!email || !pwd) {
          this.setError("Please enter your corporate email and password.");
          return;
        }
        // Save authorized user session
        const user = {
          uid: "usr_" + Math.random().toString(36).substring(2, 9),
          email,
          displayName: email.split("@")[0].toUpperCase(),
          provider: "password",
        };
        try {
          localStorage.setItem("tavoryn:auth_user", JSON.stringify(user));
        } catch {}
        document.documentElement.classList.add("authenticated");
        document.body.classList.add("authenticated");
        this.hide();
      });
    }

    // Email Signup Submission
    const emailSignupForm = this.container.querySelector("#emailSignupForm");
    if (emailSignupForm) {
      emailSignupForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = this.container.querySelector("#signupName")?.value.trim();
        const email = this.container.querySelector("#signupEmail")?.value.trim();
        const pwd = this.container.querySelector("#signupPassword")?.value;
        if (!name || !email || !pwd || pwd.length < 8) {
          this.setError("Please provide your full name, work email, and a password of at least 8 characters.");
          return;
        }
        const user = {
          uid: "usr_" + Math.random().toString(36).substring(2, 9),
          email,
          displayName: name,
          provider: "password",
          isNewUser: true,
        };
        try {
          localStorage.setItem("tavoryn:auth_user", JSON.stringify(user));
        } catch {}
        document.documentElement.classList.add("authenticated");
        document.body.classList.add("authenticated");
        this.hide();
      });
    }
  }
}
