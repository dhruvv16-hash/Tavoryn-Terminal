// Deterministic Event-Driven Replay Engine
// Chronological bar-by-bar execution simulation strictly preventing lookahead bias.
// Enforces Phase 2 risk controls (maxOrderNotional, maxPositionNotional, maxDailyLoss),
// gap-through stops, multi-mode intrabar collision handling, and institutional accounting.

import { createStrategyContext, JsonStrategyAdapter, Strategy } from "./strategy-interface.js";
import { computeBacktestMetrics } from "./backtest-metrics.js";

const pathOf = (x) => {
  const dH = Math.abs(x.open - x.high);
  const dL = Math.abs(x.open - x.low);
  if (dH !== dL) {
    return dH < dL ? [x.open, x.high, x.low, x.close] : [x.open, x.low, x.high, x.close];
  }
  return x.close < x.open
    ? [x.open, x.high, x.low, x.close]
    : [x.open, x.low, x.high, x.close];
};

export class DeterministicReplayEngine {
  constructor(bars, strategy, options = {}) {
    if (!Array.isArray(bars) || bars.length === 0) {
      throw new Error("ReplayEngine requires a non-empty array of bars");
    }
    this.bars = bars;

    // Strategy resolution
    if (strategy instanceof Strategy) {
      this.strategy = strategy;
    } else if (typeof strategy === "function" && strategy.prototype instanceof Strategy) {
      this.strategy = new strategy(options.strategyParams || {});
    } else if (strategy && typeof strategy === "object" && (strategy.entryLong || strategy.entryShort || strategy.indicators)) {
      this.strategy = new JsonStrategyAdapter(strategy);
    } else if (strategy && typeof strategy.onBar === "function") {
      this.strategy = strategy;
    } else {
      throw new Error("Invalid strategy provided to DeterministicReplayEngine");
    }

    this.options = {
      initialCapital: 10000,
      positionPct: 100,
      feePct: 0.1,
      feePerOrder: 0,
      borrowFeePctAnnual: 0, // Financing/borrow cost for short positions
      maxVolumeParticipationPct: null, // e.g. 10 for max 10% of bar volume
      allowPartialFills: true,
      slippagePct: 0.05,
      spreadPct: 0,
      intrabar: "worst", // 'worst' | 'ohlc' | 'optimistic' | 'magnifier'
      riskLimits: {
        maxOrderNotional: null,
        maxPositionNotional: null,
        maxDailyLoss: null,
      },
      ...options,
    };

    this.cash = Number(this.options.initialCapital) || 10000;
    this.position = null; // { side: 1 | -1, qty, entryPrice, entryTime, entryIndex, stop, target, peak, reason }
    this.pendingOrders = [];
    this.trades = [];
    this.rejections = [];
    this.equity = [];
    this.dailyLossTracker = {}; // 'YYYY-MM-DD' -> realized loss
    this.totalBorrowFees = 0;
    this.barsWithPosition = new Uint8Array(this.bars.length);
    this.totalGrossExposurePct = 0;
  }

  getFee(notional) {
    const feePct = (this.options.feePct || 0) / 100;
    const feePerOrder = this.options.feePerOrder || 0;
    return feePerOrder + notional * feePct;
  }

  getSlippageRate() {
    return (this.options.slippagePct || 0) / 100;
  }

  getHalfSpreadRate() {
    return (this.options.spreadPct || 0) / 200;
  }

  calculateCurrentEquity(index) {
    const b = this.bars[index];
    if (!this.position) return this.cash;
    const mtm =
      this.position.side === 1
        ? this.position.qty * b.close
        : this.position.qty * (2 * this.position.entryPrice - b.close);
    return this.cash + mtm;
  }

