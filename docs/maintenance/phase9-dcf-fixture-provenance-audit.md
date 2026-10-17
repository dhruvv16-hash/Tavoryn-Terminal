# Tavoryn Terminal — Final DCF Fixture Provenance & Equity Bridge Audit

**Document Reference:** `docs/maintenance/phase9-dcf-fixture-provenance-audit.md`  
**Execution Timestamp:** 2026-10-17  
**Auditor:** Principal Quantitative Systems Architect & Independent Financial Auditor  
**Repository Path:** `D:\G_BLOOM\Tavoryn-Terminal`  
**Execution Runtime:** Node.js v24.19.0 on `win32 (x64)`  
**Baseline Stage:** Phase 9 Frozen Baseline  
**Official Final Disposition:** **PASS WITH LIMITATIONS**  

---

## 1. Executive Summary & Verification Mandate

This audit delivers the final independent reconciliation of the Discounted Cash Flow (DCF) numerical fixture, its input provenance, and the mathematical mechanics of the **Enterprise-Value-to-Equity-Value Bridge**.

### Primary Audit Question Investigated
In the baseline evaluation reported in previous audits:
- **Enterprise Value ($EV$):** $\$1,967,683.09\text{M}$
- **Equity Value:** $\$1,967,683.09\text{M}$
- **Implied Diluted Shares:** $15,555.56\text{M}$
- **Intrinsic Value per Share:** $\$126.49$
- **Current Share Price:** $\$225.00$
- **Margin of Safety ($MoS$):** $-43.78\%$

The audit investigated whether the equality $EV \equiv \text{Equity Value}$ represented an implementation defect, an accidental variable reuse, or an explicit feature of the fixture inputs.

