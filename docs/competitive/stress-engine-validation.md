# Portfolio Stress Testing Engine Quantitative & Mathematical Validation

**Target Engine:** `lib/fn/stress.js` & `public/js/fn/stress.js`  
**System:** Tavoryn Terminal (`STRESS`)  
**Auditor:** Principal Quantitative Researcher & Financial Systems Specialist  
**Status:** VALIDATED & HARDENED  

---

## 1. Executive Summary

This report delivers the quantitative validation, mathematical proof, and operational audit of the **Portfolio Stress Testing Engine** (`STRESS`) within Tavoryn Terminal. The engine simulates the resilience of multi-asset portfolios against 8 historical financial crises and 4 forward-looking macroeconomic factor shocks.

Following rigorous institutional testing, the engine was audited and hardened to ensure:
1. **Mathematical Directionality:** Short positions correctly act as portfolio hedges during market downturns, reducing net portfolio drawdown rather than producing erroneous losses.
2. **Cash Invariance:** Cash and cash-equivalent holdings maintain 100% capital preservation with zero equity beta shock ($\beta_{cash} = 0$).
3. **Truthful State Handling:** Empty portfolios present an authentic empty state without synthesizing unrequested positions. A dedicated institutional benchmark simulation mode is explicitly labeled.
4. **Deterministic Reproducibility:** 12 deterministic test suites verify that portfolio loss calculations, factor sensitivities, and vulnerability rankings match analytical hand calculations.

---

## 2. Complete Scenario Inventory & Calibration

The engine evaluates portfolios across twelve calibrated shock vectors consisting of 8 historical crisis proxies and 4 parametric macroeconomic shocks.

### 2.1 Eight Historical Crisis Scenarios

| Scenario ID | Historical Crisis Event | Benchmark Period | Market Shock ($S_{mkt}$) | Tech Shock ($S_{tech}$) | Financials Shock ($S_{fin}$) | Rates Shock ($S_{rates}$) | Commodity Shock ($S_{cmdty}$) | Crypto Shock ($S_{crypto}$) | Historical Source / Proxy |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `gfc_2008` | 2008 Global Financial Crisis | Sep 2008 – Mar 2009 | -50.0% | -45.0% | -75.0% | +15.0% | -45.0% | -70.0% | S&P 500 / Lehman Bankruptcy drawdown records |
| `covid_2020` | 2020 COVID-19 Flash Crash | Feb 2020 – Mar 2020 | -33.9% | -28.0% | -40.0% | +8.0% | -55.0% | -50.0% | S&P 500 peak-to-trough, WTI oil contract collapse |
| `rate_shock_2022` | 2022 Fed Tightening & Tech Drawdown | Jan 2022 – Oct 2022 | -25.4% | -33.1% | -15.0% | -18.0% | +25.0% | -64.0% | Fed 425 bps hiking cycle; concurrent equity & bond drop |
| `dotcom_2000` | 2000–2002 Dot-Com Bubble Collapse | Mar 2000 – Oct 2002 | -49.1% | -78.0% | -20.0% | +14.0% | -10.0% | -80.0% | Nasdaq Composite -78% peak-to-trough crash |
| `black_monday_1987` | 1987 Black Monday Crash | Oct 19, 1987 | -22.6% | -25.0% | -26.0% | +4.0% | -10.0% | -40.0% | Single-day Dow / S&P crash; portfolio insurance unwind |
| `us_downgrade_2011` | 2011 US Sovereign Debt Downgrade | Jul 2011 – Aug 2011 | -16.3% | -18.0% | -28.0% | +6.0% | -12.0% | -25.0% | S&P US sovereign credit rating downgrade |
| `china_deval_2015` | 2015 China Currency Devaluation | Aug 2015 – Sep 2015 | -12.4% | -14.0% | -15.0% | +3.0% | -22.0% | -20.0% | PBOC Renminbi adjustment, EM capital outflow |
| `svb_banking_2023` | 2023 US Regional Banking Shock | Mar 2023 | -8.5% | +2.0% | -32.0% | +5.0% | -5.0% | -12.0% | KBW Regional Banking Index run; duration mismatch |

