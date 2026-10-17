// Pre-Trade Risk Gateway & Safety Breakers
// Enforces fail-closed deterministic checks: max qty, notional, portfolio/symbol exposure,
// available buying power, max daily loss, allowed instruments/order types, open orders count,
// rate limiting (orders/min), and real-time market data feed health.
// Risk-reducing exits are explicitly exempted from buying power and exposure expansion checks.

export const RISK_REJECTION_CODES = {
  KILL_SWITCH_ACTIVE: "KILL_SWITCH_ACTIVE",
  INVALID_ORDER_SPEC: "INVALID_ORDER_SPEC",
  DISALLOWED_INSTRUMENT: "DISALLOWED_INSTRUMENT",
  DISALLOWED_ORDER_TYPE: "DISALLOWED_ORDER_TYPE",
  STALE_OR_DEGRADED_FEED: "STALE_OR_DEGRADED_FEED",
  FEED_STALE: "FEED_STALE",
  MISSING_MARKET_PRICE: "MISSING_MARKET_PRICE",
  MAX_ORDER_QTY_EXCEEDED: "MAX_ORDER_QTY_EXCEEDED",
  MAX_ORDER_NOTIONAL_EXCEEDED: "MAX_ORDER_NOTIONAL_EXCEEDED",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  MAX_OPEN_ORDERS_EXCEEDED: "MAX_OPEN_ORDERS_EXCEEDED",
  DAILY_LOSS_LIMIT_REACHED: "DAILY_LOSS_LIMIT_REACHED",
  UNKNOWN_BUYING_POWER: "UNKNOWN_BUYING_POWER",
  INSUFFICIENT_BUYING_POWER: "INSUFFICIENT_BUYING_POWER",
  MAX_POSITION_EXPOSURE_EXCEEDED: "MAX_POSITION_EXPOSURE_EXCEEDED",
  INVALID_CLOSING_ORDER: "INVALID_CLOSING_ORDER",
  CLOSING_QTY_EXCEEDS_POSITION: "CLOSING_QTY_EXCEEDS_POSITION",
};

export class PreTradeRiskGateway {
  constructor(config = {}) {
    this.config = {
      maxOrderQty: config.maxOrderQty ?? 1000,
      maxOrderNotional: config.maxOrderNotional ?? 100000,
      maxPositionExposure: config.maxPositionExposure ?? 250000,
      maxDailyLoss: config.maxDailyLoss ?? 5000,
      maxOpenOrders: config.maxOpenOrders ?? 20,
      maxOrdersPerMinute: config.maxOrdersPerMinute ?? 60,
      feedMaxAgeMs: config.feedMaxAgeMs ?? 15000,
      killSwitchEngaged: Boolean(config.killSwitchEngaged),
      killSwitchReason: config.killSwitchReason || null,
      ...config,
      allowedInstruments: config.allowedInstruments
        ? new Set(config.allowedInstruments.map((s) => s.toUpperCase()))
        : null,
      allowedOrderTypes: config.allowedOrderTypes
        ? new Set(config.allowedOrderTypes.map((t) => t.toUpperCase()))
        : new Set(["MARKET", "LIMIT", "STOP", "STOP_LIMIT"]),
    };

    this.submissionTimestamps = [];
  }

  engageKillSwitch(reason = "Manual kill switch engaged") {
    this.config.killSwitchEngaged = true;
    this.config.killSwitchReason = reason;
  }

  disengageKillSwitch() {
    this.config.killSwitchEngaged = false;
    this.config.killSwitchReason = null;
  }

  isKillSwitchEngaged() {
    return this.config.killSwitchEngaged;
  }

