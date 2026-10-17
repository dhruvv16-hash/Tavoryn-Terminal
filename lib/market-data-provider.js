// Provider-independent Market Data Architecture & Normalized Event Schema
// Implements BaseMarketDataProvider, TokenBucketRateLimiter, and Canonical Event Validation.
// Zero live broker connections; offline-safe and deterministic.

import { EventEmitter } from "node:events";
import crypto from "node:crypto";

/**
 * Canonical Normalized Market Data Event Factory
 */
export function createNormalizedEvent({
  provider,
  symbol,
  eventType = "BAR",
  timeframe = "1m",
  exchangeTime,
  receivedTime = Date.now(),
  sequenceNumber = null,
  bar = null,
  quote = null,
  trade = null,
  qualityFlags = ["NORMAL"],
  provenance = {},
}) {
  if (!provider || typeof provider !== "string") {
    throw new Error("createNormalizedEvent: provider string is required");
  }
  if (!symbol || typeof symbol !== "string") {
    throw new Error("createNormalizedEvent: symbol string is required");
  }
  if (exchangeTime == null || !Number.isFinite(exchangeTime)) {
    throw new Error("createNormalizedEvent: exchangeTime must be a finite numeric timestamp");
  }

  const id = `EVT-${provider}-${symbol}-${exchangeTime}-${sequenceNumber ?? crypto.randomBytes(3).toString("hex")}`;

  return {
    id,
    provider: provider.toLowerCase(),
    symbol: symbol.toUpperCase(),
    eventType: eventType.toUpperCase(),
    timeframe,
    exchangeTime: Number(exchangeTime),
    receivedTime: Number(receivedTime),
    sequenceNumber: sequenceNumber != null ? Number(sequenceNumber) : null,
    bar: bar ? { ...bar } : null,
    quote: quote ? { ...quote } : null,
    trade: trade ? { ...trade } : null,
    qualityFlags: Array.isArray(qualityFlags) ? [...qualityFlags] : ["NORMAL"],
    provenance: {
      rawPayload: provenance.rawPayload || null,
      sourceId: provenance.sourceId || provider,
      latencyMs: receivedTime >= exchangeTime ? receivedTime - exchangeTime : 0,
      ...provenance,
    },
  };
}

/**
 * Validates a canonical normalized event against integrity constraints
 */
export function validateNormalizedEvent(event) {
  if (!event || typeof event !== "object") {
    return { valid: false, reason: "Event must be an object" };
  }

  const validTypes = ["BAR", "QUOTE", "TRADE", "HEARTBEAT", "STATUS", "GAP"];
  if (!validTypes.includes(event.eventType)) {
    return { valid: false, reason: `Unknown eventType: ${event.eventType}` };
  }

  if (!Number.isFinite(event.exchangeTime) || event.exchangeTime <= 0) {
    return { valid: false, reason: `Invalid exchangeTime: ${event.exchangeTime}` };
  }

  if (event.eventType === "BAR") {
    if (!event.bar) return { valid: false, reason: "BAR event missing bar payload" };
    const { open, high, low, close, volume } = event.bar;
    if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
      return { valid: false, reason: "OHLC values must all be finite numbers" };
    }
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
      return { valid: false, reason: "OHLC values must be strictly positive" };
    }
    if (high < low || high < open || high < close || low > open || low > close) {
      return { valid: false, reason: `Invalid OHLC bounds: H=${high}, L=${low}, O=${open}, C=${close}` };
    }
    if (volume != null && (!Number.isFinite(volume) || volume < 0)) {
      return { valid: false, reason: `Invalid volume: ${volume}` };
    }
  }

  if (event.eventType === "QUOTE") {
    if (!event.quote) return { valid: false, reason: "QUOTE event missing quote payload" };
    const { bid, ask } = event.quote;
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) {
      return { valid: false, reason: "Bid and ask must be positive finite numbers" };
    }
    if (bid > ask) {
      return { valid: false, reason: `Crossed market quote: bid ${bid} > ask ${ask}` };
    }
  }

  if (event.eventType === "TRADE") {
    if (!event.trade) return { valid: false, reason: "TRADE event missing trade payload" };
    const { price, size } = event.trade;
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(size) || size <= 0) {
      return { valid: false, reason: "Trade price and size must be positive finite numbers" };
    }
  }

  return { valid: true };
}

/**
 * Token Bucket Rate Limiter supporting Retry-After
 */
