// Tavoryn Terminal — Institutional Authentication UI & User Profile Enclave
// Controls sovereign profile popovers, session status, and workspace access.

import {
  signInWithGoogle,
  signInWithGitHub,
  sendPhoneOtp,
  verifyPhoneOtp,
  signOutUser,
  onAuthChanged,
  getCurrentUser,
  mockSignIn,
  getStoredFirebaseConfig,
  saveStoredFirebaseConfig,
  initFirebase,
} from "./auth.js";
import { startTour } from "./tour.js";

export class AuthGate {
  constructor(container = document.getElementById("authGate")) {
    this.container = container || this.createContainer();
    this.userBtn = document.getElementById("userBtn");
    this.popover = document.getElementById("userProfilePopover") || this.createPopover();
    this.grid = document.getElementById("grid");
    this.activeTab = "oauth";
    this.phoneStep = "input";
    this.phoneNumber = "";
    this.loading = false;
    this.errorMsg = "";
    this.successMsg = "";

    const storedCfg = getStoredFirebaseConfig();
    this.cfgApiKey = storedCfg?.apiKey || "";
    this.cfgProjectId = storedCfg?.projectId || "tavoryn-terminal";
    this.cfgAppId = storedCfg?.appId || "";

    this.init();
  }

  createContainer() {
    const el = document.createElement("div");
    el.id = "authGate";
    el.className = "auth-gate";
    el.hidden = true;
    document.body.appendChild(el);
    return el;
  }

  createPopover() {
    const el = document.createElement("div");
    el.id = "userProfilePopover";
    el.className = "user-profile-popover";
    el.hidden = true;
    const header = document.querySelector("header.top");
    if (header) header.appendChild(el);
    else document.body.appendChild(el);
    return el;
  }