### 2.2 Four Macroeconomic Factor Shocks

| Scenario ID | Macroeconomic Scenario | Factor Type | Equity Shock ($S_{eq}$) | Tech Shock ($S_{tech}$) | Rates Shock ($S_{rates}$) | Commodity Shock ($S_{cmdty}$) | Crypto Shock ($S_{crypto}$) | Parametric Calibration Model |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `rates_up_200bp` | Yield Curve Shift (+200 bps) | Rates Shift | -12.0% | -18.0% | -14.0% | -5.0% | -20.0% | Parallel upward shift across sovereign yield curves |
| `stagflation` | Stagflationary Supply Shock | Cost-Push | -18.0% | -22.0% | -10.0% | +35.0% | -25.0% | Margin compression with resource price inflation |
| `usd_crunch` | USD Global Liquidity Crunch (+10%) | FX Dislocation | -10.0% | -12.0% | +2.0% | -18.0% | -30.0% | Trade-weighted DXY surge, cross-currency basis squeeze |
| `oil_surge` | Global Energy Disruption (+50% Oil) | Energy Shock | -8.0% | -9.0% | -5.0% | +40.0% | -15.0% | Choke-point maritime transit shock to crude supplies |

---

## 3. Mathematical Formulation & Architecture

The stress engine applies a **multi-factor single-index sensitivity model** with asset-class, sector-proxy, and beta adjustments:

```
                          +-------------------------+
                          |   Portfolio Holdings    |
                          |  { sec, val, beta, ...} |
                          +-------------------------+
                                       |
                                       v
         +-----------------------------------------------------------+
         |               Asset Class & Sector Routing                |
         |  - Cash / USD:           Shock = 0.00%                    |
         |  - Crypto:               Shock = S_crypto                 |
         |  - Rates / Treasuries:   Shock = S_rates                  |
         |  - Commodities:          Shock = S_cmdty                  |
         |  - Tech / Financials:    Shock = S_sector * (0.5+0.5*beta)|
         |  - Broad Equity:         Shock = S_mkt * beta             |
         +-----------------------------------------------------------+
                                       |
                                       v
         +-----------------------------------------------------------+
         |           Position-Level Directional Valuation            |
         |  Long  (val > 0):  V_stressed = max(0, val * (1 + shock)) |
         |  Short (val < 0):  V_stressed = min(0, val * (1 + shock)) |
         |  Dollar Loss = V_stressed - val                           |
         +-----------------------------------------------------------+
                                       |
                                       v
         +-----------------------------------------------------------+
         |             Portfolio Aggregation & Ranking               |
         |  Portfolio Dollar Loss = Sum(Dollar Loss_i)               |
         |  Drawdown % = (Portfolio Dollar Loss / |Base Value|) * 100|
         |  Worst-Case Vulnerability Ranking by Dollar Loss          |
         +-----------------------------------------------------------+
```

### 3.1 Holding-Level Sensitivity Mapping

For each holding $i$, its calibrated shock $S_i$ is determined by its security type, ticker, and sector:

1. **Cash and Equivalents:**
   $$\text{If } \text{ticker} = \text{"USD"} \text{ or } \text{sector} = \text{"cash"} \implies S_i = 0.0$$
2. **Digital Assets (Crypto):**
   $$S_i = S_{crypto}$$
3. **Fixed Income / Sovereign Debt:**
   $$S_i = S_{rates}$$
4. **Commodities & Real Assets:**
   $$S_i = S_{cmdty}$$
5. **Sector Equities (Technology / Financials):**
   $$S_i = \max\left(-0.95, S_{sector} \times (0.5 + 0.5 \times \beta_i)\right)$$
6. **Broad Equity / Other Equities:**
   $$S_i = \max\left(-0.95, \min\left(1.50, S_{market} \times \beta_i\right)\right)$$

### 3.2 Directional Value & Cash Conservation

The engine preserves physical economic reality across asset signs:

* **Long Positions ($V_i > 0$):**
  $$V_{i, stressed} = \max\left(0, V_i \times (1 + S_i)\right)$$
  $$\Delta V_i = V_{i, stressed} - V_i$$
  *When $S_i < 0$, $\Delta V_i < 0$ (capital loss).*

