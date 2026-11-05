// Tavoryn Terminal — CRT Amber Authentication UI & Security Gate
// Controls login barriers, OAuth popups, Phone SMS OTP verification, and user profiles.

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
    this.grid = document.getElementById("grid");
    this.activeTab = "oauth"; // "oauth" | "phone" | "config"
    this.phoneStep = "input"; // "input" | "code"
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
    document.body.appendChild(el);
    return el;
  }

  init() {
    // Header Sign In / Profile button click
    if (this.userBtn) {
      this.userBtn.addEventListener("click", () => {
        const user = getCurrentUser();
        if (user) {
          if (confirm(`Signed in as ${user.displayName || user.email || user.phoneNumber}.\nDo you want to log out?`)) {
            signOutUser();
          }
        } else {
          this.showGate();
        }
      });
    }

    // Subscribe to auth state changes
    onAuthChanged((user) => {
      this.renderHeader(user);
      if (user) {
        this.hideGate();
        // If first-time user, trigger tour
        if (user.isNewUser && !localStorage.getItem("tavoryn:tour_completed")) {
          setTimeout(() => startTour(false), 500);
        }
      } else {
        this.showGate();
      }
    });

    // Initial render
    this.render();
    const user = getCurrentUser();
    if (!user) {
      this.showGate();
    } else {
      this.hideGate();
      this.renderHeader(user);
    }
  }

  showGate() {
    const lp = document.getElementById("loginPageView");
    if (lp && !lp.hidden) return;
    this.container.hidden = false;
    if (this.grid) this.grid.style.filter = "blur(8px)";
    this.render();
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
      this.userBtn.innerHTML = `<span class="auth-live-dot">●</span> ${name} <span class="auth-logout-tag">LOGOUT</span>`;
      this.userBtn.classList.add("logged-in");
      this.userBtn.title = `Signed in as ${user.displayName || user.email || user.phoneNumber}. Click to sign out.`;
    } else {
      this.userBtn.innerHTML = `SIGN IN`;
      this.userBtn.classList.remove("logged-in");
      this.userBtn.title = "Terminal Access Control: Sign In";
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="auth-backdrop"></div>
      <div class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="authTitle">
        <div class="auth-header">
          <div class="auth-sys-tag">SECURITY CLEARANCE // PROTOCOL 77-B</div>
          <div class="auth-title" id="authTitle">TAVORYN TERMINAL // ACCESS CONTROL</div>
          <div class="auth-subtitle">Institutional Authentication Required to Enter Terminal Workspace</div>
        </div>

        ${this.errorMsg ? `<div class="auth-error-banner">▲ ${this.errorMsg}</div>` : ""}
        ${this.successMsg ? `<div class="auth-success-banner">✔ ${this.successMsg}</div>` : ""}

        <div class="auth-tabs">
          <button class="auth-tab ${this.activeTab === "oauth" ? "active" : ""}" data-tab="oauth">
            [1] GOOGLE / GITHUB
          </button>
          <button class="auth-tab ${this.activeTab === "phone" ? "active" : ""}" data-tab="phone">
            [2] MOBILE SMS OTP
          </button>
          <button class="auth-tab ${this.activeTab === "config" ? "active" : ""}" data-tab="config">
            [3] ⚙ PROJECT KEYS
          </button>
        </div>

        <div class="auth-body">
          ${
            this.activeTab === "oauth"
              ? this.renderOAuthSection()
              : this.activeTab === "phone"
                ? this.renderPhoneSection()
                : this.renderConfigSection()
          }
        </div>

        <div id="recaptcha-container"></div>

        <div class="auth-footer">
          <div class="auth-security-notice">
            <span class="auth-lock">🔒</span> 256-BIT SECURE IDENTITY ENCLAVE · ZERO TELEMETRY LEAKAGE
          </div>
          <div class="auth-dev-row">
            <button class="auth-btn-ghost auth-btn-mock" data-action="mock">
              [BYPASS / GUEST DEMO ACCESS]
            </button>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  renderOAuthSection() {
    return `
      <div class="auth-methods-stack">
        <button class="auth-btn auth-btn-google ${this.loading ? "disabled" : ""}" data-action="google">
          <span class="auth-btn-icon">G</span>
          <span class="auth-btn-text">Sign In with Google / Gmail</span>
          <span class="auth-btn-kbd">GO</span>
        </button>

        <button class="auth-btn auth-btn-github ${this.loading ? "disabled" : ""}" data-action="github">
          <span class="auth-btn-icon">🐙</span>
          <span class="auth-btn-text">Sign In with GitHub</span>
          <span class="auth-btn-kbd">GH</span>
        </button>
      </div>
    `;
  }

  renderPhoneSection() {
    if (this.phoneStep === "input") {
      return `
        <div class="auth-phone-form">
          <label class="auth-label" for="phoneInput">ENTER MOBILE PHONE NUMBER (WITH COUNTRY CODE):</label>
          <div class="auth-input-group">
            <input 
              id="phoneInput" 
              type="tel" 
              class="auth-input" 
              placeholder="+1 212 555 0199" 
              value="${this.phoneNumber}"
              autocomplete="tel"
            />
            <button class="auth-btn auth-btn-action" data-action="send-otp">
              ${this.loading ? "SENDING..." : "SEND CODE"}
            </button>
          </div>
          <div class="auth-hint">A 6-digit cryptographic verification code will be sent to your device via SMS.</div>
        </div>
      `;
    }

    return `
      <div class="auth-phone-form">
        <label class="auth-label" for="otpInput">ENTER 6-DIGIT SMS VERIFICATION CODE:</label>
        <div class="auth-input-group">
          <input 
            id="otpInput" 
            type="text" 
            class="auth-input auth-otp-input" 
            placeholder="123456" 
            maxlength="6"
            autocomplete="one-time-code"
          />
          <button class="auth-btn auth-btn-action" data-action="verify-otp">
            ${this.loading ? "VERIFYING..." : "VERIFY & ENTER"}
          </button>
        </div>
        <div class="auth-hint">
          Sent to <b>${this.phoneNumber}</b> · 
          <a href="#" class="auth-link" data-action="change-phone">Change Number</a>
        </div>
      </div>
    `;
  }

  renderConfigSection() {
    return `
      <div class="auth-phone-form">
        <label class="auth-label" for="cfgApiKey">FIREBASE WEB API KEY (FROM YOUR FIREBASE CONSOLE):</label>
        <input 
          id="cfgApiKey" 
          type="text" 
          class="auth-input" 
          placeholder="AIzaSy..." 
          value="${this.cfgApiKey}"
          style="margin-bottom: 8px;"
        />
        <label class="auth-label" for="cfgProjectId">PROJECT ID:</label>
        <input 
          id="cfgProjectId" 
          type="text" 
          class="auth-input" 
          placeholder="tavoryn-terminal" 
          value="${this.cfgProjectId}"
          style="margin-bottom: 8px;"
        />
        <label class="auth-label" for="cfgAppId">APP ID (OPTIONAL):</label>
        <input 
          id="cfgAppId" 
          type="text" 
          class="auth-input" 
          placeholder="1:123456789:web:..." 
          value="${this.cfgAppId}"
          style="margin-bottom: 12px;"
        />
        <button class="auth-btn auth-btn-action" data-action="save-config" style="width: 100%;">
          ${this.loading ? "CONNECTING..." : "SAVE & CONNECT LIVE FIREBASE"}
        </button>
        <div class="auth-hint">
          Keys are stored securely in your browser's local sandbox enclave.
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Tab switching
    this.container.querySelectorAll(".auth-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.activeTab = btn.dataset.tab;
        this.errorMsg = "";
        this.render();
      });
    });

    // Actions
    const googleBtn = this.container.querySelector('[data-action="google"]');
    if (googleBtn) {
      googleBtn.addEventListener("click", async () => {
        this.setLoading(true);
        try {
          await signInWithGoogle();
        } catch (err) {
          this.setError(err.message || "Google Authentication Failed");
        } finally {
          this.setLoading(false);
        }
      });
    }

    const githubBtn = this.container.querySelector('[data-action="github"]');
    if (githubBtn) {
      githubBtn.addEventListener("click", async () => {
        this.setLoading(true);
        try {
          await signInWithGitHub();
        } catch (err) {
          this.setError(err.message || "GitHub Authentication Failed");
        } finally {
          this.setLoading(false);
        }
      });
    }

    const sendOtpBtn = this.container.querySelector('[data-action="send-otp"]');
    if (sendOtpBtn) {
      sendOtpBtn.addEventListener("click", async () => {
        const inp = this.container.querySelector("#phoneInput");
        const val = (inp?.value || "").trim();
        if (!val || val.length < 7) {
          this.setError("Please enter a valid international mobile number including country code (+1, +44, +91...)");
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
          this.setError(err.message || "Failed to send SMS OTP. Please check number format.");
        } finally {
          this.setLoading(false);
        }
      });
    }

    const verifyOtpBtn = this.container.querySelector('[data-action="verify-otp"]');
    if (verifyOtpBtn) {
      verifyOtpBtn.addEventListener("click", async () => {
        const inp = this.container.querySelector("#otpInput");
        const val = (inp?.value || "").trim();
        if (!val || val.length < 4) {
          this.setError("Please enter the verification code sent via SMS.");
          return;
        }
        this.setLoading(true);
        try {
          await verifyPhoneOtp(val);
        } catch (err) {
          this.setError(err.message || "Invalid or expired verification code.");
        } finally {
          this.setLoading(false);
        }
      });
    }

    const changePhoneLink = this.container.querySelector('[data-action="change-phone"]');
    if (changePhoneLink) {
      changePhoneLink.addEventListener("click", (e) => {
        e.preventDefault();
        this.phoneStep = "input";
        this.errorMsg = "";
        this.render();
      });
    }

    const saveConfigBtn = this.container.querySelector('[data-action="save-config"]');
    if (saveConfigBtn) {
      saveConfigBtn.addEventListener("click", async () => {
        const apiKey = (this.container.querySelector("#cfgApiKey")?.value || "").trim();
        const projectId = (this.container.querySelector("#cfgProjectId")?.value || "").trim() || "tavoryn-terminal";
        const appId = (this.container.querySelector("#cfgAppId")?.value || "").trim();

        if (!apiKey) {
          this.setError("Please enter your Web API Key from the Firebase Console.");
          return;
        }

        this.cfgApiKey = apiKey;
        this.cfgProjectId = projectId;
        this.cfgAppId = appId;

        const cfg = {
          apiKey,
          authDomain: `${projectId}.firebaseapp.com`,
          projectId,
          storageBucket: `${projectId}.appspot.com`,
          messagingSenderId: "",
          appId,
        };

        saveStoredFirebaseConfig(cfg);
        this.setLoading(true);
        try {
          await initFirebase(cfg);
          this.successMsg = `Connected to Firebase project "${projectId}" successfully!`;
          this.errorMsg = "";
          this.activeTab = "oauth";
          this.render();
        } catch (err) {
          this.setError("Failed to initialize Firebase with provided keys: " + err.message);
        } finally {
          this.setLoading(false);
        }
      });
    }

    const mockBtn = this.container.querySelector('[data-action="mock"]');
    if (mockBtn) {
      mockBtn.addEventListener("click", () => {
        mockSignIn("Guest Trader", "guest@tavoryn.terminal", "demo");
      });
    }
  }

  setLoading(val) {
    this.loading = val;
    this.render();
  }

  setError(msg) {
    this.errorMsg = msg;
    this.render();
  }
}
