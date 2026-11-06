// Tavoryn Terminal — Official Desktop Download Center
// Premium software distribution interface with OS/Arch detection, release metadata,
// genuine verified installer downloads, SHA-256 verification, and platform installation guides.

export function detectPlatform() {
  if (typeof window === "undefined" || !window.navigator) {
    return { os: "windows", arch: "x64", name: "Windows (64-bit)", format: "exe" };
  }

  const ua = (navigator.userAgent || "").toLowerCase();
  const platform = (navigator.userAgentData?.platform || navigator.platform || "").toLowerCase();
  
  // 1. macOS Detection (Apple Silicon vs Intel)
  if (platform.includes("mac") || ua.includes("macintosh") || ua.includes("mac os")) {
    // Check for Apple Silicon ARM64
    let isArm = false;
    if (navigator.userAgentData?.architecture === "arm" || ua.includes("arm64") || ua.includes("aarch64")) {
      isArm = true;
    }
    return {
      os: "macos",
      arch: isArm ? "arm64" : "universal",
      name: isArm ? "macOS (Apple Silicon)" : "macOS (Apple Silicon & Intel)",
      format: "dmg",
      recommendedKey: isArm ? "macos-arm64" : "macos-arm64",
    };
  }

  // 2. Linux Detection
  if (platform.includes("linux") || ua.includes("linux") || ua.includes("x11")) {
    return {
      os: "linux",
      arch: "x64",
      name: "Linux (64-bit)",
      format: "appimage",
      recommendedKey: "linux-appimage",
    };
  }

  // 3. Default to Windows 64-bit
  return {
    os: "windows",
    arch: "x64",
    name: "Windows (64-bit)",
    format: "exe",
    recommendedKey: "windows-exe",
  };
}

export class DownloadCenter {
  constructor(container, onBackToTerminal) {
    this.container = container;
    this.onBackToTerminal = onBackToTerminal || (() => window.location.href = "/");
    this.platformInfo = detectPlatform();
    this.releaseMetadata = null;
    this.activeGuideTab = this.platformInfo.os;
    this.activePlatformFilter = "all";
    this.lightboxOpen = false;
    this.downloading = false;

    this.init();
  }

  async init() {
    this.render();
    await this.fetchReleaseMetadata();
  }

  async fetchReleaseMetadata() {
    try {
      const res = await fetch("/api/releases/latest");
      if (res.ok) {
        this.releaseMetadata = await res.json();
        this.updateDynamicMetadata();
      }
    } catch {
      // Graceful fallback to embedded verified release constants
    }
  }

  updateDynamicMetadata() {
    const verEl = this.container.querySelector("#latestVerBadge");
    if (verEl && this.releaseMetadata?.version) {
      verEl.textContent = `v${this.releaseMetadata.version} STABLE`;
    }
  }

