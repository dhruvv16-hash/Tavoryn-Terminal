// Tavoryn Terminal — Dedicated Login Front Page Controller
// Renders the full modern fintech landing & login front page when unauthenticated.

import {
  signInWithGoogle,
  signInWithGitHub,
  sendPhoneOtp,
  verifyPhoneOtp,
  signOutUser,
  onAuthChanged,
  getCurrentUser,
  mockSignIn,
} from "./auth.js";
import { startTour } from "./tour.js";

export class LoginPage {
  constructor() {
    this.container = document.getElementById("loginPageView") || this.createContainer();
    this.phoneStep = "input"; // "input" | "code"
    this.phoneNumber = "";
    this.loading = false;
    this.errorMsg = "";

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
    // Listen to authentication changes
    onAuthChanged((user) => {
      if (user) {
        this.hide();
        // If first-time user, trigger the onboarding tour
        if (user.isNewUser && !localStorage.getItem("tavoryn:tour_completed")) {
          setTimeout(() => startTour(false), 500);
        }
      } else {
        this.show();
      }
    });

    const user = getCurrentUser();
    if (!user) {
      this.show();
    } else {
      this.hide();
    }
  }

  show() {
    this.container.hidden = false;
    const top = document.querySelector("header.top");
    const grid = document.getElementById("grid");
    const keys = document.getElementById("keys");
    const tape = document.querySelector("footer.tape");

    if (top) top.style.display = "none";
    if (grid) grid.style.display = "none";
    if (keys) keys.style.display = "none";
    if (tape) tape.style.display = "none";

    this.render();
  }

  hide() {
    this.container.hidden = true;
    const top = document.querySelector("header.top");
    const grid = document.getElementById("grid");
    const keys = document.getElementById("keys");
    const tape = document.querySelector("footer.tape");

    if (top) top.style.display = "";
    if (grid) grid.style.display = "";
    if (keys) keys.style.display = "";
    if (tape) tape.style.display = "";
  }

  render() {
    this.container.innerHTML = `
      <div class="login-bg-glow"></div>

      <!-- Navigation Bar -->
      <header class="login-nav">
        <a href="/" class="login-logo">
          <span class="login-logo-brand">TAVORYN</span>
          <span class="login-logo-sub">TERMINAL</span>
        </a>
        <div class="login-nav-links">
          <div class="login-status-pill">
            <span class="login-pulse-dot"></span>
            <span>SYSTEM ACTIVE</span>
          </div>
          <a href="/user-manual" class="login-nav-link">Documentation</a>
          <button class="login-btn-social login-btn-guest-nav" data-action="guest" style="height:32px;padding:0 12px;font-size:12px;width:auto;">
            Demo Mode
          </button>
        </div>
      </header>

      <!-- Main Split Screen -->
      <main class="login-container">
        <!-- Left Hero Showcase -->
        <section class="login-hero">
          <div class="login-badge">INSTITUTIONAL QUANT WORKSPACE</div>
          <h1 class="login-headline">
            Professional Financial Terminal. <span>Zero Latency.</span>
          </h1>
          <p class="login-desc">
            Next-generation financial research workstation engineered for equity analysts, macro economists, and quantitative traders. Bloomberg-grade function codes with modern web speeds.
          </p>

          <div class="login-features-grid">
            <div class="login-feat-item">
              <span class="login-feat-icon">⚡</span>
              <span>Real-Time Equities &amp; FX Feeds</span>
            </div>
            <div class="login-feat-item">
              <span class="login-feat-icon">📈</span>
              <span>Yield Curves &amp; Macro Rates</span>
            </div>
            <div class="login-feat-item">
              <span class="login-feat-icon">📊</span>
              <span>Interactive DCF Valuation</span>
            </div>
            <div class="login-feat-item">
              <span class="login-feat-icon">🛡️</span>
              <span>Stress Testing &amp; Scenario Lab</span>
            </div>
          </div>

          <div class="login-quote">
            "Engineered to replicate institutional market depth with zero configuration."
          </div>
        </section>

        <!-- Right Login Card -->
        <section class="login-card-wrapper">
          <div class="login-card">
            <div class="login-card-header">
              <h2 class="login-card-title">Sign In to Terminal</h2>
              <p class="login-card-sub">Select your authentication method to enter workspace</p>
            </div>

            ${this.errorMsg ? `<div class="auth-error-banner" style="border-radius:4px;padding:8px 12px;">▲ ${this.errorMsg}</div>` : ""}

            <!-- OAuth Buttons Stack -->
            <div class="login-oauth-stack">
              <button class="login-btn-social login-btn-google ${this.loading ? "disabled" : ""}" data-action="google">
                <span class="login-social-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z"/>
                    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
                    <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.2c0 2.8.7 5.5 1.9 7.9l3.7-2.9z"/>
                    <path fill="#34A853" d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 16.9C3.7 20.6 7.5 23.5 12 23.5z"/>
                  </svg>
                </span>
                <span>Continue with Google / Gmail</span>
              </button>

              <button class="login-btn-social login-btn-github ${this.loading ? "disabled" : ""}" data-action="github">
                <span class="login-social-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                  </svg>
                </span>
                <span>Continue with GitHub</span>
              </button>
            </div>

            <!-- Divider -->
            <div class="login-divider">
              <span>OR MOBILE PHONE OTP</span>
            </div>

            <!-- Phone SMS OTP Form -->
            ${this.renderPhoneForm()}

            <!-- Guest Demo Link -->
            <div class="login-guest-box">
              <button class="login-btn-guest" data-action="guest">
                Continue as Guest / Demo Trader →
              </button>
            </div>

            <div class="login-security-tag">
              🔒 256-Bit SSL Enclave · Zero Tracking Telemetry
            </div>
          </div>
        </section>
      </main>
    `;

    this.bindEvents();
  }

