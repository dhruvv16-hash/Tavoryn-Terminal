// Strategy Interface & Reference Test Strategies
// Standard lifecycle contract: init(ctx), onBar(bar, ctx), onOrderFill(order, ctx), onOrderReject(order, reason, ctx).
// Strict look-ahead protection: strategy context provides access only to historical bars [0...t].
// Reference strategies are for deterministic engine validation and testing only (NOT for live trading).

import { conditionFn } from "../public/lib/backtest.js";
import { compute } from "../public/lib/indicators.js";

/**
 * Base strategy contract
 */
export class Strategy {
  constructor(params = {}) {
    this.name = params.name || this.constructor.name;
    this.params = { ...params };
    this.disclaimer =
      "Reference strategy for deterministic backtesting and test validation. Does NOT imply profitability or readiness for live trading.";
  }

  init(ctx) {}
  onBar(bar, ctx) {}
  onOrderFill(order, ctx) {}
  onOrderReject(order, reason, ctx) {}
  destroy(ctx) {}
}

/**
 * Creates an isolated strategy context for bar t.
 * Strictly prevents looking ahead by only exposing bars slice [0...currentIndex].
 */
export function createStrategyContext(engine, index) {
  const currentBar = engine.bars[index];
  const historySlice = engine.bars.slice(0, index + 1);

  return {
    bar: currentBar,
    index,
    get bars() {
      // Returns historical bars up to current index only. Future bars are inaccessible.
      return historySlice;
    },
    get position() {
      return engine.position ? { ...engine.position } : null;
    },
    get cash() {
      return engine.cash;
    },
    get equity() {
      return engine.calculateCurrentEquity(index);
    },
    get pendingOrders() {
      return engine.pendingOrders.map((o) => ({ ...o }));
    },
    submitOrder(spec) {
      return engine.submitOrder(spec, index);
    },
    cancelOrder(orderId) {
      return engine.cancelOrder(orderId);
    },
    closePosition(reason = "Strategy close", qty = null) {
      return engine.closePosition(index, reason, qty);
    },
  };
}

/**
 * Adapts declarative JSON strategies (from public/lib/backtest.js)
 * to run deterministically on the event-driven replay engine.
 */
export class JsonStrategyAdapter extends Strategy {
  constructor(jsonSpec) {
    super(jsonSpec);
    this.spec = jsonSpec;
    this._condFns = null;
  }

  init(ctx) {
    const bars = ctx.bars;
    // Condition functions pre-evaluated against indicators
    const cond = conditionFn(bars, this.spec.indicators || {});
    const allOf = (fns) => (i) => fns.length > 0 && fns.every((f) => f(i));
    const anyOf = (fns) => (i) => fns.some((f) => f(i));
    const exits = this.spec.exitMatch === "any" ? anyOf : allOf;

    this._condFns = {
      eL: allOf((this.spec.entryLong || []).map(cond)),
      xL: exits((this.spec.exitLong || []).map(cond)),
      eS: allOf((this.spec.entryShort || []).map(cond)),
      xS: exits((this.spec.exitShort || []).map(cond)),
    };
  }

  onBar(bar, ctx) {
    if (!this._condFns) this.init(ctx);
    const i = ctx.index;
    const { eL, xL, eS, xS } = this._condFns;
    const pos = ctx.position;

    if (pos?.side === 1 && (xL(i) || eS(i))) {
      ctx.closePosition(xL(i) ? "Exit long" : "Reverse");
      if (eS(i)) {
        ctx.submitOrder({
          side: "SELL",
          type: "MARKET",
          reason: "Short entry",
          stopLossPct: this.spec.stopLossPct,
          takeProfitPct: this.spec.takeProfitPct,
          trailingStopPct: this.spec.trailingStopPct,
        });
      }
    } else if (pos?.side === -1 && (xS(i) || eL(i))) {
      ctx.closePosition(xS(i) ? "Exit short" : "Reverse");
      if (eL(i)) {
        ctx.submitOrder({
          side: "BUY",
          type: "MARKET",
          reason: "Long entry",
          stopLossPct: this.spec.stopLossPct,
          takeProfitPct: this.spec.takeProfitPct,
          trailingStopPct: this.spec.trailingStopPct,
        });
      }
    } else if (pos && this.spec.maxBarsInTrade > 0 && i - pos.entryIndex + 1 >= this.spec.maxBarsInTrade) {
      ctx.closePosition("Time exit");
    } else if (!pos && eL(i)) {
      ctx.submitOrder({
        side: "BUY",
        type: "MARKET",
        reason: "Long entry",
        stopLossPct: this.spec.stopLossPct,
        takeProfitPct: this.spec.takeProfitPct,
        trailingStopPct: this.spec.trailingStopPct,
      });
    } else if (!pos && eS(i)) {
      ctx.submitOrder({
        side: "SELL",
        type: "MARKET",
        reason: "Short entry",
        stopLossPct: this.spec.stopLossPct,
        takeProfitPct: this.spec.takeProfitPct,
        trailingStopPct: this.spec.trailingStopPct,
      });
    }
  }
}

