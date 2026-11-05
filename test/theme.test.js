import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

test('Theme Tokens: terminal.css preserves CRT amber and defines Daylight Titanium light mode', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'public', 'css', 'terminal.css'), 'utf8');
  // Dark CRT phosphor baseline
  assert.ok(css.includes('--amber: #ffa028'), 'Dark mode must preserve --amber: #ffa028');
  assert.ok(css.includes('--bg: #000000'), 'Dark mode must preserve --bg: #000000');
  
  // Daylight Titanium light mode
  assert.ok(css.includes('html.theme-light') || css.includes('.theme-light'), 'terminal.css must define .theme-light');
  assert.ok(css.includes('--bg: #eceff3'), 'Light mode must define soft off-white background');
  assert.ok(css.includes('--panel: #ffffff'), 'Light mode must define white panel background');
  assert.ok(css.includes('--amber: #b25900'), 'Light mode must define high-contrast amber token');
  assert.ok(css.includes('.theme-toggle-btn'), 'terminal.css must define .theme-toggle-btn');
});

test('Theme HTML Shell: index.html has pre-render zero-FOUC check and header toggle button', () => {
  const html = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');
  assert.ok(html.includes('tavoryn:theme'), 'index.html must check tavoryn:theme before DOM render');
  assert.ok(html.includes('theme-light'), 'index.html must add theme-light class when stored');
  assert.ok(html.includes('id="themeToggleBtn"'), 'index.html must include id="themeToggleBtn" in top header');
  assert.ok(html.includes('theme-toggle-btn'), 'theme toggle button must have theme-toggle-btn class');
});

test('Theme Landing Page: login-page.js and login-page.css provide light mode and toggle button', () => {
  const loginJs = fs.readFileSync(path.join(process.cwd(), 'public', 'js', 'login-page.js'), 'utf8');
  const loginCss = fs.readFileSync(path.join(process.cwd(), 'public', 'css', 'login-page.css'), 'utf8');
  assert.ok(loginJs.includes('loginThemeToggleBtn'), 'login-page.js must include loginThemeToggleBtn');
  assert.ok(loginCss.includes('.login-theme-btn'), 'login-page.css must style .login-theme-btn');
  assert.ok(loginCss.includes('html.theme-light .login-page'), 'login-page.css must define theme-light overrides');
});

test('Theme Terminal Functions: meta.js registers THEME, LIGHT, and DARK function codes', async () => {
  const { FUNCS } = await import('../public/js/fn/index.js');
  assert.ok(FUNCS.THEME, 'THEME command must be registered');
  assert.ok(FUNCS.LIGHT, 'LIGHT command must be registered');
  assert.ok(FUNCS.DARK, 'DARK command must be registered');
  assert.equal(typeof FUNCS.THEME.render, 'function');
  assert.equal(typeof FUNCS.LIGHT.render, 'function');
  assert.equal(typeof FUNCS.DARK.render, 'function');
});

test('Safety: Zero npm dependencies and paper trading ledger remains byte-for-byte identical', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies || {}, {}, 'package.json dependencies must remain strictly empty');

  const ledgerPath = path.join(process.cwd(), 'data', 'paper-account.json');
  const bytes = fs.readFileSync(ledgerPath);
  assert.equal(bytes.length, 2386, 'paper-account.json length must be exactly 2,386 bytes');

  const hash = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
  assert.equal(hash, '8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D', 'paper-account.json SHA-256 hash must be identical');
});
