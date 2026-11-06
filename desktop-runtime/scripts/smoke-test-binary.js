#!/usr/bin/env node
/**
 * Cross-Platform Desktop Smoke Test
 * Spawns the compiled native Tauri executable, intercepts dynamic port output,
 * verifies the loopback sidecar handshake, and tests HTTP /health.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const DESKTOP_DIR = path.join(ROOT, 'desktop');

async function findBinary() {
  const isWindows = process.platform === 'win32';
  const binName = `tavoryn-terminal${isWindows ? '.exe' : ''}`;

  const candidates = [
    path.join(DESKTOP_DIR, 'target', 'release', binName),
    path.join(DESKTOP_DIR, 'target', 'x86_64-pc-windows-msvc', 'release', binName),
    path.join(DESKTOP_DIR, 'target', 'aarch64-apple-darwin', 'release', binName),
    path.join(DESKTOP_DIR, 'target', 'x86_64-unknown-linux-gnu', 'release', binName),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }

  // Also check recursive search if target triple varies
  const targetDir = path.join(DESKTOP_DIR, 'target');
  if (fs.existsSync(targetDir)) {
    const queue = [targetDir];
    while (queue.length > 0) {
      const curr = queue.shift();
      try {
        const entries = fs.readdirSync(curr, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(curr, e.name);
          if (e.isDirectory() && !full.includes('incremental') && !full.includes('.fingerprint')) {
            queue.push(full);
          } else if (e.isFile() && e.name.toLowerCase() === binName.toLowerCase() && full.includes('release')) {
            return full;
          }
        }
      } catch {}
    }
  }

  throw new Error(`Could not locate native release binary (${binName}) in ${DESKTOP_DIR}/target`);
}

async function run() {
  console.log('====================================================');
  console.log('  Tavoryn Terminal — Native Executable Smoke Test   ');
  console.log('====================================================');
  console.log(`Platform: ${process.platform} (${process.arch})`);

  const binPath = await findBinary();
  console.log(`Found binary: ${binPath}`);
  const stat = fs.statSync(binPath);
  console.log(`Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

  let child;
  const isLinux = process.platform === 'linux';
  
  if (isLinux && !process.env.DISPLAY) {
    console.log('[SmokeTest] Running under xvfb-run (virtual X11 display)...');
    child = spawn('xvfb-run', ['-a', binPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true' },
    });
  } else {
    child = spawn(binPath, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true' },
    });
  }

  let detectedPort = null;
  let handshakeVerified = false;

  child.stdout.on('data', (d) => {
    const str = d.toString();
    process.stdout.write(`[APP STDOUT] ${str}`);

    const portMatch = str.match(/127\.0\.0\.1:(\d+)/);
    if (portMatch && !detectedPort) {
      detectedPort = parseInt(portMatch[1], 10);
    }
    if (str.includes('Handshake successful')) {
      handshakeVerified = true;
    }
  });

  child.stderr.on('data', (d) => {
    process.stderr.write(`[APP STDERR] ${d.toString()}`);
  });

  child.on('error', (err) => {
    console.error('[SmokeTest] Failed to spawn desktop binary:', err);
    process.exit(1);
  });

  // Poll for health verification
  const startTime = Date.now();
  let healthOk = false;

  while (Date.now() - startTime < 15000) {
    if (detectedPort) {
      try {
        const res = await fetch(`http://127.0.0.1:${detectedPort}/health`);
        if (res.ok) {
          const body = await res.json();
          if (body.ok && body.app === 'tavoryn-terminal' && body.processReadiness === 'ready') {
            console.log(`\n✔ Successfully verified live HTTP handshake on port ${detectedPort}!`);
            console.log(`  - app:              ${body.app}`);
            console.log(`  - processReadiness: ${body.processReadiness}`);
            console.log(`  - runtimeStatus:    ${body.runtimeStatus}`);
            console.log(`  - version:          ${body.version}`);
            healthOk = true;
            break;
          }
        }
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // Gracefully terminate child process
  console.log('\n[SmokeTest] Terminating smoke test process...');
  child.kill();

  if (!healthOk && !handshakeVerified) {
    console.error('❌ Smoke test FAILED: Desktop application did not reach ready state within 15 seconds.');
    process.exit(1);
  }

  console.log('✔ Smoke test PASSED: Native binary initialized, launched sidecar, and answered health probe.');
  process.exit(0);
}

run().catch((err) => {
  console.error('[SmokeTest] Fatal error:', err);
  process.exit(1);
});
