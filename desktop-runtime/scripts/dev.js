#!/usr/bin/env node
/**
 * Tavoryn Terminal Desktop — Development Mode Runner
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const DESKTOP_DIR = path.join(ROOT, 'desktop');

console.log('[Dev] Starting Tavoryn Terminal in desktop development mode...');

// Ensure sidecar is prepared
const prepScript = path.join(__dirname, 'prepare-runtime.js');
spawnSync(process.execPath, [prepScript], { cwd: ROOT, stdio: 'inherit' });

// Launch cargo run in desktop
const cargoCmd = process.platform === 'win32' ? 'cargo.exe' : 'cargo';
const devProcess = spawn(cargoCmd, ['run'], {
  cwd: DESKTOP_DIR,
  stdio: 'inherit',
  env: { ...process.env, RUST_LOG: 'info' },
});

devProcess.on('exit', (code) => {
  process.exit(code || 0);
});
