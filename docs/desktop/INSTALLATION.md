# Tavoryn Terminal Desktop — Installation Guide

This guide details system requirements, installation workflows, first-run initialization, and uninstallation procedures for the Tavoryn Terminal native desktop application across Windows, macOS, and Linux.

---

## 1. System Requirements

### Hardware Requirements
- **Processor:** 64-bit x86 (x86_64 / amd64) or 64-bit ARM (Apple Silicon / aarch64)
- **Memory (RAM):** 512 MB minimum (1 GB recommended for full offline backtesting and caching)
- **Storage:** ~180 MB free disk space (includes bundled Node.js runtime and application assets)
- **Display:** Minimum 1024x768 resolution (1440x900 or higher recommended for 4-panel CRT workspace)

### Operating System Support
| Operating System | Supported Versions | Installer Formats |
| :--- | :--- | :--- |
| **Windows** | Windows 10 (1809+) & Windows 11 (64-bit) | `.exe` (NSIS Installer), `.msi` (Windows Installer) |
| **macOS** | macOS 11.0 Big Sur or later (Intel & Apple Silicon) | `.dmg` (Disk Image), `.app` |
| **Linux** | Ubuntu 20.04+, Debian 11+, Fedora 36+, Arch Linux | `.AppImage` (Universal binary), `.deb` (Debian/Ubuntu) |

> [!NOTE]
> Tavoryn Terminal bundles its own isolated Node.js sidecar execution engine. **Users do not need to install Node.js, npm, or Rust.**

---

## 2. Windows Installation

### Option A: Standard Setup (`.exe` NSIS Installer) — Recommended
1. Download `Tavoryn Terminal_1.0.0_x64-setup.exe` from the official repository release.
2. Double-click the installer executable.
3. If Windows SmartScreen displays *"Windows protected your PC"*:
   - Click **More info**.
   - Click **Run anyway** (SmartScreen flags freshly published binaries before reputation accumulates).
4. Follow the setup wizard prompts:
   - Default install destination: `%LOCALAPPDATA%\Programs\Tavoryn Terminal\`
   - Select optional shortcuts (Desktop shortcut, Start Menu shortcut).
5. Click **Install**. Once finished, check **Launch Tavoryn Terminal** and click **Finish**.

### Option B: Enterprise / MSI Package (`.msi`)
For silent enterprise deployments or Group Policy installations:
```powershell
# Interactive install:
msiexec /i "Tavoryn Terminal_1.0.0_x64_en-US.msi"

# Silent automated install:
msiexec /i "Tavoryn Terminal_1.0.0_x64_en-US.msi" /qn /norestart
```

### Windows WebView2 Requirement
Tauri on Windows utilizes Microsoft Edge WebView2. All modern Windows 10 (updated) and Windows 11 systems include WebView2 pre-installed. If running on an enterprise LTSC installation missing WebView2, download the [Evergreen WebView2 Bootstrapper from Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

---

## 3. macOS Installation

### Option A: DMG Drag-and-Drop (`.dmg`)
1. Download `Tavoryn Terminal_1.0.0_x64.dmg` (Intel) or `Tavoryn Terminal_1.0.0_aarch64.dmg` (Apple Silicon).
2. Double-click the `.dmg` file to mount the volume.
3. Drag the **Tavoryn Terminal** application icon into the **Applications** folder shortcut.
4. Eject the DMG disk image from Finder.
5. Launch **Tavoryn Terminal** from Spotlight (Cmd + Space) or Launchpad.

### Gatekeeper Verification (Unsigned / Self-Signed Builds)
For community or preview builds not signed with an Apple Developer ID:
1. On first launch, macOS may warn: *"Tavoryn Terminal cannot be opened because the developer cannot be verified."*
2. Click **Cancel**.
3. Open **System Settings** > **Privacy & Security**.
4. Scroll down to the **Security** section and locate: *"Tavoryn Terminal was blocked from use because it is not from an identified developer."*
5. Click **Open Anyway** and confirm with your macOS password/Touch ID.
6. Alternatively, via Terminal:
   ```bash
   xattr -d com.apple.quarantine "/Applications/Tavoryn Terminal.app"
   ```

---

## 4. Linux Installation

### Linux System Dependencies
On modern Debian/Ubuntu-based distributions, ensure `webkit2gtk` is installed (required by Tauri's webview shell):
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-0 libayatana-appindicator3-1 librsvg2-2
```
On Fedora / RHEL:
```bash
sudo dnf install webkit2gtk4.1 libappindicator-gtk3 librsvg2
```

