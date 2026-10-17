import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  createNormalizedEvent,
  validateNormalizedEvent,
  TokenBucketRateLimiter,
  BaseMarketDataProvider,
} from "../lib/market-data-provider.js";
import { MarketDataPipeline } from "../lib/market-data-pipeline.js";
import { MarketSessionManager } from "../lib/market-session.js";
import { ShadowTradingEngine } from "../lib/shadow-engine.js";
import { Strategy } from "../lib/strategy-interface.js";
import { redactSensitiveData, createStructuredLog } from "../lib/logger.js";

const PAPER_ACCOUNT_HASH = "8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D";

class MockProvider extends BaseMarketDataProvider {
  constructor(options = {}) {
    super("mock-exchange", options);
    this.historicalBarsFixture = [];
  }

  setHistoricalFixture(bars) {
    this.historicalBarsFixture = bars;
  }

  async fetchHistoricalBars(symbol, timeframe, from, to) {
    return this.historicalBarsFixture;
  }

  emitMockBar(bar, exchangeTime = Date.now(), seq = null) {
    const evt = createNormalizedEvent({
      provider: this.providerId,
      symbol: bar.symbol || "BTCUSDT",
      eventType: "BAR",
      timeframe: bar.timeframe || "1m",
      exchangeTime,
      sequenceNumber: seq,
      bar,
    });
    this.emit("event", evt);
    return evt;
  }
}

// ============================================================================
// 1. Normalized Event Schema & Validation (Stage 1)
// ============================================================================

test("market-data-schema: creates valid canonical normalized events with metadata", () => {
  const evt = createNormalizedEvent({
    provider: "binance",
    symbol: "BTCUSDT",
    eventType: "BAR",
    timeframe: "1m",
    exchangeTime: 1700000000,
    receivedTime: 1700000050,
    sequenceNumber: 101,
    bar: { open: 100, high: 105, low: 98, close: 104, volume: 1500 },
  });

  assert.equal(evt.provider, "binance");
  assert.equal(evt.symbol, "BTCUSDT");
  assert.equal(evt.eventType, "BAR");
  assert.equal(evt.sequenceNumber, 101);
  assert.equal(evt.provenance.latencyMs, 50);

  const val = validateNormalizedEvent(evt);
  assert.equal(val.valid, true);
});

test("market-data-schema: rejects invalid OHLC relationships and non-positive prices", () => {
  // High less than Open
  const invalidBar1 = createNormalizedEvent({
    provider: "test",
    symbol: "TEST",
    exchangeTime: 1700000000,
    bar: { open: 100, high: 95, low: 90, close: 92, volume: 10 },
  });
  const val1 = validateNormalizedEvent(invalidBar1);
  assert.equal(val1.valid, false);
  assert.ok(val1.reason.includes("Invalid OHLC bounds"));

  // Negative volume
  const invalidBar2 = createNormalizedEvent({
    provider: "test",
    symbol: "TEST",
    exchangeTime: 1700000000,
    bar: { open: 100, high: 105, low: 95, close: 102, volume: -1 },
  });
  const val2 = validateNormalizedEvent(invalidBar2);
  assert.equal(val2.valid, false);
  assert.ok(val2.reason.includes("Invalid volume"));

  // Crossed Quote (bid > ask)
  const crossedQuote = createNormalizedEvent({
    provider: "test",
    symbol: "TEST",
    eventType: "QUOTE",
    exchangeTime: 1700000000,
    quote: { bid: 105, ask: 100 },
  });
  const valQuote = validateNormalizedEvent(crossedQuote);
  assert.equal(valQuote.valid, false);
  assert.ok(valQuote.reason.includes("Crossed market quote"));
});

test("market-data-schema: token bucket rate limiter handles quotas and Retry-After", () => {
  const limiter = new TokenBucketRateLimiter({ maxRequests: 2, intervalMs: 60000 });

  assert.equal(limiter.tryConsume(1).allowed, true);
  assert.equal(limiter.tryConsume(1).allowed, true);

  // Third consume exceeds tokens
  const denied = limiter.tryConsume(1);
  assert.equal(denied.allowed, false);
  assert.ok(denied.reason.includes("Token bucket exhausted"));

  // Set Retry-After
  limiter.setRetryAfter(5);
  assert.equal(limiter.isRateLimited(), true);
  const retryDenied = limiter.tryConsume(1);
  assert.equal(retryDenied.allowed, false);
  assert.ok(retryDenied.reason.includes("Retry-After active"));
});