* **Short Positions ($V_i < 0$):**
  Short positions are short liabilities. When asset prices drop ($S_i < 0$), the liability decreases towards zero, creating an economic gain:
  $$V_{i, stressed} = \min\left(0, V_i \times (1 + S_i)\right)$$
  $$\Delta V_i = V_{i, stressed} - V_i = -|V_i| \times (1 + S_i) - (-|V_i|) = -|V_i| \times S_i$$
  *Since $S_i < 0$, $\Delta V_i > 0$ (gain/hedging contribution).*

* **Portfolio Totals:**
  $$\text{Portfolio Value}_{base} = \sum_{i=1}^N V_i$$
  $$\text{Portfolio Value}_{stressed} = \sum_{i=1}^N V_{i, stressed}$$
  $$\text{Total Dollar Loss} = \text{Portfolio Value}_{stressed} - \text{Portfolio Value}_{base}$$
  $$\text{Drawdown \%} = \frac{\text{Total Dollar Loss}}{|\text{Portfolio Value}_{base}|} \times 100\%$$

---

## 4. Step-by-Step Hand-Calculated Verification Example

To verify analytical precision independently of code, a multi-asset test portfolio is subjected to the **2008 Global Financial Crisis** scenario.

### 4.1 Test Portfolio Composition

* **Position 1 (Broad Equity):** SPY US EQUITY, Value = **+$100,000.00**, $\beta = 1.00$, Sector: Index
* **Position 2 (Treasuries):** TLT US EQUITY, Value = **+$50,000.00**, $\beta = -0.20$, Sector: Treasury
* **Position 3 (Cash):** USD CASH, Value = **+$50,000.00**, $\beta = 0.00$, Sector: Cash
* **Total Portfolio Base Value:** **+$200,000.00**

### 4.2 Scenario Shocks (2008 GFC: `gfc_2008`)
* Market Shock ($S_{mkt}$): **-50.0% (-0.500)**
* Rates Shock ($S_{rates}$): **+15.0% (+0.150)** (Long Treasuries flight-to-safety)

### 4.3 Manual Arithmetic Execution

#### Position 1: SPY
* $S_{SPY} = -0.500 \times 1.00 = -0.500$ (-50.0%)
* $V_{stressed} = \max(0, 100,000 \times (1 - 0.500)) = \mathbf{\$50,000.00}$
* $\Delta V = \$50,000.00 - \$100,000.00 = \mathbf{-\$50,000.00}$

#### Position 2: TLT
* $S_{TLT} = S_{rates} = +0.150$ (+15.0%)
* $V_{stressed} = \max(0, 50,000 \times (1 + 0.150)) = \mathbf{\$57,500.00}$
* $\Delta V = \$57,500.00 - \$50,000.00 = \mathbf{+\$7,500.00}$

#### Position 3: USD Cash
* $S_{USD} = 0.000$ (0.0%)
* $V_{stressed} = 50,000 \times (1 + 0.000) = \mathbf{\$50,000.00}$
* $\Delta V = \$50,000.00 - \$50,000.00 = \mathbf{\$0.00}$

#### Portfolio Totals
* Stressed Portfolio Value:
  $$V_{stressed} = \$50,000.00 + \$57,500.00 + \$50,000.00 = \mathbf{\$157,500.00}$$
* Total Dollar Loss:
  $$\Delta V_{total} = \$157,500.00 - \$200,000.00 = \mathbf{-\$42,500.00}$$
* Total Drawdown Percentage:
  $$\text{Drawdown \%} = \frac{-\$42,500.00}{\$200,000.00} \times 100\% = \mathbf{-21.25\%}$$

### 4.4 Engine Verification Match
Running `test/stress.test.js` (Test 1):
```javascript
assert.equal(gfcRes.stressedTotalValue, 157500); // PASS
assert.equal(gfcRes.totalDollarLoss, -42500);     // PASS
assert.equal(gfcRes.totalDrawdownPct, -21.25);    // PASS
```
The engine outputs match analytical hand calculations to the exact dollar and basis point.

---

