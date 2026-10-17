// Provider-Independent Broker Adapter Contract & Capabilities
// Defines the unified interface for brokerage connectivity, capability declarations,
// account/buying power queries, order execution, error classification, and secret safety.
// Live execution is strictly disabled by default.

import { EventEmitter } from "node:events";

export class BrokerError extends Error {
  constructor(message, code = "BROKER_ERROR", upstream = null) {
    super(message);
    this.name = "BrokerError";
    this.code = code;
    this.upstream = upstream;
  }
}

export class RateLimitError extends BrokerError {
  constructor(message, retryAfterSec = 60) {
    super(message, "RATE_LIMIT_EXCEEDED");
    this.name = "RateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

export class TimeoutError extends BrokerError {
  constructor(message = "Broker request timed out") {
    super(message, "REQUEST_TIMEOUT");
    this.name = "TimeoutError";
  }
}

export class AuthenticationError extends BrokerError {
  constructor(message = "Broker authentication failed or disabled") {
    super(message, "AUTHENTICATION_FAILED");
    this.name = "AuthenticationError";
  }
}

export class OrderRejectedError extends BrokerError {
  constructor(message, rejectionReason = "Rejected by broker") {
    super(message, "ORDER_REJECTED");
    this.name = "OrderRejectedError";
    this.rejectionReason = rejectionReason;
  }
}

export const DEFAULT_BROKER_CAPABILITIES = {
  supportedOrderTypes: ["MARKET", "LIMIT", "STOP", "STOP_LIMIT"],
  canCancel: true,
  canReplace: false,
  supportsExtendedHours: false,
  supportsFractional: false,
  isSandbox: true,
  supportsOco: false,
};

/**
 * Base Abstract Broker Adapter
 */
export class BaseBrokerAdapter extends EventEmitter {
  constructor(brokerId, options = {}) {
    super();
    if (!brokerId) throw new Error("BaseBrokerAdapter requires brokerId");
    this.brokerId = brokerId.toLowerCase();

    this.options = {
      environment: options.environment || "SANDBOX", // "SANDBOX" | "PAPER" | "LIVE"
      timeoutMs: options.timeoutMs ?? 5000,
      apiKey:
        options.apiKey ||
        process.env.TAVORYN_BROKER_API_KEY ||
        process.env.AMBER_BROKER_API_KEY ||
        null,
      apiSecret:
        options.apiSecret ||
        process.env.TAVORYN_BROKER_API_SECRET ||
        process.env.AMBER_BROKER_API_SECRET ||
        null,
      liveConfirmationToken:
        options.liveConfirmationToken ||
        process.env.TAVORYN_LIVE_BROKER_CONFIRM ||
        process.env.AMBER_LIVE_BROKER_CONFIRM ||
        null,
      ...options,
    };

    // Non-negotiable safety guard: Live order execution is permanently disabled by default.
    // Live mode requires explicit LIVE environment setting AND confirmation token.
    this.isLive =
      this.options.environment === "LIVE" &&
      this.options.liveConfirmationToken === "YES_I_UNDERSTAND_THE_RISKS";

    if (this.options.environment === "LIVE" && !this.isLive) {
      throw new AuthenticationError(
        "Live brokerage execution is disabled by default. Requires explicit confirmation token.",
      );
    }

    this.status = "DISCONNECTED"; // DISCONNECTED | CONNECTING | CONNECTED | ERROR
    this.capabilities = {
      ...DEFAULT_BROKER_CAPABILITIES,
      isSandbox: !this.isLive,
      ...options.capabilities,
    };
  }

  getCapabilities() {
    return { ...this.capabilities };
  }

  async connect() {
    this.status = "CONNECTED";
    this.emit("status", { status: this.status, isConnected: true });
    return true;
  }

  async disconnect() {
    this.status = "DISCONNECTED";
    this.emit("status", { status: this.status, isConnected: false });
    return true;
  }

  async getHealth() {
    return {
      brokerId: this.brokerId,
      status: this.status,
      isConnected: this.status === "CONNECTED",
      isLive: this.isLive,
      capabilities: this.getCapabilities(),
    };
  }

  async getAccount() {
    throw new Error("getAccount must be implemented by concrete adapter");
  }

  async getBuyingPower() {
    throw new Error("getBuyingPower must be implemented by concrete adapter");
  }

  async getPositions() {
    throw new Error("getPositions must be implemented by concrete adapter");
  }

  async getOpenOrders() {
    throw new Error("getOpenOrders must be implemented by concrete adapter");
  }

  async submitOrder(orderSpec) {
    throw new Error("submitOrder must be implemented by concrete adapter");
  }

  async cancelOrder(clientOrderId, brokerOrderId) {
    throw new Error("cancelOrder must be implemented by concrete adapter");
  }

  async getOrder(clientOrderId, brokerOrderId) {
    throw new Error("getOrder must be implemented by concrete adapter");
  }
}