  submitOrder(spec, index) {
    const side =
      String(spec.side || "").toUpperCase() === "BUY" || spec.side === 1
        ? 1
        : String(spec.side || "").toUpperCase() === "SELL" || spec.side === -1
          ? -1
          : 0;

    if (side === 0) {
      throw new Error(`Invalid order side: ${spec.side}`);
    }

    const order = {
      id: `ORD-${index + 1}-${this.pendingOrders.length + 1}`,
      createdAtBar: index,
      side,
      type: String(spec.type || "MARKET").toUpperCase(),
      qty: spec.qty != null ? Number(spec.qty) : null,
      limitPrice: spec.limitPrice != null ? Number(spec.limitPrice) : null,
      stopLossPct: spec.stopLossPct != null ? Number(spec.stopLossPct) : null,
      takeProfitPct: spec.takeProfitPct != null ? Number(spec.takeProfitPct) : null,
      trailingStopPct: spec.trailingStopPct != null ? Number(spec.trailingStopPct) : null,
      reason: spec.reason || "Strategy order",
    };

    this.pendingOrders.push(order);
    return order;
  }

  cancelOrder(orderId) {
    const idx = this.pendingOrders.findIndex((o) => o.id === orderId);
    if (idx !== -1) {
      const removed = this.pendingOrders.splice(idx, 1)[0];
      return removed;
    }
    return null;
  }

  closePosition(index, reason = "Strategy close", qty = null) {
    if (!this.position) return null;
    const order = {
      id: `ORD-CLOSE-${index + 1}`,
      createdAtBar: index,
      isClose: true,
      reason,
      qty: qty != null ? Number(qty) : null,
    };
    this.pendingOrders.push(order);
    return order;
  }

  _checkRiskControls(order, execPrice, qty, bar) {
    const limits = this.options.riskLimits || {};
    const notional = execPrice * qty;

    // 1. Max Order Notional
    if (limits.maxOrderNotional != null && limits.maxOrderNotional > 0) {
      if (notional > limits.maxOrderNotional) {
        return {
          allowed: false,
          reason: `Risk control rejection: Order notional $${notional.toFixed(2)} exceeds maximum limit $${limits.maxOrderNotional.toFixed(2)}`,
        };
      }
    }

    // 2. Max Position Notional (for opening/increasing positions)
    if (limits.maxPositionNotional != null && limits.maxPositionNotional > 0) {
      const currentNotional = this.position ? this.position.qty * execPrice : 0;
      const projected = currentNotional + notional;
      if (projected > limits.maxPositionNotional) {
        return {
          allowed: false,
          reason: `Risk control rejection: Projected position notional $${projected.toFixed(2)} exceeds maximum limit $${limits.maxPositionNotional.toFixed(2)}`,
        };
      }
    }

    // 3. Max Daily Loss
    if (limits.maxDailyLoss != null && limits.maxDailyLoss > 0) {
      const dayKey = new Date(bar.time * 1000).toISOString().slice(0, 10);
      const todayLoss = this.dailyLossTracker[dayKey] || 0;
      if (todayLoss >= limits.maxDailyLoss) {
        return {
          allowed: false,
          reason: `Risk control rejection: Daily loss limit $${limits.maxDailyLoss.toFixed(2)} reached for ${dayKey} ($${todayLoss.toFixed(2)} lost)`,
        };
      }
    }

    return { allowed: true };
  }

