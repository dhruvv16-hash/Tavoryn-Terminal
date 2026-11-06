#!/usr/bin/env node
/**
 * Tavoryn Terminal Desktop — Cross-Platform Build & Packaging Orchestrator
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync, fork } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const DESKTOP_DIR = path.join(ROOT, 'desktop');

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function run() {
  console.log('====================================================');
  console.log('   Tavoryn Terminal Native Desktop Build Pipeline   ');
  console.log('====================================================');
  console.log(`Root:    ${ROOT}`);
  console.log(`Desktop: ${DESKTOP_DIR}`);

  // Step 1: Prepare sidecar runtime
  console.log('\n[Phase 1] Preparing bundled Node.js sidecar binary...');
  const prepScript = path.join(__dirname, 'prepare-runtime.js');
  const prep = spawnSync(process.execPath, [prepScript, ...process.argv.slice(2)], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (prep.status !== 0) {
    console.error('[Build] Failed to prepare runtime sidecar.');
    process.exit(prep.status || 1);
  }

  // Step 2: Build Tauri desktop application
  console.log('\n[Phase 2] Compiling Tauri 2 desktop shell and packaging installers...');
  const extraArgs = process.argv.slice(2);
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const tauriBuild = spawnSync(npxCmd, ['@tauri-apps/cli', 'build', ...extraArgs], {
    cwd: DESKTOP_DIR,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, CI: 'true' },
  });

  if (tauriBuild.status !== 0) {
    console.error(`[Build] Tauri build exited with status ${tauriBuild.status}`);
    process.exit(tauriBuild.status || 1);
  }

  // Step 3: Discover and checksum generated bundles
  console.log('\n[Phase 3] Discovering generated installer artifacts...');
  const bundleDir = path.join(DESKTOP_DIR, 'target', 'release', 'bundle');
  if (fs.existsSync(bundleDir)) {
    const artifacts = [];
    function scan(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
        } else if (/\.(exe|msi|dmg|app|AppImage|deb|rpm|zip|tar\.gz)$/i.test(entry.name)) {
          artifacts.push(full);
        }
      }
    }
    scan(bundleDir);

    console.log(`\nFound ${artifacts.length} installer package(s):`);
    for (const a of artifacts) {
      const stat = fs.statSync(a);
      const hash = sha256(a);
      const rel = path.relative(ROOT, a);
      console.log(`  - Artifact: ${rel}`);
      console.log(`    Size:     ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`    SHA-256:  ${hash}`);
    }
  } else {
    console.log('[Build] Finished release build (bundle directory not present or debug build).');
  }

  console.log('\n[Build] Desktop build completed successfully!');
}

run().catch((err) => {
  console.error('[Build] Fatal error:', err);
  process.exit(1);
});
