# Tavoryn Terminal Desktop — Build & Compilation Guide

This guide documents the toolchain prerequisites, sidecar staging mechanism, development environment workflows, and production packaging instructions for Tavoryn Terminal Desktop.

---

## 1. Prerequisites & Toolchain Setup

To compile the Tauri 2 native shell and package release installers, the host machine requires Rust, Node.js, and platform-specific C/C++ compilation toolchains.

### Common Requirements
- **Node.js:** v18.0.0 or later (v20+ recommended).
- **Rust Toolchain:** v1.77.2 or later (installed via `rustup`).
  ```bash
  rustup default stable
  rustup update
  ```

### Platform-Specific Dependencies

#### Windows
- **Visual Studio C++ Build Tools:** Install Visual Studio 2022 Build Tools with the **Desktop development with C++** workload selected (provides `MSVC` compiler, Windows SDK, and linkers).
- **WebView2:** Installed by default on Windows 10/11.
- **WiX Toolset v3.14 (Optional for `.msi` output):** Tauri will automatically use WiX if present on PATH.

#### macOS
- **Xcode Command Line Tools:**
  ```bash
  xcode-select --install
  ```

#### Linux (Debian / Ubuntu)
- Install development libraries required for WebKit2GTK, OpenSSL, and AppIndicator:
  ```bash
  sudo apt update
  sudo apt install -y \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libwebkit2gtk-4.1-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
  ```

---

## 2. Repository Structure

```
Tavoryn-Terminal/
├── desktop/                         # Tauri 2 Native Desktop Shell (Rust)
│   ├── Cargo.toml                   # Rust crate dependencies & metadata
│   ├── build.rs                     # Tauri build hook
│   ├── tauri.conf.json              # Window layout, sidecar definitions, bundle specs
│   ├── capabilities/
│   │   └── default.json             # Tauri 2 capability & permission ACLs
│   ├── icons/                       # Multi-platform app icons (ico, png)
│   ├── binaries/                    # Staged Node.js sidecar executables per triple
│   │   └── node-x86_64-pc-windows-msvc.exe
│   └── src/                         # Native Rust implementation
│       ├── main.rs                  # Windows subsystem runner
│       ├── lib.rs                   # Setup orchestrator, lifecycle, IPC commands
│       ├── sidecar.rs               # Node runtime resolver, process supervisor
│       ├── port.rs                  # Dynamic loopback port allocator
│       ├── health.rs                # Asynchronous /health handshake polling
│       ├── menu.rs                  # Native menu bar definition
│       └── tray.rs                  # System tray icon & context menu
├── desktop-runtime/
│   └── scripts/                     # Automation scripts (Zero-dependency Node.js)
│       ├── prepare-runtime.js       # Stages / downloads sidecar binary for target triple
│       ├── build.js                 # Unified release compilation pipeline
│       ├── dev.js                   # Development launcher
│       ├── test-desktop.js          # Desktop integration test suite
│       └── generate-icons.ps1       # Multi-resolution icon builder
├── public/                          # Packaged frontend assets (HTML, CSS, JS, audio)
├── server.js                        # Tavoryn Node.js backend server
├── lib/                             # Financial calculation & persistence engine
├── data/                            # Baseline templates & historical datasets
└── package.json                     # NPM project scripts
```

---

## 3. Sidecar Binary Staging (`desktop:prepare`)

Tauri 2 requires external binaries declared under `bundle.externalBin` to be named with the exact target triple of the host or compilation target:
```
desktop/binaries/node-${TARGET_TRIPLE}[.exe]
```

Examples:
- Windows x64: `node-x86_64-pc-windows-msvc.exe`
- macOS Apple Silicon: `node-aarch64-apple-darwin`
- macOS Intel: `node-x86_64-apple-darwin`
- Linux x64: `node-x86_64-unknown-linux-gnu`

### Running the Staging Script
```bash
npm run desktop:prepare
```
The script (`desktop-runtime/scripts/prepare-runtime.js`):
1. Detects the current host architecture or accepts `--target=<triple>`.
2. Checks if a matching binary exists in `desktop/binaries/`.
3. If missing, it copies the local active Node.js executable (for local developer convenience) or downloads official Node.js release archives from `https://nodejs.org/dist/` for cross-platform targets.
4. Verifies the binary by executing `--version` via `spawnSync`.

