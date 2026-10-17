# Amber Terminal — Phase 9 Accounting Cross-Check & Release Freeze

> [!NOTE]
> **Rebrand Notice & Governance Addendum (October 2026)**
> The quantitative finance platform historically developed under the name **Amber Terminal** has been officially rebranded to **Tavoryn** (parent product: **Tavoryn**, workspace: **Tavoryn Terminal**, quantitative research: **Tavoryn Research**, execution & paper trading: **Tavoryn Execution**).
> This document is a historical audit and verification record preserved under strict cryptographic and governance invariants. All historical evidence, verified test counts, audit findings, and mathematical calculations recorded herein remain immutable and valid under the Tavoryn platform identity.

**Audit Date:** October 17, 2026  
**Auditor:** Quantitative Systems Auditor & Reliability Engineer  
**Repository Directory:** `D:\G_BLOOM\amber-terminal`  
**Host Runtime:** Node.js `v24.19.0` on Windows 11 (`win32-x64`)  
**Package Version:** `1.0.0` (from `package.json`)  
**Scope:** Source-Level Trade-by-Trade Accounting Reconciliation, Cash Ledger Verification, and Release Baseline Preservation  
**Current Release-Gate Disposition:** **PASS WITH LIMITATIONS** (Live execution strictly disabled)  
**Accounting Audit Disposition:** **VERIFIED**

---

## 1. Source Records & Implementation Inspection

The accounting reconciliation was conducted directly from underlying execution records and source algorithms in the codebase:

1. **Session Orchestration:** [`PaperTradingSession`](file:///d:/G_BLOOM/amber-terminal/lib/broker/paper-session.js#L44-L80) in `lib/broker/paper-session.js`
   - Defines the multi-regime simulation: `_runTrendingRegime()`, `_runRangeBoundRegime()`, `_runVolatileGapRegime()`, `_runFeedOutageRegime()`, `_runSessionBoundaryRegime()`.
   - Computes ending cash and evaluates reconciliation in `reconcileAccounting()`.
2. **Execution & Settlement Engine:** [`MockBrokerAdapter`](file:///d:/G_BLOOM/amber-terminal/lib/broker/mock-broker.js#L220-L419) in `lib/broker/mock-broker.js`
   - **Fee Model:** `_calculateFee(qty) = Math.max(minCommission, qty * commissionPerShare)` ([lines 76–79](file:///d:/G_BLOOM/amber-terminal/lib/broker/mock-broker.js#L76-L79)). Under session configuration: `commissionPerShare = 0.005`, `minCommission = 1.0`. For $10$, $20$, or $30$ shares, fee is capped at minimum **$1.00** per order.
   - **Slippage Model:** `_calculateSlippagePrice(basePrice, side)` ([lines 81–85](file:///d:/G_BLOOM/amber-terminal/lib/broker/mock-broker.js#L81-L85)). For 2 bps (0.02%):
     - Buy: $\text{fillPrice} = \text{basePrice} \times (1 + 0.0002)$
     - Sell: $\text{fillPrice} = \text{basePrice} \times (1 - 0.0002)$
   - **Cash & Position Settlement:** `_executeFill()` ([lines 322–419](file:///d:/G_BLOOM/amber-terminal/lib/broker/mock-broker.js#L322-L419)). Deducts fees immediately: `this.cash -= fee`. Updates cost basis and cash flows on buys (`this.cash -= notional`), credits gross proceeds on sells (`this.cash += closingQty * fillPrice`), and accumulates realized profit/loss (`this.realizedPnL += closingQty * (fillPrice - avgEntryPrice)`).
3. **Execution Coordinator:** [`BrokerExecutionCoordinator`](file:///d:/G_BLOOM/amber-terminal/lib/broker/execution-coordinator.js) in `lib/broker/execution-coordinator.js`
   - Serializes orders via `_submissionQueue`. Handles pre-trade risk gating, timeout handling, and emergency liquidation in `activateKillSwitch()`.
4. **Lifecycle Manager:** [`OrderLifecycleManager`](file:///d:/G_BLOOM/amber-terminal/lib/broker/order-lifecycle.js) in `lib/broker/order-lifecycle.js`
   - Tracks order states, deduplicates execution IDs via `applyExecutionReport()`, and maintains persistent disk snapshots.

---

## 2. Trade-by-Trade Position Recalculation

A complete trade-by-trade reconstruction was performed on the 9 executed fills generated during the deterministic paper-trading session:

### 2.1 AAPL Position Ledger

| Exec # | Client Order ID | Side | Qty | Base Price | Slippage Multiplier | Fill Price | Gross Outlay / Proceeds | Order Fee | Cumulative Position | Weighted Avg Entry Price | Realized P&L |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | `TREND-AAPL-0` | BUY | 10 | $152.00 | $1 + 0.0002$ | $152.0304 | -$1,520.3040 | $1.00 | 10 | $152.0304 | $0.0000 |
| **2** | `TREND-AAPL-1` | BUY | 10 | $154.00 | $1 + 0.0002$ | $154.0308 | -$1,540.3080 | $1.00 | 20 | $153.0306 | $0.0000 |
| **3** | `TREND-AAPL-2` | BUY | 10 | $156.00 | $1 + 0.0002$ | $156.0312 | -$1,560.3120 | $1.00 | 30 | $154.0308 | $0.0000 |
| **4** | `TREND-AAPL-3` | BUY | 10 | $158.00 | $1 + 0.0002$ | $158.0316 | -$1,580.3160 | $1.00 | 40 | $155.0310 | $0.0000 |
| **5** | `TREND-AAPL-4` | BUY | 10 | $160.00 | $1 + 0.0002$ | $160.0320 | -$1,600.3200 | $1.00 | 50 | $156.0312 | $0.0000 |
| **7** | `VOLATILE-CLOSE-AAPL` | SELL | 20 | $140.00 | $1 - 0.0002$ | $139.9720 | +$2,799.4400 | $1.00 | 30 | $156.0312 | -$321.1840 |
| **8** | `ORD-...-AAPL` (Flatten) | SELL | 30 | $140.00 | $1 - 0.0002$ | $139.9720 | +$4,199.1600 | $1.00 | 0 | $0.0000 | -$481.7760 |

#### AAPL Position Summary:
- **Total Shares Bought:** 50 shares
- **Total Buy Outlay:** $\$1,520.3040 + \$1,540.3080 + \$1,560.3120 + \$1,580.3160 + \$1,600.3200 = \mathbf{\$7,801.5600}$
- **Final Weighted Average Entry Price:** $\frac{\$7,801.5600}{50} = \mathbf{\$156.0312}$
- **Total Shares Sold:** 50 shares
- **Total Gross Sell Proceeds:** $\$2,799.4400 + \$4,199.1600 = \mathbf{\$6,998.6000}$
- **Total Cost Basis of Sold Shares:** $20 \times \$156.0312 + 30 \times \$156.0312 = \mathbf{\$7,801.5600}$
- **Total AAPL Realized P&L:** $\$6,998.6000 - \$7,801.5600 = -\mathbf{\$802.9600}$  
  *(Breakdown: $-\$321.1840$ from Regime 3 stop close $-\$481.7760$ from Regime 5 emergency flatten)*
- **Total AAPL Fees:** $7 \times \$1.00 = \mathbf{\$7.0000}$
- **Ending AAPL Quantity:** $50 - 50 = \mathbf{0}$ shares (**0 residual exposure**).

---

### 2.2 MSFT Position Ledger

| Exec # | Client Order ID | Side | Qty | Base Price | Slippage Multiplier | Fill Price | Gross Outlay / Proceeds | Order Fee | Cumulative Position | Weighted Avg Entry Price | Realized P&L |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **6** | `RANGE-LIMIT-MSFT` | BUY | 10 | $295.00 | Limit ($0$) | $295.0000$ | -$2,950.0000$ | $1.00$ | 10 | $295.0000$ | $0.0000$ |
| **9** | `ORD-...-MSFT` (Flatten) | SELL | 10 | $300.00 | $1 - 0.0002$ | $299.9400$ | +$2,999.4000$ | $1.00$ | 0 | $0.0000$ | +$49.4000$ |

#### MSFT Position Summary:
- **Partial Fill & Cancellation Accounting:** Order `RANGE-LIMIT-MSFT` requested 20 shares at limit price $295.00. Exactly 10 shares were filled via liquidity match ([`simulateFill`](file:///d:/G_BLOOM/amber-terminal/lib/broker/mock-broker.js#L424-L454)). The remaining 10 shares were cancelled via `coordinator.cancelOrder()`. Lifecycle recorded state transition from `PARTIALLY_FILLED` to `CANCELLED` without leaving ghost open orders on the broker.
- **Total Shares Bought:** 10 shares
- **Total Buy Outlay:** **$2,950.0000**
- **Weighted Average Entry Price:** **$295.0000**
- **Total Shares Sold:** 10 shares
- **Total Gross Sell Proceeds:** **$2,999.4000**
- **Total Cost Basis of Sold Shares:** $10 \times \$295.0000 = \mathbf{\$2,950.0000}$
- **Total MSFT Realized P&L:** $\$2,999.4000 - \$2,950.0000 = +\mathbf{\$49.4000}$
- **Total MSFT Fees:** $2 \times \$1.00 = \mathbf{\$2.0000}$
- **Ending MSFT Quantity:** $10 - 10 = \mathbf{0}$ shares (**0 residual exposure**).

---

## 3. Cash Ledger Reconciliation & Conservation Proof

### 3.1 Cash Flow Method (Physical Cash Inflows vs. Outflows)
In `MockBrokerAdapter`, cash changes occur directly upon order execution:
- Every execution deducts `fee`: `this.cash -= fee`.
- Every purchase deducts gross outlay: `this.cash -= fillQty * fillPrice`.
- Every sale credits gross proceeds: `this.cash += closingQty * fillPrice`.

$$\text{Ending Cash} = \text{Starting Cash} - \sum \text{Buy Outlays} + \sum \text{Sell Proceeds} - \sum \text{Fees}$$

Substituting the independently calculated values:
- Starting Cash: **$100,000.0000**
- $\sum \text{Buy Outlays}$: $\$7,801.5600 (\text{AAPL}) + \$2,950.0000 (\text{MSFT}) = \mathbf{\$10,751.5600}$
- $\sum \text{Sell Proceeds}$: $\$6,998.6000 (\text{AAPL}) + \$2,999.4000 (\text{MSFT}) = \mathbf{\$9,998.0000}$
- $\sum \text{Fees}$: $\$7.0000 (\text{AAPL}) + \$2.0000 (\text{MSFT}) = \mathbf{\$9.0000}$

$$\text{Calculated Ending Cash} = \$100,000.0000 - \$10,751.5600 + \$9,998.0000 - \$9.0000 = \mathbf{\$99,237.4400}$$

---

### 3.2 Economic P&L Method (Universal Conservation Law)
The implementation defines the universal cash conservation law in [`PaperTradingSession.reconcileAccounting()`](file:///d:/G_BLOOM/amber-terminal/lib/broker/paper-session.js#L232-L236):

$$\text{Ending Cash} = \text{Starting Cash} + \text{Realized P&L} - \text{Total Fees} - \text{Open Position Outlay}$$

Substituting:
- Total Realized P&L: $-\$802.9600 (\text{AAPL}) + \$49.4000 (\text{MSFT}) = -\mathbf{\$753.5600}$
- Total Fees: $\mathbf{\$9.0000}$
- Open Position Outlay: $\mathbf{\$0.0000}$ (all positions 100% flattened)

$$\text{Expected Ending Cash} = \$100,000.0000 + (-\$753.5600) - \$9.0000 - \$0.0000 = \mathbf{\$99,237.4400}$$

---

### 3.3 Mathematical Equivalence & Reconciliation
Notice that because all positions were liquidated, the cost basis of sold shares equals the total purchase outlay:
$$\sum \text{Sell Proceeds} - \sum \text{Buy Outlays} \equiv \text{Realized P&L}$$
$$\$9,998.0000 - \$10,751.5600 = -\$753.5600$$

Comparing the two independent recalculations against the broker adapter's ledger balance:

| Metric | Source-Calculated Value | Broker Record / Ledger Value | Discrepancy |
| :--- | :---: | :---: | :---: |
| **Starting Balance** | $100,000.0000 | $100,000.0000 | $0.0000 |
| **Gross Buy Outlays** | $10,751.5600 | $10,751.5600 | $0.0000 |
| **Gross Sell Proceeds** | $9,998.0000 | $9,998.0000 | $0.0000 |
| **Total Broker Fees** | $9.0000 | $9.0000 | $0.0000 |
| **Total Realized P&L** | -$753.5600 | -$753.5600 | $0.0000 |
| **Ending Cash Balance** | $99,237.4400 | $99,237.4400 | **$0.0000** |
| **Residual Open Positions** | 0 | 0 | **0** |

- **Double-Counting Identified:** **None**.
- **Omitted Cash Movements:** **None**.
- **Accounting Discrepancy:** **$0.0000** (Penny-exact match down to four decimal places).

---

## 4. Evidence Verification & Test Confirmation

The following deterministic accounting test suites were executed to verify automated test assertions:

1. **[`test/phase9-operational-validation.test.js`](file:///d:/G_BLOOM/amber-terminal/test/phase9-operational-validation.test.js):**
   - Test: `Extended Paper Session: Full multi-regime simulation and exact cash conservation verification`
   - Result: **PASS** (duration `5.06ms`). Confirms `accounting.isCashConserved === true` and `accounting.cashDiscrepancy === 0.0`.
   - Test: `Extended Paper Session: Mid-session crash recovery maintains exact accounting`
   - Result: **PASS** (duration `17.51ms`). Confirms cash conservation survives crash and restart.
2. **[`test/phase9-final-audit.test.js`](file:///d:/G_BLOOM/amber-terminal/test/phase9-final-audit.test.js):**
   - Test: `Accounting Audit: Long and Short round-trips obey exact cash conservation equation`
   - Result: **PASS** (duration `2.50ms`). Confirms both Long and Short positions obey cash conservation down to $0.0000.

### Breakdown of Verified Claims:
- **Independently Recomputed:** All 9 individual execution fill prices, slippage adjustments, commissions, realized P&L per trade, cost basis averaging, and cash flow ledger balances.
- **Supported by Automated Test Assertions:** Mid-session restart recovery accounting, concurrent order buying-power serialization, and multi-symbol 100+ event stress accounting.

---

## 5. Protected State & Baseline Preservation

- **Target File:** `data/paper-account.json`
- **Initial Reference Hash:** `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`
- **Post-Audit Reference Hash:** `8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D`
- **Byte Delta:** **0 bytes modified** (exact byte-for-byte identity preserved).
- **Live Trading Safeguards:** Real-money trading credentials and live endpoints remain permanently disabled (`isLive = false`, `isSandbox = true`).
- **Phase Boundary:** Phase 9 remains closed. Phase 10 development is not started.

---

## 6. Audit Conclusion & Final Archival Sign-Off

### **Accounting Audit Disposition: VERIFIED**
### **Release-Gate Status: PASS WITH LIMITATIONS**

### Sign-Off Statement:
The reported accounting values are completely reconciled against underlying execution logs and source code algorithms. Both the direct cash flow method and the economic P&L conservation equation reconcile to **$99,237.44** with **$0.0000 discrepancy** and **0 residual positions**.

**Phase 9 is formally archived. Live execution remains disabled, and the repository baseline is frozen.**