  init() {
    // Header Sign In / Profile button click
    if (this.userBtn) {
      this.userBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const user = getCurrentUser();
        if (user) {
          this.togglePopover();
        } else {
          this.showGate();
        }
      });
    }

    // Dismiss popover when clicking outside
    document.addEventListener("click", (e) => {
      if (
        this.popover &&
        !this.popover.hidden &&
        !this.popover.contains(e.target) &&
        e.target !== this.userBtn &&
        !this.userBtn?.contains(e.target)
      ) {
        this.hidePopover();
      }
    });

    // Dismiss popover on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.popover && !this.popover.hidden) {
        this.hidePopover();
      }
    });

    // Subscribe to auth state changes
    onAuthChanged((user) => {
      this.renderHeader(user);
      if (user) {
        this.hideGate();
        this.renderProfilePopover(user);
      } else {
        this.hidePopover();
        this.renderHeader(null);
      }
    });

    const user = getCurrentUser();
    this.renderHeader(user);
    if (user) {
      this.renderProfilePopover(user);
    }
  }

  togglePopover() {
    if (!this.popover) return;
    if (this.popover.hidden) {
      const user = getCurrentUser();
      if (user) {
        this.renderProfilePopover(user);
        this.popover.hidden = false;
      }
    } else {
      this.hidePopover();
    }
  }

  hidePopover() {
    if (this.popover) this.popover.hidden = true;
  }

  showGate() {
    const user = getCurrentUser();
    if (user) {
      this.togglePopover();
      return;
    }

    // Trigger modern full-page login gateway
    if (window.tavoryn?.loginPage) {
      window.tavoryn.loginPage.show();
    } else {
      const lp = document.getElementById("loginPageView");
      if (lp) lp.hidden = false;
    }
  }

  hideGate() {
    this.container.hidden = true;
    if (this.grid) {
      this.grid.style.filter = "none";
      this.grid.hidden = false;
    }
  }

  renderHeader(user) {
    if (!this.userBtn) return;
    if (user) {
      const name = (user.displayName || user.email?.split("@")[0] || user.phoneNumber || "TRADER").toUpperCase();
      this.userBtn.innerHTML = `<span class="auth-live-dot">●</span> <span>${name}</span> <span class="auth-caret">▾</span>`;
      this.userBtn.classList.add("logged-in");
      this.userBtn.title = `Institutional Session: ${name}. Click to view account enclave.`;
    } else {
      this.userBtn.innerHTML = `SIGN IN`;
      this.userBtn.classList.remove("logged-in");
      this.userBtn.title = "Terminal Access Control: Sign In";
    }
  }

  renderProfilePopover(user) {
    if (!this.popover || !user) return;

    const displayName = user.displayName || "Institutional Trader";
    const emailOrPhone = user.email || user.phoneNumber || "Verified Local Enclave";
    const provider = (user.provider || "oauth").toUpperCase();

    // Derive avatar initials
    let initials = "TR";
    if (user.displayName) {
      const parts = user.displayName.trim().split(/\s+/);
      initials = parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].slice(0, 2).toUpperCase();
    } else if (user.email) {
      initials = user.email.slice(0, 2).toUpperCase();
    }

    const isLight = document.documentElement.classList.contains("theme-light");

    this.popover.innerHTML = `
      <div class="user-popover-card">
        <div class="user-card-head">
          <div class="user-avatar">
            ${user.photoURL ? `<img src="${user.photoURL}" alt="${displayName}" referrerpolicy="no-referrer" />` : initials}
          </div>
          <div class="user-info">
            <div class="user-full-name" title="${displayName}">${displayName}</div>
            <div class="user-email-text" title="${emailOrPhone}">${emailOrPhone}</div>
            <div class="user-tier-badge">PRO QUANT // TIER 1</div>
          </div>
        </div>

        <div class="user-card-sep"></div>

        <div class="user-card-stats">
          <div class="user-stat-row">
            <span class="stat-label">Security Enclave</span>
            <span class="stat-val status-green">● PROTOCOL 77-B ACTIVE</span>
          </div>
          <div class="user-stat-row">
            <span class="stat-label">Auth Provider</span>
            <span class="stat-val">${provider}</span>
          </div>
          <div class="user-stat-row">
            <span class="stat-label">Workspace Theme</span>
            <span class="stat-val">${isLight ? "Daylight Titanium" : "CRT Obsidian"}</span>
          </div>
        </div>

        <div class="user-card-sep"></div>

        <div class="user-card-nav">
          <button type="button" class="user-nav-item" id="popoverThemeAction">
            <span>${isLight ? "☾" : "☀"}</span>
            <span>Switch to ${isLight ? "Dark CRT Mode" : "Daylight Mode"}</span>
          </button>
          <button type="button" class="user-nav-item" id="popoverTourAction">
            <span>🗺️</span>
            <span>Interactive Terminal Tour (TOUR)</span>
          </button>
          <a class="user-nav-item" href="/user-manual">
            <span>📖</span>
            <span>User Manual &amp; Function Matrix (HELP)</span>
          </a>
        </div>

        <div class="user-card-sep"></div>

        <button type="button" class="user-signout-btn" id="popoverSignOutAction">
          <span>⎋</span>
          <span>Sign Out of Terminal</span>
        </button>
      </div>
    `;

    // Bind Theme button
    const themeActionBtn = this.popover.querySelector("#popoverThemeAction");
    if (themeActionBtn) {
      themeActionBtn.addEventListener("click", () => {
        this.hidePopover();
        window.tavoryn?.toggleTheme?.();
      });
    }

    // Bind Tour button
    const tourBtn = this.popover.querySelector("#popoverTourAction");
    if (tourBtn) {
      tourBtn.addEventListener("click", () => {
        this.hidePopover();
        startTour(true);
      });
    }

    // Bind Sign Out button
    const signOutBtn = this.popover.querySelector("#popoverSignOutAction");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", async () => {
        this.hidePopover();
        await signOutUser();
        document.documentElement.classList.remove("authenticated");
        document.body.classList.remove("authenticated");

        if (window.tavoryn?.loginPage) {
          window.tavoryn.loginPage.show();
        } else {
          const lp = document.getElementById("loginPageView");
          if (lp) lp.hidden = false;
        }

        // Show terminal toast notification
        const toast = document.getElementById("toast");
        if (toast) {
          toast.textContent = "TERMINAL SESSION TERMINATED // USER SIGNED OUT";
          toast.hidden = false;
          setTimeout(() => {
            toast.hidden = true;
          }, 3000);
        }
      });
    }
  }

  render() {
    // Preserved for legacy contract
    this.container.innerHTML = `
      <div class="auth-backdrop"></div>
      <div class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        <div class="auth-header">
          <div class="auth-sys-tag">SECURITY CLEARANCE // PROTOCOL 77-B</div>
          <div class="auth-title" id="authTitle">TAVORYN TERMINAL // ACCESS CONTROL</div>
        </div>
      </div>
    `;
  }
}