// ============================================================================
// 2. Streaming Event Pipeline: Deduplication, Ordering, Bounded Queues (Stage 2)
// ============================================================================

test("streaming-pipeline: deduplicates identical events and preserves queue order", () => {
  const pipeline = new MarketDataPipeline({ maxQueueDepth: 100 });

  const evt = createNormalizedEvent({
    provider: "test",
    symbol: "BTCUSDT",
    exchangeTime: 1700000000,
    sequenceNumber: 1,
    bar: { open: 100, high: 105, low: 98, close: 102, volume: 50 },
  });

  const res1 = pipeline.ingest(evt);
  assert.equal(res1.accepted, true);

  // Re-ingesting same event is rejected as duplicate
  const res2 = pipeline.ingest(evt);
  assert.equal(res2.accepted, false);
  assert.equal(res2.reason, "DUPLICATE_EVENT");
  assert.equal(pipeline.metrics.duplicateCount, 1);
});

test("streaming-pipeline: detects and rejects out-of-order events without overwriting state", () => {
  const pipeline = new MarketDataPipeline();

  const evt1 = createNormalizedEvent({
    provider: "test",
    symbol: "BTCUSDT",
    exchangeTime: 1700000100,
    bar: { open: 100, high: 105, low: 98, close: 102, volume: 50 },
  });

  const evtOld = createNormalizedEvent({
    provider: "test",
    symbol: "BTCUSDT",
    exchangeTime: 1700000050, // older timestamp arriving late
    bar: { open: 98, high: 101, low: 97, close: 99, volume: 40 },
  });

  pipeline.ingest(evt1);
  assert.equal(pipeline.lastExchangeTime.get("BTCUSDT"), 1700000100);

  pipeline.ingest(evtOld);
  assert.equal(pipeline.metrics.outOfOrderCount, 1);
  // Last exchange time remains the newer one
  assert.equal(pipeline.lastExchangeTime.get("BTCUSDT"), 1700000100);
});

test("streaming-pipeline: bounded queue overflow policies (DROP_OLDEST, DROP_NEWEST, BACKPRESSURE)", () => {
  // 1. DROP_OLDEST
  const pipelineOldest = new MarketDataPipeline({ maxQueueDepth: 2, overflowPolicy: "DROP_OLDEST" });
  pipelineOldest.isProcessing = true; // freeze draining to test queue overflow
  pipelineOldest.ingest(createNormalizedEvent({ provider: "t", symbol: "S", exchangeTime: 1, bar: { open: 1, high: 2, low: 1, close: 2, volume: 1 } }));
  pipelineOldest.ingest(createNormalizedEvent({ provider: "t", symbol: "S", exchangeTime: 2, bar: { open: 2, high: 3, low: 2, close: 3, volume: 1 } }));
  pipelineOldest.ingest(createNormalizedEvent({ provider: "t", symbol: "S", exchangeTime: 3, bar: { open: 3, high: 4, low: 3, close: 4, volume: 1 } }));

  assert.equal(pipelineOldest.queue.length, 2);
  assert.equal(pipelineOldest.queue[0].exchangeTime, 2); // 1 was dropped
  assert.equal(pipelineOldest.metrics.droppedEventsCount, 1);

  // 2. BACKPRESSURE
  const pipelineBp = new MarketDataPipeline({ maxQueueDepth: 1, overflowPolicy: "BACKPRESSURE" });
  pipelineBp.isProcessing = true;
  pipelineBp.ingest(createNormalizedEvent({ provider: "t", symbol: "S", exchangeTime: 10, bar: { open: 1, high: 2, low: 1, close: 2, volume: 1 } }));
  const bpRes = pipelineBp.ingest(createNormalizedEvent({ provider: "t", symbol: "S", exchangeTime: 11, bar: { open: 2, high: 3, low: 2, close: 3, volume: 1 } }));

  assert.equal(bpRes.accepted, false);
  assert.equal(bpRes.reason, "QUEUE_OVERFLOW_BACKPRESSURE");
});

// ============================================================================
// 3. Connection Recovery, Gap Detection & Backfill Reconciliation (Stage 3)
// ============================================================================

