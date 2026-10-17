# Amber Terminal — Phase 4.1: Independent Quantitative Verification & Release Gate Report

**Audit Date:** October 17, 2026  
**Auditor Roles:** Principal Software Engineer, Quantitative Finance Engineer, Market-Data Infrastructure Architect, and QA Lead  
**Scope:** Amber Terminal (`D:\G_BLOOM\amber-terminal`) — Phase 4 Engine Audit, Market Exposure Discrepancy Resolution, Quantitative Metric Verification, Execution Accounting, and Robustness Validation  
**Overall Verdict:** **VERIFIED & RELEASE-READY (Institutional Quantitative Integrity)**  

---

## Executive Summary

An adversarial, independent verification pass was conducted on the Phase 4 quantitative research, historical replay simulation, and statistical validation engines of Amber Terminal.

The audit identified, investigated, and permanently resolved the **266.67% market-exposure discrepancy**, separated time-in-market exposure from gross notional exposure, cleanly segregated transaction commissions from short borrow financing fees, verified conservation of cash and equity across every simulation bar, and introduced moving-block bootstrap Monte Carlo simulation to capture loss clustering and serial dependence.

### Scorecard Summary

| Evaluation Area | Phase 4 State | Phase 4.1 Verified State | Verdict |
| :--- | :--- | :--- | :--- |
| **Total Test Count** | 453 passing | **472 passing tests, 0 failures, 0 skips** | **VERIFIED** |
| **Test Execution Duration** | ~2.16s | **~2.39s (100% offline-deterministic)** | **VERIFIED** |
| **`data/paper-account.json` Hash**| `8090df4...` | **`8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D` (Byte-identical)** | **VERIFIED** |
| **Live Broker Socket Calls** | 0 calls | **0 calls (strict offline sandbox enforced)** | **VERIFIED** |
| **Market Exposure Calculation** | Flawed: sum of trade bars divided by total bars | **Separated into `timeInMarketPct` ($\le 100\%$) and `grossExposurePct`** | **DEFECT RESOLVED** |
| **Intrabar Equidistant Tie-Break**| Hardcoded low branch | **Candle-direction tie-break ($Close < Open \to$ High before Low)** | **DEFECT RESOLVED** |
| **Commissions vs Borrow Fees** | Lumped in `t.fees` | **Cleanly decomposed: commissions + borrow fees = total fees** | **IMPROVED** |
| **Stress-Test Configuration Visibility**| Unreported | **Explicit `config` object returned for all 4 friction tiers** | **IMPROVED** |
| **Monte Carlo Serial Dependence**| IID only | **Added Block Bootstrap (`blockSize \ge 1`) to model clustered losses** | **IMPROVED** |
| **Parameter Multiplicity Risk** | Unreported | **Added `multiplicityRisk` flag and Bonferroni significance threshold** | **IMPROVED** |

---

## 1. Safe Baseline & Account Integrity

1. **Pre-Audit State:**
   - Baseline test suite: 453 passing tests.
   - User runtime data: `D:\G_BLOOM\amber-terminal\data\paper-account.json`.
   - Initial SHA-256: `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`.
2. **Post-Audit State:**
   - Final test suite: **472 passing tests**, 0 failures, 0 skips.
   - Final SHA-256: `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`.
   - Verification: `data/paper-account.json` remained byte-for-byte untouched throughout all audits and test runs.
3. **Execution Environment:**
   - 100% offline-safe. All simulations run within ephemeral `DeterministicReplayEngine` memory structures against offline JSON fixtures (`test/fixtures/btc-1d.json`). Zero live brokerage API keys or network sockets were accessed.

---

## 2. Market Exposure Discrepancy: Investigation & Resolution

### 2.1 Root Cause Analysis of the 266.67% Discrepancy
In Phase 4, `exposurePct` in `lib/backtest-metrics.js` was defined as:
```javascript
let totalBarsInTrade = 0;
for (const t of trades) {
  totalBarsInTrade += t.bars || 0;
}
const exposurePct = bars && bars.length > 0 ? (totalBarsInTrade / bars.length) * 100 : 0;
```
In a 3-bar test fixture with two mock trades having durations of 5 bars and 3 bars:
$$\text{totalBarsInTrade} = 5 + 3 = 8 \text{ lot-bars}$$
$$\text{exposurePct} = \frac{8}{3} \times 100 = 266.67\%$$
This produced an economic contradiction: a single-asset strategy cannot hold a position for 266.67% of calendar time. Summing `t.bars` across trades double-counted overlapping position bars and failed to cap time-in-market at 100%.

### 2.2 Mathematical Resolution: Separate Exposure Metrics
Two institutional metrics were established to replace the conflated formula:

1. **Time-in-Market Exposure (`timeInMarketPct`, aliased to `exposurePct`):**
   - **Definition:** The percentage of evaluation bars during which at least one position (long or short) was open.
   - **Mathematical Bound:** Strictly bounded:
     $$0.0\% \le \text{timeInMarketPct} \le 100.0\%$$
   - **Formula:**
     $$\text{timeInMarketPct} = \frac{\sum_{i=0}^{N-1} \mathbf{1}_{\{\text{position active on bar } i\}}}{N} \times 100$$
2. **Gross Notional Exposure (`grossExposurePct`):**
   - **Definition:** The cumulative position-bar duration or leverage ratio relative to total evaluation bars.
   - **Behavior:** May exceed 100% in multi-asset portfolios, concurrent lot scaling, or leveraged positions.
   - **Formula:**
     $$\text{grossExposurePct} = \frac{\sum_{t \in \text{trades}} \text{bars}_t}{N} \times 100$$
     or from bar-by-bar active notional:
     $$\text{avgGrossExposurePct} = \frac{1}{N} \sum_{i=0}^{N-1} \frac{|\text{Notional}_i|}{\text{Equity}_i} \times 100$$

### 2.3 Hand-Calculated Scenarios Verified in Code

| Scenario | Setup | Hand-Calculated `timeInMarketPct` | Hand-Calculated `grossExposurePct` | Engine Output | Verified? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Flat** | 0 trades, 10 bars | **0.00%** | **0.00%** | 0.00% / 0.00% | **MATCH** |
| **Fully Invested** | 1 trade across all 10 bars | **100.00%** | **100.00%** | 100.00% / 100.00% | **MATCH** |
| **Intermittent** | 1 trade for 4 bars in 10 bars | **40.00%** | **40.00%** | 40.00% / 40.00% | **MATCH** |
| **Overlapping Lots**| Lot 1 (bars 2-5), Lot 2 (bars 4-7) in 10 bars | **60.00%** (6 distinct bars) | **80.00%** (4+4=8 lot-bars) | 60.00% / 80.00% | **MATCH** |
| **Long / Short** | Long (bars 1-3), Short (bars 6-8) in 10 bars | **60.00%** (6 distinct bars) | **60.00%** (3+3=6 lot-bars) | 60.00% / 60.00% | **MATCH** |
| **Multi-Asset** | Asset 1 (bars 0-7), Asset 2 (bars 3-9) in 10 bars| **100.00%** (all 10 bars) | **150.00%** (8+7=15 lot-bars) | 100.00% / 150.00%| **MATCH** |

---

## 3. Independent Verification of Performance Metrics

### 3.1 Taxonomy: Trade-Based vs. Return-Series Metrics

| Metric Category | Metrics Included | Calculation Basis | Missing/Undefined Handling |
| :--- | :--- | :--- | :--- |
| **Trade-Based** | `totalTrades`, `winRatePct`, `lossRatePct`, `profitFactor`, `expectancyPct`, `expectancyPerTrade`, `avgTradePct`, `avgWinPct`, `avgLossPct`, `avgTradeDollars`, `avgWinDollars`, `avgLossDollars`, `totalCommissions`, `totalBorrowFees`, `turnoverPct` | Individual closed trade records $[T_1, \dots, T_k]$ | Returns structured zeros (`0`) or `null` with descriptive note (e.g. `"No trades executed"`, `"No losing trades"`); never `NaN` or `Infinity`. |
| **Return-Series** | `initialCapital`, `finalEquity`, `netProfit`, `netProfitPct`, `cagrPct`, `buyHoldPct`, `maxDrawdownPct`, `maxDrawdownDollars`, `maxDrawdownDurationBars`, `sharpe`, `sortino`, `timeInMarketPct`, `grossExposurePct` | Chronological bar-by-bar mark-to-market equity curve $[E_0, \dots, E_N]$ | Returns `null` when standard deviation or downside deviation is zero (`"Zero return variance"`), or when evaluation timespan $< 2$ bars. |

### 3.2 Hand-Calculated Fixture Verification
- **Test Fixture:** Initial Capital: $\$10,000.00$.
- **Trade 1 (Long):** Buy 100 @ \$100, Sell @ \$110. Gross PnL: $+\$1,000.00$. Commissions: $\$15.00$. Slippage: $\$5.00$. Borrow: $\$0.00$. Net PnL: $+\$980.00$ ($+9.8\%$). Duration: 3 bars.
- **Trade 2 (Short):** Sell 100 @ \$100, Buy @ \$105. Gross PnL: $-\$500.00$. Commissions: $\$15.00$. Slippage: $\$5.00$. Borrow: $\$10.00$. Net PnL: $-\$530.00$ ($-5.3\%$). Duration: 2 bars.
- **Equity Curve:** $[(t_0, \$10,000), (t_1, \$10,980), (t_2, \$10,450)]$.

