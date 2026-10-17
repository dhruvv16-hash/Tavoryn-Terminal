// Deterministic Sandbox Mock Broker Adapter
// Fully in-memory, reproducible, zero external network calls.
// Provides realistic balance tracking, position accounting, commission/slippage models,
// and fine-grained failure injection for robust testing.

import crypto from "node:crypto";
import {
  BaseBrokerAdapter,
  RateLimitError,
  TimeoutError,
  OrderRejectedError,
  BrokerError,
} from "./broker-adapter.js";

export class MockBrokerAdapter extends BaseBrokerAdapter {
  constructor(options = {}) {
    super(options.brokerId || "mock-broker", {
      environment: "SANDBOX",
      ...options,
    });

    this.highestFencingToken = 0;

    this.initialCash = options.initialCash ?? 100000;
    this.cash = this.initialCash;
    this.reservedBuyingPower = 0;
    this.realizedPnL = 0;
    this.commissionPerShare = options.commissionPerShare ?? 0.005;
    this.minCommission = options.minCommission ?? 1.0;
    this.slippageBps = options.slippageBps ?? 0; // basis points (1 bp = 0.01%)

    this.positions = new Map(); // symbol -> { symbol, qty, avgEntryPrice, marketPrice, unrealizedPnL, costBasis }
    this.openOrders = new Map(); // brokerOrderId -> orderSpec
    this.orderHistory = new Map(); // brokerOrderId -> orderSpec
    this.marketPrices = new Map(options.initialPrices || []); // symbol -> price
    this.executions = []; // audit log of all fills

    this.failureMode = null; // null | "SUBMISSION_TIMEOUT" | "REJECT" | "RATE_LIMIT" | "PARTIAL_FILL" | "DELAYED_ACK" | "CANCEL_REJECT"
    this.rejectReason = "Simulated rejection";
  }

  setFailureMode(mode, reason = "Simulated rejection") {
    this.failureMode = mode;
    this.rejectReason = reason;
  }

  clearFailureMode() {
    this.failureMode = null;
    this.rejectReason = "";
  }

  setMarketPrice(symbol, price) {
    const sym = String(symbol).toUpperCase();
    const p = Number(price);
    this.marketPrices.set(sym, p);

    // Update position unrealized P&L
    if (this.positions.has(sym)) {
      const pos = this.positions.get(sym);
      pos.marketPrice = p;
      if (pos.qty > 0) {
        pos.unrealizedPnL = Number(((p - pos.avgEntryPrice) * pos.qty).toFixed(4));
      } else if (pos.qty < 0) {
        pos.unrealizedPnL = Number(((pos.avgEntryPrice - p) * Math.abs(pos.qty)).toFixed(4));
      } else {
        pos.unrealizedPnL = 0;
      }
    }
  }

  getMarketPrice(symbol) {
    const sym = String(symbol).toUpperCase();
    return this.marketPrices.get(sym) || 100.0;
  }

  _calculateFee(qty) {
    const rawFee = qty * this.commissionPerShare;
    return Number(Math.max(this.minCommission, rawFee).toFixed(4));
  }

  _calculateSlippagePrice(basePrice, side) {
    if (this.slippageBps === 0) return basePrice;
    const slippageMultiplier = 1 + (side * this.slippageBps) / 10000;
    return Number((basePrice * slippageMultiplier).toFixed(4));
  }

  async getAccount() {
    let unrealizedTotal = 0;
    let portfolioValue = this.cash;

    for (const pos of this.positions.values()) {
      unrealizedTotal += pos.unrealizedPnL;
      portfolioValue += pos.qty * pos.marketPrice;
    }

    return {
      brokerId: this.brokerId,
      accountId: "MOCK-ACCT-01",
      cash: Number(this.cash.toFixed(2)),
      buyingPower: Number(Math.max(0, this.cash - this.reservedBuyingPower).toFixed(2)),
      reservedBuyingPower: Number(this.reservedBuyingPower.toFixed(2)),
      portfolioValue: Number(portfolioValue.toFixed(2)),
      realizedPnL: Number(this.realizedPnL.toFixed(2)),
      unrealizedPnL: Number(unrealizedTotal.toFixed(2)),
      currency: "USD",
      isLive: false,
    };
  }