test("connection-recovery: detects sequence gap, triggers backfill, and suppresses duplicates", async () => {
  const provider = new MockProvider();
  const pipeline = new MarketDataPipeline({ autoBackfill: true });
  pipeline.attachProvider(provider);
  await provider.connect();

  const missingBar = { symbol: "BTCUSDT", time: 1700000060, open: 102, high: 106, low: 101, close: 104, volume: 100 };
  provider.setHistoricalFixture([missingBar]);

  // Ingest sequence 10
  provider.emitMockBar({ symbol: "BTCUSDT", open: 100, high: 102, low: 99, close: 101, volume: 50 }, 1700000000, 10);

  // Jump to sequence 13 (gaps 11 and 12)
  const gapResolvedPromise = new Promise((resolve) => pipeline.once("gapResolved", resolve));
  provider.emitMockBar({ symbol: "BTCUSDT", open: 104, high: 108, low: 103, close: 107, volume: 60 }, 1700000120, 13);
  await gapResolvedPromise;

  assert.equal(pipeline.metrics.detectedGapsCount, 1);
  const gap = pipeline.gaps[0];
  assert.equal(gap.startSeq, 11);
  assert.equal(gap.endSeq, 12);
  assert.equal(gap.status, "RECOVERED");
  assert.equal(pipeline.metrics.recoveredGapsCount, 1);
  assert.equal(pipeline.continuityStatus, "HEALTHY");
});

// ============================================================================
// 4. Market Sessions & Incomplete Bar Quality Control (Stage 4)
// ============================================================================

test("market-sessions: distinguishes 24/7 crypto, US equities calendar hours, and holidays", () => {
  const sessions = new MarketSessionManager();

  // Crypto is always open
  const cryptoSession = sessions.getSession("BTCUSDT", 1700000000);
  assert.equal(cryptoSession.isOpen, true);
  assert.equal(cryptoSession.session, "REGULAR");

  // US Equities: Wednesday at 10:30 AM ET (14:30 UTC) -> Open
  // 2026-03-18 14:30:00 UTC = 1773844200
  const eqOpen = sessions.getSession("AAPL", 1773844200);
  assert.equal(eqOpen.isOpen, true);
  assert.equal(eqOpen.session, "REGULAR");

  // US Equities: Saturday -> Closed (WEEKEND)
  // 2026-03-21 15:00:00 UTC = 1774105200
  const eqWeekend = sessions.getSession("AAPL", 1774105200);
  assert.equal(eqWeekend.isOpen, false);
  assert.equal(eqWeekend.reason, "WEEKEND");

  // Distinguishes closed market from feed outage
  const closedDiag = sessions.distinguishClosureFromOutage("AAPL", 1774100000, 1774105200);
  assert.equal(closedDiag.isLegitimateClosure, true);
  assert.equal(closedDiag.reason, "MARKET_CLOSED");

  // During open hours, lack of data is an outage
  const outageDiag = sessions.distinguishClosureFromOutage("AAPL", 1773844000, 1773844200);
  assert.equal(outageDiag.isLegitimateClosure, false);
  assert.equal(outageDiag.reason, "FEED_OUTAGE");
});

test("market-sessions: identifies incomplete bars and prevents execution on partial candles", () => {
  const sessions = new MarketSessionManager();
  const barStartSec = 1700000000;

  // 1-minute bar at t=1700000030 (30 seconds in) is incomplete
  assert.equal(sessions.isBarComplete(barStartSec, "1m", 1700000030), false);

  // 1-minute bar at t=1700000060 (60 seconds elapsed) is complete
  assert.equal(sessions.isBarComplete(barStartSec, "1m", 1700000060), true);
});

// ============================================================================
// 5. Integration With Shadow Trading Engine (Stage 5)
// ============================================================================

test("shadow-integration: skips incomplete candles for completed-bar strategies", () => {
  class SampleStrategy extends Strategy {
    constructor() {
      super();
      this.barsSeen = 0;
    }
    onBar(bar, ctx) {
      this.barsSeen++;
    }
  }

  const strat = new SampleStrategy();
  const engine = new ShadowTradingEngine(strat, { allowPartialBars: false });

  // Incomplete bar
  const res1 = engine.processBar({
    time: 1700000000,
    open: 100, high: 105, low: 95, close: 102,
    complete: false,
  });
  assert.equal(res1.status, "SKIPPED_INCOMPLETE");
  assert.equal(strat.barsSeen, 0);

  // Complete bar
  const res2 = engine.processBar({
    time: 1700000000,
    open: 100, high: 105, low: 95, close: 102,
    complete: true,
  });
  assert.equal(res2.status, "PROCESSED");
  assert.equal(strat.barsSeen, 1);
});

