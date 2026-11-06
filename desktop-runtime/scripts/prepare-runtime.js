#!/usr/bin/env node
/**
 * Tavoryn Terminal Desktop — Runtime Preparation & Sidecar Packager
 * 
 * Prepares the bundled standalone Node.js sidecar binary for Tauri packaging.
 * In local dev, reuses host node.exe. In CI or cross-build, fetches official prebuilt binary.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';
import https from 'node:https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const BINARIES_DIR = path.join(ROOT, 'desktop', 'binaries');

const NODE_VERSION = 'v20.18.0';

const TARGET_MAP = {
  'win32-x64': 'x86_64-pc-windows-msvc',
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
};

function getHostTargetTriple() {
  const plat = process.platform;
  const arch = process.arch;
  const key = `${plat}-${arch}`;
  return TARGET_MAP[key] || `${arch}-unknown-${plat}`;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`[SidecarPackager] Downloading ${url}...`);
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      file.close();
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

async function prepare() {
  console.log('[SidecarPackager] Preparing Node.js desktop sidecar...');
  fs.mkdirSync(BINARIES_DIR, { recursive: true });

  const targetArg = process.argv.find((a) => a.startsWith('--target='));
  const targetTriple = targetArg ? targetArg.split('=')[1] : getHostTargetTriple();
  const isWindows = targetTriple.includes('windows');
  const binaryName = `node-${targetTriple}${isWindows ? '.exe' : ''}`;
  const destPath = path.join(BINARIES_DIR, binaryName);

  console.log(`[SidecarPackager] Target triple: ${targetTriple}`);
  console.log(`[SidecarPackager] Destination:   ${destPath}`);

  if (fs.existsSync(destPath)) {
    const stat = fs.statSync(destPath);
    console.log(`[SidecarPackager] Existing sidecar found (${(stat.size / 1024 / 1024).toFixed(2)} MB). Verifying...`);
    try {
      const ver = execFileSync(destPath, ['--version'], { encoding: 'utf8' }).trim();
      console.log(`[SidecarPackager] Verified sidecar Node.js version: ${ver}`);
      return;
    } catch (e) {
      console.warn(`[SidecarPackager] Existing binary verification skipped or failed (${e.message}). Proceeding...`);
      return;
    }
  }

  // If host matches target, copy host Node.js executable
  const hostTriple = getHostTargetTriple();
  if (hostTriple === targetTriple) {
    console.log(`[SidecarPackager] Copying host Node.js runtime from ${process.execPath}...`);
    fs.copyFileSync(process.execPath, destPath);
    if (!isWindows) {
      fs.chmodSync(destPath, 0o755);
    }
    const stat = fs.statSync(destPath);
    console.log(`[SidecarPackager] Staged sidecar (${(stat.size / 1024 / 1024).toFixed(2)} MB).`);
    try {
      const ver = execFileSync(destPath, ['--version'], { encoding: 'utf8' }).trim();
      console.log(`[SidecarPackager] Successfully verified sidecar binary: ${ver}`);
    } catch {}
    return;
  }

  // Otherwise download prebuilt Node binary for target
  console.log(`[SidecarPackager] Fetching official Node.js distribution ${NODE_VERSION} for ${targetTriple}...`);
  const tmpDir = path.join(os.tmpdir(), `tavoryn-node-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    let url, archiveName, binarySubpath;
    if (targetTriple === 'x86_64-pc-windows-msvc') {
      archiveName = `node-${NODE_VERSION}-win-x64.zip`;
      url = `https://nodejs.org/dist/${NODE_VERSION}/${archiveName}`;
      binarySubpath = `node-${NODE_VERSION}-win-x64/node.exe`;
    } else if (targetTriple === 'x86_64-unknown-linux-gnu') {
      archiveName = `node-${NODE_VERSION}-linux-x64.tar.gz`;
      url = `https://nodejs.org/dist/${NODE_VERSION}/${archiveName}`;
      binarySubpath = `node-${NODE_VERSION}-linux-x64/bin/node`;
    } else if (targetTriple === 'aarch64-apple-darwin') {
      archiveName = `node-${NODE_VERSION}-darwin-arm64.tar.gz`;
      url = `https://nodejs.org/dist/${NODE_VERSION}/${archiveName}`;
      binarySubpath = `node-${NODE_VERSION}-darwin-arm64/bin/node`;
    } else if (targetTriple === 'x86_64-apple-darwin') {
      archiveName = `node-${NODE_VERSION}-darwin-x64.tar.gz`;
      url = `https://nodejs.org/dist/${NODE_VERSION}/${archiveName}`;
      binarySubpath = `node-${NODE_VERSION}-darwin-x64/bin/node`;
    } else {
      throw new Error(`Unsupported target triple: ${targetTriple}`);
    }

    const archivePath = path.join(tmpDir, archiveName);
    await downloadFile(url, archivePath);

    console.log(`[SidecarPackager] Extracting binary from ${archiveName}...`);
    if (archiveName.endsWith('.zip')) {
      execSync(`tar -xf "${archivePath}" -C "${tmpDir}"`, { stdio: 'inherit' });
    } else {
      execSync(`tar -xzf "${archivePath}" -C "${tmpDir}"`, { stdio: 'inherit' });
    }

    const extractedBinary = path.join(tmpDir, binarySubpath);
    if (!fs.existsSync(extractedBinary)) {
      throw new Error(`Extracted binary not found at ${extractedBinary}`);
    }

    fs.copyFileSync(extractedBinary, destPath);
    if (!isWindows) {
      fs.chmodSync(destPath, 0o755);
    }
    console.log(`[SidecarPackager] Successfully staged ${destPath}`);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

prepare().catch((err) => {
  console.error('[SidecarPackager] Error preparing sidecar:', err);
  process.exit(1);
});
