// Controlled Shadow & Paper-Trading Execution Engine
// Feeds historical replay or live market data into a strictly simulated matching engine.
// Completely isolated from live brokerage connectivity and separate from the user's paper-account.
// Logs full audit trail (decision timestamp, data timestamp, order intent, simulated fill, costs, portfolio state).
// Features data anomaly detection (stale, missing, duplicate, out-of-order), idempotency restart recovery,
// and an operator emergency kill switch.

import { createStrategyContext } from "./strategy-interface.js";

export class ShadowTradingEngine {
  constructor(strategy, options = {}) {
    if (!strategy) {
      throw new Error("ShadowTradingEngine requires a strategy instance or definition");
    }

    this.strategy = strategy;
    this.strategyVersion = options.strategyVersion || "shadow-v1.0.0";
    this.sessionId = options.sessionId || `shadow-${Date.now()}`;

    this.options = {
      initialCapital: Number(options.initialCapital) || 100000,
      feePct: options.feePct ?? 0.1,
      slippagePct: options.slippagePct ?? 0.05,
      spreadPct: options.spreadPct ?? 0,
      borrowFeePctAnnual: options.borrowFeePctAnnual ?? 0,
      expectedIntervalSec: options.expectedIntervalSec ?? 86400,
      riskLimits: options.riskLimits || {},
      flattenOnKill: options.flattenOnKill !== false,
      ...options,
    };

    // State
    this.cash = this.options.initialCapital;
    this.position = null;
    this.pendingOrders = [];
    this.trades = [];
    this.auditLog = [];
    this.anomalies = [];
    this.processedTimestamps = new Set();
    this.killSwitchActive = false;
    this.lastBarTime = null;
    this.lastDecisionTime = null;
    this.lastBar = null;

    // Strict non-negotiable safeguard: Live broker connections are physically impossible
    this.isLiveBrokerConnected = false;
    this.pipeline = null;
    if (this.options.pipeline) {
      this.attachPipeline(this.options.pipeline);
    }
  }

  attachPipeline(pipeline) {
    this.pipeline = pipeline;
    pipeline.on("bar", (evt) => {
      if (evt && evt.bar) {
        const barData = {
          time: evt.exchangeTime,
          open: evt.bar.open,
          high: evt.bar.high,
          low: evt.bar.low,
          close: evt.bar.close,
          volume: evt.bar.volume,
          complete: evt.bar.complete,
          symbol: evt.symbol,
          timeframe: evt.timeframe,
        };
        this.processBar(barData);
      }
    });
    return this;
  }

  /**
   * Connect to a broker - strictly forbidden in shadow engine
   */
  connectBroker() {
    throw new Error("Security Violation: Live broker execution is disabled in ShadowTradingEngine");
  }

  /**
   * Emergency Kill Switch
   * Immediately prevents new orders, cancels pending orders, and optionally flattens positions.
   */
  activateKillSwitch({ flatten = true, reason = "Operator emergency kill switch activated" } = {}) {
    this.killSwitchActive = true;
    const cancelledOrdersCount = this.pendingOrders.length;
    this.pendingOrders = [];

    let flattenedTrade = null;
    if (flatten && this.position && this.lastBar) {
      flattenedTrade = this._executeClose(this.lastBar.close, "Kill switch emergency flatten", this.lastBar);
    }

    const logEntry = {
      id: `LOG-${this.auditLog.length + 1}`,
      type: "KILL_SWITCH_ACTIVATED",
      decisionTimestamp: Date.now(),
      dataTimestamp: this.lastBarTime,
      reason,
      cancelledOrdersCount,
      flattenedTrade,
      portfolioState: this._getPortfolioSnapshot(),
    };
    this.auditLog.push(logEntry);
    return logEntry;
  }

