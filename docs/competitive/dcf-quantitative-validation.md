# Discounted Cash Flow (DCF) Quantitative & Mathematical Validation

**Target Engine:** `lib/fn/dcf.js` & `public/js/fn/dcf.js`  
**System:** Tavoryn Terminal  
**Auditor:** Principal Quantitative Researcher & Financial Systems Specialist  
**Status:** VALIDATED & HARDENED  

---

## 1. Mathematical Formulation & Valuation Architecture

The Tavoryn DCF valuation engine implements a multi-stage Free Cash Flow to Firm (FCFF proxy) valuation model with a perpetual Gordon Growth terminal value and an enterprise-to-equity value bridge.

```
       +-------------------------------------------------------------+
       |                  Historical Filings (10-K)                  |
       |  Operating Cash Flow (OCF) - Capital Expenditures (CapEx)   |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |           5-Year Explicit FCF Projection Period             |
       |  FCF_t = FCF_0 * (1 + g)^t                                  |
       |  PV(FCF_t) = FCF_t / (1 + WACC)^t                           |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |             Perpetual Gordon Growth Terminal Value          |
       |  TV = [ FCF_5 * (1 + g_term) ] / [ WACC - g_term ]          |
       |  PV(TV) = TV / (1 + WACC)^5                                 |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |                   Enterprise Value (EV)                     |
       |  EV = Sum(PV_FCF_1..5) + PV(TV)                             |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |                 Net Debt Bridge Adjustment                  |
       |  Equity Value = EV - Total Debt + Cash & Short-Term Inv     |
       +-------------------------------------------------------------+
                                      |
                                      v
       +-------------------------------------------------------------+
       |               Per-Share Fair Value & Margin of Safety       |
       |  Intrinsic Value = Equity Value / Diluted Shares            |
       |  Margin of Safety = (Intrinsic Value - Price) / Price * 100%|
       +-------------------------------------------------------------+
```

---

## 2. Cash-Flow Methodology & Capital Structure Consistency

### 2.1 Cash-Flow Definition
* **Equation:**
  $$\text{FCF} = \text{Cash Provided by Operating Activities (OCF)} - \text{Capital Expenditures (CapEx)}$$
* **Methodology Classification:**
  * This formulation represents an operational Free Cash Flow to Firm (FCFF) proxy.
  * Because cash flows are discounted at the **Weighted Average Cost of Capital (WACC)**, the cash-flow streams must reflect cash available to *all capital providers* (both debt and equity).
  * The transition from Enterprise Value to Equity Value is achieved via the Net Debt Bridge:
    $$\text{Equity Value} = \text{Enterprise Value} - (\text{Total Debt} - \text{Cash \& Short-Term Investments})$$
* **Units and Scale Consistency:**
  * All statement inputs (OCF, CapEx, Cash, Debt, Market Cap) are standardized in **Millions of US Dollars ($M)**.
  * Diluted share count is standardized in **Millions of shares ($M)**.
  * Intrinsic Value per share evaluates as:
    $$\frac{\text{Equity Value (\$M)}}{\text{Shares Outstanding (M)}} = \text{US Dollars per share (\$)}$$
    This guarantees unit homogeneity across corporate scale.

---

## 3. Step-by-Step Hand-Calculated Verification Example

To prove mathematical precision independently of running code, the model is tested against a fixed analytical benchmark:

### Benchmark Assumptions
* Current Stock Price ($P$): **$40.00**
* Shares Outstanding ($S$): **50.0 Million**
* Base Free Cash Flow ($FCF_0$): **$100.0 Million**
* 5-Year Growth Rate ($g$): **10.0% (0.10)**
* Discount Rate ($WACC$): **10.0% (0.10)**
* Perpetual Growth Rate ($g_{term}$): **3.0% (0.03)**
* Projection Horizon ($N$): **5 Years**
* Cash and Equivalents: **$50.0 Million**
* Total Debt: **$150.0 Million**

### Mathematical Execution

#### Step 1: 5-Year Explicit Cash Flows & Present Values
Since $g = WACC = 0.10$, for every year $t$:
$$FCF_t = 100 \times (1.10)^t$$
$$PV_t = \frac{100 \times (1.10)^t}{(1.10)^t} = 100.0000$$

* Year 1: $FCF_1 = 110.0000$, $PV_1 = \mathbf{100.0000}$
* Year 2: $FCF_2 = 121.0000$, $PV_2 = \mathbf{100.0000}$
* Year 3: $FCF_3 = 133.1000$, $PV_3 = \mathbf{100.0000}$
* Year 4: $FCF_4 = 146.4100$, $PV_4 = \mathbf{100.0000}$
* Year 5: $FCF_5 = 161.0510$, $PV_5 = \mathbf{100.0000}$

