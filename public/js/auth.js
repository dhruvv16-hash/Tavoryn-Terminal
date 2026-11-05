// Tavoryn Terminal — Multi-Provider Authentication Engine
// Zero-dependency modular auth supporting Google/Gmail, GitHub, and Phone SMS OTP.

import { FIREBASE_CONFIG } from "./firebase-config.js";

const FIREBASE_APP_CDN = "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
const FIREBASE_AUTH_CDN = "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Active Firebase instance cache
let fbApp = null;
let fbAuth = null;
let fbRecaptchaVerifier = null;
let fbConfirmationResult = null;
let authListener = null;
let currentUser = null;

// Default client configuration (can be overridden by window.FIREBASE_CONFIG or /api/auth/config)
export const DEFAULT_CONFIG = FIREBASE_CONFIG;

export function getStoredFirebaseConfig() {
  try {
    const raw = localStorage.getItem("tavoryn:firebase_config");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveStoredFirebaseConfig(config) {
  try {
    if (!config) localStorage.removeItem("tavoryn:firebase_config");
    else localStorage.setItem("tavoryn:firebase_config", JSON.stringify(config));
  } catch {}
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem("tavoryn:auth_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveStoredUser(user) {
  try {
    if (!user) {
      localStorage.removeItem("tavoryn:auth_user");
    } else {
      localStorage.setItem("tavoryn:auth_user", JSON.stringify(user));
    }
  } catch {}
}

/**
 * Initializes Firebase Web SDK dynamically from CDN without adding npm packages.
 */
export async function initFirebase(config = null) {
  if (fbAuth) return fbAuth;

  const cfg = config || (DEFAULT_CONFIG?.apiKey ? DEFAULT_CONFIG : getStoredFirebaseConfig() || DEFAULT_CONFIG);
  if (!cfg.apiKey || !cfg.projectId) {
    // Config not yet populated: use local authenticated mock session for offline/testing
    return null;
  }

  try {
    const { initializeApp, getApps } = await import(FIREBASE_APP_CDN);
    const { getAuth, onAuthStateChanged, getRedirectResult } = await import(FIREBASE_AUTH_CDN);

    fbApp = getApps().length ? getApps()[0] : initializeApp(cfg);
    fbAuth = getAuth(fbApp);

    // Check if returning from redirect sign-in
    getRedirectResult(fbAuth).catch(() => {});

    onAuthStateChanged(fbAuth, (user) => {
      if (user) {
        currentUser = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email?.split("@")[0] || user.phoneNumber || "TRADER",
          phoneNumber: user.phoneNumber,
          photoURL: user.photoURL,
          provider: user.providerData?.[0]?.providerId || "firebase",
          isNewUser: user.metadata?.creationTime === user.metadata?.lastSignInTime,
        };
        saveStoredUser(currentUser);
      } else {
        currentUser = null;
        saveStoredUser(null);
      }
      if (authListener) authListener(currentUser);
    });

    return fbAuth;
  } catch (err) {
    console.warn("[Auth] Firebase dynamic import error:", err);
    return null;
  }
}

/**
 * Sign In with Google / Gmail Popup (with automatic redirect fallback)
 */
export async function signInWithGoogle(forceRedirect = false) {
  const auth = await initFirebase();
  if (!auth) {
    // Fallback Mock Sign-In for offline / local preview
    return mockSignIn("Google Trader", "trader@gmail.com", "google.com");
  }

  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import(FIREBASE_AUTH_CDN);
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");

  if (forceRedirect) {
    return await signInWithRedirect(auth, provider);
  }

  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err) {
    console.warn("[Auth] Popup error:", err.code, err.message);
    if (
      err.code === "auth/popup-blocked" ||
      err.code === "auth/popup-closed-by-user" ||
      err.code === "auth/cancelled-popup-request" ||
      err.message?.includes("Cross-Origin-Opener-Policy")
    ) {
      console.log("[Auth] Falling back to signInWithRedirect...");
      return await signInWithRedirect(auth, provider);
    }
    throw err;
  }
}

/**
 * Sign In with GitHub OAuth Popup (with automatic redirect fallback)
 */
export async function signInWithGitHub(forceRedirect = false) {
  const auth = await initFirebase();
  if (!auth) {
    // Fallback Mock Sign-In for offline / local preview
    return mockSignIn("GitHub Quant", "quant@github.com", "github.com");
  }

  const { GithubAuthProvider, signInWithPopup, signInWithRedirect } = await import(FIREBASE_AUTH_CDN);
  const provider = new GithubAuthProvider();
  provider.addScope("read:user");
  provider.addScope("user:email");

  if (forceRedirect) {
    return await signInWithRedirect(auth, provider);
  }

  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err) {
    if (
      err.code === "auth/popup-blocked" ||
      err.code === "auth/popup-closed-by-user" ||
      err.code === "auth/cancelled-popup-request" ||
      err.message?.includes("Cross-Origin-Opener-Policy")
    ) {
      return await signInWithRedirect(auth, provider);
    }
    throw err;
  }
}

/**
 * Sends Phone SMS OTP code using Firebase reCAPTCHA
 */
export async function sendPhoneOtp(phoneNumber, containerId = "recaptcha-container") {
  const auth = await initFirebase();
  if (!auth) {
    // Mock simulation
    return { mock: true, verificationId: "mock-123456" };
  }

  const { RecaptchaVerifier, signInWithPhoneNumber } = await import(FIREBASE_AUTH_CDN);

  if (!fbRecaptchaVerifier) {
    fbRecaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: "invisible",
      callback: () => {},
    });
  }

  fbConfirmationResult = await signInWithPhoneNumber(auth, phoneNumber, fbRecaptchaVerifier);
  return fbConfirmationResult;
}

/**
 * Verifies SMS OTP code
 */
export async function verifyPhoneOtp(code) {
  if (fbConfirmationResult) {
    const result = await fbConfirmationResult.confirm(code);
    return result.user;
  }

  // Fallback Mock verification
  return mockSignIn("SMS Verified Trader", "+1 (555) 019-2834", "phone");
}

/**
 * Mock sign-in for development & local environment
 */
export function mockSignIn(name, contact, provider = "local") {
  const user = {
    uid: "mock-" + Date.now(),
    email: contact.includes("@") ? contact : null,
    phoneNumber: contact.startsWith("+") ? contact : null,
    displayName: name,
    photoURL: null,
    provider,
    isNewUser: !localStorage.getItem("tavoryn:has_logged_in"),
  };
  localStorage.setItem("tavoryn:has_logged_in", "1");
  currentUser = user;
  saveStoredUser(user);
  if (authListener) authListener(user);
  return user;
}

/**
 * Sign Out
 */
export async function signOutUser() {
  if (fbAuth) {
    try {
      const { signOut } = await import(FIREBASE_AUTH_CDN);
      await signOut(fbAuth);
    } catch {}
  }
  currentUser = null;
  saveStoredUser(null);
  if (authListener) authListener(null);
}

/**
 * Registers an auth state listener callback
 */
export function onAuthChanged(callback) {
  authListener = callback;
  const stored = getStoredUser();
  if (stored) {
    currentUser = stored;
    callback(stored);
  }
}

export function getCurrentUser() {
  return currentUser || getStoredUser();
}
