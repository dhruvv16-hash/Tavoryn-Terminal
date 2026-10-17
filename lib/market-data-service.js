// Market Data Service Manager & Global Pipeline Accessor
// Exposes pipeline health, provider state, and observability telemetry to API endpoints.

import { MarketDataPipeline } from "./market-data-pipeline.js";
import { BaseMarketDataProvider } from "./market-data-provider.js";
import { MarketSessionManager } from "./market-session.js";

let globalPipeline = null;

export function getGlobalMarketDataPipeline() {
  if (!globalPipeline) {
    globalPipeline = new MarketDataPipeline({
      maxQueueDepth: 2000,
      staleThresholdMs: 30000,
      sessionManager: new MarketSessionManager(),
    });
  }
  return globalPipeline;
}

export function setGlobalMarketDataPipeline(pipeline) {
  globalPipeline = pipeline;
  return globalPipeline;
}
