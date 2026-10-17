# FINANCIAL MODEL ASSUMPTIONS & QUANTITATIVE SPECIFICATIONS
**Platform:** Dhruv Terminal (Amber Terminal / G_BLOOM)  
**Version:** 1.0.0 Institutional Specification  
**Status:** Verified & Tested

---

## 1. Paper-Trading Accounting & Execution Model

The simulated trading engine (`lib/paper-trading.js`) models a **cash account without margin** using institutional double-entry invariants.

### 1.1 Accounting Invariants & Equations

$$\text{Available Cash} = \text{Cash} - \text{Reserved Cash}$$

$$\text{Buying Power} = \max(0, \text{Available Cash})$$

$$\text{Market Value of Open Positions} = \sum_{i} \left( \text{Qty}_i \cdot \text{MarkPrice}_i \right)$$

$$\text{Total Cost Basis} = \sum_{i} \left( \text{Qty}_i \cdot \text{AvgPrice}_i \right)$$

$$\text{Unrealized P\&L} = \text{Market Value of Open Positions} - \text{Total Cost Basis}$$

$$\text{Cumulative Realized P\&L} = \sum \left( \text{Closed Quantity} \cdot (\text{Execution Price} - \text{Avg Entry Price}) - \text{Fees} \right)$$

$$\text{Account Equity} = \text{Available Cash} + \text{Reserved Cash} + \text{Market Value of Open Positions}$$

$$\text{Total Net P\&L} = \text{Account Equity} - \text{Initial Cash} = \text{Cumulative Realized P\&L} + \text{Unrealized P\&L} - \text{Total Fees}$$

### 1.2 Execution & Reservation Invariants
1. **Pending BUY Orders:**
   - When a pending BUY limit order is created for quantity $Q$ at limit price $P_{limit}$, funds are reserved immediately:
     $$\Delta \text{Reserved Cash} = Q \cdot P_{limit}$$
   - The order is rejected if $Q \cdot P_{limit} > \text{Available Cash}$.
2. **Order Cancellation / Rejection:**
   - Cancelling a pending BUY order immediately releases the reservation:
     $$\Delta \text{Reserved Cash} = - (Q \cdot P_{limit})$$
3. **Execution from Pending:**
   - When a pending BUY limit order fills at price $P_{exec} \le P_{limit}$:
     - Reserved cash is released: $\text{Reserved Cash} \leftarrow \text{Reserved Cash} - (Q \cdot P_{limit})$.
     - Actual cost is debited from cash: $\text{Cash} \leftarrow \text{Cash} - (Q \cdot P_{exec})$.
     - Any price improvement $(P_{limit} - P_{exec}) \cdot Q$ immediately returns to available cash.
4. **Position Reductions & Closes:**
   - Selling reduces quantity: $Q_{rem} = Q_{old} - Q_{sold}$.
   - Average entry price ($\text{AvgPrice}$) is strictly preserved during partial sells.
   - When $Q_{rem} \le 10^{-6}$, the position is removed from `positions`, but the cumulative realized gain/loss is permanently credited to `acc.realizedPnl`.
5. **Concurrency Serialization:**
   - All state mutations and asynchronous quote lookups are serialized through an internal FIFO Promise chain (`runLocked`), preventing race conditions, stale balance reads, and double-spending.

---

## 2. Options Valuation & Strategy Risk Model

The options analytics engine (`lib/fn/opay.js`) implements analytical Black-Scholes-Merton valuation with continuous dividend yields and exact piecewise linear strategy payoff bounds.

### 2.1 Pricing Formulas (Black-Scholes-Merton)

For underlying spot price $S$, strike $K$, risk-free rate $r$, continuous dividend yield $q$, annualized volatility $\sigma$, and time to maturity $T$:

$$d_1 = \frac{\ln(S/K) + \left(r - q + \frac{1}{2}\sigma^2\right)T}{\sigma\sqrt{T}}, \quad d_2 = d_1 - \sigma\sqrt{T}$$

$$C(S, K, T) = S e^{-qT} N(d_1) - K e^{-rT} N(d_2)$$

$$P(S, K, T) = K e^{-rT} N(-d_2) - S e^{-qT} N(-d_1)$$

Where $N(x)$ is the cumulative standard normal distribution function evaluated using the high-precision Abramowitz & Stegun (7.1.26) rational approximation:
$$\phi(x) = \frac{1}{\sqrt{2\pi}} e^{-\frac{1}{2}x^2}$$

### 2.2 Greeks & Sensitivity Units

- **Delta ($\Delta$):**
  $$\Delta_{\text{call}} = e^{-qT} N(d_1), \quad \Delta_{\text{put}} = -e^{-qT} N(-d_1)$$
- **Gamma ($\Gamma$):** Identical for calls and puts:
  $$\Gamma = \frac{e^{-qT} \phi(d_1)}{S \sigma \sqrt{T}}$$
- **Vega ($\mathcal{V}$):** Dollar sensitivity per $1\%$ (0.01) shift in volatility:
  $$\mathcal{V} = \frac{S e^{-qT} \phi(d_1) \sqrt{T}}{100}$$