| Metric | Formula | Hand-Calculated Value | Engine Output | Verified? |
| :--- | :--- | :--- | :--- | :--- |
| **Net Profit ($)** | $980.00 - 530.00$ | **$450.00** | **$450.00** | **MATCH** |
| **Net Profit (%)** | $(450.00 / 10000.00) \times 100$ | **4.50%** | **4.50%** | **MATCH** |
| **Final Equity** | $10000.00 + 450.00$ | **$10,450.00** | **$10,450.00** | **MATCH** |
| **Commissions ($)** | $15.00 + 15.00$ | **$30.00** | **$30.00** | **MATCH** |
| **Borrow Fees ($)** | $0.00 + 10.00$ | **$10.00** | **$10.00** | **MATCH** |
| **Total Fees ($)** | $30.00 + 10.00$ | **$40.00** | **$40.00** | **MATCH** |
| **Total Slippage ($)**| $5.00 + 5.00$ | **$10.00** | **$10.00** | **MATCH** |
| **Average Win ($)** | Gross Wins / 1 Win | **$980.00** | **$980.00** | **MATCH** |
| **Average Loss ($)** | Gross Losses / 1 Loss | **$530.00** | **$530.00** | **MATCH** |
| **Average Trade ($)**| Net Profit / 2 Trades | **$225.00** | **$225.00** | **MATCH** |
| **Expectancy (%)** | $(0.50 \times 9.8) - (0.50 \times 5.3)$ | **2.25%** | **2.25%** | **MATCH** |
| **Expectancy ($)** | $450.00 / 2$ | **$225.00** | **$225.00** | **MATCH** |
| **Profit Factor** | $980.00 / 530.00$ | **1.8490... $\to$ 1.85** | **1.85** | **MATCH** |

---

## 4. Execution Accounting Stress-Testing

### 4.1 Order Execution Invariants
1. **Next-Bar Execution:** Orders generated at bar $t$ Close execute at bar $t+1$ Open. Orders submitted on the final bar remain pending and are not executed.
2. **Limit Order Price Improvement:** Limit buy order at $\$100$ fills at $\$96$ if the market opens at $\$96$, realizing price improvement. Unreached limit orders remain pending in `pendingOrders`.
3. **Opening Gap Fills:**
   - Long Target gap-up: Fills at Open price ($\$120$), not target ($\$110$).
   - Long Stop gap-down: Fills at Open price ($\$80$), not stop ($\$90$).
   - Short Target gap-down: Fills at Open price ($\$80$), not target ($\$90$).
   - Short Stop gap-up: Fills at Open price ($\$115$), not stop ($\$105$).
4. **Intrabar Collision Resolution:**
   - `worst`: Stop loss takes precedence over target.
   - `optimistic`: Take profit takes precedence over stop loss.
   - `ohlc`: Evaluates candle direction. In equidistant ties ($|Open - High| = |Open - Low|$):
     - Bearish candle ($Close < Open$): High assumed before Low $\to$ Target triggers first.
     - Bullish candle ($Close \ge Open$): Low assumed before High $\to$ Stop triggers first.
5. **Partial Position Exits:**
   - Closing $Q_{close} < Q_{pos}$ preserves original `entryPrice`, `entryTime`, and `entryIndex` on remaining position.
   - Entry fees and entry slippage are prorated exactly: $\text{Fee}_{partial} = \text{Fee}_{orig} \times \frac{Q_{close}}{Q_{orig}}$.
6. **Position Reversals:**
   - Submitting opposite order with excess quantity atomically closes the current position and opens the opposite side at the fill price in one atomic operation.
7. **Cash & Equity Conservation Law:**
   Across every bar $t$:
   $$\text{Cash}_t = \text{Cash}_0 + \sum \text{Realized PnL} - \sum \text{Invested Notional} - \sum \text{Commissions} - \sum \text{Borrow Fees}$$
   $$\text{Equity}_t = \text{Cash}_t + \text{Unrealized MTM}_t$$
   $$\text{Final Cash} - \text{Initial Capital} = \text{Net Profit} = \sum \text{Trade Net PnL}$$
   Verified exact to $\$0.0000001$ across all tests.

---

## 5. Robustness & Validation Methodology Audit

