# Tavoryn Terminal — Operational Diagnostics & Troubleshooting Runbook

**Release Version:** Tavoryn Terminal Research Edition v1.0  
**Baseline:** Phase 9 Frozen Baseline (Offline-First / Capital-Safe)  
**Scope:** Operational Diagnostics, Error Resolution, and System Recovery  

---

## 1. Quick Diagnostic Triage

When encountering unexpected behavior, run through this 60-second triage checklist:

1. **Verify Server Health:** Open a browser tab to `http://localhost:3787/api/health`. Confirm `"ok": true` and `"app": "tavoryn-terminal"`.
2. **Inspect Data Feeds:** Run `DATA GO` in any terminal panel to inspect feed latencies, provider rate-limit status, and WebSocket connection state.
3. **Check Browser Console:** Press <kbd>F12</kbd> (or <kbd>Ctrl+Shift+I</kbd>) to view browser error logs.
4. **Confirm Route Accessibility:** Test `/user-manual` and `/help` directly in your browser.

---

## 2. Command Line & Input Validation Errors

### Error: `"No function called <XYZ>. Type HELP for the list."`
- **Root Cause:** An unrecognized function code was entered into the command line.
- **Remediation:** 
  1. Check for typographical errors.
  2. Press <kbd>F1</kbd> or run `HELP GO` to review the 53 valid function codes.
  3. Ensure that yellow keys (e.g., `EQUITY`, `INDEX`) are positioned before the function code.

### Error: `"<FUNCTION> needs a security first, for example AAPL US EQUITY <FUNCTION>"`
- **Root Cause:** A security-specific function (such as `DES`, `DCF`, `GP`, `CF`, `FA`, `OMON`) was executed without a subject security.
- **Remediation:**
  1. Prefix the command with the asset ticker: `AAPL US EQUITY DCF GO`.
  2. Alternatively, run a security search first (e.g., `AAPL GO`), and once the panel subject is set, run `DCF GO`.

### Error: `"WACC must strictly exceed terminal growth rate g"`
- **Root Cause:** In the DCF valuation model, the cost of capital parameter ($WACC$) was set less than or equal to the perpetual growth rate ($g$).
- **Mathematical Explanation:** In the Gordon Growth Model $TV = \frac{FCFF \times (1 + g)}{WACC - g}$, if $WACC \le g$, the denominator becomes zero or negative, resulting in mathematically nonsensical or infinite valuations.
- **Remediation:** Adjust $WACC$ higher (e.g., 8.5%) or $g$ lower (e.g., 2.5%) in the DCF input fields.

---

## 3. Data Feed & Market Quote Issues

### Symptom: Quotes appear static or delayed by 15 minutes
- **Root Cause:** 
  1. Standard exchange public feeds are delayed by 15 minutes during regular trading hours.
  2. Outside of exchange trading hours (e.g., weekends, holidays, after 16:00 ET for US equities), quotes reflect the last official market close.
- **Remediation:**
  1. Crypto assets (`CRYPTO`, `BTC GP`) stream 24/7 without delays.
  2. For equities and indices, compare the timestamp displayed in the bottom panel footer (`asof`) against market operating hours.

### Symptom: `"Rate limit encountered on public gateway"`
- **Root Cause:** High-frequency consecutive queries to public Yahoo Finance or SEC EDGAR endpoints temporarily throttled the local IP.
- **Remediation:**
  1. Tavoryn includes automated exponential backoff and local fixture caching.
  2. Wait 30 seconds before re-issuing queries.
  3. Run `DATA GO` to monitor rate-limit recovery.

---

## 4. Paper Trading & Risk Fencing Errors

### Error: `"Order rejected: Insufficient purchasing power"`
- **Root Cause:** In the `TRAD` order ticket, `Estimated Notional Value + Fees` exceeds the available paper cash balance.
- **Remediation:**
  1. Reduce the order quantity (shares).
  2. Inspect current cash balance via `PORT GO`.
  3. Note that paper trading protects against negative cash balances.

### Error: `"Order rejected: Position concentration exceeds limit (25%)"`
- **Root Cause:** Institutional pre-trade risk rule preventing any single equity position from exceeding 25% of total portfolio value.
- **Remediation:** Diversify allocation by sizing orders within the 25% concentration ceiling.

### Error: `"Live broker execution is disabled by release gate"`
- **Root Cause:** Tavoryn Terminal operates under a frozen Phase 9 non-live execution policy.
- **Remediation:** Live broker order routing is intentionally fenced. All trading must proceed through the simulated paper execution environment (`TRAD`).

---

## 5. Server & Port Conflicts

### Symptom: `Error: listen EADDRINUSE: address already in use :::3787`
- **Root Cause:** Another process or background instance of Tavoryn Terminal is already bound to port 3787.
- **Remediation on Windows:**
  1. Open PowerShell and find the process occupying port 3787:
     ```powershell
     Get-NetTCPConnection -LocalPort 3787 | Select-Object OwningProcess
     ```
  2. Terminate the stale Node.js process:
     ```powershell
     Stop-Process -Id <PID> -Force
     ```
  3. Alternatively, launch Tavoryn on an alternate port:
     ```powershell
     $env:PORT=3788; node server.js
     ```

---

## 6. Local Storage & Viewport Recovery

### Symptom: Terminal workspace displays broken panels after abnormal browser shutdown
- **Root Cause:** Local browser storage or server state contains an unparseable layout payload.
- **Remediation:**
  1. In the global command bar, type `LAYOUT 4 GO` to force-reset to the standard 2x2 grid.
  2. Clear cached terminal state in browser DevTools:
     ```javascript
     localStorage.clear();
     location.reload();
     ```