  /**
   * Deactivates the emergency kill switch
   */
  deactivateKillSwitch(reason = "Operator restored shadow execution") {
    this.killSwitchActive = false;
    const logEntry = {
      id: `LOG-${this.auditLog.length + 1}`,
      type: "KILL_SWITCH_DEACTIVATED",
      decisionTimestamp: Date.now(),
      dataTimestamp: this.lastBarTime,
      reason,
      portfolioState: this._getPortfolioSnapshot(),
    };
    this.auditLog.push(logEntry);
    return logEntry;
  }

  _getPortfolioSnapshot() {
    const lastPrice = this.lastBar ? this.lastBar.close : 0;
    const unrealized = this.position
      ? this.position.side === 1
        ? (lastPrice - this.position.entryPrice) * this.position.qty
        : (this.position.entryPrice - lastPrice) * this.position.qty
      : 0;
    const mtm = this.position
      ? this.position.side === 1
        ? this.position.qty * lastPrice
        : this.position.qty * (2 * this.position.entryPrice - lastPrice)
      : 0;

    return {
      cash: Number(this.cash.toFixed(2)),
      equity: Number((this.cash + mtm).toFixed(2)),
      realizedPnl: Number(this.trades.reduce((a, t) => a + t.netPnl, 0).toFixed(2)),
      unrealizedPnl: Number(unrealized.toFixed(2)),
      position: this.position ? { ...this.position } : null,
      pendingOrdersCount: this.pendingOrders.length,
    };
  }

  submitOrder(spec, barIndex = 0) {
    if (this.killSwitchActive) {
      const rejection = {
        id: `REJ-${Date.now()}`,
        reason: "Rejection: Kill switch is active",
        orderSpec: spec,
      };
      this.auditLog.push({
        id: `LOG-${this.auditLog.length + 1}`,
        type: "ORDER_REJECTED",
        decisionTimestamp: Date.now(),
        dataTimestamp: this.lastBarTime,
        rejectionReason: rejection.reason,
        portfolioState: this._getPortfolioSnapshot(),
      });
      return rejection;
    }

    if (this.pipeline && !spec.isClose) {
      const pipelineHealth = this.pipeline.getHealth();
      if (!pipelineHealth.canTrade) {
        const reason = `Rejection: Market data feed is ${pipelineHealth.status}. Opening entries blocked for safety.`;
        const rejection = {
          id: `REJ-${Date.now()}`,
          reason,
          orderSpec: spec,
        };
        this.auditLog.push({
          id: `LOG-${this.auditLog.length + 1}`,
          type: "ORDER_REJECTED",
          decisionTimestamp: Date.now(),
          dataTimestamp: this.lastBarTime,
          rejectionReason: reason,
          portfolioState: this._getPortfolioSnapshot(),
        });
        return rejection;
      }
    }

    const side =
      String(spec.side || "").toUpperCase() === "BUY" || spec.side === 1
        ? 1
        : String(spec.side || "").toUpperCase() === "SELL" || spec.side === -1
          ? -1
          : 0;

    if (side === 0) throw new Error(`Invalid order side: ${spec.side}`);

    const order = {
      id: `SHD-ORD-${this.auditLog.length + 1}`,
      createdAt: Date.now(),
      side,
      type: String(spec.type || "MARKET").toUpperCase(),
      qty: spec.qty != null ? Number(spec.qty) : null,
      limitPrice: spec.limitPrice != null ? Number(spec.limitPrice) : null,
      stopLossPct: spec.stopLossPct != null ? Number(spec.stopLossPct) : null,
      takeProfitPct: spec.takeProfitPct != null ? Number(spec.takeProfitPct) : null,
      reason: spec.reason || "Shadow strategy order",
    };

    this.pendingOrders.push(order);

    this.auditLog.push({
      id: `LOG-${this.auditLog.length + 1}`,
      type: "ORDER_INTENT",
      decisionTimestamp: Date.now(),
      dataTimestamp: this.lastBarTime,
      orderIntent: { ...order },
      portfolioState: this._getPortfolioSnapshot(),
    });

    return order;
  }