### 5.1 Lookahead Bias & Temporal Isolation
- **Indicator Calculation:** All indicators, moving averages, and ATR computations operate on slices $[0 \dots t]$.
- **Adversarial Test:** In `test/quantitative-verification-release-gate.test.js`, future bar 55 was perturbed by $+1,000\%$. Decisions at bar 10 were verified to be strictly identical between baseline and perturbed series.

### 5.2 Chronological Partitioning & Walk-Forward
- **Partitioning:** `splitBars` enforces strictly non-overlapping intervals: $\text{Train}_{\text{end}} < \text{Val}_{\text{start}}$ and $\text{Val}_{\text{end}} < \text{Test}_{\text{start}}$.
- **Walk-Forward:** Candidate parameter sets are scored exclusively on In-Sample (IS) folds. Winning parameters are subsequently evaluated once on unseen Out-of-Sample (OOS) data without feedback.

### 5.3 Multiplicity & Overfitting Safeguards
- `parameterSensitivitySweep` now computes:
  - `multiplicityRisk`: `"LOW"` ($\le 4$ trials), `"MODERATE"` ($5\text{--}10$ trials), or `"HIGH"` ($> 10$ trials).
  - `bonferroniAlpha`: Family-wise error rate adjustment $\alpha_{BF} = \frac{0.05}{K}$.
  - `fragilityScore`: Percentage of parameter sets whose Sharpe collapses by $> 50\%$ from the optimum.

### 5.4 Monte Carlo: Serial Dependence & Block Bootstrap
- **Standard IID Permutation:** Assumes independent identically distributed trade returns.
- **Block Bootstrap:** Added `blockSize` parameter (default 1, configurable $2\text{--}5$). Resamples contiguous blocks of trades, preserving loss streaks, regime clustering, and path-dependent drawdown severity.
- **Ruin Probability:** Configurable `ruinThresholdPct` (default $50\%$ drawdown).

---

## 6. Confirmed Defects, Severities, and Resolutions

| Defect ID | Severity | Component | Description | Resolution |
| :--- | :--- | :--- | :--- | :--- |
| **DEF-401** | **HIGH** | `lib/backtest-metrics.js` | Market exposure formula summed `t.bars` across trades and divided by total bars, yielding impossible $> 100\%$ numbers (e.g. 266.67%). | Separated into `timeInMarketPct` ($\le 100\%$) tracking distinct bars, and `grossExposurePct` capturing multi-lot / leveraged exposure. |
| **DEF-402** | **MEDIUM** | `lib/replay-engine.js` | In `pathOf`, equidistant High/Low distances defaulted unconditionally to the Low branch without evaluating candle direction. | Added tie-breaking based on candle body: bearish candles ($Close < Open$) assume High before Low; bullish candles assume Low before High. |
| **DEF-403** | **LOW** | `lib/backtest-robustness.js` | Execution stress test did not expose the effective configuration parameters for each friction tier in returned results. | Added `config` object to each tier output (`feePct`, `slippagePct`, `spreadPct`, `borrowFeePctAnnual`, `maxVolumeParticipationPct`, `intrabar`). |
| **DEF-404** | **LOW** | `lib/backtest-robustness.js` | Floating point arithmetic in conservative stress tier produced `0.15000000000000002` slippage rate. | Cleaned up with explicit 4-decimal rounding (`Number(rate.toFixed(4))`). |
| **DEF-405** | **LOW** | `lib/backtest-robustness.js` | Monte Carlo permutation only supported IID resampling, ignoring autocorrelation and loss streaks. | Added moving-block bootstrap (`blockSize \ge 1`) and configurable `ruinThresholdPct`. |

---

## 7. Release Gate Sign-off

### Test Verification
```text
ℹ tests 472
ℹ suites 0
ℹ pass 472
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2397.6453
```

### Final Release Gate Checklist
- [x] **Safe Baseline Established:** 453 tests initially, 472 tests after quantitative verification pass.
- [x] **Zero Regressions:** 0 failing tests, 0 skipped tests across all test suites.
- [x] **User Account Preserved:** `data/paper-account.json` SHA256 verified identical before and after all runs.
- [x] **Offline Determinism:** 100% offline-safe; zero external socket or live broker connections.
- [x] **Exposure Discrepancy Resolved:** Time-in-market exposure strictly bounded in $[0, 100]\%$.
- [x] **Accounting Conservation:** Cash, equity, and P&L reconcile across every single bar and transaction.
- [x] **Robustness Hardened:** Block bootstrap Monte Carlo, parameter multiplicity annotations, and transparent stress friction settings.

**Release Gate Verdict:** **APPROVED FOR RESEARCH AND TERMINAL BACKTESTING (PHASE 4.1 SIGN-OFF COMPLETE)**.