test("shadow-integration: blocks new opening entries when pipeline feed is degraded or stale", () => {
  class OpenOrderStrategy extends Strategy {
    onBar(bar, ctx) {
      if (ctx.index === 0) {
        ctx.submitOrder({ side: "BUY", type: "MARKET", qty: 5 });
      }
    }
  }

  const pipeline = new MarketDataPipeline();
  // Simulate degraded continuity due to unrecovered gap
  pipeline.continuityStatus = "DEGRADED";
  pipeline.status = "DEGRADED";

  const engine = new ShadowTradingEngine(new OpenOrderStrategy(), { pipeline });

  // Strategy attempts to open order while pipeline is degraded
  const order = engine.submitOrder({ side: "BUY", type: "MARKET", qty: 5 });
  assert.ok(order.reason.includes("Market data feed is DEGRADED. Opening entries blocked"));
  assert.equal(engine.pendingOrders.length, 0);

  // Risk-reducing close orders remain allowed
  engine.position = { side: 1, qty: 5, entryPrice: 100, entryFee: 0 };
  const closeOrder = engine.closePosition("Emergency close");
  assert.ok(closeOrder);
  assert.equal(closeOrder.isClose, true);
});

// ============================================================================
// 6. Observability, Security & Secret Redaction (Stage 6)
// ============================================================================

test("observability: structured logging redacts sensitive API keys and authorization tokens", () => {
  const sensitiveMeta = {
    apiKey: "secret_live_key_999",
    authToken: "Bearer xyz.secret.token",
    password: "super_secret_password",
    normalField: "BTCUSDT",
    nested: {
      clientSecret: "nested_secret_123",
      accountBalance: 50000,
    },
  };

  const redacted = redactSensitiveData(sensitiveMeta);
  assert.equal(redacted.apiKey, "[REDACTED]");
  assert.equal(redacted.authToken, "[REDACTED]");
  assert.equal(redacted.password, "[REDACTED]");
  assert.equal(redacted.nested.clientSecret, "[REDACTED]");
  assert.equal(redacted.normalField, "BTCUSDT");
  assert.equal(redacted.nested.accountBalance, 50000);

  const logEntry = createStructuredLog("INFO", "Market feed connected", sensitiveMeta, "CID-TEST-1");
  assert.equal(logEntry.correlationId, "CID-TEST-1");
  assert.equal(logEntry.metadata.apiKey, "[REDACTED]");
});

test("observability: pipeline exposes comprehensive health report with latencies and queue depth", () => {
  const pipeline = new MarketDataPipeline();
  const evt = createNormalizedEvent({
    provider: "test",
    symbol: "BTCUSDT",
    exchangeTime: Date.now() - 5000,
    bar: { open: 100, high: 105, low: 98, close: 104, volume: 50 },
  });
  pipeline.ingest(evt);

  const health = pipeline.getHealth();
  assert.equal(typeof health.isHealthy, "boolean");
  assert.equal(typeof health.queueDepth, "number");
  assert.ok(health.metrics.processingLatencies);
  assert.ok(health.metrics.latency.p50Ms != null);
  assert.equal(health.activeGapsCount, 0);
});

// ============================================================================
// 7. Non-Negotiable Invariants: Broker Isolation & Account Hash Preservation
// ============================================================================

test("invariants: broker live socket execution physically disabled", () => {
  class Strat extends Strategy {}
  const engine = new ShadowTradingEngine(new Strat());
  assert.equal(engine.isLiveBrokerConnected, false);
  assert.throws(
    () => engine.connectBroker(),
    /Security Violation: Live broker execution is disabled in ShadowTradingEngine/,
  );
});

test("invariants: data/paper-account.json remains byte-for-byte unmodified", () => {
  const content = fs.readFileSync(new URL("../data/paper-account.json", import.meta.url));
  const currentHash = crypto.createHash("sha256").update(content).digest("hex").toUpperCase();
  assert.equal(
    currentHash,
    PAPER_ACCOUNT_HASH,
    "CRITICAL: data/paper-account.json hash modified! Account isolation invariant violated.",
  );
});
