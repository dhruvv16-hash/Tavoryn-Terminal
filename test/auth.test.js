import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

test('Auth Module: Exports all required authentication methods for Google, GitHub, and Phone', async () => {
  const auth = await import('../public/js/auth.js');
  assert.equal(typeof auth.signInWithGoogle, 'function', 'Must export signInWithGoogle');
  assert.equal(typeof auth.signInWithGitHub, 'function', 'Must export signInWithGitHub');
  assert.equal(typeof auth.sendPhoneOtp, 'function', 'Must export sendPhoneOtp');
  assert.equal(typeof auth.verifyPhoneOtp, 'function', 'Must export verifyPhoneOtp');
  assert.equal(typeof auth.signOutUser, 'function', 'Must export signOutUser');
  assert.equal(typeof auth.getCurrentUser, 'function', 'Must export getCurrentUser');
  assert.equal(typeof auth.onAuthChanged, 'function', 'Must export onAuthChanged');
});

test('Auth UI: AuthGate class is defined and exported in auth-ui.js', async () => {
  const ui = await import('../public/js/auth-ui.js');
  assert.equal(typeof ui.AuthGate, 'function', 'AuthGate must be a constructible class');
  const lp = await import('../public/js/login-page.js');
  assert.equal(typeof lp.LoginPage, 'function', 'LoginPage must be a constructible class');
});

test('Auth Shell Integration: index.html links auth.css and includes authGate container', () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('/css/auth.css'), 'index.html must link /css/auth.css');
  assert.ok(indexHtml.includes('/css/login-page.css'), 'index.html must link /css/login-page.css');
  assert.ok(indexHtml.includes('id="userBtn"'), 'index.html must include id="userBtn" in header');
  assert.ok(indexHtml.includes('id="authGate"'), 'index.html must include id="authGate" container');
  assert.ok(indexHtml.includes('id="loginPageView"'), 'index.html must include id="loginPageView" container');
});

test('Firebase Config: Verified credentials for tavoryn-terminal are linked', async () => {
  const { FIREBASE_CONFIG } = await import('../public/js/firebase-config.js');
  assert.equal(FIREBASE_CONFIG.projectId, 'tavoryn-terminal');
  assert.equal(FIREBASE_CONFIG.apiKey, 'AIzaSyC6rqfOcE8t9cQ1QFWcGcCQLNbEWbXhZc8');
  assert.ok(FIREBASE_CONFIG.appId.includes('874751098568'));
});

test('Auth Function Codes: LOGIN, AUTH, and USER are registered terminal commands', async () => {
  const { FUNCS } = await import('../public/js/fn/index.js');
  assert.ok(FUNCS.LOGIN, 'LOGIN command must be registered');
  assert.ok(FUNCS.AUTH, 'AUTH command must be registered');
  assert.ok(FUNCS.USER, 'USER command must be registered');
  assert.equal(typeof FUNCS.LOGIN.render, 'function');
  assert.equal(typeof FUNCS.USER.render, 'function');
});

test('Auth Styles: auth.css defines CRT amber login modal and phone inputs', () => {
  const cssPath = path.join(process.cwd(), 'public', 'css', 'auth.css');
  assert.ok(fs.existsSync(cssPath), 'public/css/auth.css must exist');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.ok(css.includes('.auth-gate'), 'Must style .auth-gate');
  assert.ok(css.includes('.auth-modal'), 'Must style .auth-modal');
  assert.ok(css.includes('.auth-btn-google'), 'Must style .auth-btn-google');
  assert.ok(css.includes('.auth-btn-github'), 'Must style .auth-btn-github');
  assert.ok(css.includes('.auth-phone-form'), 'Must style phone form');
  assert.ok(css.includes('--amber'), 'Must use amber phosphor styling tokens');
});

test('Safety: Zero npm dependencies and paper trading ledger remains byte-for-byte identical', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies || {}, {}, 'Dependencies must remain empty (zero runtime npm dependencies)');

  const ledgerPath = path.join(process.cwd(), 'data', 'paper-account.json');
  assert.ok(fs.existsSync(ledgerPath), 'data/paper-account.json must exist');
  const buf = fs.readFileSync(ledgerPath);
  assert.equal(buf.length, 2386, 'Ledger size must remain exactly 2,386 bytes');
  const hash = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
  assert.equal(
    hash,
    '8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D',
    'Ledger SHA-256 must match baseline exactly',
  );
});