### Audit Findings
1. **Mathematical Explanation of $EV = \text{Equity Value}$:** In the baseline call of Test 12, `cashAndEquivalents` and `totalDebt` were not passed in the argument object. By design of [`lib/fn/dcf.js`](file:///D:/G_BLOOM/Tavoryn-Terminal/lib/fn/dcf.js), unsupplied capital structure parameters default safely to `0` (`cashAndEquivalents = 0, totalDebt = 0`). Consequently, $\text{Net Debt} = \text{Debt} - \text{Cash} = 0 - 0 = 0$. The equity bridge $\text{Equity Value} = EV - \text{Net Debt}$ computed $EV - 0 = EV$. Enterprise Value and Equity Value are computed separately through explicit equations; they were equal strictly because the baseline fixture evaluated a zero-net-debt capital structure.
2. **Nonzero Balance Sheet Bridge Verified:** When Apple Inc.'s actual balance sheet cash ($\$54,697\text{M}$) and debt ($\$98,657\text{M}$) from Nasdaq Form 10-K filings are supplied, $\text{Net Debt} = \$43,960\text{M}$, and the bridge correctly reduces Equity Value to $\mathbf{\$1,923,723.09M}$, adjusting Intrinsic Value to $\mathbf{\$123.67}$ and widening Margin of Safety to $\mathbf{-45.04\%}$. Both the zero-debt baseline and the active net debt bridge are now explicitly asserted in Test 12.
3. **Provable Input Provenance:** Every fixture input was traced to its source (provider string, derived ratio, or analytical assumption).
4. **Protected State Intact:** Cryptographic SHA-256 and byte size of `data/paper-account.json` were verified before and after all checks (2,386 bytes, 0 delta).
5. **Phase 9 Freeze Preserved:** No Phase 10 / 11 code or live trading gateways were introduced.

---

## 2. Input Fixture Provenance & Data Inventory

The exact fixture evaluated in Test 12 of [`test/dcf.test.js`](file:///D:/G_BLOOM/Tavoryn-Terminal/test/dcf.test.js) was constructed from audited market quotes and SEC Form 10-K filings for Apple Inc. (`AAPL`):

| Parameter | Raw Upstream Value | Normalized Engine Input | Units / Scale | Provenance Type | Source Endpoint / Authority |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Share Price ($P$)** | `$225.00` | `225.00` | Dollars / share ($\$$) | Hard-coded quote | Market price benchmark |
| **Market Capitalization** | `"$3,500,000,000,000"` | `3,500,000.00` | Millions of Dollars ($\$M$) | Provider-sourced string | Nasdaq Summary API (`fin.stats`) |
| **Diluted Shares** | — | `15,555.555556` | Millions of shares ($M$) | Derived ratio | $\frac{\text{Market Cap } (\$M)}{\text{Price } (\$/\text{share})}$ |
| **Operating Cash Flow ($OCF$)** | `"$111,482,000"` | `111,482.00` | Millions of Dollars ($\$M$) | Provider-sourced string | Nasdaq Statement API (`cashFlowTable`) |
| **CapEx Outflow** | `"($12,718,000)"` | `12,718.00` | Millions of Dollars ($\$M$) | Provider-sourced string | Nasdaq Statement API (`cashFlowTable`) |
| **Base Free Cash Flow ($FCF_0$)** | — | `98,764.00` | Millions of Dollars ($\$M$) | Derived difference | $OCF - CapEx$ |
| **Forecast Growth Rate ($g$)** | `0.08` | `0.08` | Dimensionless ($8.0\%$) | Analytical assumption | 5-Year compound forecast |
| **Discount Rate ($WACC$)** | `0.09` | `0.09` | Dimensionless ($9.0\%$) | Analytical assumption | Cost of capital benchmark |
| **Terminal Growth ($g_{term}$)** | `0.025` | `0.025` | Dimensionless ($2.5\%$) | Analytical assumption | Long-term GDP/inflation proxy |
| **Forecast Horizon ($T$)** | `5` | `5` | Years | Analytical assumption | Standard multi-year explicit period |
| **Cash & Short-Term Investments** | `"$35,934k + $18,763k"` | `54,697.00` | Millions of Dollars ($\$M$) | Provider-sourced strings | Nasdaq Balance Sheet (`balanceSheetTable`) |
| **Total Short & Long-Term Debt** | `"$20,329k + $78,328k"` | `98,657.00` | Millions of Dollars ($\$M$) | Provider-sourced strings | Nasdaq Balance Sheet (`balanceSheetTable`) |

---

## 3. Independent Recalculation of the Equity Bridge

The equity bridge equation implemented in [`lib/fn/dcf.js`](file:///D:/G_BLOOM/Tavoryn-Terminal/lib/fn/dcf.js#L43-L146) is:
$$\text{Net Debt} = \text{Total Debt} - \text{Cash \& Equivalents}$$
$$\text{Equity Value} = \text{Enterprise Value} - \text{Net Debt} \equiv \text{Enterprise Value} + \text{Cash \& Equivalents} - \text{Total Debt}$$

### Verification of Core Questions
1. **Was cash zero?** In Part A (baseline), cash was not passed; defaulted to `0.00`. In Part B (balance sheet), cash is `54,697.00` ($M).
2. **Was debt zero?** In Part A (baseline), debt was not passed; defaulted to `0.00`. In Part B (balance sheet), debt is `98,657.00` ($M).
3. **Did cash equal debt?** No. In Part A, both are 0. In Part B, Debt ($98,657M) exceeds Cash ($54,697M) by Net Debt of $\$43,960M$.
4. **Were inputs omitted because they were unavailable?** In Part A, cash and debt were omitted in the test invocation to test the zero-debt baseline.
5. **Did the engine default values to zero?** Yes, via parameter defaults `cashAndEquivalents = 0, totalDebt = 0`.
6. **Were EV and Equity Value calculated separately?** Yes. Lines 145–146 in `lib/fn/dcf.js`:
   ```javascript
   const enterpriseValue = sumPV + pvTerminalValue;
   const equityValue = enterpriseValue - netDebt;
   ```
   Separate variables, separate arithmetic steps.

### Equity Bridge Numerical Results

| Capital Structure Case | Enterprise Value ($EV$) | Cash & Equivalents | Total Debt | Net Debt | Equity Value | Intrinsic / Share | Margin of Safety |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Part A: Zero-Debt Baseline** | $\$1,967,683.09\text{M}$ | $\$0.00\text{M}$ | $\$0.00\text{M}$ | $\$0.00\text{M}$ | **$\$1,967,683.09M$** | **$\$126.49$** | **$-43.78\%$** |
| **Part B: Balance Sheet Bridge** | $\$1,967,683.09\text{M}$ | $\$54,697.00\text{M}$ | $\$98,657.00\text{M}$ | $\$43,960.00\text{M}$ | **$\$1,923,723.09M$** | **$\$123.67$** | **$-45.04\%$** |
| **Capital Structure Delta** | **$\$0.00M$** | **$+\$54,697M$** | **$+\$98,657M$** | **$+\$43,960M$** | **$-\$43,960M$** | **$-\$2.82$** | **$-1.26\%$** |

**Conclusion:** The equity bridge functions with complete mathematical accuracy. Enterprise Value is appropriately invariant to capital structure, while Equity Value, Intrinsic Value per share, and Margin of Safety dynamically reflect Net Debt deductions.

---

## 4. Independent First-Principles DCF Calculation

Every intermediate quantity was computed without calling application functions:

### 1. Annual Forecast FCF ($g = 8.0\%$)
- $FCF_1 = 98,764.00 \times 1.08 = \mathbf{106,665.1200M}$
- $FCF_2 = 106,665.1200 \times 1.08 = \mathbf{115,198.3296M}$
- $FCF_3 = 115,198.3296 \times 1.08 = \mathbf{124,414.1960M}$
- $FCF_4 = 124,414.1960 \times 1.08 = \mathbf{134,367.3316M}$
- $FCF_5 = 134,367.3316 \times 1.08 = \mathbf{145,116.7182M}$

### 2. Annual Discounted FCF ($WACC = 9.0\%$)
- $PV_1 = \frac{106,665.1200}{1.09^1} = \mathbf{97,857.90826M}$
- $PV_2 = \frac{115,198.3296}{1.09^2} = \mathbf{96,960.12928M}$
- $PV_3 = \frac{124,414.1960}{1.09^3} = \mathbf{96,070.58681M}$
- $PV_4 = \frac{134,367.3316}{1.09^4} = \mathbf{95,189.20528M}$
- $PV_5 = \frac{145,116.7182}{1.09^5} = \mathbf{94,315.90982M}$

### 3. Sum of Explicit Present Values
$$\sum_{t=1}^5 PV_t = 97857.90826 + 96960.12928 + 96070.58681 + 95189.20528 + 94315.90982 = \mathbf{480,393.73945M \approx \$480,393.74M}$$

### 4. Terminal Cash Flow & Gordon Growth Terminal Value
$$FCF_6 = 145,116.71818 \times (1 + 0.025) = \mathbf{148,744.63613M}$$
$$TV_5 = \frac{148,744.63613}{0.09 - 0.025} = \frac{148,744.63613}{0.065} = \mathbf{2,288,379.01741M \approx \$2,288,379.02M}$$

### 5. Present Value of Terminal Value
$$PV(TV) = \frac{2,288,379.01741}{(1.09)^5} = \frac{2,288,379.01741}{1.53862395489} = \mathbf{1,487,289.34716M \approx \$1,487,289.35M}$$

### 6. Enterprise Value
$$EV = \sum PV + PV(TV) = 480,393.73945 + 1,487,289.34716 = \mathbf{1,967,683.08661M \approx \$1,967,683.09M}$$

### 7. Per-Share Valuation & Margin of Safety
Implied Diluted Shares:
$$\text{Shares} = \frac{\$3,500,000.00\text{M}}{\$225.00} = \mathbf{15,555.555556M \text{ shares}}$$

- **Baseline Case (Net Debt = $0):**
  $$\text{Intrinsic} = \frac{\$1,967,683.08661\text{M}}{15,555.555556\text{M}} = \mathbf{\$126.49391 \approx \$126.49}$$
  $$MoS = \frac{126.49391 - 225.00}{225.00} \times 100 = \mathbf{-43.78\%}$$
- **Balance Sheet Case (Net Debt = $43,960M):**
  $$\text{Intrinsic} = \frac{\$1,923,723.08661\text{M}}{15,555.555556\text{M}} = \mathbf{\$123.66724 \approx \$123.67}$$
  $$MoS = \frac{123.66724 - 225.00}{225.00} \times 100 = \mathbf{-45.04\%}$$

---

## 5. Share-Count Provenance Code Paths

All four execution branches were audited in [`lib/fn/dcf.js`](file:///D:/G_BLOOM/Tavoryn-Terminal/lib/fn/dcf.js):

1. **Directly Reported Shares (`"filing_reported"`):** When `shares outstanding` exists in `fin.stats`, `sharesSource` is set to `"filing_reported"` and `sharesNote` to `"Reported directly in company statistics."`
2. **Implied from Market Cap (`"derived_from_market_cap"`):** When filing share count is omitted but Market Cap exists, `sharesOutstanding = (marketCapDollars / 1e6) / currentPrice`, `sharesSource = "derived_from_market_cap"`, and `sharesNote = "Derived from reported Market Capitalization divided by Share Price ($M / $ = M shares)."`
3. **User Query Override (`"user_override"`):** When query parameter `?shares=...` is passed, `effectiveShares = userShares`, `sharesSource = "user_override"`, and `sharesNote = "User supplied custom share count override (X M shares)."`
4. **Fallback Estimate (`"fallback_estimate"`):** When no filing, quote, or user data exists, defaults to 1,000M shares with `sharesSource = "fallback_estimate"`.

**UI Alignment:** In [`public/js/fn/dcf.js`](file:///D:/G_BLOOM/Tavoryn-Terminal/public/js/fn/dcf.js#L225-L235), `sharesLabel` dynamically switches between `Diluted Shares (Implied from Mkt Cap / Price)`, `Shares Outstanding (Reported)`, `Shares Outstanding (User Override)`, and `Shares Outstanding (Estimated Fallback)`. Implied shares are never misrepresented as reported diluted shares.

---

## 6. Test Independence Assessment

The unit tests in [`test/dcf.test.js`](file:///D:/G_BLOOM/Tavoryn-Terminal/test/dcf.test.js) were inspected to ensure assertions test mathematical laws rather than self-referential tautologies:

- **Independent Constants:** Expected values ($480,393.74\text{M}$, $2,288,379.02\text{M}$, $1,487,289.35\text{M}$, $1,967,683.09\text{M}$, $\$126.49$, $\$123.67$) are hardcoded analytical constants derived from first principles.
- **Sensitivity to Invariant Failures:**
  - If cash were omitted from the bridge, Part B would fail (`equityValue` would equal EV instead of $\$1,923,723.09\text{M}$).
  - If debt were omitted from the bridge, Part B would fail.
  - If statement units were scaled twice (divided by $1,000^2$), $FCF$ would equal $\$98.76\text{M}$ instead of $\$98,764\text{M}$, causing EV to collapse by a factor of 1,000 and failing EV assertions.
  - If the Margin of Safety formula were inverted ($(P - \text{Intrinsic})/P$), $MoS$ would equal $+43.78\%$ instead of $-43.78\%$, failing MoS sign assertions.

---

## 7. Execution Evidence of Canonical Verification Tests

All test suites were executed fresh in PowerShell:

```powershell
# 1. DCF Test Suite Alone
node --test test/dcf.test.js
# Exit Code: 0 | Tests: 12 passed / 0 failed (72.2 ms)

# 2. Targeted DCF and Stress Test Suites
node --test test/dcf.test.js test/stress.test.js
# Exit Code: 0 | Tests: 24 passed / 0 failed (97.3 ms)

# 3. Full Offline Repository Test Suite
npm test
# Exit Code: 0 | Tests: 604 passed / 0 failed across 39 suites (12,518 ms)
```

---

## 8. State Integrity & Account Hash Comparison

The primary paper trading account ledger [`data/paper-account.json`](file:///D:/G_BLOOM/Tavoryn-Terminal/data/paper-account.json) was verified before and after this audit:

| Verification Stage | Target File | Byte Size | SHA-256 Checksum | Integrity Status |
| :--- | :--- | :---: | :--- | :---: |
| **Pre-Audit Baseline** | `data/paper-account.json` | `2,386` bytes | `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D` | Baseline Recorded |
| **Post-Audit Final** | `data/paper-account.json` | `2,386` bytes | `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D` | **BYTE-FOR-BYTE IDENTICAL** |

---

## 9. Final Release Gate Determination

```
========================================================================================
FINAL DCF FIXTURE PROVENANCE & EQUITY BRIDGE AUDIT SIGN-OFF
========================================================================================
Repository:             Tavoryn Terminal (D:\G_BLOOM\Tavoryn-Terminal)
Release Baseline:       Phase 9 Frozen Baseline (Preserved)
Offline Tests:          604 Passed / 0 Failed across 39 suites (100% Pass Rate)
DCF Unit Tests:         12 Passed / 0 Failed (100% Pass Rate)
Equity Bridge Status:   VERIFIED & PROVEN (Zero-Debt Baseline & Active Balance Sheet Bridge)
Protected Ledger State: 8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D (0 delta)
Runtime Dependencies:   Zero runtime dependencies (dependencies: {})
FINAL DISPOSITION:      PASS WITH LIMITATIONS
========================================================================================
```