## 5. Short Hedging & Cash Immunity Validation

### 5.1 Short Position Hedging Mechanics
In financial theory, short positions hedge long portfolios during market downturns. Prior to hardening, clamping with `Math.max(0, ...)` wiped out short position values. Hardening to directional clamping resolves this.

* **Test Case:** Long $100,000 SPY and Short -$50,000 SPY (Net exposure: $50,000).
* **Under 2008 GFC (-50% Market Crash):**
  * Long SPY Loss: $100,000 \times (-0.50) = -\$50,000$
  * Short SPY Gain: $-50,000 \times (1 - 0.50) - (-50,000) = -25,000 - (-50,000) = +\$25,000$
  * Net Portfolio Loss: $-\$50,000 + \$25,000 = \mathbf{-\$25,000}$
  * Drawdown on Net Equity: $\frac{-\$25,000}{\$50,000} \times 100\% = \mathbf{-50.0\%}$
* **Validation Result:** Verified by Test 3 in `test/stress.test.js`.

### 5.2 Cash Beta Immunity
Cash holdings must experience zero drawdown regardless of equity beta:
* **Equation:** $\beta_{cash} = 0 \implies S_{cash} = 0 \implies V_{stressed} = V_{base}$
* **Validation Result:** Verified by Test 4 in `test/stress.test.js`.

---

## 6. Portfolio Vulnerability Ranking

Holdings are ranked across all scenarios by worst-case dollar loss contribution:
$$\text{Worst Loss}_i = \min_{s \in \text{Scenarios}} \left(\Delta V_{i, s}\right)$$
This enables portfolio managers to immediately pinpoint the specific position generating the greatest downside risk.

* **Example:** In a portfolio containing high-beta tech (QQQ) and defensive utilities, QQQ is identified as the primary vulnerability during the 2000 Dot-Com crash, whereas high-duration Treasuries are identified as primary vulnerabilities during the 2022 Rate Shock.

---

## 7. Institutional Test Evidence Summary

All 12 dedicated stress-testing suites pass deterministically in Node.js native test runner:

| Test Case | Description | Verification Target | Status |
| :---: | :--- | :--- | :---: |
| 1 | Hand-calculated scenario loss | Matches $157,500 stressed, -$42,500 loss, -21.25% drawdown | PASS |
| 2 | Weighting sensitivity | 90% tech portfolio experiences greater loss than 10% tech | PASS |
| 3 | Short position hedging | Short position yields +$25k gain in -50% market shock | PASS |
| 4 | Cash beta immunity | Cash maintains 100% value across all market shocks | PASS |
| 5 | Malformed inputs | Missing/NaN betas default safely to 1.0; no crashes | PASS |
| 6 | Empty portfolio structure | Returns truthful 0-drawdown empty state | PASS |
| 7 | Benchmark portfolio | Multi-asset benchmark validates across SPY, QQQ, TLT, GLD, BTC | PASS |
| 8 | Historical scenario inventory | All 8 historical scenarios present with complete metadata | PASS |
| 9 | Macro shock inventory | All 4 macro shocks present with complete metadata | PASS |
| 10 | Sector differentiation | Financials suffer deeper shock in 2023 SVB banking crisis | PASS |
| 11 | Vulnerability ranking | Positions ranked strictly by ascending dollar loss | PASS |
| 12 | Deterministic idempotency | 5 repeated runs produce byte-identical numerical outputs | PASS |

---

## 8. Methodological Limitations & Institutional Disclaimers

1. **Linear Factor Approximation:** The engine relies on linear beta scaling. Non-linear derivatives (options, structured notes) exhibit gamma, vega, and theta effects that are not fully captured by static linear beta.
2. **Correlation Breakdown:** During severe liquidity dislocations (e.g., March 2020), asset correlations frequently converge toward 1.0, impairing historical diversification benefits.
3. **Instantaneous Shock Assumption:** Scenarios model instantaneous price shocks without factoring in time-dependent coupon reinvestment, dynamic rebalancing, or margin call liquidations.
4. **Execution Fencing:** Stress testing runs in read-only research simulation mode (`STRESS`). It does not execute trades, place orders, or modify portfolio records.
