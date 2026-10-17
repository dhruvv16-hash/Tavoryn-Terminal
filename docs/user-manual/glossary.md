# Tavoryn Terminal — Quantitative & Financial Glossary

**Release Target:** Tavoryn Terminal Research Edition v1.0  
**Baseline:** Phase 9 Frozen Baseline  
**Scope:** Verified Financial, Statistical, and Quantitative Terminology  

---

## A

### Analyst Consensus (ANR)
The arithmetic mean and distribution of professional Wall Street equity research analyst ratings (Buy, Overweight, Hold, Underweight, Sell) and 12-month forward price targets.

### Asset Allocation
The quantitative division of an investment portfolio across broad asset classes (Equities, Fixed Income, Commodities, Currencies, Cash) to optimize the portfolio's expected return relative to its risk tolerance.

---

## B

### Backtesting (BTST)
The mathematical simulation of a rule-based algorithmic strategy applied to historical market bars (OHLCV) to evaluate how the strategy would have performed historically.  
*Disclaimer:* Past hypothetical backtest performance is not indicative of future results.

### Beta ($\beta$)
A quantitative measure of the systematic risk or sensitivity of a security's returns relative to market index returns (such as the S&P 500):
$$\beta = \frac{\text{Cov}(R_{\text{asset}}, R_{\text{market}})}{\text{Var}(R_{\text{market}})}$$
- $\beta = 1.0$: The asset moves in tandem with the market.
- $\beta > 1.0$: The asset exhibits higher volatility than the market (e.g., high-growth tech).
- $\beta < 1.0$: The asset exhibits lower volatility than the market (e.g., defensive utilities).

### Bid & Ask Spread
The spread between the highest price a prospective buyer is willing to bid for a security and the lowest price a prospective seller is asking. The midpoint represents the theoretical fair market quote:
$$\text{Spread} = P_{\text{ask}} - P_{\text{bid}}, \quad P_{\text{mid}} = \frac{P_{\text{bid}} + P_{\text{ask}}}{2}$$

---

## C

### Cost Basis
The initial monetary investment in a security, adjusted for transaction fees, corporate stock splits, and return of capital distributions. Used to calculate realized and unrealized capital gains.

---

## D

### Diluted Shares Outstanding
The total number of common shares that would be in circulation if all convertible securities (stock options, warrants, convertible bonds) were fully exercised. Tavoryn uses diluted share counts in per-share intrinsic valuation.

### Discounted Cash Flow (DCF)
A quantitative absolute valuation method that estimates the intrinsic value of an enterprise based upon its projected future free cash flows discounted to the present:
$$EV = \sum_{t=1}^{N} \frac{FCFF_t}{(1 + WACC)^t} + \frac{TV}{(1 + WACC)^N}$$

### Drawdown
The peak-to-trough percentage decline observed in an investment portfolio or strategy equity curve before a subsequent recovery to a new high:
$$\text{Drawdown}_t = \frac{\text{Peak}_{\tau \le t} - \text{Equity}_t}{\text{Peak}_{\tau \le t}}$$

---

## E

### Enterprise Value ($EV$)
The theoretical takeover price of a firm, representing the aggregate market value of all operational assets funded by all capital claimants:
$$EV = \text{Equity Value} + \text{Total Debt} - \text{Cash \& Equivalents}$$

### Equity Value (Market Cap)
The total market capitalization of common equity, representing the claim attributable strictly to common stockholders:
$$\text{Equity Value} = EV - \text{Total Debt} + \text{Cash \& Equivalents}$$

### Exposure
The total dollar notional or percentage value of a portfolio subject to the price fluctuation of a specific asset, sector, or market risk factor.

---

## F

### Free Cash Flow to Firm (FCFF)
The cash flow generated from core operations available for discretionary distribution to all capital providers (both debt and equity holders) after fulfilling operating expenses and reinvestment requirements:
$$FCFF = \text{EBIT} \times (1 - T) + \text{D\&A} - \text{CapEx} - \Delta NWC$$

---

## I

### Implied Volatility (IV)
The forward-looking annualized standard deviation of asset price returns implied by the market prices of traded call and put options, typically solved inversely via the Black-Scholes formula.

---

## M

### Margin of Safety
The percentage discount between an asset's estimated intrinsic value per share and its prevailing market price:
$$\text{Margin of Safety} = \frac{\text{Intrinsic Value} - \text{Market Price}}{\text{Market Price}} \times 100\%$$

### Maximum Drawdown (MDD)
The single largest peak-to-trough percentage loss experienced by a portfolio over a specified historical measurement window.

---

## O

### OHLCV Bars
The standard financial bar representation recording Open ($O$), High ($H$), Low ($L$), Close ($C$), and Volume ($V$) for an asset across a fixed time interval (e.g., 1-day, 1-hour, 5-minute).

---

## P

### Paper Trading
The simulation of order placement and portfolio execution using virtual cash balances without deploying real capital or connecting to live broker routing systems.

### Position Sizing
The disciplined allocation of portfolio capital to a specific trade based on predetermined risk tolerance parameters (e.g., fixed fractional risk, Kelly criterion).

### Profit Factor
The ratio of gross trading profits to gross trading losses across a complete sequence of round-turn trades:
$$\text{Profit Factor} = \frac{\sum \text{Gains}}{\sum |\text{Losses}|}$$

---

## R

### Risk-Adjusted Return
A metric that quantifies an investment's return relative to the amount of risk taken to generate that return (e.g., Sharpe ratio, Sortino ratio).

---

## S

### Sharpe Ratio
An annualized measure of excess return per unit of total risk (standard deviation):
$$\text{Sharpe} = \frac{\bar{R}_p - R_f}{\sigma_p}$$
- Values $> 1.0$: Favorable risk-adjusted performance.
- Values $> 2.0$: Institutional-grade performance.

### Slippage
The difference between the expected price of a trade order (such as the prevailing bid/ask quote when the order is submitted) and the price at which the order actually fills.

---

## T

### Terminal Value (TV)
The present value of all cash flows beyond an explicit multi-year projection horizon ($N$), calculated using the perpetual Gordon Growth Model:
$$TV = \frac{FCFF_N \times (1 + g)}{WACC - g} \quad \text{where } WACC > g$$

---

## V

### Volatility ($\sigma$)
A statistical dispersion metric measuring the degree of variation of asset returns over time, typically measured as the annualized sample standard deviation of logarithmic price returns.

---

## W

### Weighted Average Cost of Capital (WACC)
The average rate of return a company is expected to pay its capital providers (equity and debt holders) weighted by their respective market value proportions:
$$WACC = \left( \frac{E}{V} \times R_e \right) + \left( \frac{D}{V} \times R_d \times (1 - T) \right)$$

### Win Rate
The percentage of completed trades that generate a strictly positive net profit:
$$\text{Win Rate} = \frac{N_{\text{winning trades}}}{N_{\text{total trades}}} \times 100\%$$
