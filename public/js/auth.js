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
let currentUser = null;
const authListeners = [];

function notifyAuthListeners(user) {
  for (const cb of authListeners) {
    try {
      cb(user);
    } catch (err) {
      console.warn("[Auth] Listener error:", err);
    }
  }
}

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
      notifyAuthListeners(currentUser);
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
    throw new Error("Authentication service is currently unavailable. Please verify your connection.");
  }

  const { GoogleAuthProvider, signInWithPopup, signInWithRedirect } = await import(FIREBASE_AUTH_CDN);
  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  provider.setCustomParameters({
    prompt: "select_account consent",
  });

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
      err.message?.includes("Cross-Origin-Opener-Policy")
    ) {
      console.log("[Auth] Falling back to signInWithRedirect...");
      return await signInWithRedirect(auth, provider);
    }
    if (
      err.code === "auth/popup-closed-by-user" ||
      err.code === "auth/cancelled-popup-request"
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * Sign In with Corporate Email & Password using Firebase Authentication
 */
export async function signInWithCorporateEmail(email, password) {
  const auth = await initFirebase();
  if (!auth) {
    throw new Error("Authentication service is currently unavailable. Please verify your connection.");
  }

  const { signInWithEmailAndPassword } = await import(FIREBASE_AUTH_CDN);
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
}

/**
 * Sign Up with Corporate Email & Password using Firebase Authentication
 */
export async function signUpWithCorporateEmail(name, email, password) {
  const auth = await initFirebase();
  if (!auth) {
    throw new Error("Authentication service is currently unavailable. Please verify your connection.");
  }

  const { createUserWithEmailAndPassword, updateProfile } = await import(FIREBASE_AUTH_CDN);
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  
  if (name && result.user) {
    try {
      await updateProfile(result.user, { displayName: name.trim() });
    } catch {}
  }

  return result.user;
}

/**
 * Sign In with GitHub OAuth Popup (with automatic redirect fallback)
 */
export async function signInWithGitHub(forceRedirect = false) {
  const auth = await initFirebase();
  if (!auth) {
    throw new Error("Authentication service is currently unavailable. Please verify your connection.");
  }

  const { GithubAuthProvider, signInWithPopup, signInWithRedirect } = await import(FIREBASE_AUTH_CDN);
  const provider = new GithubAuthProvider();
  provider.addScope("read:user");
  provider.addScope("user:email");
  provider.setCustomParameters({
    prompt: "consent",
  });

  if (forceRedirect) {
    return await signInWithRedirect(auth, provider);
  }

  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err) {
    if (
      err.code === "auth/popup-blocked" ||
      err.message?.includes("Cross-Origin-Opener-Policy")
    ) {
      return await signInWithRedirect(auth, provider);
    }
    if (
      err.code === "auth/popup-closed-by-user" ||
      err.code === "auth/cancelled-popup-request"
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * Sends Phone SMS OTP code using Firebase reCAPTCHA
 */
export async function sendPhoneOtp(phoneNumber, containerId = "recaptcha-container") {
  // Normalize phone number to strict E.164 format (+[country code][number], no spaces or formatting)
  let cleanPhone = String(phoneNumber || "").trim().replace(/[\s\(\)\-\.]/g, "");
  if (!cleanPhone.startsWith("+")) {
    cleanPhone = `+${cleanPhone}`;
  }

  const auth = await initFirebase();
  if (!auth) {
    throw new Error("Authentication service is currently unavailable. Please verify your connection.");
  }

  // Ensure reCAPTCHA container element exists in DOM
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    document.body.appendChild(container);
  }

  const { RecaptchaVerifier, signInWithPhoneNumber } = await import(FIREBASE_AUTH_CDN);

  // Reuse existing verifier if available, otherwise initialize once
  if (!fbRecaptchaVerifier) {
    container.innerHTML = "";
    fbRecaptchaVerifier = new RecaptchaVerifier(auth, container, {
      size: "invisible",
      callback: () => {},
    });
  }

  try {
    fbConfirmationResult = await signInWithPhoneNumber(auth, cleanPhone, fbRecaptchaVerifier);
    return fbConfirmationResult;
  } catch (err) {
    try {
      if (fbRecaptchaVerifier) fbRecaptchaVerifier.clear();
    } catch {}
    fbRecaptchaVerifier = null;
    container.innerHTML = "";
    throw err;
  }
}

/**
 * Verifies SMS OTP code
 */
export async function verifyPhoneOtp(code) {
  if (fbConfirmationResult) {
    const result = await fbConfirmationResult.confirm(code);
    return result.user;
  }

  throw new Error("No active phone verification session found. Please request a new verification code.");
}

/**
 * Sign Out
 */
export async function signOutUser() {
  const auth = fbAuth || (await initFirebase());
  if (auth) {
    try {
      const { signOut } = await import(FIREBASE_AUTH_CDN);
      await signOut(auth);
    } catch {}
  }
  currentUser = null;
  saveStoredUser(null);
  notifyAuthListeners(null);
}

/**
 * Registers an auth state listener callback
 */
export function onAuthChanged(callback) {
  authListeners.push(callback);
  const stored = getStoredUser();
  if (stored) {
    currentUser = stored;
    try {
      callback(stored);
    } catch {}
  }
  return () => {
    const idx = authListeners.indexOf(callback);
    if (idx >= 0) authListeners.splice(idx, 1);
  };
}

export function getCurrentUser() {
  return currentUser || getStoredUser();
}