- **Theta ($\Theta$):** Calendar day decay (divided by 365):
  $$\Theta_{\text{call}} = \frac{1}{365} \left( -\frac{S e^{-qT} \phi(d_1) \sigma}{2\sqrt{T}} + q S e^{-qT} N(d_1) - r K e^{-rT} N(d_2) \right)$$
  $$\Theta_{\text{put}} = \frac{1}{365} \left( -\frac{S e^{-qT} \phi(d_1) \sigma}{2\sqrt{T}} - q S e^{-qT} N(-d_1) + r K e^{-rT} N(-d_2) \right)$$
- **Rho ($\rho$):** Sensitivity per $1\%$ (0.01) shift in interest rate:
  $$\rho_{\text{call}} = \frac{K T e^{-rT} N(d_2)}{100}, \quad \rho_{\text{put}} = \frac{-K T e^{-rT} N(-d_2)}{100}$$

### 2.3 Exact Strategy Payoff Boundaries

Rather than sampling a finite price window, the engine analyzes the exact piecewise linear function at expiration:
1. **Asymptotic Slope as $S \to \infty$:**
   $$\text{slope}_{\infty} = \sum_{\text{legs}} \text{sign}_i \cdot \text{qty}_i \cdot \mathbf{1}_{\{\text{leg}_i \text{ is Call}\}}$$
   - If $\text{slope}_{\infty} > 0 \implies \text{Max Profit} = \textbf{"Unlimited"}$.
   - If $\text{slope}_{\infty} < 0 \implies \text{Max Loss} = \textbf{"Unlimited"}$.
2. **Critical Breakpoints:**
   For bounded structures, the payoff extrema can only occur at $S = 0$ or at the distinct strike prices $\{K_j\}$.
   - At $S = 0$: $\text{P\&L}_0 = -\text{NetCost} + \sum_{\text{puts}} \text{sign}_i \cdot K_i \cdot \text{qty}_i$.
   - At each strike $K$: $\text{P\&L}(K) = -\text{NetCost} + \sum \text{sign}_i \cdot \max(0, \text{Intrinsic}_i(K)) \cdot \text{qty}_i$.
3. **Breakevens:** Calculated analytically by root-finding across the line segments connecting critical points.

---

## 3. Fixed Income Valuation Model

The bond analytics engine (`lib/fn/bndc.js`) implements institutional Treasury pricing conventions with periodic compounding.

### 3.1 Accrued Interest, Clean & Dirty Price

Given annual coupon rate $c_{\%}$, coupon frequency $m$ (typically $m=2$ semi-annual), face value $F = 100$, and settlement fraction $f = \frac{\text{days since last coupon}}{\text{days in coupon period}} \in [0, 1)$:

$$\text{Coupon Cash Flow per period } C = \frac{c_{\%}}{100} \cdot \frac{F}{m}$$

$$\text{Accrued Interest } AI = C \cdot f$$

$$\text{Dirty Price } P_{dirty} = \sum_{t=1}^{n} \frac{C_t}{\left(1 + \frac{y}{m}\right)^{t - f}} + \frac{F}{\left(1 + \frac{y}{m}\right)^{n - f}}$$

$$\text{Clean Price } P_{clean} = P_{dirty} - AI$$

When settlement occurs on a coupon date ($f = 0$), $AI = 0$, and Clean Price equals Dirty Price.

### 3.2 Duration, Convexity & DV01

- **Macaulay Duration (in years):**
  $$D_{mac} = \frac{1}{P_{dirty}} \sum_{t=1}^{n} \frac{(t - f)}{m} \cdot \frac{C_t}{\left(1 + \frac{y}{m}\right)^{t - f}}$$
- **Modified Duration:**
  $$D_{mod} = \frac{D_{mac}}{1 + \frac{y}{m}}$$
- **Convexity:**
  $$\text{Convexity} = \frac{1}{P_{dirty} \cdot m^2} \sum_{t=1}^{n} \frac{(t - f)(t - f + 1) \cdot C_t}{\left(1 + \frac{y}{m}\right)^{t - f + 2}}$$
- **DV01 (Dollar Value of 01):**
  $$\text{DV01} = D_{mod} \cdot P_{dirty} \cdot 0.0001$$

### 3.3 Yield-to-Maturity (YTM) Solver
1. **Zero-Coupon Bonds:** Solved analytically in $O(1)$:
   $$y = m \cdot \left( \left(\frac{F}{P_{dirty}}\right)^{\frac{1}{n - f}} - 1 \right)$$
2. **Coupon Bonds:** Solved using a hybrid Newton-Raphson / bisection algorithm. If a Newton step jumps outside the valid yield bracket $[y_{low}, y_{high}]$, the solver bisects, guaranteeing convergence within 100 iterations to $< 10^{-7}$ tolerance.

---

## 4. Known Boundaries & Limitations

1. **Exercise Style:** Options pricing uses the European analytical framework. American options with early exercise premiums (e.g. deep ITM puts or high dividend yield calls) are not modeled with binomial trees.
2. **Day Count Conventions:** Fixed income day count assumes standard US Treasury conventions (30/360 or Actual/Actual semi-annual). Money market discount basis instruments (e.g. T-Bills using Actual/360 discount yield) use separate BTMM analytics.
3. **Execution Model:** Paper trading executes against simulated quotes and is not connected to any live brokerage, exchange FIX engine, or real funds.