  cancelOrder(orderId) {
    const idx = this.pendingOrders.findIndex((o) => o.id === orderId);
    if (idx !== -1) {
      const removed = this.pendingOrders.splice(idx, 1)[0];
      this.auditLog.push({
        id: `LOG-${this.auditLog.length + 1}`,
        type: "ORDER_CANCELLED",
        decisionTimestamp: Date.now(),
        dataTimestamp: this.lastBarTime,
        orderId,
        portfolioState: this._getPortfolioSnapshot(),
      });
      return removed;
    }
    return null;
  }

  closePosition(reason = "Shadow close", qty = null) {
    if (!this.position) return null;
    const order = {
      id: `SHD-CLOSE-${this.auditLog.length + 1}`,
      createdAt: Date.now(),
      isClose: true,
      reason,
      qty: qty != null ? Number(qty) : null,
    };
    this.pendingOrders.push(order);
    this.auditLog.push({
      id: `LOG-${this.auditLog.length + 1}`,
      type: "ORDER_INTENT",
      decisionTimestamp: Date.now(),
      dataTimestamp: this.lastBarTime,
      orderIntent: { ...order },
      portfolioState: this._getPortfolioSnapshot(),
    });
    return order;
  }

  _executeOpen(rawPrice, order, bar) {
    const slip = (this.options.slippagePct || 0) / 100;
    const half = (this.options.spreadPct || 0) / 200;
    const fillPrice = rawPrice * (1 + order.side * half) * (1 + order.side * slip);

    let qty = order.qty;
    if (qty == null || qty <= 0) {
      const alloc = this.cash * 0.95; // default 95% allocation
      qty = alloc / fillPrice;
    }

    if (qty <= 0) return null;

    const notional = fillPrice * qty;
    const fee = notional * ((this.options.feePct || 0) / 100);

    if (this.cash < notional + fee) {
      const reason = `Insufficient funds: Required $${(notional + fee).toFixed(2)}, available cash $${this.cash.toFixed(2)}`;
      this.auditLog.push({
        id: `LOG-${this.auditLog.length + 1}`,
        type: "ORDER_REJECTED",
        decisionTimestamp: Date.now(),
        dataTimestamp: bar.time,
        rejectionReason: reason,
        orderId: order.id,
        portfolioState: this._getPortfolioSnapshot(),
      });
      return null;
    }

    this.cash -= notional + fee;
    const slippageDollars = Math.abs(fillPrice - rawPrice) * qty;

    this.position = {
      side: order.side,
      qty,
      entryPrice: fillPrice,
      rawEntryPrice: rawPrice,
      entryTime: bar.time,
      entryFee: fee,
      entrySlippage: slippageDollars,
      borrowFees: 0,
      reason: order.reason,
      stop: order.stopLossPct ? fillPrice * (1 - (order.side * order.stopLossPct) / 100) : null,
      target: order.takeProfitPct ? fillPrice * (1 + (order.side * order.takeProfitPct) / 100) : null,
    };

    const fillEvent = {
      orderId: order.id,
      side: order.side === 1 ? "BUY" : "SELL",
      fillPrice,
      qty,
      fee,
      slippage: slippageDollars,
      time: bar.time,
    };

    this.auditLog.push({
      id: `LOG-${this.auditLog.length + 1}`,
      type: "ORDER_FILLED",
      decisionTimestamp: Date.now(),
      dataTimestamp: bar.time,
      simulatedFill: fillEvent,
      portfolioState: this._getPortfolioSnapshot(),
    });

    return this.position;
  }

