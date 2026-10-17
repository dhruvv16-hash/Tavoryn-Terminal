# Portfolio Stress Testing Engine — Critical Quantitative Review & Stress Mathematics Verification

**Target Engine:** `lib/fn/stress.js` & `public/js/fn/stress.js`  
**System:** Tavoryn Terminal (`STRESS`)  
**Auditor:** Principal Quantitative Researcher & Risk Systems Architect  
**Investigation Date:** October 2026  
**Status:** VALIDATED, HARDENED & RECONCILED  

---

## 1. Executive Summary

This investigation independently examined the Portfolio Stress Testing engine (`STRESS`) within Tavoryn Terminal. The mission was to verify the mathematics of short positions, asset-class shock routing, cash immunity, accounting reconciliation, and scenario assumptions without relying on previous audit conclusions.

### Key Investigation Determinations:

1. **Short Position Valuation Formulation:** Verified the signed position market-value approximation $V_{stressed} = V \times \max(0, 1 + r)$, where $V < 0$ represents short liability. A market decline ($r < 0$) produces a positive P&L ($\Delta V > 0$), while a market rally ($r > 0$) produces an economic loss ($\Delta V < 0$).
2. **Accounting Identity Conservation:** Verified that across all 12 scenarios, $\text{Starting Value} + \text{Scenario P\&L} \equiv \text{Stressed Portfolio Value}$ holds identically with zero numerical divergence.
3. **Price Non-Negativity & Limited Liability:** Verified that for cash equities, ETFs, and cryptocurrencies, prices cannot drop below zero ($P \ge 0$). An underlying decline below -100% is bounded by $m = \max(0, 1 + r) = 0$, capping short gains at 100% of the initial liability.
4. **Base-Currency Cash Immunity:** Audited the assumption that cash holdings experience zero equity beta shock. Clarified that cash immunity is strictly a **nominal base-currency (USD) modeling assumption**, not universal protection against inflation, purchasing power loss, or cross-currency exchange rate risk.
5. **Scenario Nature Disclosures:** Ensured all 12 scenarios are explicitly labeled as **deterministic historical proxies or hypothetical factor shifts**, not probabilistic future loss forecasts.

---

## 2. Mathematical Formulation: Short Positions & Accounting Conservation

### 2.1 Universal Signed Position Market-Value Model
In a multi-asset portfolio, positions are represented by signed market values:
* **Long Position ($V_i > 0$):** Asset held; value equals quantity $\times$ price ($q \times P > 0$).
* **Short Position ($V_i < 0$):** Asset sold short; value represents liability to repurchase the borrowed shares ($-|q| \times P < 0$).
* **Cash Holding ($V_i > 0$):** Base-currency cash balance with zero equity beta ($\beta = 0$).

For any cash asset with limited liability ($P \ge 0$), an underlying return shock $r_i$ produces an effective price multiplier:
$$m_i = \max(0, 1 + r_i)$$

The stressed position value is:
$$V_{i, stressed} = V_i \times m_i = V_i \times \max(0, 1 + r_i)$$

The dollar change in position value (Scenario P&L) is:
$$\Delta V_i = V_{i, stressed} - V_i = V_i \times (m_i - 1)$$

### 2.2 Mathematical Directionality Proof for Short Positions ($V_i < 0$)

* **Case 1: Market Crash ($r_i < 0$):**
  * $m_i = 1 + r_i < 1 \implies m_i - 1 < 0$.
  * $\Delta V_i = V_i \times (m_i - 1) = (\text{negative}) \times (\text{negative}) > 0$.
  * **Result:** $\Delta V_i$ is strictly positive. The short position gains value and generates profit, hedging the portfolio.
* **Case 2: Market Rally ($r_i > 0$):**
  * $m_i = 1 + r_i > 1 \implies m_i - 1 > 0$.
  * $\Delta V_i = V_i \times (m_i - 1) = (\text{negative}) \times (\text{positive}) < 0$.
  * **Result:** $\Delta V_i$ is strictly negative. The short position loses value, expanding the liability.
