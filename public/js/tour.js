// ============================================================================
// Tavoryn Terminal — Interactive Onboarding Tour & Navigation Walkthrough
// Step-by-step guided spotlight covering every feature, tab, key, and engine.
// Zero external dependencies; pure vanilla JS and CSS with CRT Amber aesthetic.
// ============================================================================

import { getCurrentUser } from "./auth.js";

export const TOUR_STEPS = [
  {
    id: "welcome",
    target: "#brandLogo",
    chapter: "TERMINAL PHILOSOPHY",
    title: "Welcome to Tavoryn Terminal",
    desc: "A professional-grade, multi-panel financial terminal and quantitative research engine. Built for deep market analysis, rapid keyboard navigation, zero external dependencies, and complete data transparency.",
    placement: "bottom",
  },
  {
    id: "global-cmd",
    target: "#globalCmd",
    chapter: "COMMAND ARCHITECTURE",
    title: "Global Command Bar",
    desc: "The nerve center of the terminal. Enter any ticker, security, or function code followed by GO (or press Enter). Try: AAPL DES, WEI, DCF, or BTST. Press '/' anywhere in the app to instantly jump here.",
    tryCmd: "AAPL DES",
    placement: "bottom",
  },
  {
    id: "yellow-keys",
    target: "#keys .key:not(.fn)",
    chapter: "ASSET CLASSES",
    title: "Yellow Security Keys (F2 – F11)",
    desc: "Bloomberg-style asset qualifiers: F2 GOVT (government bonds), F8 EQUITY (stocks/ETFs), F9 CMDTY (commodities), F10 INDEX (benchmark indices), and F11 CRNCY (currencies & crypto). Appends the security type to your current ticker.",
    tryCmd: "SPX INDEX GP",
    placement: "bottom",
  },
  {
    id: "macro-monitors",
    target: '#keys .key[data-k="WEI"]',
    chapter: "GLOBAL MACRO",
    title: "World Markets (WEI), Top News (TOP) & Economic Calendar (ECO)",
    desc: "Instant macro situational awareness: WEI monitors global equity indices across Americas, EMEA, and APAC; TOP aggregates live market headlines across CNBC, WSJ, Bloomberg, and FT; ECO tracks high-impact central bank and economic events with consensus forecasts.",
    tryCmd: "WEI",
    placement: "bottom",
  },
  {
    id: "rates-curves",
    target: '#keys .key[data-k="GC"]',
    chapter: "FIXED INCOME & RATES",
    title: "Yield Curves (GC), Money Markets (BTMM) & Rate Odds (WIRP)",
    desc: "Track sovereign debt and monetary policy: GC plots the US Treasury yield curve across 1M to 30Y tenors and detects inversions; BTMM tracks commercial paper and SOFR funding; WIRP calculates market-implied rate cut and hike probabilities for upcoming FOMC meetings.",
    tryCmd: "GC",
    placement: "bottom",
  },
  {
    id: "cross-asset",
    target: '#keys .key[data-k="FXC"]',
    chapter: "CROSS-ASSET MATRICES",
    title: "Currencies (FXC), Commodities (GLCO) & Cryptocurrencies (CRYPTO)",
    desc: "Comprehensive multi-asset coverage: FXC displays a real-time foreign exchange cross-rate matrix; GLCO tracks energy, base and precious metals, agriculture; CRYPTO tracks spot Bitcoin, Ethereum, and altcoins 24/7.",
    tryCmd: "FXC",
    placement: "bottom",
  },
  {
    id: "movers-screener",
    target: '#keys .key[data-k="MOST"]',
    chapter: "MARKET DISCOVERY",
    title: "Market Movers (MOST), Equity Search (EQS) & Screener (SCRN)",
    desc: "Find trading ideas across global markets: MOST surfaces top gainers, losers, and volume leaders; EQS and SCRN filter the entire universe by fundamental ratios (P/E, EV/EBITDA), market cap, dividend yield, and technical indicators.",
    tryCmd: "MOST",
    placement: "bottom",
  },
  {
    id: "watchlists",
    target: '#keys .key[data-k="W"]',
    chapter: "PORTFOLIO TRACKING",
    title: "Watchlists (W)",
    desc: "Organize and track your favorite symbols across stocks, crypto, and commodities. Watchlists update in real-time, compute daily net changes, and persist locally to your workspace.",
    tryCmd: "W",
    placement: "bottom",
  },
  {
    id: "alerts",
    target: '#keys .key[data-k="ALRT"]',
    chapter: "EXECUTION & MONITORING",
    title: "Real-Time Price & Indicator Alerts (ALRT)",
    desc: "Set deterministic multi-condition alert rules (e.g. 'AAPL close > 230' or 'BTC crossesAbove 80000'). Monitored continuously with audible terminal notifications and desktop alerts.",
    tryCmd: "ALRT",
    placement: "bottom",
  },
  {
    id: "paper-trading",
    target: '#keys .key[data-k="TRAD"]',
    chapter: "PAPER EXECUTION",
    title: "Institutional Paper Trading Execution (TRAD)",
    desc: "Practice execution in a fenced simulated environment. Place Market, Limit, and Stop orders with realistic bid/ask spreads, borrowing fees, and 21 automated pre-trade risk checks (max drawdown, daily loss limit, notional caps).",
    tryCmd: "TRAD",
    placement: "bottom",
  },
  {
    id: "ai-desk",
    target: '#keys .key[data-k="ASKB"]',
    chapter: "AI QUANT ASSISTANT",
    title: "AI Quantitative Research Assistant (ASKB)",
    desc: "Your quantitative copilot. Ask conversational financial questions, analyze earnings releases, request custom indicator code, or generate backtesting rule hypotheses in natural language.",
    tryCmd: "ASKB",
    placement: "bottom",
  },
  {
    id: "data-status",
    target: '#keys .key[data-k="DATA"]',
    chapter: "TRANSPARENCY",
    title: "Data Sources & Feed Transparency (DATA)",
    desc: "View the exact provenance, latency, health status, and API contracts of all market data feeds powering the terminal (Yahoo Finance, SEC EDGAR, FRED, Coinbase, FairEconomy, and custom API connectors).",
    tryCmd: "DATA",
    placement: "bottom",
  },
  {
    id: "layout-switcher",
    target: '#keys button[data-l="4"]',
    chapter: "WORKSPACE LAYOUT",
    title: "1, 2, 4, 6, or 8 Panel Workspaces",
    desc: "Customize your workspace geometry. Switch between 1 (full focus), 2 (dual split), 4 (classic Bloomberg quad), 6 (ultrawide 3x2), or 8 (high-density 4x2) panels instantly. Use keyboard shortcuts Ctrl+1 through Ctrl+8 or click the layout buttons.",
    placement: "bottom",
  },
  {
    id: "panel-header",
    target: ".panel:first-child .pbar",
    chapter: "PANEL ARCHITECTURE",
    title: "Independent Panel Prompts & Numbering",
    desc: "Each panel is an autonomous workstation with its own command line prompt and independent history. Click any panel to activate it; the global command bar will route its commands into the active panel.",
    placement: "bottom",
  },
  {
    id: "panel-export",
    target: '.panel:first-child [data-a="export"]',
    chapter: "DATA EXPORT",
    title: "One-Click CSV Export for Excel",
    desc: "Export every financial table currently displayed on this screen into a clean, structured CSV file formatted for Excel, Python pandas, and R. Preserves full numerical precision without truncation.",
    placement: "bottom",
  },
  {
    id: "panel-controls",
    target: '.panel:first-child [data-a="max"]',
    chapter: "PANEL CONTROLS",
    title: "Maximize (▢) and History Back (◂)",
    desc: "Click ▢ (or double-click the panel header) to zoom any panel to full screen; click again to return to quad view. The back button (◂) or the Escape key walks backward through that panel's command history.",
    placement: "bottom",
  },
  {
    id: "dcf-valuation",
    target: ".panel:first-child .pbody",
    chapter: "VALUATION MODELS",
    title: "Discounted Cash Flow (DCF) & Financial Analysis (FA, DES)",
    desc: "Institutional intrinsic valuation: DCF computes 5-year free cash flow projections, Gordon Growth terminal value, WACC sensitivity matrix, and Enterprise-to-Equity value bridge. Pair with DES for tear-sheets and FA for 10-K financial statements.",
    tryCmd: "AAPL DCF",
    placement: "top",
  },
  {
    id: "charting-engine",
    target: ".panel:nth-child(3) .pbody",
    chapter: "TECHNICAL ANALYSIS",
    title: "Interactive Charts (GP) & 87 Technical Indicators",
    desc: "High-performance candlestick and bar charts powered by TradingView Lightweight Charts. Includes 87 verified quantitative indicators (VWAP, Supertrend, Ichimoku Cloud, Bollinger Bands, ATR, RSI) and on-chart drawing tools.",
    tryCmd: "AAPL GP",
    placement: "top",
  },
  {
    id: "backtest-stress",
    target: ".panel:first-child",
    chapter: "QUANTITATIVE RIGOR",
    title: "Backtester (BTST) & Crisis Stress Testing (STRESS)",
    desc: "Quantitative validation without illusions: BTST tests strategy rules against 5 anti-overfitting gates (Walk-Forward, PBO, Deflated Sharpe). STRESS mathematically shocks your portfolio against 8 historical crises (2008 GFC, 2020 COVID, 1987 crash).",
    tryCmd: "PORT STRESS",
    placement: "top",
  },
  {
    id: "options-chain",
    target: ".panel:first-child",
    chapter: "DERIVATIVES & OPTIONS",
    title: "Options Chains (OMON) & Strategy Payoffs (OPAY)",
    desc: "Options analytics: OMON displays call/put strike ladders, implied volatility, and Greeks. OPAY models visual profit-and-loss economic payoff graphs for multi-leg strategies (straddles, strangles, spreads, iron condors).",
    tryCmd: "AAPL OMON",
    placement: "top",
  },
  {
    id: "tape-stream",
    target: "#tape",
    chapter: "LIVE TICKER",
    title: "Global Benchmark Ticker Tape",
    desc: "Live market tape running continuously across the bottom of your workspace. Displays real-time updates for major equity indices (SPX, NDX, DOW, FTSE, DAX, Nikkei), commodities (Gold, Crude Oil), 10Y Yields, Forex, and Crypto.",
    placement: "top",
  },
  {
    id: "user-manual",
    target: "#helpLink",
    chapter: "DOCUMENTATION",
    title: "In-App User Manual & Documentation (F1 / HELP)",
    desc: "Need in-depth help? Press F1 or click HELP anytime to open the full interactive User Manual, complete with high-resolution screenshot walkthroughs, workflow guides, calculation proofs, and command references.",
    placement: "bottom",
  },
];

