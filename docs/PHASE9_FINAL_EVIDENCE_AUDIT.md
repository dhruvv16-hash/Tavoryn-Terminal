# Amber Terminal — Phase 9 Evidence Integrity Audit & Release-Gate Archive

> [!NOTE]
> **Rebrand Notice & Governance Addendum (October 2026)**
> The quantitative finance platform historically developed under the name **Amber Terminal** has been officially rebranded to **Tavoryn** (parent product: **Tavoryn**, workspace: **Tavoryn Terminal**, quantitative research: **Tavoryn Research**, execution & paper trading: **Tavoryn Execution**).
> This document is a historical audit and verification record preserved under strict cryptographic and governance invariants. All historical evidence, verified test counts, audit findings, and mathematical calculations recorded herein remain immutable and valid under the Tavoryn platform identity.

**Audit Date:** October 17, 2026  
**Auditor:** Principal Reliability Engineer & Quantitative Systems Auditor  
**Repository Directory:** `D:\G_BLOOM\amber-terminal`  
**Host Runtime Environment:** Node.js `v24.19.0` on Windows 11 (`win32-x64`)  
**Package Version:** `1.0.0` (from `package.json`)  
**Target Release Gate:** Phase 9 Closeout & Final Evidence Archival  
**Final Release-Gate Disposition:** **PASS WITH LIMITATIONS** (Live execution strictly disabled)

---

## 1. Evidence Inspected & Storage Locations

The following authoritative governance, execution, and test artifacts were directly inspected on physical disk:

| Document / Artifact | Physical File Path | Verification Scope | Status |
| :--- | :--- | :--- | :--- |
| **Observation Results** | [`docs/PHASE9_FIVE_DAY_OBSERVATION_RESULTS.md`](file:///d:/G_BLOOM/amber-terminal/docs/PHASE9_FIVE_DAY_OBSERVATION_RESULTS.md) | Session timestamps, durations, telemetry, and 5-session matrix | **VERIFIED** |
| **Baseline Freeze** | [`docs/PHASE9_BASELINE_FREEZE.md`](file:///d:/G_BLOOM/amber-terminal/docs/PHASE9_BASELINE_FREEZE.md) | Working tree, Node.js version, test counts, entry points, invariants | **VERIFIED** |
| **Observation Runbook** | [`docs/PHASE9_NON_LIVE_OBSERVATION_RUNBOOK.md`](file:///d:/G_BLOOM/amber-terminal/docs/PHASE9_NON_LIVE_OBSERVATION_RUNBOOK.md) | Startup procedures, 9 scenarios, failure escalation, runbook schedule | **VERIFIED** |
| **Release-Gate Sign-Off** | [`docs/RELEASE_GATE_EXECUTION_FENCING_SIGNOFF.md`](file:///d:/G_BLOOM/amber-terminal/docs/RELEASE_GATE_EXECUTION_FENCING_SIGNOFF.md) | Fencing race analysis (Case A vs B), Windows durability, live prerequisites | **VERIFIED** |
| **Extended Paper Validation** | [`docs/PHASE9_EXTENDED_PAPER_TRADING_VALIDATION.md`](file:///d:/G_BLOOM/amber-terminal/docs/PHASE9_EXTENDED_PAPER_TRADING_VALIDATION.md) | Multi-regime architecture, single execution ownership, restart recovery | **VERIFIED** |
| **Protected Account State** | [`data/paper-account.json`](file:///d:/G_BLOOM/amber-terminal/data/paper-account.json) | User paper trading balance, order history, journal, and SHA-256 digest | **VERIFIED** |
| **Market Benchmark Script** | [`scripts/benchmark-market-data.js`](file:///d:/G_BLOOM/amber-terminal/scripts/benchmark-market-data.js) | Canonical 50,000-event pipeline ingestion benchmark workload | **VERIFIED** |
| **Server Daemon Log** | `data/server.log` | Background HTTP server output and lifecycle logs | **VERIFIED** |

---

## 2. Independent Accounting Recalculation

An independent mathematical audit of the underlying trade executions generated during the multi-regime simulation session ([`PaperTradingSession`](file:///d:/G_BLOOM/amber-terminal/lib/broker/paper-session.js)) was conducted.

### 2.1 Trade Execution Audit Trail

Under `MockBrokerAdapter` configured with $100,000.00 initial cash, commission of $0.005/share (minimum $1.00/order), and 2 basis points (0.02%) execution slippage:

1. **Regime 1: Bullish Trend Accumulation (AAPL):**
   - Step 0 (Market = $152.00): BUY 10 AAPL @ Market. Fill price = $152.00 $\times$ 1.0002 = $152.0304. Fee = $1.00. Outlay = $1,520.304. Cash change = -$1,521.304. Position = 10 @ $152.0304.
   - Step 1 (Market = $154.00): BUY 10 AAPL @ Market. Fill price = $154.00 $\times$ 1.0002 = $154.0308. Fee = $1.00. Outlay = $1,540.308. Cash change = -$1,541.308. Position = 20 @ $153.0306.
   - Step 2 (Market = $156.00): BUY 10 AAPL @ Market. Fill price = $156.00 $\times$ 1.0002 = $156.0312. Fee = $1.00. Outlay = $1,560.312. Cash change = -$1,561.312. Position = 30 @ $154.0308.
   - Step 3 (Market = $158.00): BUY 10 AAPL @ Market. Fill price = $158.00 $\times$ 1.0002 = $158.0316. Fee = $1.00. Outlay = $1,580.316. Cash change = -$1,581.316. Position = 40 @ $155.0310.
   - Step 4 (Market = $160.00): BUY 10 AAPL @ Market. Fill price = $160.00 $\times$ 1.0002 = $160.0320. Fee = $1.00. Outlay = $1,600.320. Cash change = -$1,601.320.
   - *Regime 1 Subtotal:* Position = 50 AAPL @ average entry price of **$156.0312**. Total fees = **$5.00**. Total cash outlay = **$7,801.56**.

2. **Regime 2: Choppy Range Partial Fill (MSFT):**
   - Resting Limit BUY 20 MSFT @ $295.00 (Market = $300.00).
   - Partial Fill: 10 MSFT filled @ $295.00. Fee = $1.00. Outlay = $2,950.00. Cash change = -$2,951.00.
   - Cancel remaining 10 MSFT: Order cancelled cleanly.
   - *Regime 2 Subtotal:* Position = 10 MSFT @ **$295.00**. Total fees = **$1.00**. Total cash outlay = **$2,950.00**.

3. **Regime 3: Volatile Gap Down Liquidation (AAPL):**
   - Market gap down to $140.00. SELL 20 AAPL @ Market.
   - Fill price = $140.00 $\times$ 0.9998 = $139.9720. Fee = $1.00.
   - Gross proceeds = 20 $\times$ $139.9720 = $2,799.44.
   - Cost basis of 20 shares = 20 $\times$ $156.0312 = $3,120.624.
   - Realized P&L = $2,799.44 - $3,120.624 = **-$321.1840**.
   - Cash change = +$2,799.44 - $1.00 = +$2,798.44.
   - *Regime 3 Subtotal:* Remaining position = 30 AAPL @ $156.0312 (cost basis = $4,680.936). Total fees = **$1.00**.

4. **Regime 4: Feed Outage Fail-Closed Test:**
   - Order rejected by pre-trade risk gateway (`STALE_OR_DEGRADED_FEED`).
   - *Regime 4 Subtotal:* 0 fills, 0 fees, 0 cash change.

5. **Regime 5: Session Boundary Liquidation (Kill-Switch Flattening):**
   - MSFT Flattening: SELL 10 MSFT @ Market (Market = $300.00).
     - Fill price = $300.00 $\times$ 0.9998 = $299.94. Fee = $1.00.
     - Gross proceeds = 10 $\times$ $299.94 = $2,999.40. Cost basis = $2,950.00.
     - Realized P&L = $2,999.40 - $2,950.00 = **+$49.4000**.
     - Cash change = +$2,999.40 - $1.00 = +$2,998.40. Residual MSFT = **0**.
   - AAPL Flattening: SELL 30 AAPL @ Market (Market = $140.00).
     - Fill price = $140.00 $\times$ 0.9998 = $139.9720. Fee = $1.00.
     - Gross proceeds = 30 $\times$ $139.9720 = $4,199.16. Cost basis = 30 $\times$ $156.0312 = $4,680.936.
     - Realized P&L = $4,199.16 - $4,680.936 = **-$481.7760**.
     - Cash change = +$4,199.16 - $1.00 = +$4,198.16. Residual AAPL = **0**.
   - *Regime 5 Subtotal:* Total fees = **$2.00**. Residual positions = **0**.

### 2.2 Independent Reconciliation Recalculation

- **Total Broker Fees:**
  $$\text{Fees} = \$5.00 (\text{Regime 1}) + \$1.00 (\text{Regime 2}) + \$1.00 (\text{Regime 3}) + \$2.00 (\text{Regime 5}) = \mathbf{\$9.00}$$
- **Total Realized P&L:**
  $$\text{Realized P&L} = -\$321.1840 (\text{AAPL}) + \$49.4000 (\text{MSFT}) - \$481.7760 (\text{AAPL}) = -\mathbf{\$753.5600}$$
- **Ending Cash Recalculation:**
  $$\text{Ending Cash} = \text{Starting Cash} + \text{Realized P&L} - \text{Total Fees} - \text{Open Position Outlay}$$
  $$\text{Expected Cash} = \$100,000.00 + (-\$753.56) - \$9.00 - \$0.00 = \mathbf{\$99,237.44}$$
- **Recorded Ending Cash:** **$99,237.44**
- **Discrepancy:**
  $$\text{Discrepancy} = |\$99,237.44 - \$99,237.44| = \mathbf{\$0.0000}$$
- **Residual Positions:** **0 open positions** across all symbols.

**Audit Finding:** The reported accounting values in [`docs/PHASE9_FIVE_DAY_OBSERVATION_RESULTS.md`](file:///d:/G_BLOOM\amber-terminal\docs\PHASE9_FIVE_DAY_OBSERVATION_RESULTS.md) are mathematically exact, independently verified from underlying execution records, and adhere strictly to the universal cash conservation law.

---

## 3. Protected State Verification

The cryptographic digest of the primary user paper trading account file was computed and verified against the established baseline:

- **Target File:** `data/paper-account.json`
- **Documented Reference Hash:**  
  `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`
- **Audit Verification Command:**  
  `powershell -Command "Get-FileHash data/paper-account.json -Algorithm SHA256"`
- **Calculated Audit Hash:**  
  `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`
- **Byte Delta:** **0 bytes modified** (100% exact byte-for-byte identity preserved).

---

## 4. Test Evidence Verification

A full, independent rerun of the repository test suite was executed during this audit:

- **Execution Command:** `npm test` (via `node scripts/test.js`)
- **Execution Timestamp:** `2026-10-17T15:35:14+05:30`
- **Exit Code:** `0`
- **Elapsed Duration:** `1985.94 ms (~1.99s)`
- **Actual Counts:**
  - **Passed Tests:** **572**
  - **Failed Tests:** **0**
  - **Skipped / Cancelled / Todo Tests:** **0**
  - **Test Suites Executed:** **38 test suites**
- **Consistency Verification:** The recorded count of 572 tests matches the baseline across [`docs/PHASE9_BASELINE_FREEZE.md`](file:///d:/G_BLOOM/amber-terminal/docs/PHASE9_BASELINE_FREEZE.md), [`docs/RELEASE_GATE_EXECUTION_FENCING_SIGNOFF.md`](file:///d:/G_BLOOM/amber-terminal/docs/RELEASE_GATE_EXECUTION_FENCING_SIGNOFF.md), and [`docs/PHASE9_FIVE_DAY_OBSERVATION_RESULTS.md`](file:///d:/G_BLOOM/amber-terminal/docs/PHASE9_FIVE_DAY_OBSERVATION_RESULTS.md).

---

## 5. Confirmed Facts, Unverified Claims & Known Limitations

### 5.1 Confirmed Empirical Facts
1. **Offline Regression Stability:** All 572 automated tests pass deterministically in under 2 seconds.
2. **Deterministic Multi-Regime Execution:** The 5-regime simulation executes cleanly with penny-exact cash conservation and 0 residual exposure.
3. **Fail-Closed Persistence Recovery:** Corrupted state files and active kill switches survive process restarts, halting trading immediately.
4. **Account State Preservation:** `data/paper-account.json` remained unmodified across all operations.
5. **Live Execution Protection:** `BaseBrokerAdapter` throws an unhandled `AuthenticationError` if `LIVE` environment is configured without confirmation tokens.

### 5.2 Clarifications & Disclaimers (Distinguishing Scenarios from Calendar Soak)
1. **Accelerated Protocol Runs vs. Real-World Soak:**  
   The five observation sessions documented in [`docs/PHASE9_FIVE_DAY_OBSERVATION_RESULTS.md`](file:///d:/G_BLOOM/amber-terminal/docs/PHASE9_FIVE_DAY_OBSERVATION_RESULTS.md) represent five sequential, accelerated protocol evaluations executed on October 17, 2026. They do **not** represent five calendar days of unattended real-world soak time.
2. **Untested Scenarios:**  
   Zero observed failures in simulated regimes does not prove that unhandled edge cases are impossible under extreme live-market conditions (e.g. broker API format mutations, persistent WebSocket connection drops exceeding hours, exchange-wide halts).

### 5.3 Known System Limitations
1. **Legacy Broker TOCTOU Race Condition:**  
   On commercial retail broker APIs that do not validate fencing tokens (e.g. Alpaca, IBKR, Tradier, Binance), a thread/event loop pause occurring *after* `assertOwnership()` permits a stale order or cancellation to reach the exchange upon waking. Client-side locks alone cannot eliminate this race.
2. **Windows NTFS Directory Metadata Durability:**  
   Node.js on Windows does not support directory `fsync` (`EISDIR`/`EPERM`). Durability relies on atomic renaming (`MoveFileExW`) and NTFS journal consistency.
3. **No Autonomous Multi-Day Daemon Scheduler:**  
   The repository does not include a background cron scheduler daemon; multi-day observations must be driven by operator runbooks.

---

## 6. Final Disposition & Archival Sign-Off

### **Final Release-Gate Disposition: PASS WITH LIMITATIONS**

### Justification:
- All documentation artifacts are mutually consistent, mathematically exact, and supported by physical evidence and reproducible test execution.
- Universal cash conservation is verified to $0.0000 discrepancy.
- Protected user state (`data/paper-account.json`) remains completely unmodified.
- Known architectural boundaries (fencing TOCTOU race on unfenced brokers, Windows directory fsync) are clearly and honestly documented.
- Live-money execution remains strictly disabled.

---

## 7. Next Safe Operational Action

1. **Maintain Phase 9 Freeze:** Keep all Phase 9 implementation, test, and documentation artifacts frozen in their current state.
2. **Do Not Begin Phase 10:** Phase 10 development is not authorized.
3. **Do Not Enable Live Trading:** Real broker credentials and live execution endpoints remain strictly blocked.
4. **Future Implementation Preconditions:** Before live execution can ever be considered, implement a dedicated Single Serialized Dispatch Authority daemon with epoch validation and risk-reducing handover protocols as specified in [`docs/RELEASE_GATE_EXECUTION_FENCING_SIGNOFF.md`](file:///d:/G_BLOOM/amber-terminal/docs/RELEASE_GATE_EXECUTION_FENCING_SIGNOFF.md).