* **Case 3: Complete Asset Wipeout ($r_i = -1.00$):**
  * $m_i = \max(0, 1 - 1.00) = 0$.
  * $V_{i, stressed} = V_i \times 0 = 0$.
  * $\Delta V_i = 0 - V_i = -V_i = +|V_i|$.
  * **Result:** The repurchase liability is extinguished at zero cost, capturing the maximum theoretical short gain of 100% of initial position value.
* **Case 4: Extreme Shock Below -100% ($r_i < -1.00$, e.g. $r_i = -1.50$):**
  * Limited liability dictates that cash equities cannot trade at negative prices ($P \ge 0$).
  * $m_i = \max(0, 1 - 1.50) = 0$.
  * $V_{i, stressed} = 0 \implies \Delta V_i = +|V_i|$.
  * **Result:** The model prevents negative prices from erroneously converting short liabilities into long assets.

### 2.3 Portfolio Accounting Identities
$$\text{Starting Portfolio Value } (V_{start}) = \sum_{i=1}^N V_i$$

$$\text{Stressed Portfolio Value } (V_{stressed}) = \sum_{i=1}^N V_{i, stressed} = \sum_{i=1}^N V_i \times \max(0, 1 + r_i)$$

$$\text{Net Scenario P\&L } (\Delta V) = \sum_{i=1}^N \Delta V_i = V_{stressed} - V_{start}$$

$$\text{Drawdown / Return \%} = \frac{\Delta V}{|V_{start}|} \times 100\%$$

$$\text{Conservation Equation: } V_{start} + \Delta V \equiv V_{stressed}$$

---

## 3. Step-by-Step Hand-Calculated Verification Scenarios

### 3.1 Scenario 1: Short Position with 50% Underlying Decline
* **Initial Holding:** Short SPY, $V = -\$10,000.00$, $r = -0.50$.
* **Price Multiplier:** $m = \max(0, 1 - 0.50) = 0.50$.
* **Stressed Liability:** $V_{stressed} = -\$10,000 \times 0.50 = \mathbf{-\$5,000.00}$.
* **Position P&L:** $\Delta V = -\$5,000 - (-\$10,000) = \mathbf{+\$5,000.00}$ (gain).
* **Reconciliation:** $-\$10,000 + \$5,000 = -\$5,000$. Exact match.
* *Verified in `test/stress.test.js`, Test 3a.*

### 3.2 Scenario 2: Short Position with 50% Underlying Increase
* **Initial Holding:** Short SPY, $V = -\$10,000.00$, $r = +0.50$.
* **Price Multiplier:** $m = \max(0, 1 + 0.50) = 1.50$.
* **Stressed Liability:** $V_{stressed} = -\$10,000 \times 1.50 = \mathbf{-\$15,000.00}$.
* **Position P&L:** $\Delta V = -\$15,000 - (-\$10,000) = \mathbf{-\$5,000.00}$ (loss).
* **Reconciliation:** $-\$10,000 + (-\$5,000) = -\$15,000$. Exact match.
* *Verified in `test/stress.test.js`, Test 3b.*

### 3.3 Scenario 3: Underlying Decline Approaching and At 100%
* **Initial Holding:** Short SPY, $V = -\$10,000.00$.
* **At $r = -0.9999$ (99.99% decline):**
  * $m = 0.0001 \implies V_{stressed} = -\$1.00$, $\Delta V = \mathbf{+\$9,999.00}$.
* **At $r = -1.0000$ (100.00% decline):**
  * $m = 0.0000 \implies V_{stressed} = \mathbf{\$0.00}$, $\Delta V = \mathbf{+\$10,000.00}$.
* *Verified in `test/stress.test.js`, Test 3c.*

### 3.4 Scenario 4: Extreme Shock Below -100% ($r = -1.50$)
* **Initial Holding:** Short SPY, $V = -\$10,000.00$, $r = -1.50$.
* **Price Multiplier:** $m = \max(0, 1 - 1.50) = 0$.
* **Stressed Liability:** $V_{stressed} = \mathbf{\$0.00}$.
* **Position P&L:** $\Delta V = 0 - (-\$10,000) = \mathbf{+\$10,000.00}$.
* *Verified in `test/stress.test.js`, Test 3d.*

