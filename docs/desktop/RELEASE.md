# Tavoryn Terminal Desktop — Release & Distribution Guide

This document defines the release lifecycle, versioning protocol, code signing procedures, GitHub Actions automation, and auto-update architecture for Tavoryn Terminal Desktop.

---

## 1. Versioning Protocol

Tavoryn Terminal follows strict [Semantic Versioning (SemVer 2.0.0)](https://semver.org/):
`MAJOR.MINOR.PATCH`

- **MAJOR:** Incompatible API changes, storage format overhauls requiring manual migration, or major UI paradigm shifts.
- **MINOR:** Backward-compatible new financial commands, quantitative models, charting capabilities, or platform features.
- **PATCH:** Backward-compatible bug fixes, security patches, or documentation updates.

### Version Synchronization Invariant:
The version string must always be identical across these two primary configuration files:
1. `package.json` -> `"version": "1.0.0"`
2. `desktop/tauri.conf.json` -> `"version": "1.0.0"`

---

## 2. Release Checklist

Before creating a new release:
1. [ ] **Execute Baseline Regressions:** Ensure all 637 baseline tests pass with zero failures:
   ```bash
   npm test
   ```
2. [ ] **Execute Desktop Suite:** Verify sidecar runtime, port allocation, health handshake, AppData persistence, and security controls:
   ```bash
   npm run desktop:test
   ```
3. [ ] **Verify Production Web Remains Intact:** Run live data doctors and offline suite:
   ```bash
   npm run check
   ```
4. [ ] **Update Documentation:** Record updates in `CHANGELOG.md` and verify `docs/desktop/` accuracy.
5. [ ] **Synchronize Version Numbers:** Update `package.json` and `desktop/tauri.conf.json`.

---

## 3. Code Signing & Platform Notarization

To eliminate operating system security warnings (Windows SmartScreen and macOS Gatekeeper), official distribution binaries must be digitally signed.

### Windows Authenticode Signing
Windows installers (`.exe` and `.msi`) must be signed using Microsoft `signtool.exe` with a valid Extended Validation (EV) or Standard Code Signing Certificate.

#### Automated Signing via CI:
Set the following GitHub Secrets:
- `WINDOWS_CERTIFICATE_BASE64`: Base64-encoded `.pfx` certificate.
- `WINDOWS_CERTIFICATE_PASSWORD`: Certificate password.

In `desktop/tauri.conf.json`, configure the bundle signer or execute post-build signing:
```powershell
signtool sign /fd SHA256 /a /tr http://timestamp.digicert.com /td SHA256 /f "cert.pfx" /p "$env:WINDOWS_CERT_PASS" "desktop\target\release\bundle\nsis\*.exe"
```

### macOS Code Signing & Notarization
macOS application bundles (`.app`) and disk images (`.dmg`) require Apple Developer ID signing and Apple Notarization.

#### Prerequisites:
- Apple Developer Program Membership.
- Developer ID Application Certificate (`Developer ID Application: <Name> (<TeamID>)`).
- App-Specific Password or App Store Connect API Key.

#### Configuration in `desktop/tauri.conf.json`:
```json
"bundle": {
  "macOS": {
    "signingIdentity": "Developer ID Application: Tavoryn Technologies Inc.",
    "entitlements": "entitlements.plist",
    "hardenedRuntime": true
  }
}
```

#### Automated Notarization via `notarytool`:
```bash
xcrun notarytool submit "desktop/target/release/bundle/dmg/Tavoryn Terminal_1.0.0_aarch64.dmg" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --wait
xcrun stapler staple "desktop/target/release/bundle/dmg/Tavoryn Terminal_1.0.0_aarch64.dmg"
```

### Linux Package Integrity
Linux distribution packages (`.AppImage` and `.deb`) are cryptographically verified using GPG detached signatures and SHA-256 manifests.

---

## 4. Automated Release Pipeline (GitHub Actions)

Releases are automatically compiled and published using `.github/workflows/desktop-build.yml`.

### Triggering a Release:
1. Create and push a semver git tag:
   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0: Native Desktop Edition"
   git push origin v1.0.0
   ```
2. The GitHub Actions workflow triggers automatically:
   - Builds in parallel across `windows-latest`, `macos-latest`, and `ubuntu-22.04`.
   - Downloads official target Node.js runtimes.
   - Compiles native Tauri release binaries.
   - Calculates cryptographic SHA-256 checksums.
   - Creates a new GitHub Release draft containing all installer artifacts and SHA-256 digests.

---

## 5. Built Artifacts & Checksums (v1.0.0 Baseline)

The following production installers were compiled and verified for release v1.0.0 on Windows:

| Artifact Name | Format | Target Architecture | File Size | SHA-256 Checksum |
| :--- | :--- | :--- | :--- | :--- |
| `Tavoryn Terminal_1.0.0_x64-setup.exe` | NSIS Executable | Windows x86_64 | 77.36 MB | `d030546784fb09012f9ce4060da4cba152f93e9d5de43a4234ba6c240ee2f9a6` |
| `Tavoryn Terminal_1.0.0_x64_en-US.msi` | Windows Installer | Windows x86_64 | 90.41 MB | `381a4a13dd71acbd10033429b2aee0c8bbebda4acfe6d884589bb83a548995cb` |

---

## 6. Auto-Update System Architecture

Tavoryn Terminal Desktop supports differential auto-updates powered by `tauri-plugin-updater`.

### Architecture:
1. **Public Key Cryptography:** Updates are signed using Minisign. The public key is embedded in `desktop/tauri.conf.json`.
2. **Endpoint Manifest:** The client polls `https://releases.tavoryn.com/update/{{target}}/{{current_version}}`.
3. **Verification & Installation:**
   - The desktop shell downloads the signature and update archive.
   - Verifies cryptographic signature against the embedded public key before writing any files.
   - Seamlessly applies the update upon application restart or user confirmation.

### Emergency Rollback:
If an update introduces unexpected regressions:
1. Revoke the release manifest at the remote update endpoint.
2. The client will not download or prompt for that version.
3. Users can reinstall the previous known-good installer without losing local portfolio data, as persistent data in `%APPDATA%\Tavoryn\` is completely decoupled from the binary installation directory.