  _executeOpen(i, side, rawPrice, order, bar) {
    const half = this.getHalfSpreadRate();
    const slip = this.getSlippageRate();
    const fillPrice = rawPrice * (1 + side * half) * (1 + side * slip);

    let qty = order.qty;
    if (qty == null || qty <= 0) {
      // Allocate configured position percentage
      const posPct = this.options.positionPct || 100;
      const alloc = (this.cash * posPct) / 100;
      const feeEst = this.options.feePct ? (this.options.feePct / 100) : 0;
      qty = alloc / (fillPrice * (1 + feeEst));
    }

    if (qty <= 0) return null;

    // Volume participation liquidity constraint
    if (this.options.maxVolumeParticipationPct != null && bar.volume != null && bar.volume > 0) {
      const maxAllowed = bar.volume * (this.options.maxVolumeParticipationPct / 100);
      if (qty > maxAllowed) {
        if (this.options.allowPartialFills === false) {
          const reason = `Liquidity rejection: Order quantity ${qty.toFixed(2)} exceeds maximum volume participation limit of ${maxAllowed.toFixed(2)} (${this.options.maxVolumeParticipationPct}% of bar volume ${bar.volume})`;
          this.rejections.push({
            barIndex: i,
            time: bar.time,
            orderId: order.id,
            reason,
          });
          if (typeof this.strategy.onOrderReject === "function") {
            const ctx = createStrategyContext(this, i);
            this.strategy.onOrderReject(order, reason, ctx);
          }
          return null;
        } else {
          qty = maxAllowed;
        }
      }
    }

    const notional = fillPrice * qty;
    const fee = this.getFee(notional);

    // Risk controls check
    const riskCheck = this._checkRiskControls(order, fillPrice, qty, bar);
    if (!riskCheck.allowed) {
      this.rejections.push({
        barIndex: i,
        time: bar.time,
        orderId: order.id,
        reason: riskCheck.reason,
      });
      if (typeof this.strategy.onOrderReject === "function") {
        const ctx = createStrategyContext(this, i);
        this.strategy.onOrderReject(order, riskCheck.reason, ctx);
      }
      return null;
    }

    // Cash check
    if (this.cash < notional + fee) {
      const reason = `Insufficient funds: required $${(notional + fee).toFixed(2)}, available cash $${this.cash.toFixed(2)}`;
      this.rejections.push({
        barIndex: i,
        time: bar.time,
        orderId: order.id,
        reason,
      });
      if (typeof this.strategy.onOrderReject === "function") {
        const ctx = createStrategyContext(this, i);
        this.strategy.onOrderReject(order, reason, ctx);
      }
      return null;
    }

    this.cash -= notional + fee;

    const slippageDollars = Math.abs(fillPrice - rawPrice) * qty;

    this.position = {
      side,
      qty,
      entryPrice: fillPrice,
      rawEntryPrice: rawPrice,
      entryTime: bar.time,
      entryIndex: i,
      entryFee: fee,
      entrySlippage: slippageDollars,
      borrowFees: 0,
      reason: order.reason,
      peak: fillPrice,
      stop: order.stopLossPct ? fillPrice * (1 - (side * order.stopLossPct) / 100) : null,
      target: order.takeProfitPct ? fillPrice * (1 + (side * order.takeProfitPct) / 100) : null,
      trailingStopPct: order.trailingStopPct || null,
    };

    if (typeof this.strategy.onOrderFill === "function") {
      const ctx = createStrategyContext(this, i);
      this.strategy.onOrderFill(
        {
          ...order,
          filledPrice: fillPrice,
          qty,
          fee,
          slippage: slippageDollars,
          time: bar.time,
        },
        ctx,
      );
    }

    return this.position;
  }

  _executeClose(i, rawPrice, reason, bar, closeQty = null) {
    if (!this.position) return null;
    const pos = this.position;
    const slip = this.getSlippageRate();
    const half = this.getHalfSpreadRate();

    // Long sells at bid - slip; Short buys at ask + slip
    const fillPrice = rawPrice * (1 - pos.side * half) * (1 - pos.side * slip);

    const qtyToClose = (closeQty != null && closeQty > 0 && closeQty < pos.qty) ? closeQty : pos.qty;
    const isPartial = qtyToClose < pos.qty;

    const proceeds =
      pos.side === 1 ? qtyToClose * fillPrice : qtyToClose * (2 * pos.entryPrice - fillPrice);
    const exitNotional = fillPrice * qtyToClose;
    const exitFee = this.getFee(exitNotional);
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

    // Track daily loss
    if (netPnl < 0) {
      const dayKey = new Date(bar.time * 1000).toISOString().slice(0, 10);
      this.dailyLossTracker[dayKey] = (this.dailyLossTracker[dayKey] || 0) + Math.abs(netPnl);
    }

    const trade = {
      id: `TRD-${this.trades.length + 1}`,
      side: pos.side === 1 ? "long" : "short",
      entryTime: pos.entryTime,
      exitTime: bar.time,
      entryIndex: pos.entryIndex,
      exitIndex: i,
      entryPrice: pos.entryPrice,
      exitPrice: fillPrice,
      qty: qtyToClose,
      grossPnl,
      netPnl,
      pnl: netPnl,
      pnlPct,
      commissions,
      fees: totalFees,
      slippage: totalSlippage,
      borrowFees: borrowFeesPortion,
      bars: i - pos.entryIndex,
      entryReason: pos.reason,
      exitReason: reason,
      isPartial,
    };

    this.trades.push(trade);

    if (isPartial) {
      pos.qty -= qtyToClose;
      pos.entryFee = (pos.entryFee || 0) - entryFeePortion;
      pos.entrySlippage = (pos.entrySlippage || 0) - entrySlippagePortion;
      pos.borrowFees = (pos.borrowFees || 0) - borrowFeesPortion;
    } else {
      this.position = null;
    }

    return trade;
  }