  _executeClose(rawPrice, reason, bar, closeQty = null) {
    if (!this.position) return null;
    const pos = this.position;
    const slip = (this.options.slippagePct || 0) / 100;
    const half = (this.options.spreadPct || 0) / 200;
    const fillPrice = rawPrice * (1 - pos.side * half) * (1 - pos.side * slip);

    const qtyToClose = closeQty != null && closeQty > 0 && closeQty < pos.qty ? closeQty : pos.qty;
    const isPartial = qtyToClose < pos.qty;

    const proceeds =
      pos.side === 1 ? qtyToClose * fillPrice : qtyToClose * (2 * pos.entryPrice - fillPrice);
    const exitNotional = fillPrice * qtyToClose;
    const exitFee = exitNotional * ((this.options.feePct || 0) / 100);
    const exitSlippage = Math.abs(fillPrice - rawPrice) * qtyToClose;

    const entryFeePortion = (pos.entryFee || 0) * (qtyToClose / pos.qty);
    const entrySlippagePortion = (pos.entrySlippage || 0) * (qtyToClose / pos.qty);
    const borrowFeesPortion = (pos.borrowFees || 0) * (qtyToClose / pos.qty);
    const commissions = entryFeePortion + exitFee;
    const totalFees = commissions + borrowFeesPortion;
    const totalSlippage = entrySlippagePortion + exitSlippage;

    this.cash += proceeds - exitFee;

    const grossPnl =
      pos.side === 1
        ? (fillPrice - pos.entryPrice) * qtyToClose
        : (pos.entryPrice - fillPrice) * qtyToClose;
    const netPnl = grossPnl - totalFees;
    const tradeCost = qtyToClose * pos.entryPrice;
    const pnlPct = tradeCost > 0 ? (netPnl / tradeCost) * 100 : 0;

    const trade = {
      id: `SHD-TRD-${this.trades.length + 1}`,
      side: pos.side === 1 ? "long" : "short",
      entryTime: pos.entryTime,
      exitTime: bar.time,
      entryPrice: pos.entryPrice,
      exitPrice: fillPrice,
      qty: qtyToClose,
      grossPnl,
      netPnl,
      pnl: netPnl,
      pnlPct,
      commissions,
      fees: totalFees,
      borrowFees: borrowFeesPortion,
      slippage: totalSlippage,
      entryReason: pos.reason,
      exitReason: reason,
      isPartial,
    };

    this.trades.push(trade);

    this.auditLog.push({
      id: `LOG-${this.auditLog.length + 1}`,
      type: "ORDER_CLOSED",
      decisionTimestamp: Date.now(),
      dataTimestamp: bar.time,
      simulatedFill: {
        tradeId: trade.id,
        exitPrice: fillPrice,
        qty: qtyToClose,
        grossPnl,
        netPnl,
        reason,
      },
      portfolioState: this._getPortfolioSnapshot(),
    });

    if (isPartial) {
      pos.qty -= qtyToClose;
      pos.entryFee -= entryFeePortion;
      pos.entrySlippage -= entrySlippagePortion;
      pos.borrowFees = (pos.borrowFees || 0) - borrowFeesPortion;
    } else {
      this.position = null;
    }

    return trade;
  }