---

## 4. Local Desktop Development Mode (`desktop:dev`)

To run the desktop shell with live logs and inspectable webview during development:

```bash
npm run desktop:dev
```

This command:
1. Verifies that the sidecar runtime binary is staged in `desktop/binaries/`.
2. Spawns `npx @tauri-apps/cli dev` inside `desktop/`.
3. The Tauri shell allocates a loopback port (defaulting to 3787 or picking an ephemeral port).
4. Launches the bundled sidecar Node process.
5. Polls `/health` until `{"processReadiness": "ready"}` is confirmed.
6. Opens the native desktop window with Developer Tools accessible via right-click (or F12).

---

## 5. Production Release Compilation (`desktop:build`)

To compile the native Rust binary in release mode (`--release`) and package OS installers:

```bash
npm run desktop:build
```

### Build Pipeline Execution Flow:
1. **Sidecar Preparation:** Runs `prepare-runtime.js` to ensure the sidecar binary matches the host target.
2. **Release Compilation:** Invokes `npx @tauri-apps/cli build` targeting `desktop/tauri.conf.json`.
   - Compiles Rust shell with link-time optimization (LTO) and size optimizations.
   - Embeds icons, manifests, and frontend assets from `public/`.
   - Bundles the Node.js sidecar binary alongside the executable.
   - Generates installer packages.
3. **Artifact Discovery & Integrity:** The build script scans `desktop/target/release/bundle/` and calculates cryptographic SHA-256 checksums for each generated installer.

### Output Artifacts by Platform:

#### Windows (`desktop/target/release/bundle/`)
- **NSIS Setup Executable:** `nsis/Tavoryn Terminal_1.0.0_x64-setup.exe`
- **MSI Installer:** `msi/Tavoryn Terminal_1.0.0_x64_en-US.msi`

#### macOS (`desktop/target/release/bundle/`)
- **DMG Disk Image:** `dmg/Tavoryn Terminal_1.0.0_x64.dmg` (or `_aarch64.dmg`)
- **Application Bundle:** `macos/Tavoryn Terminal.app`

#### Linux (`desktop/target/release/bundle/`)
- **Universal AppImage:** `appimage/tavoryn-terminal_1.0.0_amd64.AppImage`
- **Debian Package:** `deb/tavoryn-terminal_1.0.0_amd64.deb`

---

## 6. Automated Desktop Test Suite (`desktop:test`)

To verify desktop runtime readiness and security assertions prior to release:

```bash
npm run desktop:test
```

The test runner (`desktop-runtime/scripts/test-desktop.js`) executes 5 automated integration checks:
1. **Sidecar Execution:** Verifies that the staged Node binary can execute and returns Node v18+.
2. **Backend Startup & Health Handshake:** Spawns `server.js` on an isolated test port and verifies the `/health` payload (`backendVersion`, `processReadiness`, `runtimeStatus`, `apiVersion`).
3. **AppData Persistence & Write Isolation:** Verifies data writes inside `%APPDATA%\Tavoryn\` via `QT_DATA_DIR` environment override.
4. **Desktop Security Perimeter:** Confirms that `server.js` enforces loopback isolation and rejects disallowed cross-origin requests.
5. **Release Installer Verification:** Confirms that release bundle installers exist on disk and meet size criteria.

---

## 7. CI/CD Matrix Automation

Cross-platform compilation across Windows, macOS, and Linux is orchestrated in `.github/workflows/desktop-build.yml` via GitHub Actions runners:

```yaml
strategy:
  matrix:
    include:
      - os: windows-latest
        target: x86_64-pc-windows-msvc
      - os: macos-latest
        target: aarch64-apple-darwin
      - os: ubuntu-22.04
        target: x86_64-unknown-linux-gnu
```

The workflow automatically installs platform dependencies, runs baseline regressions (`npm test`), runs desktop tests (`npm run desktop:test`), builds the installers, produces SHA-256 digests, and attaches release assets.