  _trail(p) {
    if (!this.position || !this.position.trailingStopPct) return;
    const pos = this.position;
    pos.peak = pos.side === 1 ? Math.max(pos.peak, p) : Math.min(pos.peak, p);
    const t = pos.peak * (1 - (pos.side * pos.trailingStopPct) / 100);
    pos.stop =
      pos.stop == null ? t : pos.side === 1 ? Math.max(pos.stop, t) : Math.min(pos.stop, t);
  }

  _isBeyond(price, level, favour) {
    if (level == null || !this.position) return false;
    return (this.position.side === 1) === favour ? price >= level : price <= level;
  }

  _evaluateIntrabarExits(i, bar, subBars) {
    if (!this.position) return;
    const pos = this.position;
    if (pos.stop == null && pos.target == null && !pos.trailingStopPct) return;

    const half = this.getHalfSpreadRate();
    const quote = (p) => p * (1 - pos.side * half);

    const mode = this.options.intrabar || "worst";

    // Gap-through stop check at the bar Open:
    // If the bar opened beyond the stop level, it must fill at the Open, NOT at the stop level!
    const openQuote = quote(bar.open);
    if (pos.trailingStopPct) this._trail(openQuote);

    if (this._isBeyond(openQuote, pos.stop, false)) {
      this._executeClose(i, bar.open, "Stop", bar);
      return;
    }
    if (this._isBeyond(openQuote, pos.target, true)) {
      this._executeClose(i, bar.open, "Target", bar);
      return;
    }

    if (mode === "worst") {
      const hi = quote(bar.high);
      const lo = quote(bar.low);
      if (pos.trailingStopPct) this._trail(pos.side === 1 ? hi : lo);

      const touchesStop = this._isBeyond(pos.side === 1 ? lo : hi, pos.stop, false);
      const touchesTarget = this._isBeyond(pos.side === 1 ? hi : lo, pos.target, true);

      if (touchesStop) {
        // Stop triggers first in 'worst' mode
        const exitLevel = pos.side === 1 ? Math.min(pos.stop, openQuote) : Math.max(pos.stop, openQuote);
        this._executeClose(i, exitLevel, "Stop", bar);
      } else if (touchesTarget) {
        const exitLevel = pos.side === 1 ? Math.max(pos.target, openQuote) : Math.min(pos.target, openQuote);
        this._executeClose(i, exitLevel, "Target", bar);
      }
    } else if (mode === "optimistic") {
      const hi = quote(bar.high);
      const lo = quote(bar.low);
      if (pos.trailingStopPct) this._trail(pos.side === 1 ? hi : lo);

      const touchesStop = this._isBeyond(pos.side === 1 ? lo : hi, pos.stop, false);
      const touchesTarget = this._isBeyond(pos.side === 1 ? hi : lo, pos.target, true);

      if (touchesTarget) {
        // Target triggers first in 'optimistic' mode
        const exitLevel = pos.side === 1 ? Math.max(pos.target, openQuote) : Math.min(pos.target, openQuote);
        this._executeClose(i, exitLevel, "Target", bar);
      } else if (touchesStop) {
        const exitLevel = pos.side === 1 ? Math.min(pos.stop, openQuote) : Math.max(pos.stop, openQuote);
        this._executeClose(i, exitLevel, "Stop", bar);
      }
    } else if (mode === "ohlc" || mode === "magnifier") {
      const segments = (mode === "magnifier" && subBars?.length) ? subBars : [bar];
      for (const seg of segments) {
        const pts = pathOf(seg).map(quote);
        for (let k = 0; k < pts.length; k++) {
          const p = pts[k];
          if (k === 0) {
            if (pos.trailingStopPct) this._trail(p);
            if (this._isBeyond(p, pos.stop, false)) {
              this._executeClose(i, seg.open, "Stop", bar);
              return;
            }
            if (this._isBeyond(p, pos.target, true)) {
              this._executeClose(i, seg.open, "Target", bar);
              return;
            }
            continue;
          }
          const favour = pos.side === 1 ? p > pts[k - 1] : p < pts[k - 1];
          if (favour) {
            if (this._isBeyond(p, pos.target, true)) {
              this._executeClose(i, pos.target, "Target", bar);
              return;
            }
            if (pos.trailingStopPct) this._trail(p);
          } else if (this._isBeyond(p, pos.stop, false)) {
            this._executeClose(i, pos.stop, "Stop", bar);
            return;
          }
        }
      }
    }
  }