### Option A: Universal AppImage (`.AppImage`) — Recommended
1. Download `tavoryn-terminal_1.0.0_amd64.AppImage`.
2. Grant execution permission:
   ```bash
   chmod +x tavoryn-terminal_1.0.0_amd64.AppImage
   ```
3. Run directly:
   ```bash
   ./tavoryn-terminal_1.0.0_amd64.AppImage
   ```

### Option B: Debian / Ubuntu Package (`.deb`)
1. Download `tavoryn-terminal_1.0.0_amd64.deb`.
2. Install via `apt` or `dpkg`:
   ```bash
   sudo apt install ./tavoryn-terminal_1.0.0_amd64.deb
   ```
3. Launch from your application menu or via command line:
   ```bash
   tavoryn-terminal
   ```

---

## 5. First-Run Initialization & Life of a Boot

When Tavoryn Terminal starts for the first time, the native shell automatically performs initialization without user intervention:

```
[User Launches Tavoryn]
         │
         ▼
[1. Resolve AppData Storage]
Windows: %APPDATA%\Tavoryn\
macOS:   ~/Library/Application Support/Tavoryn/
Linux:   ~/.local/share/tavoryn/
         │
         ├── Checks for existing data directory
         └── Seeds default templates (paper_portfolio.json, historical data) if fresh
         │
         ▼
[2. Dynamic Port Probing]
Probes loopback 127.0.0.1:3787
         ├── Available? -> Allocates port 3787
         └── In Use?    -> Binds ephemeral port (e.g. 127.0.0.1:51432)
         │
         ▼
[3. Launch Bundled Node.js Sidecar]
Spawns background child process:
node server.js (Loopback only, CREATE_NO_WINDOW, QT_DATA_DIR set)
         │
         ▼
[4. Health Polling Handshake]
Rust shell queries http://127.0.0.1:<PORT>/health (up to 15 retries, 250ms interval)
         ├── Handshake confirmed (status: 200, processReadiness: "ready")
         │
         ▼
[5. Display Native Window]
Loads local webview pointing to loopback server.
Amber CRT 4-panel terminal renders ready for input.
```

---

## 6. Local Storage Directory Map

All persistent state (trades, positions, cached market data, terminal logs) is strictly isolated from the application binaries:

| Platform | Persistent Storage Directory Path |
| :--- | :--- |
| **Windows** | `%APPDATA%\Tavoryn\` (e.g., `C:\Users\<User>\AppData\Roaming\Tavoryn\`) |
| **macOS** | `~/Library/Application Support/Tavoryn/` |
| **Linux** | `~/.local/share/tavoryn/` (or `$XDG_DATA_HOME/tavoryn/`) |

### Subdirectories Inside AppData:
- `/data/`: Contains `paper_portfolio.json`, transaction logs, backtesting profiles, and cached security quotes.
- `/logs/`: Contains `backend.log` (child process stdout/stderr stream) and crash diagnostic dumps.
- `/exports/`: Default destination for generated CSV, JSON, and PDF quantitative analytics reports.

---

## 7. Uninstallation

### Windows
1. Open **Windows Settings** > **Apps** > **Installed apps**.
2. Locate **Tavoryn Terminal** in the list.
3. Click the three dots menu and select **Uninstall**.
4. To completely purge user data, manually delete:
   ```powershell
   Remove-Item -Recurse -Force "$env:APPDATA\Tavoryn"
   ```

### macOS
1. Open **Finder** and navigate to `/Applications`.
2. Drag **Tavoryn Terminal.app** to the **Trash**.
3. Empty Trash.
4. To completely purge user data:
   ```bash
   rm -rf ~/Library/Application\ Support/Tavoryn
   ```

### Linux
If installed via `.deb`:
```bash
sudo apt remove --purge tavoryn-terminal
rm -rf ~/.local/share/tavoryn
```
If using `.AppImage`:
Simply delete the `.AppImage` file and remove `~/.local/share/tavoryn`.
