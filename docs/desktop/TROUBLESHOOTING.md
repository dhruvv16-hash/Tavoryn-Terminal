# Tavoryn Terminal Desktop — Troubleshooting & Diagnostics

This guide provides operational solutions for port conflicts, backend startup timeouts, antivirus warnings, data recovery, and rendering anomalies.

---

## 1. Quick Diagnostic Checklist

If Tavoryn Terminal fails to start or displays a connection error:
1. **Check the Backend Log:**
   Open the log file located at:
   - **Windows:** `%APPDATA%\Tavoryn\logs\backend.log`
   - **macOS:** `~/Library/Application Support/Tavoryn/logs/backend.log`
   - **Linux:** `~/.local/share/tavoryn/logs/backend.log`
2. **Verify Loopback Port Accessibility:**
   Ensure your local security software or firewall is not blocking loopback connections to `127.0.0.1`.
3. **Verify WebView2 Runtime (Windows Only):**
   Ensure Microsoft Edge WebView2 is installed and updated.

---

## 2. Common Issues & Solutions

### Issue A: "Backend failed to become healthy within timeout"

#### Symptoms:
On launch, the splash screen hangs or displays an error dialog indicating the backend did not respond within the allocated timeout.

#### Root Causes & Remedies:
1. **Occupied Port or Stuck Background Process:**
   - Tavoryn automatically falls back to an ephemeral port if 3787 is occupied. However, if a zombie Node.js process is locking files in the data directory, startup may stall.
   - *Fix (Windows):* Open Task Manager, locate any orphan `node-x86_64-pc-windows-msvc.exe` processes, and select **End Task**.
   - *Fix (macOS / Linux):* Run `pkill -f "node server.js"` or inspect with `ps aux | grep node`.
2. **Missing Runtime Dependencies in `server.js`:**
   - Inspect `backend.log` for stack traces (e.g., `MODULE_NOT_FOUND` or permission errors).
3. **Data File Corruption:**
   - If a JSON file in `%APPDATA%\Tavoryn\data\` contains malformed data, parse errors may crash the backend on boot. See Section 3 for data recovery.

---

### Issue B: Windows SmartScreen or Antivirus False Positives

#### Symptoms:
- Windows SmartScreen displays: *"Windows protected your PC. Microsoft Defender SmartScreen prevented an unrecognized app from starting."*
- Antivirus software flags the bundled `node-x86_64-pc-windows-msvc.exe` as suspicious (heuristic detection).

#### Technical Explanation:
Freshly compiled native binaries that have not yet established reputation in Microsoft's telemetry database trigger SmartScreen warnings unless signed with an Extended Validation (EV) code signing certificate. The bundled Node.js executable is a standard Node.js binary extracted for sidecar execution.

#### Resolution:
1. On SmartScreen prompt, click **More info** -> **Run anyway**.
2. If your corporate antivirus quarantines the binary:
   - Add an exclusion for `%LOCALAPPDATA%\Programs\Tavoryn Terminal\` or the directory containing the executable.
   - For verification, compare the SHA-256 hash of the installer against the official release hashes published in the GitHub Release notes.

---

### Issue C: Black Screen or Webview Rendering Glitches

#### Symptoms:
The application window opens, but the contents render completely black, flicker, or show tearing.

#### Root Causes & Remedies:
1. **Linux WebKit Compositing Conflicts (NVIDIA / Wayland):**
   - Certain Linux graphic driver combinations produce black screens in WebKitGTK with hardware compositing enabled.
   - *Fix:* Launch Tavoryn with disabled hardware compositing:
     ```bash
     WEBKIT_DISABLE_COMPOSITING_MODE=1 ./tavoryn-terminal_1.0.0_amd64.AppImage
     ```
2. **Windows GPU Acceleration Conflict:**
   - Outdated graphics drivers can cause DirectX acceleration issues inside WebView2.
   - *Fix:* Update graphics drivers or launch with software rendering fallback by setting the environment variable:
     ```powershell
     $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--disable-gpu"
     ```

---

### Issue D: Port 3787 Conflict

#### Symptoms:
Another service (such as an existing local development server or Docker container) is already bound to port 3787.

#### Resolution:
Tavoryn Terminal handles this automatically:
1. The native shell detects that `127.0.0.1:3787` is unavailable.
2. It immediately binds to `127.0.0.1:0` to request an ephemeral kernel port (e.g. 54219).
3. The port number is passed directly to the sidecar backend via `PORT=54219`.
4. The webview is pointed directly to `http://127.0.0.1:54219`.
No manual configuration or port changing is required.

---

## 3. Data Recovery & Reset Procedures

Tavoryn stores user portfolios, orders, and watchlists inside the application data directory.

### Resetting Paper Portfolio via Terminal UI:
If the terminal is responsive, type the following command into the terminal command line:
```
PAPER RESET
```
This re-initializes your portfolio with the default \$100,000 cash balance.

### Manual Data Restoration:
If data files become corrupted due to unexpected operating system crashes:
1. Navigate to the data folder:
   - Windows: `%APPDATA%\Tavoryn\data\`
   - macOS: `~/Library/Application Support/Tavoryn/data/`
   - Linux: `~/.local/share/tavoryn/data/`
2. If an atomic write was interrupted, you may find `.tmp` files (e.g., `paper_portfolio.json.tmp`). If the main `.json` file is empty (0 bytes), inspect the `.tmp` file or delete both to allow the application to re-seed factory defaults on next boot.
3. To perform a full clean reset, delete the entire `Tavoryn` data folder. Factory templates will be automatically regenerated upon next application launch.

---

## 4. Exporting Diagnostic Bundles

When reporting an issue or contacting support, generate a complete diagnostic report:

### Method A: Via Terminal Interface
1. In the terminal command prompt, type:
   ```
   SYSTEM DIAGNOSTICS
   ```
2. The terminal will compile system specs, backend health stats, port status, and memory metrics, saving the report to your `exports/` folder.

### Method B: Via System Tray
1. Right-click the **Tavoryn Terminal** icon in the system notification tray.
2. Click **Check Backend Status** to view instant connectivity and process status.

### Method C: Manual Log Retrieval
Collect the following files and include them with bug reports:
- `%APPDATA%\Tavoryn\logs\backend.log`
- Current operating system version (`winver` or `uname -a`)
- Display scaling settings (DPI / scaling percentage)