  run() {
    const bars = this.bars;
    const initCtx = {
      bars: this.bars,
      initialCapital: this.options.initialCapital,
      config: this.options,
    };
    if (typeof this.strategy.init === "function") {
      this.strategy.init(initCtx);
    }

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];

      // 1. Process pending orders at the bar Open (decided on bar i - 1 Close)
      if (this.pendingOrders.length > 0) {
        const ordersToProcess = [...this.pendingOrders];
        this.pendingOrders = [];

        for (const order of ordersToProcess) {
          if (order.isClose) {
            if (this.position) {
              this._executeClose(i, b.open, order.reason, b, order.qty);
            }
          } else if (order.type === "MARKET") {
            if (!this.position) {
              this._executeOpen(i, order.side, b.open, order, b);
            } else if (this.position.side !== order.side) {
              // Opposite side order: reduction or reversal
              const currentQty = this.position.qty;
              if (order.qty == null || order.qty >= currentQty) {
                this._executeClose(i, b.open, order.reason || "Reversal exit", b);
                if (order.qty != null && order.qty > currentQty) {
                  const remOrder = { ...order, qty: order.qty - currentQty };
                  this._executeOpen(i, order.side, b.open, remOrder, b);
                }
              } else {
                this._executeClose(i, b.open, order.reason || "Partial close", b, order.qty);
              }
            }
          } else if (order.type === "LIMIT") {
            // Check if limit price was reached at or after open
            const lp = order.limitPrice;
            if (lp != null) {
              const touched = (order.side === 1 && b.low <= lp) || (order.side === -1 && b.high >= lp);
              if (touched) {
                const fillAt = order.side === 1 ? Math.min(b.open, lp) : Math.max(b.open, lp);
                if (!this.position) {
                  this._executeOpen(i, order.side, fillAt, order, b);
                } else if (this.position.side !== order.side) {
                  const currentQty = this.position.qty;
                  if (order.qty == null || order.qty >= currentQty) {
                    this._executeClose(i, fillAt, order.reason || "Limit reversal exit", b);
                    if (order.qty != null && order.qty > currentQty) {
                      const remOrder = { ...order, qty: order.qty - currentQty };
                      this._executeOpen(i, order.side, fillAt, remOrder, b);
                    }
                  } else {
                    this._executeClose(i, fillAt, order.reason || "Limit partial close", b, order.qty);
                  }
                }
              } else {
                // Keep limit order pending for next bar
                this.pendingOrders.push(order);
              }
            }
          }
        }
      }

      // Mark if position is held during bar i
      if (this.position) {
        this.barsWithPosition[i] = 1;
      }