  async getBuyingPower() {
    const acct = await this.getAccount();
    return acct.buyingPower;
  }

  async getPositions() {
    return Array.from(this.positions.values()).map((p) => ({ ...p }));
  }

  async getOpenOrders() {
    return Array.from(this.openOrders.values()).map((o) => ({ ...o }));
  }

  async getOrder(clientOrderId, brokerOrderId) {
    if (brokerOrderId && this.openOrders.has(brokerOrderId)) {
      return { ...this.openOrders.get(brokerOrderId) };
    }
    if (brokerOrderId && this.orderHistory.has(brokerOrderId)) {
      return { ...this.orderHistory.get(brokerOrderId) };
    }
    for (const o of this.openOrders.values()) {
      if (o.clientOrderId === clientOrderId) return { ...o };
    }
    for (const o of this.orderHistory.values()) {
      if (o.clientOrderId === clientOrderId) return { ...o };
    }
    return null;
  }

  async submitOrder(orderSpec) {
    if (this.status !== "CONNECTED") {
      throw new Error("Broker not connected");
    }

    // Failure injection simulation
    if (this.failureMode === "SUBMISSION_TIMEOUT") {
      throw new TimeoutError("MockBroker simulated submission timeout");
    }
    if (this.failureMode === "REJECT") {
      throw new OrderRejectedError(`Order rejected: ${this.rejectReason}`, this.rejectReason);
    }
    if (this.failureMode === "RATE_LIMIT") {
      throw new RateLimitError("MockBroker rate limit exceeded (HTTP 429)", 30);
    }

    // Fencing token validation: reject stale tokens if downstream supports fencing
    if (orderSpec.fencingToken != null) {
      if (this.highestFencingToken && orderSpec.fencingToken < this.highestFencingToken) {
        throw new OrderRejectedError(
          `Broker rejected order: stale fencing token ${orderSpec.fencingToken} (< ${this.highestFencingToken})`,
          "STALE_FENCING_TOKEN",
        );
      }
      this.highestFencingToken = Math.max(this.highestFencingToken, orderSpec.fencingToken);
    }

    const brokerOrderId = `MOCK-BORD-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    const symbol = String(orderSpec.symbol).toUpperCase();
    const side =
      String(orderSpec.side).toUpperCase() === "BUY" || orderSpec.side === 1 ? 1 : -1;
    const qty = Number(orderSpec.qty);
    const type = String(orderSpec.type || "MARKET").toUpperCase();
    const isClose = Boolean(orderSpec.isClose);

    const record = {
      brokerOrderId,
      clientOrderId: orderSpec.clientOrderId,
      symbol,
      side,
      qty,
      type,
      limitPrice: orderSpec.limitPrice != null ? Number(orderSpec.limitPrice) : null,
      stopPrice: orderSpec.stopPrice != null ? Number(orderSpec.stopPrice) : null,
      isClose,
      filledQty: 0,
      remainingQty: qty,
      status: "OPEN",
      submittedAt: Date.now(),
    };

    if (this.failureMode === "DELAYED_ACK") {
      this.openOrders.set(brokerOrderId, record);
      return {
        brokerOrderId,
        clientOrderId: orderSpec.clientOrderId,
        status: "ACKNOWLEDGED",
        filled: false,
      };
    }

    if (this.failureMode === "PARTIAL_FILL") {
      const partialQty = Math.max(1, Math.floor(qty / 2));
      const mktPrice = this.getMarketPrice(symbol);
      const fillPrice = this._calculateSlippagePrice(mktPrice, side);
      const fee = this._calculateFee(partialQty);

      const fill = this._executeFill(record, partialQty, fillPrice, fee);
      record.status = "PARTIALLY_FILLED";
      this.openOrders.set(brokerOrderId, record);

      return {
        brokerOrderId,
        clientOrderId: orderSpec.clientOrderId,
        status: "PARTIALLY_FILLED",
        filled: false,
        fill,
      };
    }

    // Standard execution
    const mktPrice = this.getMarketPrice(symbol);
    if (type === "MARKET") {
      const fillPrice = this._calculateSlippagePrice(mktPrice, side);
      const fee = this._calculateFee(qty);
      const fill = this._executeFill(record, qty, fillPrice, fee);

      record.status = "FILLED";
      this.orderHistory.set(brokerOrderId, record);

      return {
        brokerOrderId,
        clientOrderId: orderSpec.clientOrderId,
        status: "FILLED",
        filled: true,
        fill,
      };
    }

    if (type === "LIMIT") {
      const limitPrice = Number(orderSpec.limitPrice);
      const canFillNow =
        (side === 1 && mktPrice <= limitPrice) || (side === -1 && mktPrice >= limitPrice);

      if (canFillNow) {
        const fillPrice = limitPrice;
        const fee = this._calculateFee(qty);
        const fill = this._executeFill(record, qty, fillPrice, fee);

        record.status = "FILLED";
        this.orderHistory.set(brokerOrderId, record);

        return {
          brokerOrderId,
          clientOrderId: orderSpec.clientOrderId,
          status: "FILLED",
          filled: true,
          fill,
        };
      }

      // Rest on book
      this.openOrders.set(brokerOrderId, record);
      return {
        brokerOrderId,
        clientOrderId: orderSpec.clientOrderId,
        status: "ACKNOWLEDGED",
        filled: false,
      };
    }

    // Default open order
    this.openOrders.set(brokerOrderId, record);
    return {
      brokerOrderId,
      clientOrderId: orderSpec.clientOrderId,
      status: "ACKNOWLEDGED",
      filled: false,
    };
  }

  async cancelOrder(clientOrderId, brokerOrderId, options = {}) {
    const fencingToken =
      options.fencingToken ??
      (typeof brokerOrderId === "object" && brokerOrderId !== null ? brokerOrderId.fencingToken : null);

    if (fencingToken != null) {
      if (this.highestFencingToken && fencingToken < this.highestFencingToken) {
        throw new BrokerError(
          `Broker rejected cancel: stale fencing token ${fencingToken} (< ${this.highestFencingToken})`,
          "STALE_FENCING_TOKEN",
        );
      }
      this.highestFencingToken = Math.max(this.highestFencingToken, fencingToken);
    }

    if (this.failureMode === "CANCEL_REJECT") {
      throw new BrokerError("Simulated cancel rejection", "CANCEL_REJECTED");
    }

    let targetBrokerId = brokerOrderId;
    if (!targetBrokerId) {
      for (const [bId, ord] of this.openOrders.entries()) {
        if (ord.clientOrderId === clientOrderId) {
          targetBrokerId = bId;
          break;
        }
      }
    }

    if (!targetBrokerId || !this.openOrders.has(targetBrokerId)) {
      return { success: false, reason: "Order not found or already filled/cancelled" };
    }

    const order = this.openOrders.get(targetBrokerId);
    order.status = "CANCELLED";
    this.openOrders.delete(targetBrokerId);
    this.orderHistory.set(targetBrokerId, order);

    this.emit("orderCancelled", { brokerOrderId: targetBrokerId, clientOrderId });
    return { success: true, brokerOrderId: targetBrokerId, clientOrderId };
  }

  _executeFill(orderRecord, fillQty, fillPrice, fee) {
    const symbol = orderRecord.symbol;
    const side = orderRecord.side;
    const notional = fillQty * fillPrice;

    orderRecord.filledQty += fillQty;
    orderRecord.remainingQty = Math.max(0, orderRecord.qty - orderRecord.filledQty);

    // Apply cash and position accounting
    this.cash -= fee;

    let position = this.positions.get(symbol);
    if (!position) {
      position = {
        symbol,
        qty: 0,
        avgEntryPrice: 0,
        marketPrice: fillPrice,
        unrealizedPnL: 0,
        costBasis: 0,
      };
      this.positions.set(symbol, position);
    }

    const currentQty = position.qty;
    const targetQty = currentQty + side * fillQty;

    if (currentQty === 0) {
      // Opening new position
      position.qty = targetQty;
      position.avgEntryPrice = fillPrice;
      position.costBasis = notional;
      this.cash -= side * notional;
    } else if ((currentQty > 0 && side === 1) || (currentQty < 0 && side === -1)) {
      // Adding to existing position in same direction
      const totalNotional = position.qty * position.avgEntryPrice + side * notional;
      position.qty = targetQty;
      position.avgEntryPrice = Number((Math.abs(totalNotional) / Math.abs(targetQty)).toFixed(4));
      position.costBasis = Math.abs(position.qty * position.avgEntryPrice);
      this.cash -= side * notional;
    } else {
      // Reducing or closing or flipping position
      const closingQty = Math.min(Math.abs(currentQty), fillQty);
      const isLong = currentQty > 0;
      const pnlPerUnit = isLong ? fillPrice - position.avgEntryPrice : position.avgEntryPrice - fillPrice;
      const realized = closingQty * pnlPerUnit;

      this.realizedPnL += realized;
      this.cash += isLong ? closingQty * fillPrice : -closingQty * fillPrice;

      if (Math.abs(currentQty) === fillQty) {
        // Closed completely
        position.qty = 0;
        position.avgEntryPrice = 0;
        position.costBasis = 0;
        position.unrealizedPnL = 0;
        this.positions.delete(symbol);
      } else if (Math.abs(currentQty) > fillQty) {
        // Partially reduced
        position.qty = targetQty;
        position.costBasis = Math.abs(position.qty * position.avgEntryPrice);
      } else {
        // Flipped position
        const remainingNewQty = fillQty - Math.abs(currentQty);
        position.qty = side * remainingNewQty;
        position.avgEntryPrice = fillPrice;
        position.costBasis = remainingNewQty * fillPrice;
        this.cash -= side * (remainingNewQty * fillPrice);
      }
    }

    // Refresh unrealized P&L
    if (this.positions.has(symbol)) {
      const pos = this.positions.get(symbol);
      pos.marketPrice = fillPrice;
      pos.unrealizedPnL =
        pos.qty > 0
          ? Number(((fillPrice - pos.avgEntryPrice) * pos.qty).toFixed(4))
          : Number(((pos.avgEntryPrice - fillPrice) * Math.abs(pos.qty)).toFixed(4));
    }

    const execRecord = {
      executionId: `MOCK-EXEC-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      brokerOrderId: orderRecord.brokerOrderId,
      clientOrderId: orderRecord.clientOrderId,
      symbol,
      side,
      qty: fillQty,
      fillPrice,
      fee,
      timestamp: Date.now(),
    };

    this.executions.push(execRecord);
    this.emit("execution", execRecord);

    return execRecord;
  }

  /**
   * Helper for tests to manually simulate a fill on an open order
   */
  simulateFill(clientOrderId, fillSpec = {}) {
    let order = null;
    let targetBrokerId = null;
    for (const [bId, ord] of this.openOrders.entries()) {
      if (ord.clientOrderId === clientOrderId) {
        order = ord;
        targetBrokerId = bId;
        break;
      }
    }

    if (!order) {
      throw new Error(`Order ${clientOrderId} not found in open orders`);
    }

    const fillQty = fillSpec.qty ?? order.remainingQty;
    const fillPrice = fillSpec.price ?? this.getMarketPrice(order.symbol);
    const fee = this._calculateFee(fillQty);

    const fill = this._executeFill(order, fillQty, fillPrice, fee);

    if (order.remainingQty === 0) {
      order.status = "FILLED";
      this.openOrders.delete(targetBrokerId);
      this.orderHistory.set(targetBrokerId, order);
    } else {
      order.status = "PARTIALLY_FILLED";
    }

    return fill;
  }
}
