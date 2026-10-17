// Bounded, Observable Streaming Market Data Pipeline
// Implements acquisition, normalization, validation, deduplication, ordering,
// staleness detection, sequence gap reconciliation, bounded queueing, and backpressure.

import { EventEmitter } from "node:events";
import { validateNormalizedEvent, createNormalizedEvent } from "./market-data-provider.js";
import { MarketSessionManager } from "./market-session.js";

export class MarketDataPipeline extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      maxQueueDepth: options.maxQueueDepth ?? 1000,
      overflowPolicy: options.overflowPolicy || "DROP_OLDEST", // DROP_OLDEST | DROP_NEWEST | BACKPRESSURE
      staleThresholdMs: options.staleThresholdMs ?? 30000,
      dedupWindowSize: options.dedupWindowSize ?? 5000,
      sessionManager: options.sessionManager || new MarketSessionManager(),
      autoBackfill: options.autoBackfill !== false,
      ...options,
    };

    this.queue = [];
    this.isProcessing = false;
    this.status = "DISCONNECTED"; // HEALTHY | DEGRADED | STALE | DISCONNECTED | RECOVERING
    this.continuityStatus = "HEALTHY"; // HEALTHY | DEGRADED

    // State per symbol
    this.lastExchangeTime = new Map(); // symbol -> lastExchangeTime
    this.lastSequenceNumber = new Map(); // symbol -> lastSeq
    this.lastReceivedTime = new Map(); // symbol -> local timestamp
    this.lastBar = new Map(); // symbol -> last closed bar

    // Deduplication cache
    this.seenEventKeys = new Set();
    this.seenKeyQueue = [];

    // Telemetry & Metrics
    this.metrics = {
      eventsIngested: 0,
      eventsProcessed: 0,
      droppedEventsCount: 0,
      duplicateCount: 0,
      outOfOrderCount: 0,
      detectedGapsCount: 0,
      recoveredGapsCount: 0,
      unrecoveredGapsCount: 0,
      reconnectCount: 0,
      processingLatencies: [],
    };

    this.gaps = [];
    this.anomalies = [];
    this.sessionManager = this.options.sessionManager;
    this.provider = null;
  }

  attachProvider(provider) {
    if (this.provider) {
      this.provider.removeAllListeners();
    }
    this.provider = provider;

    provider.on("status", (s) => {
      if (s.status === "CONNECTED") {
        this.status = this.gaps.some((g) => g.status === "UNRECOVERED") ? "DEGRADED" : "HEALTHY";
      } else if (s.status === "DISCONNECTED") {
        this.status = "DISCONNECTED";
        this.metrics.reconnectCount++;
      } else if (s.status === "RECOVERING" || s.status === "CONNECTING") {
        this.status = "RECOVERING";
      }
      this.emit("pipelineStatus", { status: this.status, providerStatus: s.status });
    });

    provider.on("event", (evt) => {
      this.ingest(evt);
    });

    return this;
  }

  _makeDedupKey(event) {
    if (event.sequenceNumber != null) {
      return `${event.symbol}::${event.eventType}::${event.sequenceNumber}`;
    }
    return `${event.symbol}::${event.eventType}::${event.exchangeTime}::${event.bar?.close || event.trade?.price || event.quote?.bid || 0}`;
  }

  _trackDedupKey(key) {
    this.seenEventKeys.add(key);
    this.seenKeyQueue.push(key);
    if (this.seenKeyQueue.length > this.options.dedupWindowSize) {
      const oldest = this.seenKeyQueue.shift();
      this.seenEventKeys.delete(oldest);
    }
  }

  /**
   * Ingests a raw or normalized event into the bounded processing pipeline
   */
  ingest(event) {
    this.metrics.eventsIngested++;

    // 1. Validation
    const validation = validateNormalizedEvent(event);
    if (!validation.valid) {
      this.anomalies.push({
        type: "MALFORMED_EVENT",
        time: Date.now(),
        reason: validation.reason,
        event,
      });
      this.emit("anomaly", { type: "MALFORMED_EVENT", reason: validation.reason, event });
      return { accepted: false, reason: validation.reason };
    }

    // 2. Deduplication check
    const dedupKey = this._makeDedupKey(event);
    if (this.seenEventKeys.has(dedupKey)) {
      this.metrics.duplicateCount++;
      return { accepted: false, reason: "DUPLICATE_EVENT" };
    }
    this._trackDedupKey(dedupKey);

    // 3. Bounded Queue & Overflow Handling
    if (this.queue.length >= this.options.maxQueueDepth) {
      this.metrics.droppedEventsCount++;
      if (this.options.overflowPolicy === "BACKPRESSURE") {
        this.emit("backpressure", { queueDepth: this.queue.length });
        return { accepted: false, reason: "QUEUE_OVERFLOW_BACKPRESSURE" };
      }
      if (this.options.overflowPolicy === "DROP_NEWEST") {
        return { accepted: false, reason: "QUEUE_OVERFLOW_DROPPED_NEWEST" };
      }
      if (this.options.overflowPolicy === "DROP_OLDEST") {
        this.queue.shift(); // Drop oldest
      }
    }

    this.queue.push(event);
    this._drainQueue();
    return { accepted: true, queueDepth: this.queue.length };
  }

  _drainQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const event = this.queue.shift();
      this._processEvent(event);
    }

    this.isProcessing = false;
  }

  _processEvent(event) {
    const startTime = Date.now();
    const sym = event.symbol;

    // 1. Staleness check
    this.lastReceivedTime.set(sym, startTime);

    // 2. Sequence gap check
    const prevSeq = this.lastSequenceNumber.get(sym);
    if (event.sequenceNumber != null && prevSeq != null) {
      if (event.sequenceNumber > prevSeq + 1) {
        const gapSize = event.sequenceNumber - prevSeq - 1;
        this.metrics.detectedGapsCount++;
        const gapRecord = {
          id: `GAP-${sym}-${Date.now()}`,
          symbol: sym,
          startSeq: prevSeq + 1,
          endSeq: event.sequenceNumber - 1,
          gapSize,
          detectedAt: startTime,
          status: "UNVERIFIED_GAP",
        };
        this.gaps.push(gapRecord);
        this.continuityStatus = "DEGRADED";
        this.emit("gap", gapRecord);

        if (this.options.autoBackfill && this.provider && typeof this.provider.fetchHistoricalBars === "function") {
          this.triggerBackfill(sym, prevSeq, event.sequenceNumber);
        }
      }
    }
    if (event.sequenceNumber != null) {
      this.lastSequenceNumber.set(sym, event.sequenceNumber);
    }

    // 3. Out-of-order timestamp check
    const prevTime = this.lastExchangeTime.get(sym);
    if (prevTime != null && event.exchangeTime < prevTime) {
      this.metrics.outOfOrderCount++;
      this.anomalies.push({
        type: "OUT_OF_ORDER_EVENT",
        symbol: sym,
        exchangeTime: event.exchangeTime,
        lastExchangeTime: prevTime,
        detectedAt: startTime,
      });
      this.emit("anomaly", { type: "OUT_OF_ORDER_EVENT", event });
      // Out-of-order event is recorded but does NOT overwrite newer state
      return;
    }
    this.lastExchangeTime.set(sym, event.exchangeTime);

    // 4. Session & Incomplete Bar Quality Control
    if (event.eventType === "BAR" && event.bar) {
      const isComplete = this.sessionManager.isBarComplete(event.exchangeTime, event.timeframe, startTime);
      event.bar.complete = isComplete;
      if (!isComplete) {
        event.qualityFlags.push("INCOMPLETE");
      }
      this.lastBar.set(sym, event.bar);
      this.emit("bar", event);
    }

    // 5. Dispatch Event
    this.metrics.eventsProcessed++;
    const duration = Date.now() - startTime;
    this.metrics.processingLatencies.push(duration);
    if (this.metrics.processingLatencies.length > 1000) {
      this.metrics.processingLatencies.shift();
    }

    this.emit("event", event);
  }

  /**
   * Reconciles gaps via historical backfill with duplicate suppression
   */
  async triggerBackfill(symbol, fromTimeOrSeq, toTimeOrSeq) {
    if (!this.provider || typeof this.provider.fetchHistoricalBars !== "function") return;

    try {
      this.status = "RECOVERING";
      const backfilledBars = await this.provider.fetchHistoricalBars(symbol, "1m", fromTimeOrSeq, toTimeOrSeq);

      let suppressedDups = 0;
      let insertedCount = 0;

      for (const bar of backfilledBars) {
        const normEvt = createNormalizedEvent({
          provider: this.provider.providerId,
          symbol,
          eventType: "BAR",
          timeframe: bar.timeframe || "1m",
          exchangeTime: bar.time,
          receivedTime: Date.now(),
          bar,
          qualityFlags: ["RECOVERED_GAP"],
        });

        const dedupKey = this._makeDedupKey(normEvt);
        if (this.seenEventKeys.has(dedupKey)) {
          suppressedDups++;
        } else {
          this._trackDedupKey(dedupKey);
          insertedCount++;
          this.emit("bar", normEvt);
        }
      }

      const openGap = this.gaps.find((g) => g.symbol === symbol && g.status === "UNVERIFIED_GAP");
      if (openGap) {
        openGap.status = "RECOVERED";
        openGap.recoveredBarsCount = insertedCount;
        openGap.suppressedDups = suppressedDups;
        this.metrics.recoveredGapsCount++;
      }

      this.continuityStatus = "HEALTHY";
      this.status = "HEALTHY";
      this.emit("gapResolved", { symbol, insertedCount, suppressedDups });
    } catch (err) {
      const openGap = this.gaps.find((g) => g.symbol === symbol && g.status === "UNVERIFIED_GAP");
      if (openGap) {
        openGap.status = "UNRECOVERED";
        openGap.error = err.message;
        this.metrics.unrecoveredGapsCount++;
      }
      this.continuityStatus = "DEGRADED";
      this.status = "DEGRADED";
      this.emit("gapFailed", { symbol, error: err.message });
    }
  }

  /**
   * Evaluates overall pipeline health and observability metrics
   */
  getHealth() {
    const now = Date.now();
    let computedStatus = this.status;

    // Check staleness across symbols
    let maxFeedAgeMs = 0;
    for (const [sym, rxTime] of this.lastReceivedTime.entries()) {
      const age = now - rxTime;
      if (age > maxFeedAgeMs) maxFeedAgeMs = age;
      if (age > this.options.staleThresholdMs) {
        // Distinguish legitimate market closure from feed outage
        const lastExTime = this.lastExchangeTime.get(sym) || rxTime;
        const diag = this.sessionManager.distinguishClosureFromOutage(sym, lastExTime, now);
        if (!diag.isLegitimateClosure) {
          computedStatus = "STALE";
        }
      }
    }

    if (this.continuityStatus === "DEGRADED") {
      computedStatus = "DEGRADED";
    }

    const latencies = this.metrics.processingLatencies;
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

    return {
      status: computedStatus,
      continuityStatus: this.continuityStatus,
      isHealthy: computedStatus === "HEALTHY",
      canTrade: computedStatus === "HEALTHY",
      queueDepth: this.queue.length,
      maxQueueDepth: this.options.maxQueueDepth,
      feedAgeMs: maxFeedAgeMs,
      metrics: {
        ...this.metrics,
        latency: { p50Ms: p50, p95Ms: p95, p99Ms: p99 },
      },
      activeGapsCount: this.gaps.filter((g) => g.status !== "RECOVERED").length,
      gaps: [...this.gaps],
      anomalies: [...this.anomalies],
    };
  }
}