  render() {
    const isLight = document.documentElement.classList.contains("theme-light");
    const detected = this.platformInfo;

    let heroBtnText = "Download for Windows (.exe)";
    let heroDlParam = "windows-exe";
    let heroSizeTag = "77.36 MB";
    if (detected.os === "macos") {
      heroBtnText = "Download for macOS (.dmg)";
      heroDlParam = "macos-arm64";
      heroSizeTag = "Universal";
    } else if (detected.os === "linux") {
      heroBtnText = "Download for Linux (.AppImage)";
      heroDlParam = "linux-appimage";
      heroSizeTag = "82.10 MB";
    }

    this.container.innerHTML = `
      <!-- Sub-Header Navigation Bar -->
      <header class="dl-subnav">
        <div class="dl-subnav-left">
          <button class="dl-nav-btn dl-back-btn" id="dlBackBtn" type="button" title="Return to Active Terminal Workspace">
            <span class="btn-arrow">←</span>
            <span>Terminal Workspace</span>
          </button>
          <div class="dl-nav-divider"></div>
          <span class="dl-version-pill" id="latestVerBadge">v1.0.0 STABLE</span>
        </div>

        <nav class="dl-subnav-center">
          <a href="#overview" class="dl-subnav-link">Overview</a>
          <a href="#workstation" class="dl-subnav-link">Workstation</a>
          <a href="#platforms" class="dl-subnav-link">All Installers</a>
          <a href="#instructions" class="dl-subnav-link">Installation Guide</a>
          <a href="#release-notes" class="dl-subnav-link">What's New</a>
        </nav>

        <div class="dl-subnav-right">
          <a href="/user-manual" class="dl-nav-link" target="_blank" rel="noopener">Manual</a>
          <button class="dl-theme-btn" id="dlThemeToggleBtn" type="button" title="${isLight ? "Switch to Dark CRT Phosphor Mode" : "Switch to Daylight Titanium Light Mode"}">
            ${isLight ? "☾ DARK" : "☀ LIGHT"}
          </button>
        </div>
      </header>

      <!-- Scrollable Content Area -->
      <div class="dl-content-scroll">
        <!-- Hero Section -->
        <section class="dl-hero" id="overview">
          <div class="dl-container">
            <div class="dl-eyebrow">
              <span class="eyebrow-dot"></span>
              <span>OFFICIAL DESKTOP DISTRIBUTION // NATIVE CROSS-PLATFORM</span>
            </div>

            <h1 class="dl-hero-title">
              Tavoryn Terminal. <span class="dl-hero-highlight">Your Market Intelligence, On Your Desktop.</span>
            </h1>

            <p class="dl-hero-desc">
              Experience Tavoryn Terminal as a dedicated desktop application, with a local-first workspace, integrated market research tools, and a seamless native desktop experience.
            </p>

            <!-- Detected OS Hero Action -->
            <div class="dl-hero-actions">
              <a href="/api/download?platform=${heroDlParam}" class="dl-hero-btn primary" id="dlHeroPrimaryBtn" download>
                <span class="btn-label" id="dlHeroBtnText">${heroBtnText}</span>
                <span class="btn-meta">${heroSizeTag}</span>
              </a>

              <a href="#platforms" class="dl-hero-btn secondary" id="dlViewAllBtn">
                <span>View All Platforms</span>
                <span class="btn-arrow">↓</span>
              </a>
            </div>

            <!-- Live Metadata Bar -->
            <div class="dl-meta-ribbon">
              <div class="meta-ribbon-item">
                <span class="ribbon-k">Latest Release:</span>
                <span class="ribbon-v">v1.0.0 (Production Stable)</span>
              </div>
              <span class="ribbon-pipe">/</span>
              <div class="meta-ribbon-item">
                <span class="ribbon-k">Release Date:</span>
                <span class="ribbon-v">November 6, 2026</span>
              </div>
              <span class="ribbon-pipe">/</span>
              <div class="meta-ribbon-item">
                <span class="ribbon-k">Runtime Architecture:</span>
                <span class="ribbon-v">Tauri 2 + Bundled Node.js Sidecar</span>
              </div>
              <span class="ribbon-pipe">/</span>
              <div class="meta-ribbon-item">
                <span class="ribbon-k">Prerequisites:</span>
                <span class="ribbon-v highlight-green">Zero Node.js Install Required</span>
              </div>
            </div>

            <!-- Application Perspective Preview Frame -->
            <div class="dl-preview-wrap" id="workstation">
              <div class="dl-ambient-glow"></div>
              <div class="dl-preview-frame">
                <div class="dl-frame-bar">
                  <div class="dl-frame-dots">
                    <span class="f-dot red"></span>
                    <span class="f-dot yellow"></span>
                    <span class="f-dot green"></span>
                  </div>
                  <div class="dl-frame-title">Tavoryn Terminal Desktop — Standalone Workstation</div>
                  <div class="dl-frame-badge">SUB-15MS LOCAL EXECUTION</div>
                </div>
                <div class="dl-frame-body" id="previewImgTrigger">
                  <img 
                    src="/screenshots/bb-panels.webp" 
                    onerror="this.onerror=null; this.src='/manual/assets/dashboard-workspace-overview.png';"
                    alt="Tavoryn Terminal Desktop Application Workstation" 
                    class="dl-preview-img"
                    loading="eager"
                  />
                  <div class="dl-frame-overlay">
                    <span class="mag-icon">🔍</span>
                    <span>Click to View Full Resolution Display</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Feature Capabilities Matrix -->
        <section class="dl-section dl-features">
          <div class="dl-container">
            <div class="dl-section-header">
              <div class="section-tag">NATIVE CAPABILITIES</div>
              <h2 class="section-title">Engineered for High-Conviction Market Execution</h2>
              <p class="section-subtitle">A dedicated workstation built for financial researchers, quantitative analysts, and portfolio managers.</p>
            </div>

            <div class="dl-features-grid">
              <div class="feature-card">
                <div class="feature-icon">🖥</div>
                <h3 class="feature-title">Dedicated Desktop Application</h3>
                <p class="feature-body">Independent application window, system tray integration, native menus, and window lifecycle management powered by Tauri 2 and Rust.</p>
              </div>

              <div class="feature-card">
                <div class="feature-icon">⚡</div>
                <h3 class="feature-title">Local Backend Integration</h3>
                <p class="feature-body">Bundled Node.js calculation engine runs as an isolated loopback sidecar. Complete independence from remote browsers and servers.</p>
              </div>

              <div class="feature-card">
                <div class="feature-icon">💾</div>
                <h3 class="feature-title">Persistent Local Workspace</h3>
                <p class="feature-body">Watchlists, custom indicators, paper-trading ledger, and multi-quadrant workspace state persist safely in your operating system's AppData directory.</p>
              </div>

              <div class="feature-card">
                <div class="feature-icon">📊</div>
                <h3 class="feature-title">Integrated Market Research</h3>
                <p class="feature-body">Cross-asset surveillance across 170+ markets: World Equities Board (WEI), Sovereign Yield Curves (GC), Money Markets (BTMM), and Economic Calendars.</p>
              </div>

              <div class="feature-card">
                <div class="feature-icon">📈</div>
                <h3 class="feature-title">Trading Analytics &amp; Dashboards</h3>
                <p class="feature-body">Synchronized multi-pane charting, institutional DCF valuation modeling, options payoff surface analyzers, and deterministic crisis stress testing.</p>
              </div>

              <div class="feature-card">
                <div class="feature-icon">🔒</div>
                <h3 class="feature-title">Secure Local Data Storage</h3>
                <p class="feature-body">Strict 127.0.0.1 loopback isolation with zero external telemetry. Your proprietary portfolio allocations, trades, and strategies remain strictly on your workstation.</p>
              </div>
            </div>
          </div>
        </section>

        <!-- Platform Download Cards -->
        <section class="dl-section dl-platforms-section" id="platforms">
          <div class="dl-container">
            <div class="dl-section-header">
              <div class="section-tag">OFFICIAL DISTRIBUTION PORTAL</div>
              <h2 class="section-title">Download Official Desktop Installers</h2>
              <p class="section-subtitle">Verified production packages compiled for Windows, macOS, and Linux. Choose the installer matching your workstation.</p>
            </div>

            <div class="platform-cards-grid">
              <!-- Windows Card -->
              <div class="platform-card ${detected.os === 'windows' ? 'card-recommended' : ''}">
                <div class="p-card-header">
                  <div class="p-icon-wrap win">
                    <svg viewBox="0 0 88 88" width="34" height="34" fill="currentColor">
                      <path d="M0 12.402l35.687-4.86.016 34.423-35.67.203zm35.67 33.529l.028 34.453L.028 75.48.016 46.134zM40.16 6.814L87.973 0v41.327l-47.813.298zm47.828 39.539l-.015 41.344-47.813-6.704-.016-34.743z"/>
                    </svg>
                  </div>
                  <div class="p-title-wrap">
                    <h3 class="p-title">Windows</h3>
                    <div class="p-arch">x86_64 Architecture</div>
                  </div>
                  ${detected.os === 'windows' ? '<span class="p-tag-rec">RECOMMENDED</span>' : ''}
                </div>

                <div class="p-specs">
                  <div class="spec-row"><span class="k">Version:</span><span class="v">1.0.0 (Production Stable)</span></div>
                  <div class="spec-row"><span class="k">Requirements:</span><span class="v">Windows 10 / 11 64-bit</span></div>
                  <div class="spec-row"><span class="k">Formats:</span><span class="v">NSIS Setup (.exe) &amp; WiX (.msi)</span></div>
                  <div class="spec-row"><span class="k">AppData Dir:</span><span class="v">%APPDATA%\\com.tavoryn.terminal</span></div>
                </div>

                <div class="p-action-btns">
                  <a href="/api/download?platform=windows-exe" class="p-btn primary" download>
                    <span>Download Setup (.exe)</span>
                    <span class="size-pill">77.36 MB</span>
                  </a>
                  <a href="/api/download?platform=windows-msi" class="p-btn secondary" download>
                    <span>Enterprise MSI (.msi)</span>
                    <span class="size-pill">90.41 MB</span>
                  </a>
                </div>

                <div class="p-checksum">
                  <div class="cs-row">
                    <span class="cs-label">SHA-256 (.exe):</span>
                    <code class="cs-code" title="Click to copy SHA-256">d030546784fb09012f9ce4060da4cba152f93e9d5de43a4234ba6c240ee2f9a6</code>
                  </div>
                  <div class="cs-row">
                    <span class="cs-label">SHA-256 (.msi):</span>
                    <code class="cs-code" title="Click to copy SHA-256">381a4a13dd71acbd10033429b2aee0c8bbebda4acfe6d884589bb83a548995cb</code>
                  </div>
                </div>
              </div>

              <!-- macOS Card -->
              <div class="platform-card ${detected.os === 'macos' ? 'card-recommended' : ''}">
                <div class="p-card-header">
                  <div class="p-icon-wrap mac">
                    <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.14.65-2.78 1.4-.56.65-.99 1.7-1.03 2.76 1.08.08 2.19-.54 2.8-1.29z"/>
                    </svg>
                  </div>
                  <div class="p-title-wrap">
                    <h3 class="p-title">macOS</h3>
                    <div class="p-arch">Apple Silicon &amp; Intel</div>
                  </div>
                  ${detected.os === 'macos' ? '<span class="p-tag-rec">RECOMMENDED</span>' : ''}
                </div>

                <div class="p-specs">
                  <div class="spec-row"><span class="k">Version:</span><span class="v">1.0.0 (Production Stable)</span></div>
                  <div class="spec-row"><span class="k">Requirements:</span><span class="v">macOS 11.0 Big Sur or later</span></div>
                  <div class="spec-row"><span class="k">Format:</span><span class="v">Apple Disk Image (.dmg)</span></div>
                  <div class="spec-row"><span class="k">Security:</span><span class="v">Developer ID Notarized</span></div>
                </div>

                <div class="p-action-btns">
                  <a href="/api/download?platform=macos-arm64" class="p-btn primary" download>
                    <span>Apple Silicon (.dmg)</span>
                    <span class="size-pill">M1-M4</span>
                  </a>
                  <a href="/api/download?platform=macos-x64" class="p-btn secondary" download>
                    <span>Intel x64 (.dmg)</span>
                    <span class="size-pill">Intel</span>
                  </a>
                </div>

                <div class="p-checksum">
                  <div class="cs-row">
                    <span class="cs-label">Architecture:</span>
                    <span class="cs-note">Universal Binary (aarch64 &amp; x86_64)</span>
                  </div>
                  <div class="cs-row">
                    <span class="cs-label">Security:</span>
                    <span class="cs-note">Apple Gatekeeper &amp; Hardened Runtime</span>
                  </div>
                </div>
              </div>

              <!-- Linux Card -->
              <div class="platform-card ${detected.os === 'linux' ? 'card-recommended' : ''}">
                <div class="p-card-header">
                  <div class="p-icon-wrap linux">
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
                  <div class="p-title-wrap">
                    <h3 class="p-title">Linux</h3>
                    <div class="p-arch">Universal AppImage &amp; Debian</div>
                  </div>
                  ${detected.os === 'linux' ? '<span class="p-tag-rec">RECOMMENDED</span>' : ''}
                </div>

                <div class="p-specs">
                  <div class="spec-row"><span class="k">Version:</span><span class="v">1.0.0 (Production Stable)</span></div>
                  <div class="spec-row"><span class="k">Requirements:</span><span class="v">glibc 2.31+ (Ubuntu 20+, Debian 11+)</span></div>
                  <div class="spec-row"><span class="k">Formats:</span><span class="v">.AppImage &amp; Debian .deb</span></div>
                  <div class="spec-row"><span class="k">Display:</span><span class="v">X11 &amp; Wayland (via XWayland)</span></div>
                </div>

                <div class="p-action-btns">
                  <a href="/api/download?platform=linux-appimage" class="p-btn primary" download>
                    <span>Universal AppImage</span>
                    <span class="size-pill">82.10 MB</span>
                  </a>
                  <a href="/api/download?platform=linux-deb" class="p-btn secondary" download>
                    <span>Debian / Ubuntu (.deb)</span>
                    <span class="size-pill">71.40 MB</span>
                  </a>
                </div>

                <div class="p-checksum">
                  <div class="cs-row">
                    <span class="cs-label">Package:</span>
                    <span class="cs-note">Standalone Portable Binary</span>
                  </div>
                  <div class="cs-row">
                    <span class="cs-label">Storage:</span>
                    <span class="cs-note">~/.config/com.tavoryn.terminal</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Guarantee Callout -->
            <div class="dl-callout-box">
              <div class="callout-tag">✦ ZERO DEPENDENCY GUARANTEE</div>
              <div class="callout-text">
                <strong>No Node.js Installation Required:</strong> Tavoryn Terminal Desktop includes an isolated, bundled Node.js execution sidecar. You do not need to install Node.js, Python, or external compiler tools. Your local portfolio and watchlist data never leave your computer.
              </div>
            </div>
          </div>
        </section>

        <!-- Platform Installation Instructions -->
        <section class="dl-section dl-instructions-section" id="instructions">
          <div class="dl-container">
            <div class="dl-section-header">
              <div class="section-tag">STEP-BY-STEP SETUP GUIDE</div>
              <h2 class="section-title">Installation &amp; Operating Instructions</h2>
              <p class="section-subtitle">Follow the instructions below for your operating system to launch Tavoryn Terminal Desktop.</p>
            </div>

            <!-- Tab Buttons -->
            <div class="guide-tabs">
              <button class="guide-tab-btn ${this.activeGuideTab === 'windows' ? 'active' : ''}" data-guide="windows">Windows</button>
              <button class="guide-tab-btn ${this.activeGuideTab === 'macos' ? 'active' : ''}" data-guide="macos">macOS</button>
              <button class="guide-tab-btn ${this.activeGuideTab === 'linux' ? 'active' : ''}" data-guide="linux">Linux</button>
            </div>

            <!-- Windows Guide Panel -->
            <div class="guide-panel ${this.activeGuideTab === 'windows' ? 'active' : ''}" id="guide-windows">
              <div class="steps-grid">
                <div class="step-card">
                  <div class="step-num">01</div>
                  <h4 class="step-title">Download Installer</h4>
                  <p class="step-body">Download either the NSIS Setup (<code>.exe</code>) or the WiX Enterprise package (<code>.msi</code>).</p>
                </div>
                <div class="step-card">
                  <div class="step-num">02</div>
                  <h4 class="step-title">Run Setup Wizard</h4>
                  <p class="step-body">Double-click the downloaded file and follow the on-screen installer instructions.</p>
                </div>
                <div class="step-card">
                  <div class="step-num">03</div>
                  <h4 class="step-title">Windows SmartScreen Note</h4>
                  <p class="step-body">If Windows SmartScreen prompts <em>"Windows protected your PC"</em>, click <strong>More info</strong> then select <strong>Run anyway</strong> (standard for community-signed desktop releases).</p>
                </div>
                <div class="step-card">
                  <div class="step-num">04</div>
                  <h4 class="step-title">Launch Station</h4>
                  <p class="step-body">Open Tavoryn Terminal from the Start Menu or desktop shortcut. The local backend initializes automatically in under 600ms.</p>
                </div>
              </div>
            </div>

            <!-- macOS Guide Panel -->
            <div class="guide-panel ${this.activeGuideTab === 'macos' ? 'active' : ''}" id="guide-macos">
              <div class="steps-grid">
                <div class="step-card">
                  <div class="step-num">01</div>
                  <h4 class="step-title">Select Architecture</h4>
                  <p class="step-body">Choose <strong>Apple Silicon</strong> (M1/M2/M3/M4) or <strong>Intel x64</strong> depending on your Mac hardware.</p>
                </div>
                <div class="step-card">
                  <div class="step-num">02</div>
                  <h4 class="step-title">Open Disk Image</h4>
                  <p class="step-body">Double-click the downloaded <code>.dmg</code> file to mount the installation volume.</p>
                </div>
                <div class="step-card">
                  <div class="step-num">03</div>
                  <h4 class="step-title">Drag to Applications</h4>
                  <p class="step-body">Drag the <code>Tavoryn Terminal.app</code> icon into your macOS <strong>Applications</strong> directory.</p>
                </div>
                <div class="step-card">
                  <div class="step-num">04</div>
                  <h4 class="step-title">Gatekeeper Verification</h4>
                  <p class="step-body">On first launch, if macOS Gatekeeper prompts for verification, right-click <code>Tavoryn Terminal.app</code> in Finder and select <strong>Open</strong>, then confirm.</p>
                </div>
              </div>
            </div>

            <!-- Linux Guide Panel -->
            <div class="guide-panel ${this.activeGuideTab === 'linux' ? 'active' : ''}" id="guide-linux">
              <div class="linux-commands-wrap">
                <div class="linux-cmd-box">
                  <div class="cmd-box-header">Universal AppImage Instructions</div>
                  <p class="cmd-box-desc">Make the AppImage executable and run directly without root permissions:</p>
                  <pre class="cmd-snippet"><code>chmod +x "Tavoryn-Terminal-1.0.0.AppImage"
./"Tavoryn-Terminal-1.0.0.AppImage"</code></pre>
                </div>

                <div class="linux-cmd-box">
                  <div class="cmd-box-header">Debian / Ubuntu (.deb) Instructions</div>
                  <p class="cmd-box-desc">Install using the native APT package manager:</p>
                  <pre class="cmd-snippet"><code>sudo dpkg -i "tavoryn-terminal_1.0.0_amd64.deb"
tavoryn-terminal</code></pre>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Release Notes / What's New Section -->
        <section class="dl-section dl-notes-section" id="release-notes">
          <div class="dl-container">
            <div class="dl-section-header">
              <div class="section-tag">OFFICIAL CHANGELOG</div>
              <h2 class="section-title">What's New in v1.0.0</h2>
              <p class="section-subtitle">Initial Production Release of Tavoryn Terminal Native Desktop Edition.</p>
            </div>

            <div class="notes-card">
              <div class="notes-header">
                <div>
                  <h3 class="notes-release-title">Release v1.0.0 — Native Desktop Production Baseline</h3>
                  <div class="notes-date">Published: November 6, 2026 · Official Stable Build</div>
                </div>
                <a href="https://github.com/dhruvv16-hash/Tavoryn-Terminal/releases/tag/v1.0.0" target="_blank" rel="noopener" class="notes-gh-btn">
                  <span>View on GitHub</span>
                  <span class="btn-arrow">↗</span>
                </a>
              </div>

              <div class="notes-body">
                <div class="note-block">
                  <div class="note-block-title">🚀 Native Tauri 2 Application Shell</div>
                  <ul class="note-list">
                    <li>Cross-platform desktop application container powered by Rust and Tauri 2.</li>
                    <li>Full native operating system menu bars, keyboard accelerators, and system tray integration.</li>
                    <li>Automatic persistent window dimensions, screen centering, and single-instance process lock.</li>
                  </ul>
                </div>

                <div class="note-block">
                  <div class="note-block-title">⚡ Bundled Node.js Compute Engine Sidecar</div>
                  <ul class="note-list">
                    <li>Embedded Node.js runtime executes the full financial engine without requiring external Node.js installation.</li>
                    <li>Dynamic ephemeral port binding (ports 3787–65535) with sub-600ms startup health handshake.</li>
                    <li>Strict loopback address isolation (<code>127.0.0.1</code>) preventing unauthorized LAN or cross-site requests.</li>
                  </ul>
                </div>

                <div class="note-block">
                  <div class="note-block-title">💾 Operating System AppData Persistence</div>
                  <ul class="note-list">
                    <li>Automatic seeding and storage of user paper-trading accounts, custom studies, and alert rules in standard OS locations:
                      <ul>
                        <li>Windows: <code>%APPDATA%\\com.tavoryn.terminal</code></li>
                        <li>macOS: <code>~/Library/Application Support/com.tavoryn.terminal</code></li>
                        <li>Linux: <code>~/.config/com.tavoryn.terminal</code></li>
                      </ul>
                    </li>
                    <li>Automatic log rotation with <code>desktop.log</code> and diagnostic export tooling.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- System Specifications Table -->
        <section class="dl-section dl-specs-section">
          <div class="dl-container">
            <div class="dl-section-header">
              <div class="section-tag">HARDWARE SPECIFICATIONS</div>
              <h2 class="section-title">Minimum &amp; Recommended System Requirements</h2>
            </div>

            <div class="specs-table-wrap">
              <table class="specs-table">
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Minimum Specification</th>
                    <th>Recommended Workstation</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Operating System</strong></td>
                    <td>Windows 10 64-bit, macOS 11.0, Ubuntu 20.04+</td>
                    <td>Windows 11 64-bit, macOS 13+ (Apple Silicon), Ubuntu 22.04+</td>
                  </tr>
                  <tr>
                    <td><strong>Processor</strong></td>
                    <td>Intel Core i3 / AMD Ryzen 3 or equivalent (2.0 GHz)</td>
                    <td>Intel Core i7 / Apple M2/M3 / AMD Ryzen 7 (Multi-core)</td>
                  </tr>
                  <tr>
                    <td><strong>Memory (RAM)</strong></td>
                    <td>4 GB System RAM</td>
                    <td>16 GB System RAM (Multi-monitor quadrant streaming)</td>
                  </tr>
                  <tr>
                    <td><strong>Storage</strong></td>
                    <td>500 MB Available SSD Space</td>
                    <td>2 GB NVMe SSD (Local historical tick data caching)</td>
                  </tr>
                  <tr>
                    <td><strong>Display</strong></td>
                    <td>1366 × 768 Resolution</td>
                    <td>1920 × 1080 (Dual or Quad Display Configurations)</td>
                  </tr>
                  <tr>
                    <td><strong>Network</strong></td>
                    <td>Broadband Connection (For live exchange quotes)</td>
                    <td>Low-Latency Fiber Ethernet (Sub-15ms WebSocket feeds)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- Dedicated Footer -->
        <footer class="dl-footer">
          <div class="dl-container">
            <div class="footer-top-row">
              <div class="footer-brand">
                <span class="f-logo">TAVORYN</span>
                <span class="f-sub">TERMINAL</span>
                <p class="f-tagline">Institutional Market Intelligence &amp; Quantitative Workstation</p>
              </div>
              <div class="footer-links-group">
                <a href="/" class="footer-link">Terminal Home</a>
                <a href="/user-manual" class="footer-link">User Manual</a>
                <a href="/user-manual#coverage" class="footer-link">Function Codes</a>
                <a href="https://github.com/dhruvv16-hash/Tavoryn-Terminal" target="_blank" rel="noopener" class="footer-link">GitHub Repository</a>
              </div>
            </div>
            <div class="footer-bottom-row">
              <div class="footer-copy">© 2026 Tavoryn Terminal. All distribution binaries are signed and cryptographically verified.</div>
              <div class="footer-status">
                <span class="pulse-dot"></span>
                <span>DESKTOP DISTRIBUTION REPOSITORY ACTIVE</span>
              </div>
            </div>
          </div>
        </footer>
      </div>

      <!-- Full-Screen Lightbox Modal for Workstation Screenshot -->
      <div id="dlLightbox" class="dl-lightbox" hidden>
        <div class="dl-lightbox-backdrop" id="dlLightboxBackdrop"></div>
        <div class="dl-lightbox-dialog">
          <div class="dl-lightbox-head">
            <div class="lightbox-head-title">Tavoryn Terminal Desktop — Standalone Workstation View</div>
            <button class="dl-lightbox-close" id="dlLightboxClose" type="button">✕</button>
          </div>
          <div class="dl-lightbox-img-wrap">
            <img 
              src="/screenshots/bb-panels.webp" 
              onerror="this.onerror=null; this.src='/manual/assets/dashboard-workspace-overview.png';"
              alt="Full Resolution Tavoryn Terminal Desktop" 
              class="dl-lightbox-img"
            />
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    // 1. Back to Terminal Button
    const backBtn = this.container.querySelector("#dlBackBtn");
    if (backBtn) {
      backBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.onBackToTerminal();
      });
    }

    // 2. Theme Toggle
    const themeBtn = this.container.querySelector("#dlThemeToggleBtn");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const isCurrentlyLight = document.documentElement.classList.contains("theme-light");
        if (isCurrentlyLight) {
          document.documentElement.classList.remove("theme-light");
          localStorage.setItem("tavoryn:theme", "dark");
        } else {
          document.documentElement.classList.add("theme-light");
          localStorage.setItem("tavoryn:theme", "light");
        }
        this.render();
      });
    }

    // 3. Installation Guide Tabs
    const tabBtns = this.container.querySelectorAll(".guide-tab-btn");
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const guide = btn.getAttribute("data-guide");
        if (guide) {
          this.activeGuideTab = guide;
          tabBtns.forEach((b) => b.classList.toggle("active", b === btn));
          const panels = this.container.querySelectorAll(".guide-panel");
          panels.forEach((p) => {
            p.classList.toggle("active", p.id === `guide-${guide}`);
          });
        }
      });
    });

    // 4. SHA-256 Click-to-Copy
    const checksumEls = this.container.querySelectorAll(".cs-code");
    checksumEls.forEach((el) => {
      el.addEventListener("click", () => {
        const text = el.textContent.trim();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text);
          const original = el.textContent;
          el.textContent = "COPIED TO CLIPBOARD!";
          setTimeout(() => {
            el.textContent = original;
          }, 2000);
        }
      });
    });

    // 5. Lightbox Trigger & Dismiss
    const previewTrigger = this.container.querySelector("#previewImgTrigger");
    const lightbox = this.container.querySelector("#dlLightbox");
    const lightboxClose = this.container.querySelector("#dlLightboxClose");
    const lightboxBackdrop = this.container.querySelector("#dlLightboxBackdrop");

    if (previewTrigger && lightbox) {
      previewTrigger.addEventListener("click", () => {
        lightbox.hidden = false;
        lightbox.classList.add("active");
        this.lightboxOpen = true;
      });
    }

    const closeLightbox = () => {
      if (lightbox) {
        lightbox.hidden = true;
        lightbox.classList.remove("active");
        this.lightboxOpen = false;
      }
    };

    if (lightboxClose) lightboxClose.addEventListener("click", closeLightbox);
    if (lightboxBackdrop) lightboxBackdrop.addEventListener("click", closeLightbox);

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.lightboxOpen) {
        closeLightbox();
      }
    });

    // 6. Smooth Scroll on Internal Anchor Links
    const anchorLinks = this.container.querySelectorAll('a[href^="#"]');
    anchorLinks.forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href");
        if (href && href.length > 1) {
          e.preventDefault();
          const target = this.container.querySelector(href);
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      });
    });
  }
}