  /**
   * Ingests a new market bar chronologically and drives strategy decisions.
   */
  processBar(bar) {
    if (!bar || typeof bar !== "object" || bar.time == null) {
      throw new Error("Invalid bar provided to processBar");
    }

    // Incomplete Bar Quality Check: completed-bar strategies must not receive incomplete data
    if (bar.complete === false && !this.options.allowPartialBars) {
      return { status: "SKIPPED_INCOMPLETE", message: "Incomplete candle skipped for completed-bar strategy" };
    }

    // 1. Anomaly & Data Quality Detection
    if (this.processedTimestamps.has(bar.time)) {
      const anomaly = {
        type: "DUPLICATE_BAR_TIMESTAMP",
        time: bar.time,
        detectedAt: Date.now(),
        message: `Ignored duplicate bar at timestamp ${bar.time} to prevent double-execution.`,
      };
      this.anomalies.push(anomaly);
      return { status: "SKIPPED_DUPLICATE", anomaly };
    }

    if (this.lastBarTime && bar.time < this.lastBarTime) {
      const anomaly = {
        type: "OUT_OF_ORDER_TIMESTAMP",
        time: bar.time,
        lastTime: this.lastBarTime,
        detectedAt: Date.now(),
        message: `Rejected out-of-order bar: ${bar.time} < ${this.lastBarTime}`,
      };
      this.anomalies.push(anomaly);
      return { status: "REJECTED_OUT_OF_ORDER", anomaly };
    }

    if (this.lastBarTime && bar.time - this.lastBarTime > this.options.expectedIntervalSec * 1.5) {
      this.anomalies.push({
        type: "MISSING_DATA_GAP",
        time: bar.time,
        lastTime: this.lastBarTime,
        gapSec: bar.time - this.lastBarTime,
        detectedAt: Date.now(),
        message: `Data gap detected: ${bar.time - this.lastBarTime}s > expected ${this.options.expectedIntervalSec}s`,
      });
    }

    this.lastBar = bar;
    this.lastBarTime = bar.time;

    // 2. Process Pending Orders at the bar Open
    if (this.pendingOrders.length > 0 && !this.killSwitchActive) {
      const ordersToRun = [...this.pendingOrders];
      this.pendingOrders = [];

      for (const order of ordersToRun) {
        if (order.isClose) {
          this._executeClose(bar.open, order.reason, bar, order.qty);
        } else if (order.type === "MARKET") {
          if (!this.position) {
            this._executeOpen(bar.open, order, bar);
          } else if (this.position.side !== order.side) {
            this._executeClose(bar.open, "Reversal", bar);
            this._executeOpen(bar.open, order, bar);
          }
        } else if (order.type === "LIMIT") {
          const reached = (order.side === 1 && bar.low <= order.limitPrice) || (order.side === -1 && bar.high >= order.limitPrice);
          if (reached) {
            const fillPrice = order.side === 1 ? Math.min(bar.open, order.limitPrice) : Math.max(bar.open, order.limitPrice);
            if (!this.position) {
              this._executeOpen(fillPrice, order, bar);
            }
          } else {
            this.pendingOrders.push(order);
          }
        }
      }
    }

    // 3. Intrabar Stop / Target Exits
    if (this.position && !this.killSwitchActive) {
      const pos = this.position;
      if (pos.stop != null) {
        const hitStop = pos.side === 1 ? bar.low <= pos.stop : bar.high >= pos.stop;
        if (hitStop) {
          const fill = pos.side === 1 ? Math.min(pos.stop, bar.open) : Math.max(pos.stop, bar.open);
          this._executeClose(fill, "Stop", bar);
        }
      }
      if (this.position && pos.target != null) {
        const hitTarget = pos.side === 1 ? bar.high >= pos.target : bar.low <= pos.target;
        if (hitTarget) {
          const fill = pos.side === 1 ? Math.max(pos.target, bar.open) : Math.min(pos.target, bar.open);
          this._executeClose(fill, "Target", bar);
        }
      }

      // 3.5 Accrue short borrow financing fee
      if (this.position && this.position.side === -1 && this.options.borrowFeePctAnnual > 0) {
        const periodsPerYear = Math.max(1, Math.round((86400 * 365) / (this.options.expectedIntervalSec || 86400)));
        const periodRate = (this.options.borrowFeePctAnnual / 100) / periodsPerYear;
        const notional = this.position.qty * bar.close;
        const borrowCost = notional * periodRate;
        if (borrowCost > 0) {
          this.cash -= borrowCost;
          this.position.borrowFees = (this.position.borrowFees || 0) + borrowCost;
        }
      }
    }

    // 4. Evaluate Strategy Decisions on bar Close
    if (!this.killSwitchActive && typeof this.strategy.onBar === "function") {
      const ctx = {
        index: this.processedTimestamps.size,
        cash: this.cash,
        position: this.position,
        pendingOrders: this.pendingOrders,
        submitOrder: (spec) => this.submitOrder(spec),
        cancelOrder: (id) => this.cancelOrder(id),
        closePosition: (reason, qty) => this.closePosition(reason, qty),
      };
      this.lastDecisionTime = Date.now();
      this.strategy.onBar(bar, ctx);
    }

    this.processedTimestamps.add(bar.time);
    return { status: "PROCESSED", portfolio: this._getPortfolioSnapshot() };
  }