class OnboardingTour {
  constructor() {
    this.currentStep = 0;
    this.overlay = null;
    this.spotlight = null;
    this.card = null;
    this.active = false;
    this.onKeydown = this.handleKeydown.bind(this);
    this.onResize = this.handleResize.bind(this);
  }

  init() {
    if (this.overlay) return;

    this.overlay = document.createElement("div");
    this.overlay.id = "tourOverlay";
    this.overlay.className = "tour-overlay";
    this.overlay.setAttribute("role", "dialog");
    this.overlay.setAttribute("aria-label", "Tavoryn Terminal Tour");

    this.spotlight = document.createElement("div");
    this.spotlight.id = "tourSpotlight";
    this.spotlight.className = "tour-spotlight";

    this.card = document.createElement("div");
    this.card.id = "tourCard";
    this.card.className = "tour-card";

    this.overlay.appendChild(this.spotlight);
    this.overlay.appendChild(this.card);
    document.body.appendChild(this.overlay);

    // Event delegation on tour card
    this.card.addEventListener("click", (e) => {
      const bar = e.target.closest(".tour-progress-bar");
      if (bar) {
        const rect = bar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, clickX / rect.width));
        const step = Math.min(TOUR_STEPS.length - 1, Math.floor(pct * TOUR_STEPS.length));
        this.goToStep(step);
        return;
      }

      const btn = e.target.closest("button");
      if (!btn) return;
      if (btn.classList.contains("tour-skip")) {
        this.endTour();
      } else if (btn.classList.contains("tour-next")) {
        this.next();
      } else if (btn.classList.contains("tour-prev")) {
        this.prev();
      } else if (btn.classList.contains("tour-try")) {
        const cmd = btn.dataset.cmd;
        if (cmd && window.tavoryn?.run) {
          window.tavoryn.run(cmd);
          btn.textContent = `✓ Executed "${cmd}"`;
          btn.disabled = true;
        }
      }
    });

    // Close when clicking directly on overlay backdrop outside card
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) {
        this.endTour();
      }
    });
  }

  start(force = false) {
    if (!force) {
      try {
        const user = typeof getCurrentUser === "function" ? getCurrentUser() : null;
        const id = user ? (user.uid || user.email || user.phoneNumber) : null;
        const toured = JSON.parse(localStorage.getItem("tavoryn:toured_accounts") || "{}");
        if (id && toured[id]) return;
        if (!id && localStorage.getItem("tavoryn:tour_completed")) return;
      } catch {}
    }
    this.init();
    this.currentStep = 0;
    this.active = true;
    this.overlay.classList.add("active");
    document.addEventListener("keydown", this.onKeydown);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("scroll", this.onResize, true);
    this.renderStep();
  }

  endTour() {
    this.active = false;
    if (this.overlay) {
      this.overlay.classList.remove("active");
    }
    document.removeEventListener("keydown", this.onKeydown);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("scroll", this.onResize, true);
    
    try {
      const user = typeof getCurrentUser === "function" ? getCurrentUser() : null;
      const id = user ? (user.uid || user.email || user.phoneNumber) : null;
      if (id) {
        const toured = JSON.parse(localStorage.getItem("tavoryn:toured_accounts") || "{}");
        toured[id] = Date.now();
        localStorage.setItem("tavoryn:toured_accounts", JSON.stringify(toured));
      }
      localStorage.setItem("tavoryn:tour_completed", "true");
    } catch {}
    
    // Return focus to global command line
    const gInput = document.getElementById("gInput");
    if (gInput) gInput.focus();
  }

  next() {
    if (this.currentStep < TOUR_STEPS.length - 1) {
      this.currentStep++;
      this.renderStep();
    } else {
      this.endTour();
    }
  }

  prev() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.renderStep();
    }
  }

  goToStep(index) {
    if (index >= 0 && index < TOUR_STEPS.length) {
      this.currentStep = index;
      this.renderStep();
    }
  }

  handleKeydown(e) {
    if (!this.active) return;
    if (e.key === "Escape") {
      e.preventDefault();
      this.endTour();
    } else if (e.key === "ArrowRight" || e.key === "Enter") {
      e.preventDefault();
      this.next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      this.prev();
    }
  }

  handleResize() {
    if (!this.active) return;
    this.positionSpotlightAndCard();
  }

  resolveTargetElement(selector) {
    let el = null;
    try {
      el = document.querySelector(selector);
    } catch {}
    
    // Fallback if specific child selector not found
    if (!el) {
      if (selector.includes(".panel:nth-child(3)")) {
        el = document.querySelector(".panel:last-child") || document.querySelector(".panel");
      } else if (selector.includes(".panel")) {
        el = document.querySelector(".panel");
      } else if (selector.includes("#keys")) {
        el = document.getElementById("keys");
      }
    }
    return el || document.body;
  }

  renderStep() {
    const step = TOUR_STEPS[this.currentStep];
    const isFirst = this.currentStep === 0;
    const isLast = this.currentStep === TOUR_STEPS.length - 1;
    const total = TOUR_STEPS.length;
    const currentNum = this.currentStep + 1;
    const progressPct = Math.round((currentNum / total) * 100);

    const tryBtnHtml = step.tryCmd
      ? `<button class="tour-try" data-cmd="${step.tryCmd}" title="Run ${step.tryCmd} in the active panel">⚡ Try: <b>${step.tryCmd}</b></button>`
      : "";

    this.card.innerHTML = `
      <div class="tour-card-header">
        <div class="tour-meta">
          <span class="tour-badge">${currentNum} of ${total}</span>
          <span class="tour-chapter">${step.chapter}</span>
        </div>
        <button class="tour-skip" title="Exit Tour (Esc)">Skip Tour ✕</button>
      </div>

      <div class="tour-card-body">
        <h3 class="tour-title">${step.title}</h3>
        <p class="tour-desc">${step.desc}</p>
        ${tryBtnHtml}
      </div>

      <div class="tour-progress-bar" title="Click anywhere along the bar to jump to that step">
        <div class="tour-progress-fill" style="width: ${progressPct}%"></div>
      </div>

      <div class="tour-card-footer">
        <div class="tour-key-nav">
          <button class="tour-key-btn tour-prev" ${isFirst ? "disabled" : ""} title="Previous Step (Left Arrow / ←)">←</button>
          <button class="tour-key-btn tour-next" title="${isLast ? 'Finish Tour (Enter / →)' : 'Next Step (Right Arrow / →)'}">→</button>
          <button class="tour-key-btn tour-skip" title="Exit Tour (Escape / Esc)">Esc</button>
        </div>
        <div class="tour-nav-buttons">
          <button class="tour-btn tour-prev" ${isFirst ? "disabled" : ""}>◂ Back</button>
          <button class="tour-btn tour-next tour-btn-primary">${isLast ? "Finish Tour ✓" : "Next ▸"}</button>
        </div>
      </div>
    `;

    this.positionSpotlightAndCard();
  }

  positionSpotlightAndCard() {
    const step = TOUR_STEPS[this.currentStep];
    const targetEl = this.resolveTargetElement(step.target);
    const rect = targetEl.getBoundingClientRect();
    const pad = 6;

    // Position spotlight cutout
    let spotTop = Math.max(0, rect.top - pad);
    let spotLeft = Math.max(0, rect.left - pad);
    let spotWidth = rect.width + pad * 2;
    let spotHeight = rect.height + pad * 2;

    // Prevent full-body spotlight from overwhelming viewport
    if (targetEl === document.body) {
      spotWidth = 0;
      spotHeight = 0;
    }

    this.spotlight.style.top = `${spotTop}px`;
    this.spotlight.style.left = `${spotLeft}px`;
    this.spotlight.style.width = `${spotWidth}px`;
    this.spotlight.style.height = `${spotHeight}px`;

    // Position popover card
    const cardWidth = Math.min(420, window.innerWidth - 32);
    this.card.style.width = `${cardWidth}px`;
    const cardHeight = this.card.offsetHeight || 240;

    let cardTop = 0;
    let cardLeft = 0;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    // Determine vertical placement
    if (step.placement === "top" && spotTop - cardHeight - 16 > 0) {
      cardTop = spotTop - cardHeight - 14;
    } else if (step.placement === "bottom" && spotTop + spotHeight + cardHeight + 16 < viewportH) {
      cardTop = spotTop + spotHeight + 14;
    } else {
      // Auto-fallback: if bottom fits, use bottom, else top
      if (spotTop + spotHeight + cardHeight + 16 < viewportH) {
        cardTop = spotTop + spotHeight + 14;
      } else if (spotTop - cardHeight - 14 > 0) {
        cardTop = spotTop - cardHeight - 14;
      } else {
        cardTop = Math.max(20, (viewportH - cardHeight) / 2);
      }
    }

    // Determine horizontal placement (align with left of target, keep inside screen)
    cardLeft = Math.max(16, Math.min(spotLeft, viewportW - cardWidth - 16));

    // Special case for centered modals or body
    if (targetEl === document.body) {
      cardTop = (viewportH - cardHeight) / 2;
      cardLeft = (viewportW - cardWidth) / 2;
    }

    this.card.style.top = `${cardTop}px`;
    this.card.style.left = `${cardLeft}px`;
  }
}

export const tour = new OnboardingTour();

export function startTour(force = false) {
  tour.start(force);
}