  renderPhoneForm() {
    if (this.phoneStep === "input") {
      return `
        <div class="login-phone-form">
          <div class="login-input-row">
            <input 
              id="frontPhoneInput" 
              type="tel" 
              class="login-input" 
              placeholder="+1 212 555 0199 (with country code)" 
              value="${this.phoneNumber}"
              autocomplete="tel"
            />
            <button class="login-btn-primary" data-action="send-otp">
              ${this.loading ? "SENDING..." : "SEND OTP"}
            </button>
          </div>
          <div class="login-phone-hint">
            Enter your mobile number to receive a 6-digit SMS verification code.
          </div>
        </div>
      `;
    }

    return `
      <div class="login-phone-form">
        <div class="login-input-row">
          <input 
            id="frontOtpInput" 
            type="text" 
            class="login-input login-otp-input" 
            placeholder="123456" 
            maxlength="6"
            autocomplete="one-time-code"
          />
          <button class="login-btn-primary" data-action="verify-otp">
            ${this.loading ? "VERIFYING..." : "VERIFY & ENTER"}
          </button>
        </div>
        <div class="login-phone-hint">
          Verification code sent to <b>${this.phoneNumber}</b> · 
          <a href="#" class="auth-link" data-action="change-phone">Change Number</a>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Google
    const googleBtn = this.container.querySelector('[data-action="google"]');
    if (googleBtn) {
      googleBtn.addEventListener("click", async () => {
        this.setLoading(true);
        try {
          await signInWithGoogle();
        } catch (err) {
          this.setError(err.message || "Google authentication failed");
        } finally {
          this.setLoading(false);
        }
      });
    }

    // GitHub
    const githubBtn = this.container.querySelector('[data-action="github"]');
    if (githubBtn) {
      githubBtn.addEventListener("click", async () => {
        this.setLoading(true);
        try {
          await signInWithGitHub();
        } catch (err) {
          this.setError(err.message || "GitHub authentication failed");
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
          this.setError(err.message || "Failed to send SMS OTP.");
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
        if (!val || val.length < 4) {
          this.setError("Please enter the 6-digit verification code.");
          return;
        }
        this.setLoading(true);
        try {
          await verifyPhoneOtp(val);
        } catch (err) {
          this.setError(err.message || "Invalid verification code.");
        } finally {
          this.setLoading(false);
        }
      });
    }

    // Change phone
    const changePhoneLink = this.container.querySelector('[data-action="change-phone"]');
    if (changePhoneLink) {
      changePhoneLink.addEventListener("click", (e) => {
        e.preventDefault();
        this.phoneStep = "input";
        this.errorMsg = "";
        this.render();
      });
    }

    // Guest Demo
    this.container.querySelectorAll('[data-action="guest"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        mockSignIn("Demo Trader", "trader@tavoryn.terminal", "demo");
      });
    });
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