  /**
   * Health and Observability Interface
   */
  getStatus() {
    const portfolio = this._getPortfolioSnapshot();
    const nowSec = Math.floor(Date.now() / 1000);
    const dataFreshnessSec = this.lastBarTime ? nowSec - this.lastBarTime : null;

    let health = "HEALTHY";
    if (this.killSwitchActive) health = "KILLED";
    else if (this.anomalies.length > 0) health = "DEGRADED";

    const totalRealizedPnl = this.trades.reduce((a, t) => a + t.netPnl, 0);
    const posOutlay = this.position
      ? (this.position.entryPrice * this.position.qty + (this.position.entryFee || 0) + (this.position.borrowFees || 0))
      : 0;
    const expectedCash = this.options.initialCapital + totalRealizedPnl - posOutlay;
    const cashDiscrepancy = Math.abs(this.cash - expectedCash);
    const cashConservationVerified = cashDiscrepancy < 0.05;

    const pipelineHealth = this.pipeline ? this.pipeline.getHealth() : null;

    return {
      status: health,
      killSwitchActive: this.killSwitchActive,
      isLiveBrokerConnected: false, // Invariant: always false
      pipelineAttached: Boolean(this.pipeline),
      pipeline: pipelineHealth
        ? {
            status: pipelineHealth.status,
            continuityStatus: pipelineHealth.continuityStatus,
            canTrade: pipelineHealth.canTrade,
            activeGapsCount: pipelineHealth.activeGapsCount,
            queueDepth: pipelineHealth.queueDepth,
          }
        : null,
      strategyVersion: this.strategyVersion,
      sessionId: this.sessionId,
      lastDataTimestamp: this.lastBarTime,
      lastDecisionTimestamp: this.lastDecisionTime,
      dataFreshnessSec,
      anomaliesCount: this.anomalies.length,
      anomalies: [...this.anomalies],
      cash: portfolio.cash,
      equity: portfolio.equity,
      realizedPnl: portfolio.realizedPnl,
      unrealizedPnl: portfolio.unrealizedPnl,
      openPositionsCount: portfolio.position ? 1 : 0,
      tradesCount: this.trades.length,
      auditLogCount: this.auditLog.length,
      reconciliation: {
        reconciled: cashConservationVerified,
        cashConservationVerified,
        cashDiscrepancy: Number(cashDiscrepancy.toFixed(4)),
        expectedCash: Number(expectedCash.toFixed(2)),
      },
    };
  }

  /**
   * Exports an immutable snapshot for restart recovery
   */
  saveSnapshot() {
    return {
      sessionId: this.sessionId,
      strategyVersion: this.strategyVersion,
      savedAt: Date.now(),
      cash: this.cash,
      position: this.position ? { ...this.position } : null,
      pendingOrders: [...this.pendingOrders],
      trades: [...this.trades],
      anomalies: [...this.anomalies],
      processedTimestamps: Array.from(this.processedTimestamps),
      killSwitchActive: this.killSwitchActive,
      lastBarTime: this.lastBarTime,
      lastDecisionTime: this.lastDecisionTime,
    };
  }

  /**
   * Restores engine state from a snapshot
   */
  restoreSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
      throw new Error("Invalid snapshot for restore");
    }
    this.cash = snapshot.cash;
    this.position = snapshot.position;
    this.pendingOrders = [...(snapshot.pendingOrders || [])];
    this.trades = [...(snapshot.trades || [])];
    this.anomalies = [...(snapshot.anomalies || [])];
    this.processedTimestamps = new Set(snapshot.processedTimestamps || []);
    this.killSwitchActive = snapshot.killSwitchActive;
    this.lastBarTime = snapshot.lastBarTime;
    this.lastDecisionTime = snapshot.lastDecisionTime;
    return this.getStatus();
  }
}