/**
 * Reference Strategy 1: Exponential Moving Average Crossover (9/21)
 * Enters Long on fast EMA crossing above slow EMA; exits on cross below.
 */
export class ReferenceEmaCrossStrategy extends Strategy {
  constructor(params = {}) {
    super({
      name: "Reference EMA Crossover (9/21)",
      fastLength: params.fastLength || 9,
      slowLength: params.slowLength || 21,
      stopLossPct: params.stopLossPct || 0,
      takeProfitPct: params.takeProfitPct || 0,
      ...params,
    });
    this.fastSeries = null;
    this.slowSeries = null;
  }

  init(ctx) {
    const bars = ctx.bars;
    const fast = compute("ema", bars, { length: this.params.fastLength });
    const slow = compute("ema", bars, { length: this.params.slowLength });
    this.fastSeries = fast.value || fast.ema;
    this.slowSeries = slow.value || slow.ema;
  }

  onBar(bar, ctx) {
    if (!this.fastSeries || !this.slowSeries) this.init(ctx);
    const i = ctx.index;
    if (i < 1) return;

    const fastPrev = this.fastSeries[i - 1];
    const fastCurr = this.fastSeries[i];
    const slowPrev = this.slowSeries[i - 1];
    const slowCurr = this.slowSeries[i];

    if (fastPrev == null || fastCurr == null || slowPrev == null || slowCurr == null) return;

    const crossedAbove = fastPrev <= slowPrev && fastCurr > slowCurr;
    const crossedBelow = fastPrev >= slowPrev && fastCurr < slowCurr;

    const pos = ctx.position;
    if (pos && crossedBelow) {
      ctx.closePosition("EMA Cross Exit");
    } else if (!pos && crossedAbove) {
      ctx.submitOrder({
        side: "BUY",
        type: "MARKET",
        reason: "EMA Bullish Cross",
        stopLossPct: this.params.stopLossPct,
        takeProfitPct: this.params.takeProfitPct,
      });
    }
  }
}

/**
 * Reference Strategy 2: Donchian Channel Breakout (20)
 * Enters Long when price breaks above 20-bar high; exits when breaking below 20-bar low.
 */
export class ReferenceBreakoutStrategy extends Strategy {
  constructor(params = {}) {
    super({
      name: "Reference Channel Breakout (20)",
      period: params.period || 20,
      trailingStopPct: params.trailingStopPct || 0,
      ...params,
    });
  }

  onBar(bar, ctx) {
    const i = ctx.index;
    const period = this.params.period;
    if (i < period) return;

    const bars = ctx.bars;
    let highest = -Infinity;
    let lowest = Infinity;
    for (let k = i - period; k < i; k++) {
      if (bars[k].high > highest) highest = bars[k].high;
      if (bars[k].low < lowest) lowest = bars[k].low;
    }

    const pos = ctx.position;
    if (pos && bar.close < lowest) {
      ctx.closePosition("Breakout Channel Exit");
    } else if (!pos && bar.close > highest) {
      ctx.submitOrder({
        side: "BUY",
        type: "MARKET",
        reason: "Breakout High",
        trailingStopPct: this.params.trailingStopPct,
      });
    }
  }
}

/**
 * Reference Strategy 3: RSI Mean Reversion (14)
 * Enters Long when RSI crosses below 30 and recovers; exits above 55 or stop.
 */
export class ReferenceRsiMeanReversionStrategy extends Strategy {
  constructor(params = {}) {
    super({
      name: "Reference RSI Mean Reversion (14)",
      length: params.length || 14,
      oversold: params.oversold || 30,
      exitLevel: params.exitLevel || 55,
      stopLossPct: params.stopLossPct || 5,
      ...params,
    });
    this.rsiSeries = null;
  }

  init(ctx) {
    const res = compute("rsi", ctx.bars, { length: this.params.length });
    this.rsiSeries = res.value || res.rsi;
  }

  onBar(bar, ctx) {
    if (!this.rsiSeries) this.init(ctx);
    const i = ctx.index;
    if (i < 1) return;

    const rsiPrev = this.rsiSeries[i - 1];
    const rsiCurr = this.rsiSeries[i];
    if (rsiPrev == null || rsiCurr == null) return;

    const pos = ctx.position;
    if (pos) {
      if (rsiCurr >= this.params.exitLevel) {
        ctx.closePosition("RSI Overbought Exit");
      }
    } else {
      if (rsiPrev <= this.params.oversold && rsiCurr > this.params.oversold) {
        ctx.submitOrder({
          side: "BUY",
          type: "MARKET",
          reason: "RSI Oversold Bounce",
          stopLossPct: this.params.stopLossPct,
        });
      }
    }
  }
}