### 3.5 Scenario 5: Long and Short in the Same Instrument
* **Holdings:** Long SPY $V_1 = +\$10,000.00$, Short SPY $V_2 = -\$10,000.00$.
* **Market Shock:** $r = -0.30$ (-30%).
* **Calculations:**
  * Long: $V_{stressed, 1} = \$10,000 \times 0.70 = \$7,000.00$; $\Delta V_1 = -\$3,000.00$.
  * Short: $V_{stressed, 2} = -\$10,000 \times 0.70 = -\$7,000.00$; $\Delta V_2 = +\$3,000.00$.
  * Net Starting Value: $\$10,000 - \$10,000 = \mathbf{\$0.00}$.
  * Net Stressed Value: $\$7,000 - \$7,000 = \mathbf{\$0.00}$.
  * Net P&L: $-\$3,000 + \$3,000 = \mathbf{\$0.00}$.
* *Verified in `test/stress.test.js`, Test 3e.*

### 3.6 Scenario 6: Multi-Asset Hedged Portfolio
* **Portfolio Holdings:**
  1. Long SPY US EQUITY: $V_1 = +\$100,000.00$, $\beta_1 = 1.0$, Sector: Index
  2. Short QQQ US EQUITY: $V_2 = -\$40,000.00$, $\beta_2 = 1.0$, Sector: Tech
  3. USD CASH: $V_3 = +\$20,000.00$, $\beta_3 = 0.0$, Sector: Cash
  * **Starting Portfolio Value:** $\$100,000 - \$40,000 + \$20,000 = \mathbf{+\$80,000.00}$.
* **Crisis Scenario Shocks:** Market Shock $S_{mkt} = -0.50$, Tech Shock $S_{tech} = -0.60$.
* **Position-by-Position Arithmetic:**
  * Long SPY: $r_1 = -0.50 \implies m_1 = 0.50 \implies V_{stressed, 1} = \mathbf{\$50,000.00}$, $\Delta V_1 = \mathbf{-\$50,000.00}$.
  * Short QQQ: $r_2 = -0.60 \implies m_2 = 0.40 \implies V_{stressed, 2} = -\$40,000 \times 0.40 = \mathbf{-\$16,000.00}$, $\Delta V_2 = -\$16,000 - (-\$40,000) = \mathbf{+\$24,000.00}$.
  * USD Cash: $r_3 = 0.00 \implies m_3 = 1.00 \implies V_{stressed, 3} = \mathbf{\$20,000.00}$, $\Delta V_3 = \mathbf{\$0.00}$.
* **Portfolio Aggregation & Reconciliation:**
  * Stressed Portfolio Value: $\$50,000.00 - \$16,000.00 + \$20,000.00 = \mathbf{+\$54,000.00}$.
  * Total Dollar P&L: $-\$50,000.00 + \$24,000.00 + \$0.00 = \mathbf{-\$26,000.00}$.
  * Drawdown on Net Equity: $\frac{-\$26,000.00}{\$80,000.00} \times 100\% = \mathbf{-32.50\%}$.
  * Reconciliation Check: $\$80,000.00 + (-\$26,000.00) = \mathbf{\$54,000.00}$ (Exact match).
* *Verified in `test/stress.test.js`, Test 3f.*

---

## 4. Scenario Assumptions & Methodological Review

### 4.1 Categorization of the 12 Scenarios

The engine evaluates portfolios across twelve calibrated shock vectors consisting of two distinct classes:

#### Class A: Eight Historical Proxy Scenarios (`type: "historical_proxy"`)
These scenarios represent single-period factor vectors calibrated to observed peak-to-trough drawdowns during major historical financial crises:
1. `gfc_2008` (2008 Lehman GFC): S&P 500 -50.0%, Financials -75.0%, Treasuries +15.0%.
2. `covid_2020` (2020 COVID Flash Crash): S&P 500 -33.9%, Crude Oil -55.0%, Treasuries +8.0%.
3. `rate_shock_2022` (2022 Fed Rate Hikes): S&P 500 -25.4%, Nasdaq -33.1%, Treasuries -18.0%.
4. `dotcom_2000` (2000 Dot-Com Collapse): Nasdaq -78.0%, S&P 500 -49.1%, Financials -20.0%.
5. `black_monday_1987` (1987 Black Monday): S&P 500 -22.6%, Tech -25.0%, Financials -26.0%.
6. `us_downgrade_2011` (2011 US Debt Downgrade): S&P 500 -16.3%, Financials -28.0%, Treasuries +6.0%.
7. `china_deval_2015` (2015 China Currency Shock): S&P 500 -12.4%, Commodities -22.0%, Crypto -20.0%.
8. `svb_banking_2023` (2023 US Regional Banking Shock): Financials -32.0%, Tech +2.0%, S&P 500 -8.5%.

#### Class B: Four Hypothetical Macro Factor Shocks (`type: "macro_hypothetical"`)
These scenarios represent forward-looking parametric shocks to core macroeconomic variables:
1. `rates_up_200bp` (Yield Curve Shift +200 bps): Long Bonds -14.0%, Tech -18.0%, Equities -12.0%.
2. `stagflation` (Stagflationary Supply Shock): Commodities +35.0%, Tech -22.0%, Equities -18.0%.
3. `usd_crunch` (Global USD Liquidity Crunch +10% DXY): Commodities -18.0%, Crypto -30.0%, Equities -10.0%.
4. `oil_surge` (Global Energy Transit Disruption +50% Oil): Commodities +40.0%, Equities -8.0%, Tech -9.0%.

### 4.2 Cash Immunity Boundaries
* **Nominal USD Invariance:** Cash balances held in USD experience $S_{cash} = 0.0\%$. This is mathematically correct under a base-currency reporting convention.
* **Non-Coverage Disclosures:** Cash immunity **does not** protect against domestic purchasing power erosion (inflation) or cross-currency exchange rate depreciation (foreign currency exposure). The engine displays this constraint in the methodology disclosure.

### 4.3 Asset-Class Shock Compatibility
Shocks are selectively routed to compatible exposures:
* Treasury / Bond shocks apply only to fixed-income assets (`TLT`, `IEF`, `treasury`, `bond`).
* Commodity shocks apply only to real commodities (`GLD`, `USO`, `CMDTY`).
* Crypto shocks apply only to digital assets (`BTC`, `ETH`, `CRYPTO`).
* Sector shocks apply only to corresponding sector equities.

---

## 5. Non-Linear Derivatives & Execution Caveats

The stress engine implements a linear signed market-value approximation. Institutional users must observe the following analytical constraints:
1. **Derivatives (Options/Futures):** Static delta scaling does not account for gamma acceleration, vega volatility spikes, or theta time decay.
2. **Margin & Leverage:** The model assumes positions remain solvent. It does not model margin call liquidations, borrowing fee spikes, or forced buy-ins.
3. **Correlation Convergence:** Historical diversification benefits can break down in extreme liquidity crises as correlations converge toward 1.0.

---

## 6. Regression Testing Evidence

All 12 tests in `test/stress.test.js` pass deterministically:

```text
✔ 1. Manually calculated portfolio stress test scenario loss (0.99ms)
✔ 2. Equal vs unequal weighting impacts scenario drawdown (0.18ms)
✔ 3. Short positions gain value and reduce portfolio drawdown during market crashes (0.72ms)
✔ 4. Cash holdings preserve 100% of value across market shocks (0.09ms)
✔ 5. Malformed holding values or betas default safely (0.12ms)
✔ 6. Empty portfolio produces clear zero-drawdown structure (0.08ms)
✔ 7. Institutional benchmark portfolio has valid multi-asset allocation (0.12ms)
✔ 8. Complete inventory of 8 historical crisis scenarios (0.10ms)
✔ 9. Complete inventory of 4 macroeconomic factor shocks (0.12ms)
✔ 10. Sector and asset-specific shock differentiation (0.17ms)
✔ 11. Vulnerability ranking orders holdings from greatest to smallest dollar loss (0.12ms)
✔ 12. Stress calculations are strictly deterministic and idempotent (1.40ms)
ℹ tests 12, pass 12, fail 0
```