  updateConfig(newConfig = {}) {
    if (newConfig.allowedInstruments) {
      newConfig.allowedInstruments = new Set(
        newConfig.allowedInstruments.map((s) => s.toUpperCase()),
      );
    }
    if (newConfig.allowedOrderTypes) {
      newConfig.allowedOrderTypes = new Set(
        newConfig.allowedOrderTypes.map((t) => t.toUpperCase()),
      );
    }
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Evaluate an order against pre-trade risk controls.
   * Fail-closed: missing inputs reject orders.
   *
   * @param {Object} orderSpec - { symbol, side, qty, type, limitPrice, stopPrice, isClose, isKillSwitchFlatten }
   * @param {Object} context - { buyingPower, positions, openOrdersCount, currentDailyLoss, feedPipeline, feedHealth, feedTimestamp, currentPrice }
   * @returns {Object} { allowed: boolean, reason?: string, code?: string, estPrice?: number, estNotional?: number }
   */
  evaluateOrder(orderSpec, context = {}) {
    const now = Date.now();

    // 1. Kill Switch Check
    if (this.config.killSwitchEngaged) {
      // Emergency flattening orders created as part of kill-switch procedure are permitted
      if (!orderSpec.isKillSwitchFlatten) {
        return {
          allowed: false,
          code: RISK_REJECTION_CODES.KILL_SWITCH_ACTIVE,
          reason: `Kill switch active: ${this.config.killSwitchReason || "Trading halted"}`,
        };
      }
    }

    // 2. Order Specification Integrity
    if (!orderSpec || typeof orderSpec !== "object") {
      return {
        allowed: false,
        code: RISK_REJECTION_CODES.INVALID_ORDER_SPEC,
        reason: "Missing order specification",
      };
    }

    const symbol = String(orderSpec.symbol || "").toUpperCase();
    if (!symbol) {
      return {
        allowed: false,
        code: RISK_REJECTION_CODES.INVALID_ORDER_SPEC,
        reason: "Missing or invalid symbol",
      };
    }

    const side =
      String(orderSpec.side).toUpperCase() === "BUY" || orderSpec.side === 1
        ? 1
        : String(orderSpec.side).toUpperCase() === "SELL" || orderSpec.side === -1
          ? -1
          : 0;
    if (side === 0) {
      return {
        allowed: false,
        code: RISK_REJECTION_CODES.INVALID_ORDER_SPEC,
        reason: `Invalid order side: ${orderSpec.side}`,
      };
    }

    const qty = Number(orderSpec.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      return {
        allowed: false,
        code: RISK_REJECTION_CODES.INVALID_ORDER_SPEC,
        reason: `Invalid order quantity: ${orderSpec.qty}`,
      };
    }

    const type = String(orderSpec.type || "MARKET").toUpperCase();
    if (this.config.allowedOrderTypes && !this.config.allowedOrderTypes.has(type)) {
      return {
        allowed: false,
        code: RISK_REJECTION_CODES.DISALLOWED_ORDER_TYPE,
        reason: `Order type ${type} is not allowed by risk policy`,
      };
    }

    if (type === "LIMIT") {
      const limitPrice = Number(orderSpec.limitPrice);
      if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
        return {
          allowed: false,
          code: RISK_REJECTION_CODES.INVALID_ORDER_SPEC,
          reason: `Limit order requires positive numeric limitPrice: ${orderSpec.limitPrice}`,
        };
      }
    }

    if (type === "STOP" || type === "STOP_LIMIT") {
      const stopPrice = Number(orderSpec.stopPrice);
      if (!Number.isFinite(stopPrice) || stopPrice <= 0) {
        return {
          allowed: false,
          code: RISK_REJECTION_CODES.INVALID_ORDER_SPEC,
          reason: `Stop order requires positive numeric stopPrice: ${orderSpec.stopPrice}`,
        };
      }
    }

    // 3. Instrument Whitelist
    if (this.config.allowedInstruments && !this.config.allowedInstruments.has(symbol)) {
      return {
        allowed: false,
        code: RISK_REJECTION_CODES.DISALLOWED_INSTRUMENT,
        reason: `Instrument ${symbol} is not permitted by risk policy`,
      };
    }

    // 4. Feed Health & Freshness (Market Data Pipeline Integration)
    let feedHealth = context.feedHealth;
    if (!feedHealth && context.feedPipeline && typeof context.feedPipeline.getHealth === "function") {
      feedHealth = context.feedPipeline.getHealth();
    }

    if (feedHealth) {
      if (
        feedHealth.canTrade === false ||
        feedHealth.isHealthy === false ||
        feedHealth.status === "ERROR" ||
        feedHealth.status === "STALE" ||
        feedHealth.status === "DEGRADED" ||
        feedHealth.status === "DISCONNECTED"
      ) {
        return {
          allowed: false,
          code: RISK_REJECTION_CODES.STALE_OR_DEGRADED_FEED,
          reason: `Market data feed is degraded or stale (status: ${feedHealth.status}). Trading halted.`,
          details: feedHealth,
        };
      }
    }

    if (context.feedTimestamp != null) {
      const age = now - Number(context.feedTimestamp);
      if (age > this.config.feedMaxAgeMs) {
        return {
          allowed: false,
          code: RISK_REJECTION_CODES.FEED_STALE,
          reason: `Market data feed age (${age}ms) exceeds max allowable threshold (${this.config.feedMaxAgeMs}ms)`,
        };
      }
    }

    // 5. Price Estimation & Notional Calculation
    let estPrice = null;
    if (type === "LIMIT" && orderSpec.limitPrice != null) {
      estPrice = Number(orderSpec.limitPrice);
    } else if (context.currentPrice != null && Number(context.currentPrice) > 0) {
      estPrice = Number(context.currentPrice);
    } else if (orderSpec.limitPrice != null && Number(orderSpec.limitPrice) > 0) {
      estPrice = Number(orderSpec.limitPrice);
    }

    if (!Number.isFinite(estPrice) || estPrice <= 0) {
      return {
        allowed: false,
        code: RISK_REJECTION_CODES.MISSING_MARKET_PRICE,
        reason: `Cannot determine order valuation: missing valid market price for ${symbol}`,
      };
    }

    const estNotional = Number((qty * estPrice).toFixed(4));

    // 6. Max Order Quantity
    if (qty > this.config.maxOrderQty) {
      return {
        allowed: false,
        code: RISK_REJECTION_CODES.MAX_ORDER_QTY_EXCEEDED,
        reason: `Order qty ${qty} exceeds maximum allowable single order qty ${this.config.maxOrderQty}`,
      };
    }

    // 7. Max Order Notional
    if (estNotional > this.config.maxOrderNotional) {
      return {
        allowed: false,
        code: RISK_REJECTION_CODES.MAX_ORDER_NOTIONAL_EXCEEDED,
        reason: `Order notional $${estNotional} exceeds maximum allowable order notional $${this.config.maxOrderNotional}`,
      };
    }

    // 8. Rate Limiting (Submissions per minute)
    this.submissionTimestamps = this.submissionTimestamps.filter((ts) => now - ts < 60000);
    if (this.submissionTimestamps.length >= this.config.maxOrdersPerMinute) {
      return {
        allowed: false,
        code: RISK_REJECTION_CODES.RATE_LIMIT_EXCEEDED,
        reason: `Submission rate limit exceeded (${this.submissionTimestamps.length}/${this.config.maxOrdersPerMinute} orders/min)`,
      };
    }

    // 9. Max Open Orders
    const openOrdersCount = Number(context.openOrdersCount ?? 0);
    if (openOrdersCount >= this.config.maxOpenOrders) {
      return {
        allowed: false,
        code: RISK_REJECTION_CODES.MAX_OPEN_ORDERS_EXCEEDED,
        reason: `Open orders count (${openOrdersCount}) has reached or exceeded max limit (${this.config.maxOpenOrders})`,
      };
    }

    // 10. Max Daily Loss Breaker
    const currentDailyLoss = Number(context.currentDailyLoss ?? 0);
    if (currentDailyLoss >= this.config.maxDailyLoss) {
      // Safety policy: Risk-reducing closing orders are permitted to stop further losses
      if (!orderSpec.isClose) {
        return {
          allowed: false,
          code: RISK_REJECTION_CODES.DAILY_LOSS_LIMIT_REACHED,
          reason: `Daily loss limit reached ($${currentDailyLoss} >= $${this.config.maxDailyLoss}). Only risk-reducing closing orders permitted.`,
        };
      }
    }

    // 11. Risk-Reducing Exits vs Available Buying Power & Position Exposure
    const isClose = Boolean(orderSpec.isClose);

    if (isClose) {
      // ADVERSARIAL VALIDATION:
      // If position context is provided, verify that an open position exists,
      // order side opposes the position, and qty does not exceed open position.
      if (context.positions != null) {
        const positions = Array.isArray(context.positions)
          ? context.positions
          : typeof context.positions === "object" && context.positions !== null
            ? Object.values(context.positions)
            : [];

        const currentPos = positions.find(
          (p) => String(p.symbol || "").toUpperCase() === symbol,
        );
        const currentQty = Number(currentPos?.qty || 0);

        if (currentQty === 0) {
          return {
            allowed: false,
            code: RISK_REJECTION_CODES.INVALID_CLOSING_ORDER,
            reason: `Cannot claim closing-order exemption: no open position exists for ${symbol}`,
          };
        }

        if (currentQty > 0 && side !== -1) {
          return {
            allowed: false,
            code: RISK_REJECTION_CODES.INVALID_CLOSING_ORDER,
            reason: `Cannot claim closing-order exemption: order side (${orderSpec.side}) does not oppose long position of ${currentQty} ${symbol}`,
          };
        }

        if (currentQty < 0 && side !== 1) {
          return {
            allowed: false,
            code: RISK_REJECTION_CODES.INVALID_CLOSING_ORDER,
            reason: `Cannot claim closing-order exemption: order side (${orderSpec.side}) does not oppose short position of ${currentQty} ${symbol}`,
          };
        }

        const closableQty = Math.abs(currentQty);
        if (qty > closableQty) {
          return {
            allowed: false,
            code: RISK_REJECTION_CODES.CLOSING_QTY_EXCEEDS_POSITION,
            reason: `Closing order qty (${qty}) exceeds closable position size (${closableQty} ${symbol}); unintentional reversal prevented`,
          };
        }
      }

      // Risk-reducing exit: explicitly exempt from buying power checks and exposure expansion checks
      this.submissionTimestamps.push(now);
      return {
        allowed: true,
        estPrice,
        estNotional,
        isRiskReducing: true,
      };
    }

    // Opening or expanding order: strictly verify buying power and max position exposure
    const availableBuyingPower = context.buyingPower != null ? Number(context.buyingPower) : null;
    if (availableBuyingPower == null || !Number.isFinite(availableBuyingPower)) {
      return {
        allowed: false,
        code: RISK_REJECTION_CODES.UNKNOWN_BUYING_POWER,
        reason: "Available buying power is unknown or missing from context; fail-closed",
      };
    }

    if (estNotional > availableBuyingPower) {
      return {
        allowed: false,
        code: RISK_REJECTION_CODES.INSUFFICIENT_BUYING_POWER,
        reason: `Order notional $${estNotional} exceeds available buying power $${availableBuyingPower.toFixed(2)}`,
      };
    }

    // Check position exposure
    if (this.config.maxPositionExposure > 0) {
      const positions = Array.isArray(context.positions)
        ? context.positions
        : typeof context.positions === "object" && context.positions !== null
          ? Object.values(context.positions)
          : [];

      const currentPos = positions.find(
        (p) => String(p.symbol || "").toUpperCase() === symbol,
      );
      const currentQty = Number(currentPos?.qty || 0);
      const newQty = currentQty + side * qty;
      const newExposureNotional = Math.abs(newQty * estPrice);

      if (newExposureNotional > this.config.maxPositionExposure) {
        return {
          allowed: false,
          code: RISK_REJECTION_CODES.MAX_POSITION_EXPOSURE_EXCEEDED,
          reason: `Projected position exposure for ${symbol} ($${newExposureNotional.toFixed(2)}) exceeds max allowable limit ($${this.config.maxPositionExposure})`,
        };
      }
    }

    // Approved: record submission timestamp for rate limiting
    this.submissionTimestamps.push(now);

    return {
      allowed: true,
      estPrice,
      estNotional,
      isRiskReducing: false,
    };
  }
}
