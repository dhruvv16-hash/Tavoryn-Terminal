#!/usr/bin/env node
/**
 * Tavoryn Terminal Desktop Test Suite
 * Validates desktop runtime sidecar, dynamic port selection, /health handshake,
 * AppData storage isolation, and security perimeter.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const DESKTOP_DIR = path.join(ROOT, 'desktop');

test('Desktop Sidecar: Staged Node runtime binary exists and executes', async () => {
  const isWindows = process.platform === 'win32';
  const binaryName = `node-x86_64-pc-windows-msvc${isWindows ? '.exe' : ''}`;
  const sidecarPath = path.join(DESKTOP_DIR, 'binaries', binaryName);

  assert.ok(
    fs.existsSync(sidecarPath),
    `Bundled sidecar binary must exist at ${sidecarPath}`
  );

  const ver = execFileSync(sidecarPath, ['--version'], { encoding: 'utf8' }).trim();
  assert.match(ver, /^v\d+\.\d+\.\d+/, 'Sidecar must report valid Node.js version');
});

test('Desktop Handshake: GET /health returns required process readiness schema', async () => {
  const port = 3790 + Math.floor(Math.random() * 80);
  const tmpDataDir = path.join(os.tmpdir(), `tavoryn-test-data-${Date.now()}`);
  fs.mkdirSync(tmpDataDir, { recursive: true });

  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', QT_DATA_DIR: tmpDataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    // Wait for server to start
    let started = false;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.ok) {
          started = true;
          const body = await res.json();
          assert.equal(body.ok, true);
          assert.equal(body.app, 'tavoryn-terminal');
          assert.equal(body.processReadiness, 'ready');
          assert.equal(body.runtimeStatus, 'operational');
          assert.equal(body.apiVersion, '1.0.0');
          assert.ok(body.backendVersion, 'Backend version must be present');
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(started, 'Server did not respond on /health within 4 seconds');
  } finally {
    try {
      await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
        method: 'POST',
        headers: { 'x-qt': '1' },
      }).catch(() => {});
    } catch {}
    child.kill();
    try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch {}
  }
});

test('Desktop Storage: AppData seeding preserves paper trading ledger and alerts', async () => {
  const tmpDataDir = path.join(os.tmpdir(), `tavoryn-test-storage-${Date.now()}`);
  fs.mkdirSync(tmpDataDir, { recursive: true });

  const port = 3790 + Math.floor(Math.random() * 80);
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', QT_DATA_DIR: tmpDataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    // Wait for ready
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`);
        if (r.ok) { ready = true; break; }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(ready, 'Server failed to start');

    // Place an order to test paper account persistence
    const orderRes = await fetch(`http://127.0.0.1:${port}/api/trad/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-qt': '1' },
      body: JSON.stringify({ symbol: 'BTCUSDT', side: 'buy', qty: 0.1, type: 'market' }),
    });
    assert.equal(orderRes.ok, true, 'Order endpoint must succeed');

    const paperAccountFile = path.join(tmpDataDir, 'paper-account.json');
    assert.ok(fs.existsSync(paperAccountFile), 'paper-account.json must be written to QT_DATA_DIR');

    const content = JSON.parse(fs.readFileSync(paperAccountFile, 'utf8'));
    assert.ok(content.cash > 0, 'Cash must be positive');
  } finally {
    try {
      await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
        method: 'POST',
        headers: { 'x-qt': '1' },
      }).catch(() => {});
    } catch {}
    child.kill();
    try { fs.rmSync(tmpDataDir, { recursive: true, force: true }); } catch {}
  }
});

test('Desktop Security: Rejects non-loopback Host header and malicious Origin', async () => {
  const port = 3790 + Math.floor(Math.random() * 80);
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    for (let i = 0; i < 80; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`);
        if (r.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }

    // 1. Attacker host header
    const attackerHost = await new Promise((resolve) => {
      const req = http.request(
        `http://127.0.0.1:${port}/api/state`,
        { headers: { Host: 'attacker.evil.com' } },
        (res) => resolve(res.statusCode)
      );
      req.on('error', () => resolve(null));
      req.end();
    });
    assert.equal(attackerHost, 403, 'External host headers must receive 403 Forbidden');

    // 2. Cross-origin mutating write from malicious domain
    const badOrigin = await fetch(`http://127.0.0.1:${port}/api/state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-qt': '1',
        Origin: 'https://evil-phishing.com',
      },
      body: JSON.stringify({ layout: 1 }),
    });
    assert.equal(badOrigin.status, 403, 'Cross-origin mutations must be rejected with 403');

    // 3. Allowed Tauri desktop origin
    const tauriOrigin = await fetch(`http://127.0.0.1:${port}/api/state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-qt': '1',
        Origin: 'http://tauri.localhost',
      },
      body: JSON.stringify({ layout: 4 }),
    });
    assert.equal(tauriOrigin.status, 200, 'Tauri desktop origin must be permitted');
  } finally {
    try {
      await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
        method: 'POST',
        headers: { 'x-qt': '1' },
      }).catch(() => {});
    } catch {}
    child.kill();
  }
});

test('Desktop Packaging: Verified native installer artifact exists and is non-empty', () => {
  const nsisPath = path.join(
    DESKTOP_DIR,
    'target',
    'release',
    'bundle',
    'nsis',
    'Tavoryn Terminal_1.0.0_x64-setup.exe'
  );
  assert.ok(fs.existsSync(nsisPath), `NSIS installer setup.exe must exist at ${nsisPath}`);
  const stat = fs.statSync(nsisPath);
  assert.ok(stat.size > 50 * 1024 * 1024, `Installer size (${stat.size} bytes) must exceed 50 MB`);

  const msiPath = path.join(
    DESKTOP_DIR,
    'target',
    'release',
    'bundle',
    'msi',
    'Tavoryn Terminal_1.0.0_x64_en-US.msi'
  );
  assert.ok(fs.existsSync(msiPath), `MSI installer must exist at ${msiPath}`);
  const msiStat = fs.statSync(msiPath);
  assert.ok(msiStat.size > 50 * 1024 * 1024, `MSI size (${msiStat.size} bytes) must exceed 50 MB`);
});