$$\sum_{t=1}^5 PV_t = 100 + 100 + 100 + 100 + 100 = \mathbf{500.0000\text{ \$M}}$$

#### Step 2: Terminal Value (Gordon Growth Model)
$$TV = \frac{FCF_5 \times (1 + g_{term})}{WACC - g_{term}} = \frac{161.0510 \times 1.03}{0.10 - 0.03} = \frac{165.88253}{0.07} = \mathbf{2,369.7504\text{ \$M}}$$

#### Step 3: Present Value of Terminal Value
$$PV(TV) = \frac{TV}{(1 + WACC)^5} = \frac{2,369.7504}{(1.10)^5} = \frac{2,369.7504}{1.61051} = \mathbf{1,471.4286\text{ \$M}}$$

#### Step 4: Enterprise Value
$$EV = \sum PV_t + PV(TV) = 500.0000 + 1,471.4286 = \mathbf{1,971.4286\text{ \$M}}$$

#### Step 5: Net Debt Bridge & Equity Value
$$\text{Net Debt} = \text{Total Debt} - \text{Cash} = 150.00 - 50.00 = 100.00\text{ \$M}$$
$$\text{Equity Value} = EV - \text{Net Debt} = 1,971.4286 - 100.0000 = \mathbf{1,871.4286\text{ \$M}}$$

#### Step 6: Intrinsic Value per Share & Margin of Safety
$$\text{Intrinsic Value per Share} = \frac{1,871.4286}{50.00} = \mathbf{\$37.4286}$$
$$\text{Margin of Safety} = \frac{37.4286 - 40.0000}{40.0000} \times 100\% = \mathbf{-6.4286\%}$$

*Verification:* The automated unit test in `test/dcf.test.js` reproduces these figures to within $< 10^{-4}$ tolerance.

---

## 4. Boundary Conditions & Mathematical Edge Cases

| Edge Case Scenario | Mathematical Condition | Engine Behavior | Verified Result |
| :--- | :--- | :--- | :--- |
| **WACC $\le$ Terminal Growth** | $WACC \le g_{term}$ | Clamps effective WACC to $\max(WACC, g_{term} + 0.005)$ | Prevents infinite or negative terminal values; sets `isWaccClamped: true` |
| **Negative Free Cash Flow** | $FCF_0 < 0$ (Cash burn) | Evaluates explicit negative FCF without artificial override | Yields negative intrinsic value; surfaces warning callout `isNegativeFCF: true` |
| **Zero Debt / Zero Cash** | $Debt = 0, Cash = 0$ | $NetDebt = 0$ | Asserts $EV \equiv EquityValue$ |
| **Non-Finite / Missing Inputs** | $NaN, \text{null}, \infty$ | Fallback to safe finite defaults | Prevents unhandled server errors; ensures UI integrity |

---

## 5. 5×5 Sensitivity Matrix Monotonicity Proof

The 2D sensitivity matrix recalculates the complete DCF valuation across 25 independent combinations of WACC ($\pm 200$ bps) and Perpetual Growth ($\pm 100$ bps):

1. **Row Monotonicity (Growth Sensitivity):**
   $$\frac{\partial \text{Intrinsic Value}}{\partial g_{term}} > 0 \quad \forall WACC > g_{term}$$
   Holding WACC constant, every step to the right increases perpetual cash flows, strictly increasing intrinsic value.
2. **Column Monotonicity (Discount Rate Sensitivity):**
   $$\frac{\partial \text{Intrinsic Value}}{\partial WACC} < 0 \quad \forall WACC > g_{term}$$
   Holding perpetual growth constant, every step down the column increases the required return, strictly decreasing the present value of cash flows.

*Verification:* Verified algorithmically in `test/dcf.test.js` across all 25 cells.

---

## 6. Filing Data Limitations & Disclosures

1. **Filing Latency:** Statement figures reflect annual (10-K) SEC filings reported by Nasdaq. Intraday working capital adjustments are not captured until the next quarterly (10-Q) update.
2. **Non-US Securities:** Foreign equities not filing SEC 10-K reports lack detailed cash flow statement tables; the engine surfaces an explicit notification and allows manual query parameter overrides (`?baseFCF=...&shares=...`).

---
*Validated by Tavoryn Quantitative Systems Engineering Group.*