      // 2. Accrue short borrow financing fees across bars
      if (this.position && this.position.side === -1 && this.options.borrowFeePctAnnual > 0 && i > 0) {
        const prevBar = bars[i - 1];
        const deltaSec = b.time - prevBar.time;
        if (deltaSec > 0) {
          const annualRate = this.options.borrowFeePctAnnual / 100;
          const borrowCost = this.position.qty * b.close * annualRate * (deltaSec / (365 * 86400));
          if (borrowCost > 0) {
            this.cash -= borrowCost;
            this.position.borrowFees = (this.position.borrowFees || 0) + borrowCost;
            this.totalBorrowFees += borrowCost;
          }
        }
      }

      // 3. Process stops and targets inside this bar
      this._evaluateIntrabarExits(i, b, null);

      // 4. Evaluate strategy on this bar's Close (orders are submitted for bar i + 1)
      if (i < bars.length - 1) {
        const ctx = createStrategyContext(this, i);
        if (typeof this.strategy.onBar === "function") {
          this.strategy.onBar(b, ctx);
        }
      }

      // 5. Mark to market equity at the bar Close
      const mtmVal = this.calculateCurrentEquity(i);
      this.equity.push({ time: b.time, value: mtmVal });

      const posNotional = this.position ? Math.abs(this.position.qty * b.close) : 0;
      this.totalGrossExposurePct += mtmVal > 0 ? (posNotional / mtmVal) * 100 : 0;
    }

    // End of data: close any remaining open position at the final close
    if (this.position) {
      const finalBar = bars[bars.length - 1];
      this._executeClose(bars.length - 1, finalBar.close, "End of data", finalBar);
      if (this.equity.length > 0) {
        this.equity[this.equity.length - 1].value = this.cash;
      }
    }

    if (typeof this.strategy.destroy === "function") {
      this.strategy.destroy(createStrategyContext(this, bars.length - 1));
    }

    const distinctPositionBars = this.barsWithPosition.reduce((a, b) => a + b, 0);
    const avgGrossExposurePct = bars.length > 0 ? this.totalGrossExposurePct / bars.length : 0;

    const metrics = computeBacktestMetrics(this.trades, this.equity, bars, {
      ...this.options,
      totalBorrowFees: this.totalBorrowFees,
      distinctPositionBars,
      avgGrossExposurePct,
    });

    const executionModel = {
      version: "tavoryn-execution-v4.0",
      intrabarMode: this.options.intrabar,
      feeModel: {
        feePct: this.options.feePct,
        feePerOrder: this.options.feePerOrder,
        borrowFeePctAnnual: this.options.borrowFeePctAnnual || 0,
      },
      slippageModel: {
        slippagePct: this.options.slippagePct,
        spreadPct: this.options.spreadPct,
        gapThroughExecution: "Open with adverse slippage",
      },
      liquidityConstraints: {
        maxVolumeParticipationPct: this.options.maxVolumeParticipationPct || null,
        allowPartialFills: this.options.allowPartialFills !== false,
      },
      assumptions: [
        "Fills execute at bar boundaries (Open) or intrabar extremes (High/Low)",
        "Slippage is modeled as an adverse percentage multiplier and gap-open divergence",
        "Borrow fees accrue continuously per bar for short positions",
        "Full cash collateralization reserved on short entries",
      ],
      unsupportedBehaviors: [
        "Sub-millisecond queue priority simulation",
        "Order book depth / market impact curves beyond volume participation",
        "Locate recall / forced short buy-in",
      ],
    };

    return {
      trades: this.trades,
      equity: this.equity,
      rejections: this.rejections,
      metrics,
      executionModel,
      stats: {
        ...metrics,
        totalTrades: metrics.totalTrades,
        netProfitPct: metrics.netProfitPct,
        maxDrawdownPct: metrics.maxDrawdownPct,
        winRatePct: metrics.winRatePct,
        profitFactor: metrics.profitFactor,
        sharpe: metrics.sharpe,
        sortino: metrics.sortino,
        exposurePct: metrics.exposurePct,
        timeInMarketPct: metrics.timeInMarketPct,
        grossExposurePct: metrics.grossExposurePct,
      },
      config: this.options,
    };
  }
}

/**
 * Functional entry point for deterministic replay
 */
export function runReplay(bars, strategy, options = {}) {
  const engine = new DeterministicReplayEngine(bars, strategy, options);
  return engine.run();
}
