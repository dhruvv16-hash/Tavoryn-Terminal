#!/usr/bin/env node
// Benchmark script for Tavoryn Terminal Market Data Infrastructure (Phase 6)
// Measures events per second, p50/p95/p99 processing latency, queue growth under load,
// duplicate suppression, and memory footprint.

import os from "node:os";
import { MarketDataPipeline } from "../lib/market-data-pipeline.js";
import { createNormalizedEvent } from "../lib/market-data-provider.js";

async function runBenchmark(totalEvents = 50000) {
  console.log("==================================================================");
  console.log("Tavoryn Terminal — Market Data Infrastructure Benchmark (Phase 6)");
  console.log("==================================================================");
  console.log(`OS: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`CPUs: ${os.cpus()[0]?.model} (${os.cpus().length} cores)`);
  console.log(`Node: ${process.version}`);
  console.log(`Benchmark Workload: ${totalEvents.toLocaleString()} canonical normalized events`);
  console.log("------------------------------------------------------------------");

  const pipeline = new MarketDataPipeline({
    maxQueueDepth: 100000,
    dedupWindowSize: 20000,
  });

  const initialMemory = process.memoryUsage();
  const startTime = process.hrtime.bigint();

  const latencies = [];
  let duplicateCount = 0;

  // Stream synthetic events
  for (let i = 0; i < totalEvents; i++) {
    const t0 = process.hrtime.bigint();
    const isDup = i > 0 && i % 500 === 0; // inject periodic duplicate
    const seq = isDup ? i - 1 : i;

    const evt = createNormalizedEvent({
      provider: "sim-exchange",
      symbol: i % 2 === 0 ? "BTCUSDT" : "ETHUSDT",
      eventType: "BAR",
      timeframe: "1m",
      exchangeTime: 1700000000 + (isDup ? i - 1 : i) * 60,
      sequenceNumber: seq,
      bar: {
        open: 100 + (i % 50),
        high: 105 + (i % 50),
        low: 95 + (i % 50),
        close: 102 + (i % 50),
        volume: 1000 + i,
      },
    });

    const res = pipeline.ingest(evt);
    if (!res.accepted && res.reason === "DUPLICATE_EVENT") {
      duplicateCount++;
    }

    const t1 = process.hrtime.bigint();
    latencies.push(Number(t1 - t0) / 1e6); // ms
  }

  const endTime = process.hrtime.bigint();
  const totalElapsedMs = Number(endTime - startTime) / 1e6;
  const finalMemory = process.memoryUsage();

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const throughput = Math.round((totalEvents / totalElapsedMs) * 1000);

  const heapDiffMb = ((finalMemory.heapUsed - initialMemory.heapUsed) / (1024 * 1024)).toFixed(2);
  const rssMb = (finalMemory.rss / (1024 * 1024)).toFixed(2);

  const results = {
    totalEvents,
    throughputEventsPerSec: throughput,
    totalElapsedMs: Number(totalElapsedMs.toFixed(2)),
    latenciesMs: {
      min: Number(latencies[0].toFixed(4)),
      p50: Number(p50.toFixed(4)),
      p95: Number(p95.toFixed(4)),
      p99: Number(p99.toFixed(4)),
      max: Number(latencies[latencies.length - 1].toFixed(4)),
    },
    duplicatesSuppressed: duplicateCount,
    queueRemaining: pipeline.queue.length,
    droppedEvents: pipeline.metrics.droppedEventsCount,
    memory: {
      heapDeltaMb: Number(heapDiffMb),
      finalRssMb: Number(rssMb),
    },
  };

  console.log(`Throughput:             ${results.throughputEventsPerSec.toLocaleString()} events/sec`);
  console.log(`Total Ingestion Time:   ${results.totalElapsedMs} ms`);
  console.log(`Latency p50 (median):   ${results.latenciesMs.p50} ms`);
  console.log(`Latency p95:            ${results.latenciesMs.p95} ms`);
  console.log(`Latency p99:            ${results.latenciesMs.p99} ms`);
  console.log(`Duplicates Suppressed:  ${results.duplicatesSuppressed}`);
  console.log(`Dropped Events:         ${results.droppedEvents}`);
  console.log(`Heap Delta:             ${results.memory.heapDeltaMb} MB`);
  console.log(`Process RSS:            ${results.memory.finalRssMb} MB`);
  console.log("==================================================================");

  return results;
}

if (process.argv[1]?.endsWith("benchmark-market-data.js")) {
  runBenchmark(50000).catch(console.error);
}

export { runBenchmark };
