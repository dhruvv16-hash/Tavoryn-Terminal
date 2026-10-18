import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

process.env.QT_OFFLINE = '1';
let server, BASE;

before(async () => {
  const { start } = await import('../server.js');
  const s = await start(42000 + Math.floor(Math.random() * 1000));
  server = s.server;
  BASE = `http://127.0.0.1:${s.port}`;
});

after(() => server?.close());

async function fetchJson(url) {
  const res = await fetch(url);
  return { status: res.status, ok: res.ok, data: await res.json() };
}

async function fetchText(url) {
  const res = await fetch(url);
  return { status: res.status, ok: res.ok, text: await res.text() };
}

test('QA Shell: Landing page serves Tavoryn branding and required assets', async () => {
  const { ok, text } = await fetchText(`${BASE}/`);
  assert.equal(ok, true);
  assert.ok(text.includes('<title>Tavoryn Terminal</title>'), 'HTML title must be Tavoryn Terminal');
  assert.ok(text.includes('class="logo">TAVORYN</span>'), 'Logo must say TAVORYN');
  assert.ok(text.includes('class="sub">TERMINAL</span>'), 'Sub-logo must say TERMINAL');
  assert.ok(text.includes('/css/terminal.css'), 'Stylesheet must be linked');
  assert.ok(text.includes('/vendor/lightweight-charts.standalone.production.js'), 'Lightweight charts script linked');
});

test('QA Shell: terminal.css preserves CRT amber phosphor palette and terminal styles', async () => {
  const { ok, text } = await fetchText(`${BASE}/css/terminal.css`);
  assert.equal(ok, true);
  assert.ok(text.includes('--amber: #ffa028'), 'CRT amber primary token must exist');
  assert.ok(text.includes('--amber-2: #ffbf66'), 'CRT amber-2 token must exist');
  assert.ok(text.includes('--amber-dim: #a8661a'), 'CRT amber dim token must exist');
  assert.ok(text.includes('.panel'), 'Panel layout classes must be defined');
  assert.ok(text.includes('.grid'), 'Grid container must be defined');
});

test('QA Health API: Reports Tavoryn branding and operational subsystems', async () => {
  const { ok, data } = await fetchJson(`${BASE}/api/health`);
  assert.equal(ok, true);
  assert.equal(data.ok, true);
  assert.equal(data.app, 'tavoryn-terminal');
  assert.equal(data.legacyApp, 'amber-terminal');
  assert.equal(data.version, '1.0.0');
});

test('QA Market Data: Core market endpoints respond with valid schemas', async () => {
  const endpoints = [
    { url: `${BASE}/api/candles?symbol=BTCUSDT&tf=1h&limit=10`, key: 'candles' },
    { url: `${BASE}/api/quotes?symbols=BTCUSDT,ETHUSDT`, check: (d) => typeof d === 'object' && d !== null },
    { url: `${BASE}/api/fn/board?symbols=%5EGSPC,GC%3DF`, key: 'rows' },
    { url: `${BASE}/api/fn/top`, key: 'items' },
    { url: `${BASE}/api/fn/des?symbol=AAPL`, key: 'name' },
    { url: `${BASE}/api/fn/cf?symbol=AAPL`, key: 'filings' },
    { url: `${BASE}/api/fn/eco`, key: 'rows' },
    { url: `${BASE}/api/fn/gc`, key: 'tenors' },
    { url: `${BASE}/api/fn/btmm`, key: 'funding' },
    { url: `${BASE}/api/fn/wirp`, key: 'meetings' },
  ];

  for (const ep of endpoints) {
    const { ok, data } = await fetchJson(ep.url);
    assert.equal(ok, true, `Endpoint ${ep.url} failed`);
    if (ep.key) {
      assert.ok(data[ep.key] !== undefined, `Missing key ${ep.key} on ${ep.url}`);
    } else if (ep.check) {
      assert.ok(ep.check(data), `Check failed on ${ep.url}`);
    }
  }
});

test('QA Research & Backtest: Runs backtesting engine with quant checks', async () => {
  const { ok, data } = await fetchJson(`${BASE}/api/fn/btst?symbol=AAPL&strategy=1&tf=D`);
  assert.equal(ok, true);
  assert.ok(data.results, 'Backtest results must be computed');
  assert.ok(data.quantChecks.passed >= 3, `Expected at least 3 passed checks, got ${data.quantChecks.passed}`);
  assert.equal(data.quantChecks.of, 5);
  assert.ok(Array.isArray(data.quantChecks.checks));
});

test('QA Security & Execution Fencing: Mutation routes reject unauthorized requests', async () => {
  const res = await fetch(`${BASE}/api/trad/order`, {
    method: 'POST',
    body: JSON.stringify({ symbol: 'AAPL', qty: 10, side: 'BUY' })
  });
  // Without x-qt header, mutation must be rejected with 403 Forbidden
  assert.equal(res.status, 403, 'Must reject mutations lacking x-qt header');
});

test('QA Competitive Additions: DCF valuation engine responds with mathematical model', async () => {
  const { ok, data } = await fetchJson(`${BASE}/api/fn/dcf?symbol=AAPL`);
  assert.equal(ok, true);
  assert.equal(data.ticker, 'AAPL');
  assert.ok(typeof data.currentPrice === 'number');
  assert.ok(data.baseCase, 'Must compute baseCase');
  assert.ok(typeof data.baseCase.intrinsicValuePerShare === 'number');
  assert.ok(Array.isArray(data.baseCase.projections));
  assert.equal(data.baseCase.projections.length, 5);
  assert.ok(data.baseCase.sensitivity?.matrix);
  assert.ok(data.scenarios?.conservative);
  assert.ok(data.scenarios?.optimistic);
});

test('QA Competitive Additions: STRESS scenario engine evaluates empty and benchmark modes', async () => {
  // Test default empty portfolio handling
  const emptyRes = await fetchJson(`${BASE}/api/fn/stress`);
  assert.equal(emptyRes.ok, true);
  assert.ok(typeof emptyRes.data.portfolioValue === 'number');

  // Test benchmark simulation mode
  const benchRes = await fetchJson(`${BASE}/api/fn/stress?benchmark=1`);
  assert.equal(benchRes.ok, true);
  assert.equal(benchRes.data.isBenchmark, true);
  assert.ok(benchRes.data.portfolioValue > 0);
  assert.ok(Array.isArray(benchRes.data.historicalCrises));
  assert.equal(benchRes.data.historicalCrises.length, 8);
  assert.ok(Array.isArray(benchRes.data.macroShocks));
  assert.equal(benchRes.data.macroShocks.length, 4);
  assert.ok(Array.isArray(benchRes.data.vulnerabilities));
});

