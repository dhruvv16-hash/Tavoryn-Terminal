# Tavoryn Terminal Desktop — Security & Threat Model

This document outlines the security architecture, threat model, permission policies, network boundaries, and defense-in-depth mechanisms implemented in Tavoryn Terminal Desktop.

---

## 1. Threat Model & Attack Surface

Tavoryn Terminal operates as a local financial research and quantitative modeling workstation. It handles user portfolio data, trade records, custom watchlists, and cached market data.

### Primary Threat Vectors:
1. **Malicious Web Pages & Cross-Origin Requests:** External websites opened in standard web browsers attempting to probe or send unauthorized requests to `127.0.0.1:<PORT>` (Localhost CSRF / Drive-by intranet scanning).
2. **Untrusted External Content:** External links clicked within the terminal or malicious responses from external market data APIs attempting Remote Code Execution (RCE) or cross-site scripting (XSS).
3. **Local Process Interference:** Other unprivileged local applications attempting to read or tamper with Tavoryn's local portfolio data.
4. **Subprocess Hijacking:** Exploitation of the bundled Node.js runtime process to execute unauthorized shell commands.

---

## 2. Loopback Network Isolation

The bundled Node.js backend serves APIs strictly bound to the IPv4 loopback interface (`127.0.0.1`).

### Invariants:
- **Never Publicly Exposed:** The server never binds to `0.0.0.0` or any public interface (e.g., Ethernet, Wi-Fi, or VPN adapters).
- **Socket Level Restriction:** Remote devices on the local area network (LAN) cannot route packets to Tavoryn's HTTP port.
- **Dynamic Port Selection:** The port is selected dynamically at launch. Outside scanners cannot rely on a persistent static port.

---

## 3. Origin Validation & Anti-CSRF Defenses

To prevent malicious browser scripts from sending requests to the local backend, `server.js` enforces strict origin and header validation:

### Implementation:
```javascript
// server.js - Origin and header validation
const allowed = req => {
  const o = req.headers.origin || req.headers.referer || '';
  if (!o) return true; // Direct local desktop app requests often omit Origin
  
  // Explicitly permit local loopback and native Tauri desktop schemes
  if (/^https?:\/\/localhost(:\d+)?$/.test(o)) return true;
  if (/^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(o)) return true;
  if (/^tauri:\/\/localhost$/.test(o)) return true;
  if (/^http:\/\/tauri\.localhost$/.test(o)) return true;
  
  // Production Netlify deployments
  if (o.startsWith('https://tavoryn-terminal.netlify.app')) return true;
  
  return false;
};
```

### Defense Characteristics:
1. **Blocked External Origins:** Any request originating from arbitrary domains (e.g., `https://malicious-site.com`) is rejected with HTTP 403 Forbidden.
2. **`x-qt: 1` Custom Header Enforcement:** Sensitive mutating endpoints (such as `/api/paper/reset` or shutdown commands) require custom header verification, which cannot be forged across origins under standard browser CORS preflight rules.
3. **Clean Process Termination API:** The `/api/shutdown` endpoint requires `x-qt: 1` and is only issued by the native Rust shell on application exit.

---

## 4. Tauri 2 Content Security Policy (CSP) & Capabilities

Tauri 2 enforces strict compile-time capability-based access control. No webview window can execute arbitrary native commands unless explicitly granted in `capabilities/default.json`.

### Content Security Policy (`desktop/tauri.conf.json`):
```json
"csp": "default-src 'self' tauri: http://127.0.0.1:* http://localhost:*; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:* http://localhost:* https:; media-src 'self' data:; object-src 'none';"
```
- Restricts script loading to local packaged assets (`'self'`).
- Forbids external remote scripts, CDNs, or `eval()` execution.
- Disallows plugin or embedded object execution (`object-src 'none'`).

### Tauri Capability Grants (`desktop/capabilities/default.json`):
The desktop permissions are locked to the absolute minimum set required:
- `core:default`: Window lifecycle management (minimize, maximize, close, focus).
- `opener:default`: Safe external link launching via the OS default browser.
- `notification:default`: Local OS notification dispatch.
- `window-state:default`: Persisting window bounds (width, height, position) between launches.

---

## 5. Safe External URL Handling

Financial terminals frequently provide links to SEC filings, earnings releases, and documentation.

### Mitigations:
- The desktop webview **never** navigates internally to external HTTP/HTTPS websites.
- External URLs are intercepted and dispatched to the native OS browser via `tauri_plugin_opener`:
  ```rust
  #[tauri::command]
  pub async fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
      // Validate protocol whitelist
      if !url.starts_with("https://") && !url.starts_with("http://") {
          return Err("Invalid protocol: only HTTP and HTTPS URLs are permitted".to_string());
      }
      tauri_plugin_opener::open_url(&app, &url, None)
          .map_err(|e| format!("Failed to open URL: {}", e))
  }
  ```
- File schemes (`file://`), custom protocols, shell command strings, and binary execution links are strictly rejected.

---

## 6. Subprocess Security & Lifecycle Supervision

The Node.js sidecar process is managed by `desktop/src/sidecar.rs`.

### Security Measures:
1. **Suppression of Console Windows (`CREATE_NO_WINDOW`):** On Windows, the process is spawned with process creation flag `0x08000000`, preventing interactive command prompts or rogue terminal windows from popping up.
2. **Environment Sanitization:** Only explicit environment variables (`PORT`, `QT_DATA_DIR`, `NODE_ENV=production`) are injected.
3. **No Shell Execution:** Child processes are spawned directly via binary path without invoking `cmd.exe` or `/bin/sh`, eliminating shell command injection vulnerabilities.
4. **Orphan Prevention:** The Rust process monitors child process PID, issues graceful HTTP shutdown signals on application exit, and falls back to bounded process termination after 1.5 seconds to prevent runaway orphan processes.

---

## 7. Local Data Privacy & Telemetry

- **Zero Outbound Telemetry:** Tavoryn Terminal contains no third-party tracking scripts, analytics SDKs (Google Analytics, Mixpanel, etc.), or user fingerprinting.
- **Encrypted-at-Rest Ready:** Persistent user data is stored within the user's OS-managed profile directory (`%APPDATA%\Tavoryn` / `~/Library/Application Support/Tavoryn`), respecting operating system disk encryption (BitLocker on Windows, FileVault on macOS, LUKS on Linux).
- **Atomic File Storage:** File operations in `lib/store.js` use temporary files and atomic renames (`.tmp` -> target file), preventing database corruption in the event of sudden power loss.
