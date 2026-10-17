# Deployment Guide — Tavoryn Terminal

## System Requirements
- **Runtime:** Node.js version 18.0.0 or higher.
- **Operating Systems:** Windows 10/11, macOS (Intel & Apple Silicon), Linux (Ubuntu, Debian, Fedora, Arch).
- **External Dependencies:** Zero external npm packages required (`package.json` contains no `dependencies`).
- **Network Access:** Public outbound HTTPS access to part-timequant.com, yahoo.com, nasdaq.com, binance.com, sec.gov, fred.stlouisfed.org, and treasury.gov.

## Startup Instructions
The terminal binds to local loopback interface (`127.0.0.1`) on port `3787` by default (`http://localhost:3787`).

1. **Standard Node.js / npm commands:**
   - Start and open browser:
     ```bash
     npm start
     ```
   - Start in background (server only):
     ```bash
     npm run serve
     ```
2. **Windows:**
   - Double-click `start.bat` or run:
     ```powershell
     node scripts/launch.js
     ```
3. **macOS:**
   - Double-click `start.command` or run:
     ```bash
     node scripts/launch.js
     ```
4. **Linux:**
   - Run:
     ```bash
     ./start.sh
     ```
   or:
     ```bash
     node scripts/launch.js
     ```

## Stopping the Terminal
Run:
```bash
node scripts/stop.js
```
