// Durable Order Lifecycle & Idempotent State Machine
// Formally manages transitions: CREATED -> RISK_APPROVED -> SUBMITTED -> ACKNOWLEDGED -> PARTIALLY_FILLED -> FILLED
// Terminal states: FILLED, CANCELLED, REJECTED, EXPIRED
// Uncertainty states: SUBMISSION_TIMEOUT, UNKNOWN_STATUS

import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const ORDER_STATES = {
  CREATED: "CREATED",
  RISK_APPROVED: "RISK_APPROVED",
  SUBMITTED: "SUBMITTED",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  PARTIALLY_FILLED: "PARTIALLY_FILLED",
  FILLED: "FILLED",
  CANCELLED: "CANCELLED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
  SUBMISSION_TIMEOUT: "SUBMISSION_TIMEOUT",
  UNKNOWN_STATUS: "UNKNOWN_STATUS",
};

export const TERMINAL_STATES = new Set([
  ORDER_STATES.FILLED,
  ORDER_STATES.CANCELLED,
  ORDER_STATES.REJECTED,
  ORDER_STATES.EXPIRED,
]);

// Valid state transitions graph
const VALID_TRANSITIONS = {
  [ORDER_STATES.CREATED]: new Set([
    ORDER_STATES.RISK_APPROVED,
    ORDER_STATES.REJECTED,
  ]),
  [ORDER_STATES.RISK_APPROVED]: new Set([
    ORDER_STATES.SUBMITTED,
    ORDER_STATES.REJECTED,
    ORDER_STATES.CANCELLED,
  ]),
  [ORDER_STATES.SUBMITTED]: new Set([
    ORDER_STATES.ACKNOWLEDGED,
    ORDER_STATES.PARTIALLY_FILLED,
    ORDER_STATES.FILLED,
    ORDER_STATES.REJECTED,
    ORDER_STATES.SUBMISSION_TIMEOUT,
    ORDER_STATES.UNKNOWN_STATUS,
  ]),
  [ORDER_STATES.ACKNOWLEDGED]: new Set([
    ORDER_STATES.PARTIALLY_FILLED,
    ORDER_STATES.FILLED,
    ORDER_STATES.CANCELLED,
    ORDER_STATES.REJECTED,
    ORDER_STATES.EXPIRED,
    ORDER_STATES.UNKNOWN_STATUS,
  ]),
  [ORDER_STATES.PARTIALLY_FILLED]: new Set([
    ORDER_STATES.PARTIALLY_FILLED,
    ORDER_STATES.FILLED,
    ORDER_STATES.CANCELLED,
    ORDER_STATES.EXPIRED,
    ORDER_STATES.UNKNOWN_STATUS,
  ]),
  [ORDER_STATES.SUBMISSION_TIMEOUT]: new Set([
    ORDER_STATES.ACKNOWLEDGED,
    ORDER_STATES.PARTIALLY_FILLED,
    ORDER_STATES.FILLED,
    ORDER_STATES.REJECTED,
    ORDER_STATES.CANCELLED,
    ORDER_STATES.UNKNOWN_STATUS,
  ]),
  [ORDER_STATES.UNKNOWN_STATUS]: new Set([
    ORDER_STATES.ACKNOWLEDGED,
    ORDER_STATES.PARTIALLY_FILLED,
    ORDER_STATES.FILLED,
    ORDER_STATES.CANCELLED,
    ORDER_STATES.REJECTED,
    ORDER_STATES.EXPIRED,
  ]),
  // Terminal states: CANCELLED permits late fills from broker race conditions
  [ORDER_STATES.FILLED]: new Set(),
  [ORDER_STATES.CANCELLED]: new Set([
    ORDER_STATES.PARTIALLY_FILLED,
    ORDER_STATES.FILLED,
  ]),
  [ORDER_STATES.REJECTED]: new Set(),
  [ORDER_STATES.EXPIRED]: new Set(),
};