export class TokenBucketRateLimiter {
  constructor({ maxRequests = 60, intervalMs = 60000 } = {}) {
    this.maxTokens = maxRequests;
    this.tokens = maxRequests;
    this.intervalMs = intervalMs;
    this.fillRatePerMs = maxRequests / intervalMs;
    this.lastRefill = Date.now();
    this.retryAfterUntil = 0;
  }

  _refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.fillRatePerMs);
    this.lastRefill = now;
  }

  setRetryAfter(seconds) {
    this.retryAfterUntil = Date.now() + Math.max(0, seconds) * 1000;
  }

  isRateLimited() {
    if (Date.now() < this.retryAfterUntil) return true;
    this._refill();
    return this.tokens < 1;
  }

  tryConsume(cost = 1) {
    if (Date.now() < this.retryAfterUntil) {
      const waitSec = Math.ceil((this.retryAfterUntil - Date.now()) / 1000);
      return { allowed: false, reason: `Rate limited: Retry-After active for ${waitSec}s` };
    }
    this._refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return { allowed: true, remaining: Math.floor(this.tokens) };
    }
    return { allowed: false, reason: "Rate limit exceeded: Token bucket exhausted" };
  }
}

/**
 * Abstract Base Market Data Provider
 */
export class BaseMarketDataProvider extends EventEmitter {
  constructor(providerId, options = {}) {
    super();
    if (!providerId) throw new Error("BaseMarketDataProvider requires providerId");
    this.providerId = providerId.toLowerCase();
    this.options = {
      reconnectBaseMs: options.reconnectBaseMs ?? 500,
      reconnectMaxMs: options.reconnectMaxMs ?? 30000,
      reconnectJitter: options.reconnectJitter ?? 0.2,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      rateLimits: options.rateLimits ?? { maxRequests: 60, intervalMs: 60000 },
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 15000,
      heartbeatTimeoutMs: options.heartbeatTimeoutMs ?? 45000,
      ...options,
    };

    this.status = "DISCONNECTED"; // DISCONNECTED | CONNECTING | CONNECTED | DEGRADED | RECOVERING
    this.reconnectAttempts = 0;
    this.subscriptions = new Set();
    this.rateLimiter = new TokenBucketRateLimiter(this.options.rateLimits);
    this.lastEventTime = null;
    this.lastHeartbeatTime = null;
    this.heartbeatTimer = null;
  }

  computeBackoffDelay(attempt = this.reconnectAttempts) {
    const base = this.options.reconnectBaseMs;
    const max = this.options.reconnectMaxMs;
    const exp = Math.min(max, base * Math.pow(2, attempt));
    const jitter = exp * this.options.reconnectJitter * (Math.random() * 2 - 1);
    return Math.max(base, Math.round(exp + jitter));
  }

  async connect() {
    this.status = "CONNECTING";
    this.emit("status", { status: this.status, providerId: this.providerId });
    // Concrete providers implement socket/polling setup
    this.status = "CONNECTED";
    this.reconnectAttempts = 0;
    this.lastHeartbeatTime = Date.now();
    this.emit("status", { status: this.status, providerId: this.providerId });
    return true;
  }

  async disconnect() {
    this.status = "DISCONNECTED";
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.emit("status", { status: this.status, providerId: this.providerId });
    return true;
  }

  subscribe(symbol, timeframe = "1m") {
    const key = `${symbol.toUpperCase()}::${timeframe}`;
    this.subscriptions.add(key);
    this.emit("subscribed", { symbol: symbol.toUpperCase(), timeframe });
    return true;
  }

  unsubscribe(symbol, timeframe = "1m") {
    const key = `${symbol.toUpperCase()}::${timeframe}`;
    const removed = this.subscriptions.delete(key);
    if (removed) {
      this.emit("unsubscribed", { symbol: symbol.toUpperCase(), timeframe });
    }
    return removed;
  }

  async fetchHistoricalBars(symbol, timeframe, from, to) {
    throw new Error("fetchHistoricalBars must be implemented by concrete provider");
  }

  getStatus() {
    return {
      providerId: this.providerId,
      status: this.status,
      isConnected: this.status === "CONNECTED",
      reconnectAttempts: this.reconnectAttempts,
      subscriptions: Array.from(this.subscriptions),
      lastEventTime: this.lastEventTime,
      lastHeartbeatTime: this.lastHeartbeatTime,
      rateLimitRemaining: Math.floor(this.rateLimiter.tokens),
    };
  }
}
