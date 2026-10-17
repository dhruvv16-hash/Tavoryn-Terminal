# Tavoryn Terminal — DCF Numerical Consistency & Dimensional Audit

**Document Reference:** `docs/maintenance/phase9-dcf-numerical-consistency-audit.md`  
**Execution Timestamp:** 2026-10-17  
**Auditor:** Principal Quantitative Systems Architect & Independent Financial Auditor  
**Repository Path:** `D:\G_BLOOM\Tavoryn-Terminal`  
**Execution Environment:** Windows x64 / Node.js v24.19.0  
**Baseline Stage:** Phase 9 Frozen Baseline  
**Official Audit Disposition:** **PASS WITH LIMITATIONS**  

---

## 1. Executive Summary & Verification Objective

This audit independently reconciles the numerical outputs of the Discounted Cash Flow (DCF) model reported in [`docs/maintenance/phase9-closure-audit.md`](file:///D:/G_BLOOM/Tavoryn-Terminal/docs/maintenance/phase9-closure-audit.md) against the actual implementation ([`lib/fn/dcf.js`](file:///D:/G_BLOOM/Tavoryn-Terminal/lib/fn/dcf.js)), browser interface ([`public/js/fn/dcf.js`](file:///D:/G_BLOOM/Tavoryn-Terminal/public/js/fn/dcf.js)), upstream provider schemas, and rigorous manual arithmetic.

No reported figure or test assertion was taken as given. Every intermediate cash flow, present value factor, terminal value, equity bridge component, and margin of safety calculation was computed independently using analytical mathematics before comparison with the software engine.

### Core Audit Findings
1. **Mathematical Consistency:** The reported primary valuation outputs—Enterprise Value ($\mathbf{\$1,967,683.09M}$), Implied Shares ($\mathbf{15,555.56M}$), Intrinsic Value per share ($\mathbf{\$126.49}$), and Margin of Safety ($\mathbf{-43.78\%}$)—are **100% mutually consistent** with the underlying fixture parameters and the documented 5-year Gordon Growth DCF model.
2. **Intermediate Transcription Discrepancy Resolved:** An intermediate code comment in [`test/dcf.test.js`](file:///D:/G_BLOOM/Tavoryn-Terminal/test/dcf.test.js) listed `480287.49M` (sumPV) and `1487395.60M` (pvTV) instead of the exact analytical values `480393.74M` and `1487289.35M`. Both pairs sum identically to $EV = \$1,967,683.09\text{M}$. The comment was corrected and explicit assertions for `res.pvOfProjections`, `res.terminalValue`, and `res.pvOfTerminalValue` were added to Test 12.
3. **Dimensional Homogeneity Confirmed:** Upstream statement thousands (`$k`) are scaled to Millions (`$M`) strictly once upon ingestion. Market Cap in whole dollars divided by $10^6$ and divided by share price produces shares in millions ($\frac{\$M}{\$/\text{share}} = M \text{ shares}$). Equity value in $\$M$ divided by shares in $M$ yields dollars per share ($\frac{\$}{\text{share}}$).
4. **Protected State Intact:** Cryptographic SHA-256 and byte size of [`data/paper-account.json`](file:///D:/G_BLOOM/Tavoryn-Terminal/data/paper-account.json) remained bit-for-bit identical (2,386 bytes, 0 delta).
5. **Phase 9 Freeze Preserved:** No live trading, broker order routing, or Phase 10 / 11 code was introduced.

---

## 2. Input Fixture Trace (Test 12 / Apple Inc. FY2024 Reference)

The quantitative fixture evaluated in Test 12 was constructed from audited Apple Inc. market and financial statement inputs:

| Parameter | Raw Upstream Value | Normalized Engine Input | Units / Dimensionality | Source / Methodology |
| :--- | :--- | :--- | :--- | :--- |
| **Current Stock Price ($P$)** | `$225.00` | `225.00` | Dollars per Share ($\$/\text{share}$) | Market price quote |
| **Market Capitalization** | `"$3,500,000,000,000"` | `3,500,000.00` | Millions of Dollars ($\$M$) | Whole dollars $\div 10^6$ |
| **Diluted Shares (Implied)** | — | `15,555.555556` | Millions of Shares ($M$) | $\frac{\text{Market Cap } (\$M)}{\text{Price } (\$/\text{share})}$ |
| **Operating Cash Flow ($OCF$)** | `"$111,482,000"` | `111,482.00` | Millions of Dollars ($\$M$) | Raw thousands $\div 1,000$ |
| **Capital Expenditures ($CapEx$)**| `"($12,718,000)"` | `12,718.00` | Millions of Dollars ($\$M$) | Magnitude of thousands $\div 1,000$ |
| **Base Free Cash Flow ($FCF_0$)** | — | `98,764.00` | Millions of Dollars ($\$M$) | $OCF - CapEx$ |
| **Forecast Growth Rate ($g$)** | `0.08` | `0.08` | Dimensionless Rate ($8.0\%$) | 5-Year compound annual growth |
| **Discount Rate ($WACC$)** | `0.09` | `0.09` | Dimensionless Rate ($9.0\%$) | Weighted average cost of capital |
| **Terminal Growth Rate ($g_{term}$)** | `0.025` | `0.025` | Dimensionless Rate ($2.5\%$) | Perpetual Gordon Growth rate |
| **Total Cash & Equivalents** | — | `0.00` | Millions of Dollars ($\$M$) | Fixture baseline (zero net debt) |
| **Total Debt** | — | `0.00` | Millions of Dollars ($\$M$) | Fixture baseline (zero net debt) |

---

## 3. Independent Analytical Hand Calculations

Every quantitative component was computed independently using exact arithmetic:

### A. Explicit 5-Year Cash Flow Forecast & Present Value ($WACC = 9.0\%$)
The discount factor for year $t$ is:
$$DF_t = \frac{1}{(1 + WACC)^t} = \frac{1}{(1.09)^t}$$

- **Year 1 ($t = 1$):**
  $$FCF_1 = 98,764.00 \times 1.08 = \mathbf{106,665.1200M}$$
  $$PV_1 = \frac{106,665.1200}{1.09^1} = \mathbf{97,857.90826M}$$
- **Year 2 ($t = 2$):**
  $$FCF_2 = 106,665.1200 \times 1.08 = \mathbf{115,198.3296M}$$
  $$PV_2 = \frac{115,198.3296}{1.09^2} = \mathbf{96,960.12928M}$$
- **Year 3 ($t = 3$):**
  $$FCF_3 = 115,198.3296 \times 1.08 = \mathbf{124,414.1960M}$$
  $$PV_3 = \frac{124,414.1960}{1.09^3} = \mathbf{96,070.58681M}$$
- **Year 4 ($t = 4$):**
  $$FCF_4 = 124,414.1960 \times 1.08 = \mathbf{134,367.3316M}$$
  $$PV_4 = \frac{134,367.3316}{1.09^4} = \mathbf{95,189.20528M}$$
- **Year 5 ($t = 5$):**
  $$FCF_5 = 134,367.3316 \times 1.08 = \mathbf{145,116.7182M}$$
  $$PV_5 = \frac{145,116.7182}{1.09^5} = \mathbf{94,315.90982M}$$

**Sum of Present Values of Explicit Forecast:**
$$\sum_{t=1}^5 PV_t = 97857.90826 + 96960.12928 + 96070.58681 + 95189.20528 + 94315.90982 = \mathbf{480,393.73945M \approx \$480,393.74M}$$

### B. Terminal Value & Discounted Terminal Value (Gordon Growth)
Terminal year cash flow ($t = 6$):
$$FCF_6 = FCF_5 \times (1 + g_{term}) = 145,116.71818 \times 1.025 = \mathbf{148,744.63613M}$$

Undiscounted Terminal Value at $t = 5$:
$$TV_5 = \frac{FCF_6}{WACC - g_{term}} = \frac{148,744.63613}{0.09 - 0.025} = \frac{148,744.63613}{0.065} = \mathbf{2,288,379.01741M \approx \$2,288,379.02M}$$

Present Value of Terminal Value discounted to $t = 0$:
$$PV(TV) = \frac{TV_5}{(1 + WACC)^5} = \frac{2,288,379.01741}{(1.09)^5} = \frac{2,288,379.01741}{1.53862395489} = \mathbf{1,487,289.34716M \approx \$1,487,289.35M}$$

### C. Enterprise Value and Equity Value Bridge
$$\text{Enterprise Value } (EV) = \sum_{t=1}^5 PV_t + PV(TV) = 480,393.73945 + 1,487,289.34716 = \mathbf{1,967,683.08661M \approx \$1,967,683.09M}$$

$$\text{Equity Value} = EV + \text{Cash} - \text{Total Debt} = 1,967,683.08661 + 0.00 - 0.00 = \mathbf{1,967,683.08661M \approx \$1,967,683.09M}$$

### D. Per-Share Intrinsic Value & Margin of Safety
Diluted Shares implied from Market Capitalization:
$$\text{Shares} = \frac{\text{Market Cap } (\$M)}{\text{Price } (\$/\text{share})} = \frac{3,500,000.00}{225.00} = \mathbf{15,555.555556M \text{ shares}}$$

Intrinsic Value per Share:
$$\text{Intrinsic Value} = \frac{\text{Equity Value } (\$M)}{\text{Shares } (M)} = \frac{1,967,683.08661}{15,555.555556} = \mathbf{\$126.49391 \approx \$126.49}$$

Margin of Safety ($MoS$):
$$MoS = \frac{\text{Intrinsic Value} - \text{Current Price}}{\text{Current Price}} \times 100 = \frac{126.49391 - 225.00}{225.00} \times 100 = \mathbf{-43.78048\% \approx -43.78\%}$$

---

## 4. Reconciliation Table: Independent Math vs. Engine vs. Report

| Valuation Metric | Independent Analytical Hand Calc | Software Engine Output (`lib/fn/dcf.js`) | Reported in Closure Audit | Absolute Variance | Reconciliation Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Sum PV of FCF** | $\$480,393.74\text{M}$ | $\$480,393.74\text{M}$ | $\$480,393.74\text{M}$ | $< 0.001\text{M}$ | **EXACT MATCH** |
| **Terminal Value ($TV$)** | $\$2,288,379.02\text{M}$ | $\$2,288,379.02\text{M}$ | $\$2,288,379.02\text{M}$ | $< 0.001\text{M}$ | **EXACT MATCH** |
| **PV of Terminal Value** | $\$1,487,289.35\text{M}$ | $\$1,487,289.35\text{M}$ | $\$1,487,289.35\text{M}$ | $< 0.001\text{M}$ | **EXACT MATCH** |
| **Enterprise Value ($EV$)** | $\$1,967,683.09\text{M}$ | $\$1,967,683.09\text{M}$ | $\$1,967,683.09\text{M}$ | $< 0.001\text{M}$ | **EXACT MATCH** |
| **Equity Value** | $\$1,967,683.09\text{M}$ | $\$1,967,683.09\text{M}$ | $\$1,967,683.09\text{M}$ | $< 0.001\text{M}$ | **EXACT MATCH** |
| **Implied Diluted Shares** | $15,555.56\text{M}$ | $15,555.56\text{M}$ | $15,555.56\text{M}$ | $< 0.001\text{M}$ | **EXACT MATCH** |
| **Intrinsic Value / Share** | $\$126.49$ | $\$126.49$ | $\$126.49$ | $< 0.001$ | **EXACT MATCH** |
| **Margin of Safety** | $-43.78\%$ | $-43.78\%$ | $-43.78\%$ | $0.0000\%$ | **EXACT MATCH** |

---

## 5. Investigation of Intermediate Comment Discrepancy

### Finding
In the initial implementation of Test 12 in `test/dcf.test.js`, the code comment read:
```javascript
// 5-year sum PV = 480287.49M; TV = 2288339.46M; PV(TV) = 1487395.60M; EV = 1967683.09M
```
- The sum of `480287.49 + 1487395.60 = 1967683.09`, matching the correct Enterprise Value.
- However, the breakdown had an internal transcription variance of approximately $\$106\text{M}$ between explicit cash flow sum and discounted terminal value.
- The actual software engine never used this comment; it correctly calculated $480,393.74\text{M}$ and $1,487,289.35\text{M}$.

### Remediation Applied & Verified
The comment in [`test/dcf.test.js`](file:///D:/G_BLOOM\Tavoryn-Terminal\test\dcf.test.js#L297-L302) was updated to match the exact unrounded analytical values, and explicit assertions were added directly to Test 12:
```javascript
assert.ok(Math.abs(res.pvOfProjections - 480393.74) < 1.0, `sumPV should be ~480393.74M, got ${res.pvOfProjections}`);
assert.ok(Math.abs(res.terminalValue - 2288379.02) < 1.0, `TV should be ~2288379.02M, got ${res.terminalValue}`);
assert.ok(Math.abs(res.pvOfTerminalValue - 1487289.35) < 1.0, `pvTV should be ~1487289.35M, got ${res.pvOfTerminalValue}`);
assert.ok(Math.abs(res.enterpriseValue - 1967683.09) < 1.0, `EV should be ~1967683M, got ${res.enterpriseValue}`);
```

---

## 6. Dimensional Consistency Verification

Every algebraic step was verified for dimensional homogeneity:

1. **Statement Values:**
   - Raw Nasdaq row: `"$111,482,000"` $\to$ `parseNum` $= 111482000$.
   - Scale factor: $\div 1,000$ applied once $\to \$111,482\text{M}$.
   - Magnitude of CapEx: $\div 1,000$ applied once $\to \$12,718\text{M}$.
   - Net difference: $\$111,482\text{M} - \$12,718\text{M} = \$98,764\text{M}$ ($FCF$).
2. **Implied Diluted Share Count:**
   - Raw Market Cap: `"$3,500,000,000,000"` (whole dollars).
   - Market Cap in Millions: $\$3,500,000,000,000 \div 10^6 = \$3,500,000\text{M}$.
   - Share Count:
     $$\text{Shares} = \frac{\$3,500,000\text{M}}{\$225.00/\text{share}} = 15,555.555556\text{M shares}$$
   - Units: $\frac{\$ \times 10^6}{\$ / \text{share}} = \text{shares} \times 10^6 = M \text{ shares}$.
3. **Per-Share Intrinsic Value:**
   - Intrinsic Value:
     $$\frac{\text{Equity Value } (\$M)}{\text{Shares } (M)} = \frac{\$1,967,683.08661 \times 10^6}{15,555.555556 \times 10^6 \text{ shares}} = \$126.49391/\text{share}$$
   - Dimensional consistency holds exactly.

---

## 7. Execution Evidence of Canonical Test Suites

All tests were executed fresh in PowerShell:

```powershell
# 1. DCF Test Suite Alone
node --test test/dcf.test.js
# Exit Code: 0 | Tests: 12 passed / 0 failed (75.6 ms)

# 2. Targeted DCF and Stress Suites
node --test test/dcf.test.js test/stress.test.js
# Exit Code: 0 | Tests: 24 passed / 0 failed (90.9 ms)

# 3. Full Offline Repository Test Suite
npm test
# Exit Code: 0 | Tests: 604 passed / 0 failed across 39 suites (13,573 ms)
```

---

## 8. State Preservation and Account Hash Check

The paper account file [`data/paper-account.json`](file:///D:/G_BLOOM/Tavoryn-Terminal/data/paper-account.json) was verified before and after this audit:

| Checkpoint | File Path | Byte Size | SHA-256 Checksum | Integrity Result |
| :--- | :--- | :---: | :--- | :---: |
| **Pre-Audit Baseline** | `data/paper-account.json` | `2,386` bytes | `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D` | Baseline Recorded |
| **Post-Audit Verification** | `data/paper-account.json` | `2,386` bytes | `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D` | **BYTE-FOR-BYTE IDENTICAL** |

---

## 9. Final Release Gate Determination

```
========================================================================================
DCF NUMERICAL CONSISTENCY AUDIT SIGN-OFF
========================================================================================
Repository:             Tavoryn Terminal (D:\G_BLOOM\Tavoryn-Terminal)
Release Baseline:       Phase 9 Frozen Baseline (Preserved)
Offline Tests:          604 Passed / 0 Failed across 39 suites (100% Pass Rate)
DCF Unit Tests:         12 Passed / 0 Failed (100% Pass Rate)
DCF + Stress Tests:     24 Passed / 0 Failed (100% Pass Rate)
Protected Ledger State: 8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D (0 delta)
Runtime Dependencies:   Zero runtime dependencies (dependencies: {})
FINAL DISPOSITION:      PASS WITH LIMITATIONS
========================================================================================
```