export class OrderRecord {
  constructor(spec) {
    this.clientOrderId =
      spec.clientOrderId || `ORD-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    this.brokerOrderId = spec.brokerOrderId || null;
    this.symbol = String(spec.symbol || "").toUpperCase();
    this.side =
      String(spec.side).toUpperCase() === "BUY" || spec.side === 1
        ? 1
        : String(spec.side).toUpperCase() === "SELL" || spec.side === -1
          ? -1
          : 0;
    if (this.side === 0) throw new Error(`Invalid order side: ${spec.side}`);

    this.type = String(spec.type || "MARKET").toUpperCase();
    this.qty = Number(spec.qty);
    if (!Number.isFinite(this.qty) || this.qty <= 0) {
      throw new Error(`Invalid order qty: ${spec.qty}`);
    }

    this.limitPrice = spec.limitPrice != null ? Number(spec.limitPrice) : null;
    this.stopPrice = spec.stopPrice != null ? Number(spec.stopPrice) : null;
    this.isClose = Boolean(spec.isClose);
    this.reason = spec.reason || "Strategy order";

    this.state = ORDER_STATES.CREATED;
    this.filledQty = 0;
    this.remainingQty = this.qty;
    this.avgFillPrice = 0;
    this.totalFees = 0;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();

    this.fills = [];
    this.processedExecutionIds = new Set();
    this.transitions = [
      {
        fromState: null,
        toState: ORDER_STATES.CREATED,
        timestamp: this.createdAt,
        reason: "Order initialized",
      },
    ];
  }

  isTerminal() {
    return TERMINAL_STATES.has(this.state);
  }

  transitionTo(newState, reason = "", metadata = {}) {
    const isLateFillOnCancelled =
      this.state === ORDER_STATES.CANCELLED &&
      (newState === ORDER_STATES.PARTIALLY_FILLED || newState === ORDER_STATES.FILLED);

    if (this.isTerminal() && !isLateFillOnCancelled) {
      return {
        success: false,
        reason: `Order ${this.clientOrderId} is in terminal state ${this.state}; cannot transition to ${newState}`,
      };
    }

    const allowed = VALID_TRANSITIONS[this.state]?.has(newState);
    if (!allowed) {
      return {
        success: false,
        reason: `Illegal state transition from ${this.state} to ${newState} for order ${this.clientOrderId}`,
      };
    }

    const transitionRecord = {
      fromState: this.state,
      toState: newState,
      timestamp: Date.now(),
      reason,
      metadata,
    };

    this.state = newState;
    this.updatedAt = transitionRecord.timestamp;
    this.transitions.push(transitionRecord);

    return { success: true, transition: transitionRecord };
  }

  /**
   * Idempotently processes execution reports
   */
  applyExecutionReport(report) {
    const execId = report.executionId || `EXEC-${report.fillPrice}-${report.qty}-${Date.now()}`;
    if (this.processedExecutionIds.has(execId)) {
      return { applied: false, reason: "DUPLICATE_EXECUTION_REPORT", executionId: execId };
    }

    if (this.isTerminal() && this.state !== ORDER_STATES.CANCELLED) {
      return {
        applied: false,
        reason: `Cannot apply fill to terminal state ${this.state}`,
        executionId: execId,
      };
    }

    const fillQty = Number(report.qty);
    const fillPrice = Number(report.fillPrice);
    const fee = Number(report.fee || 0);

    if (!Number.isFinite(fillQty) || fillQty <= 0) {
      throw new Error(`Invalid fill qty: ${report.qty}`);
    }
    if (!Number.isFinite(fillPrice) || fillPrice <= 0) {
      throw new Error(`Invalid fill price: ${report.fillPrice}`);
    }

    this.processedExecutionIds.add(execId);

    // Update cumulative volume-weighted average price (VWAP)
    const prevNotional = this.filledQty * this.avgFillPrice;
    const newNotional = prevNotional + fillQty * fillPrice;
    this.filledQty += fillQty;
    this.remainingQty = Math.max(0, this.qty - this.filledQty);
    this.avgFillPrice = Number((newNotional / this.filledQty).toFixed(4));
    this.totalFees += fee;

    const fillRecord = {
      executionId: execId,
      fillPrice,
      qty: fillQty,
      fee,
      timestamp: report.timestamp || Date.now(),
    };
    this.fills.push(fillRecord);

    // Update state based on cumulative filled qty
    if (this.remainingQty === 0) {
      const reason =
        this.state === ORDER_STATES.CANCELLED
          ? "Late fill fully filled cancelled order"
          : "Order fully filled";
      this.transitionTo(ORDER_STATES.FILLED, reason, { fill: fillRecord });
    } else {
      const reason =
        this.state === ORDER_STATES.CANCELLED
          ? "Late partial fill on cancelled order"
          : "Order partially filled";
      this.transitionTo(ORDER_STATES.PARTIALLY_FILLED, reason, { fill: fillRecord });
    }

    return { applied: true, fill: fillRecord, remainingQty: this.remainingQty };
  }

  toJSON() {
    return {
      clientOrderId: this.clientOrderId,
      brokerOrderId: this.brokerOrderId,
      symbol: this.symbol,
      side: this.side,
      qty: this.qty,
      type: this.type,
      limitPrice: this.limitPrice,
      stopPrice: this.stopPrice,
      isClose: this.isClose,
      reason: this.reason,
      state: this.state,
      filledQty: this.filledQty,
      remainingQty: this.remainingQty,
      avgFillPrice: this.avgFillPrice,
      totalFees: this.totalFees,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      fills: [...this.fills],
      processedExecutionIds: Array.from(this.processedExecutionIds),
      transitions: [...this.transitions],
    };
  }

  static fromJSON(data) {
    const order = new OrderRecord({
      clientOrderId: data.clientOrderId,
      brokerOrderId: data.brokerOrderId,
      symbol: data.symbol,
      side: data.side,
      qty: data.qty,
      type: data.type,
      limitPrice: data.limitPrice,
      stopPrice: data.stopPrice,
      isClose: data.isClose,
      reason: data.reason,
    });

    order.state = data.state;
    order.filledQty = Number(data.filledQty || 0);
    order.remainingQty = Number(data.remainingQty ?? data.qty);
    order.avgFillPrice = Number(data.avgFillPrice || 0);
    order.totalFees = Number(data.totalFees || 0);
    order.createdAt = data.createdAt || Date.now();
    order.updatedAt = data.updatedAt || Date.now();
    order.fills = Array.isArray(data.fills) ? [...data.fills] : [];
    order.processedExecutionIds = new Set(data.processedExecutionIds || []);
    order.transitions = Array.isArray(data.transitions) ? [...data.transitions] : [];

    return order;
  }
}

/**
 * Manages tracking, lookup, lifecycle events, and durable persistence for all orders
 */
export class OrderLifecycleManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.storagePath = options.storagePath || null;
    this.orders = new Map(); // clientOrderId -> OrderRecord
    this.brokerOrderMap = new Map(); // brokerOrderId -> clientOrderId

    if (this.storagePath && fs.existsSync(this.storagePath)) {
      this.loadFromDisk(this.storagePath);
    }
  }

  saveToDisk(filePath = this.storagePath, metadata = {}) {
    if (!filePath) return;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const mergedMetadata = {
      ...(this.metadata || {}),
      ...metadata,
    };
    this.metadata = mergedMetadata;

    const data = {
      version: 1,
      savedAt: Date.now(),
      metadata: mergedMetadata,
      orders: Array.from(this.orders.values()).map((o) => o.toJSON()),
    };
    const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const fd = fs.openSync(tmpPath, "w");
    try {
      fs.writeFileSync(fd, JSON.stringify(data, null, 2), "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, filePath);
  }

  loadFromDisk(filePath = this.storagePath) {
    if (!filePath || !fs.existsSync(filePath)) return { ordersCount: 0, metadata: {} };
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const data = JSON.parse(raw);
      const orderList = Array.isArray(data) ? data : data.orders || [];

      this.orders.clear();
      this.brokerOrderMap.clear();

      for (const item of orderList) {
        const order = OrderRecord.fromJSON(item);
        this.orders.set(order.clientOrderId, order);
        if (order.brokerOrderId) {
          this.brokerOrderMap.set(order.brokerOrderId, order.clientOrderId);
        }
      }
      this.metadata = data.metadata || {};
      return { ordersCount: this.orders.size, metadata: this.metadata };
    } catch (err) {
      throw new Error(`State file corrupted or unreadable (${filePath}): ${err.message}`);
    }
  }

  createOrder(spec) {
    if (spec.clientOrderId && this.orders.has(spec.clientOrderId)) {
      throw new Error(`Duplicate clientOrderId: Order ${spec.clientOrderId} already exists`);
    }
    const order = new OrderRecord(spec);
    this.orders.set(order.clientOrderId, order);
    this.emit("created", order);

    if (this.storagePath) {
      this.saveToDisk();
    }
    return order;
  }

  getOrder(clientOrderId) {
    return this.orders.get(clientOrderId) || null;
  }

  getOrderByBrokerId(brokerOrderId) {
    const clientOrderId = this.brokerOrderMap.get(brokerOrderId);
    return clientOrderId ? this.orders.get(clientOrderId) || null : null;
  }

  setBrokerOrderId(clientOrderId, brokerOrderId) {
    const order = this.orders.get(clientOrderId);
    if (!order) throw new Error(`Order ${clientOrderId} not found`);
    order.brokerOrderId = brokerOrderId;
    this.brokerOrderMap.set(brokerOrderId, clientOrderId);

    if (this.storagePath) {
      this.saveToDisk();
    }
  }

  transitionOrder(clientOrderId, newState, reason = "", metadata = {}) {
    const order = this.orders.get(clientOrderId);
    if (!order) throw new Error(`Order ${clientOrderId} not found`);
    const res = order.transitionTo(newState, reason, metadata);
    if (res.success) {
      this.emit("stateChange", { order, transition: res.transition });
      if (order.isTerminal()) {
        this.emit("terminal", { order, state: order.state });
      }
      if (this.storagePath) {
        this.saveToDisk();
      }
    }
    return res;
  }

  applyExecutionReport(clientOrderId, report) {
    const order = this.orders.get(clientOrderId);
    if (!order) throw new Error(`Order ${clientOrderId} not found`);
    const res = order.applyExecutionReport(report);
    if (res.applied) {
      this.emit("fill", { order, fill: res.fill });
      if (order.isTerminal()) {
        this.emit("terminal", { order, state: order.state });
      }
      if (this.storagePath) {
        this.saveToDisk();
      }
    }
    return res;
  }

  getOpenOrders() {
    return Array.from(this.orders.values()).filter((o) => !o.isTerminal());
  }

  getAllOrders() {
    return Array.from(this.orders.values());
  }
}
