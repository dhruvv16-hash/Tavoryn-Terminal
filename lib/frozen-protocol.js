// Frozen Research Protocol
// Strict chronological partitioning: Training (IS), Validation (OOS-1), and Holdout (OOS-2).
// Enforces parameter freezing, configuration trial registration, embargo/purge rules,
// indicator warm-up buffers, and one-time holdout evaluation prohibiting post-hoc tuning.

import crypto from "node:crypto";
import { validateHistoricalBars, computeBarsHash } from "./historical-data.js";
import { runReplay } from "./replay-engine.js";
import { readResearchLedger, appendResearchLedger } from "./research-ledger.js";

/**
 * Deterministic hash of an object
 */
export function hashConfig(obj) {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash("sha256").update(str).digest("hex");
}

export class FrozenResearchProtocol {
  constructor(bars, options = {}) {
    const validated = validateHistoricalBars(bars);
    this.bars = validated.bars;
    this.datasetHash = computeBarsHash(this.bars);

    this.options = {
      trainPct: options.trainPct ?? 0.5,
      valPct: options.valPct ?? 0.25,
      holdoutPct: options.holdoutPct ?? 0.25,
      embargoBars: options.embargoBars ?? 5,
      warmupBars: options.warmupBars ?? 20,
      ledgerPath: options.ledgerPath ?? null,
      ...options,
    };
    this.ledgerPath = this.options.ledgerPath;

    const totalPct = this.options.trainPct + this.options.valPct + this.options.holdoutPct;
    if (Math.abs(totalPct - 1.0) > 1e-4) {
      throw new Error(`Split percentages must sum to 1.0 (received ${totalPct.toFixed(4)})`);
    }

    const n = this.bars.length;
    if (n < 60) {
      throw new Error(`FrozenResearchProtocol requires at least 60 bars (received ${n})`);
    }

    // Partition indices
    const trainEnd = Math.floor(n * this.options.trainPct);
    const embargo = this.options.embargoBars;
    const warmup = this.options.warmupBars;

    // Validation window
    const valStart = trainEnd + embargo;
    const valEnd = Math.floor(n * (this.options.trainPct + this.options.valPct));

    if (valStart >= valEnd) {
      throw new Error(`Embargo of ${embargo} bars exceeds validation partition capacity`);
    }

    // Holdout window
    const holdoutStart = valEnd + embargo;
    const holdoutEnd = n;

    if (holdoutStart >= holdoutEnd) {
      throw new Error(`Embargo of ${embargo} bars exceeds holdout partition capacity`);
    }

    // Slices with warmup buffers for indicator stability
    this.partitions = {
      train: {
        bars: this.bars.slice(0, trainEnd),
        startIndex: 0,
        endIndex: trainEnd,
        evalStartIndex: 0,
        from: this.bars[0].time,
        to: this.bars[trainEnd - 1].time,
      },
      validation: {
        // Includes trailing bars from train partition for indicator warmup
        bars: this.bars.slice(Math.max(0, valStart - warmup), valEnd),
        startIndex: valStart,
        endIndex: valEnd,
        warmupBars: valStart - Math.max(0, valStart - warmup),
        from: this.bars[valStart].time,
        to: this.bars[valEnd - 1].time,
      },
      holdout: {
        // Includes trailing bars from validation partition for indicator warmup
        bars: this.bars.slice(Math.max(0, holdoutStart - warmup), holdoutEnd),
        startIndex: holdoutStart,
        endIndex: holdoutEnd,
        warmupBars: holdoutStart - Math.max(0, holdoutStart - warmup),
        from: this.bars[holdoutStart].time,
        to: this.bars[holdoutEnd - 1].time,
      },
      embargoBars: embargo,
      totalBars: n,
    };

    this.attempts = [];
    this.frozenSpec = null;
    this.holdoutEvaluated = false;
    this.holdoutResult = null;
  }

  /**
   * Registers an attempted configuration during training or validation
   * to record trial multiplicity and track selection bias.
   */
  registerAttempt(params, score = null, metadata = {}) {
    if (this.frozenSpec) {
      throw new Error("Protocol violation: Cannot register new exploratory attempts after strategy has been frozen");
    }
    const attempt = {
      id: `ATTEMPT-${this.attempts.length + 1}`,
      params: { ...params },
      paramHash: hashConfig(params),
      score,
      timestamp: Date.now(),
      metadata,
    };
    this.attempts.push(attempt);
    return attempt;
  }

  /**
   * Freezes a strategy specification before final holdout evaluation.
   * Locks the parameters and version.
   */
  freezeStrategy(version, params, rationale = "Selected based on validation performance") {
    if (this.frozenSpec) {
      throw new Error(`Protocol violation: Strategy already frozen with version "${this.frozenSpec.version}"`);
    }
    if (!version || typeof version !== "string") {
      throw new Error("Freezing requires an explicit strategy version identifier (e.g. 'v1.0.0')");
    }
    if (!params || typeof params !== "object") {
      throw new Error("Freezing requires a concrete parameter object");
    }

    const paramHash = hashConfig(params);
    this.frozenSpec = {
      version,
      params: { ...params },
      paramHash,
      rationale,
      frozenAt: Date.now(),
      attemptsCount: this.attempts.length,
    };

    return this.frozenSpec;
  }

  /**
   * Evaluates the frozen strategy on the final holdout partition.
   * Can be executed EXACTLY ONCE. Tuning on holdout data is strictly prohibited.
   */
  evaluateFinalHoldout(strategyFactory, replayOptions = {}) {
    if (!this.frozenSpec) {
      throw new Error("Protocol violation: Strategy must be frozen before evaluating final holdout");
    }
    if (this.holdoutEvaluated) {
      throw new Error(
        "Protocol violation: Final holdout evaluation has already been finalized. Tuning on holdout data is strictly prohibited.",
      );
    }

    if (this.ledgerPath) {
      const existingEntries = readResearchLedger(this.ledgerPath);
      const duplicate = existingEntries.find(
        (e) =>
          e.datasetHash === this.datasetHash &&
          (e.version === this.frozenSpec.version || e.paramHash === this.frozenSpec.paramHash),
      );
      if (duplicate) {
        throw new Error(
          `Protocol violation: Final holdout evaluation for dataset ${this.datasetHash} and strategy "${this.frozenSpec.version}" (hash: ${this.frozenSpec.paramHash}) is already permanently recorded in durable research ledger. Re-evaluation or tuning on holdout data is strictly prohibited.`,
        );
      }
    }

    const stratHoldout = strategyFactory(this.frozenSpec.params);
    const holdoutRun = runReplay(this.partitions.holdout.bars, stratHoldout, replayOptions);

    // Also evaluate Train and Validation sets for comparative audit reporting
    const stratTrain = strategyFactory(this.frozenSpec.params);
    const trainRun = runReplay(this.partitions.train.bars, stratTrain, replayOptions);

    const stratVal = strategyFactory(this.frozenSpec.params);
    const valRun = runReplay(this.partitions.validation.bars, stratVal, replayOptions);

    this.holdoutEvaluated = true;

    this.holdoutResult = {
      provenance: {
        datasetHash: this.datasetHash,
        symbol: this.bars[0].symbol,
        timeframe: this.bars[0].timeframe,
        totalBars: this.bars.length,
        from: new Date(this.bars[0].time * 1000).toISOString(),
        to: new Date(this.bars.at(-1).time * 1000).toISOString(),
      },
      frozenSpec: this.frozenSpec,
      partitions: {
        train: {
          bars: this.partitions.train.bars,
          barCount: this.partitions.train.bars.length,
          from: new Date(this.partitions.train.from * 1000).toISOString(),
          to: new Date(this.partitions.train.to * 1000).toISOString(),
          metrics: trainRun.metrics,
        },
        validation: {
          bars: this.partitions.validation.bars,
          barCount: this.partitions.validation.bars.length,
          warmupBars: this.partitions.validation.warmupBars,
          from: new Date(this.partitions.validation.from * 1000).toISOString(),
          to: new Date(this.partitions.validation.to * 1000).toISOString(),
          metrics: valRun.metrics,
        },
        holdout: {
          bars: this.partitions.holdout.bars,
          barCount: this.partitions.holdout.bars.length,
          warmupBars: this.partitions.holdout.warmupBars,
          from: new Date(this.partitions.holdout.from * 1000).toISOString(),
          to: new Date(this.partitions.holdout.to * 1000).toISOString(),
          metrics: holdoutRun.metrics,
          trades: holdoutRun.trades,
          equity: holdoutRun.equity,
        },
      },
      strategyFactory,
      replayOptions,
      executionModel: holdoutRun.executionModel,
      attemptsCount: this.attempts.length,
      evaluatedAt: Date.now(),
    };

    if (this.ledgerPath) {
      const ledgerEntry = appendResearchLedger(this.ledgerPath, {
        datasetHash: this.datasetHash,
        version: this.frozenSpec.version,
        paramHash: this.frozenSpec.paramHash,
        evaluatedAt: this.holdoutResult.evaluatedAt,
        metricsSummary: {
          netProfit: holdoutRun.metrics.netProfit,
          netProfitPct: holdoutRun.metrics.netProfitPct,
          sharpe: holdoutRun.metrics.sharpe,
          maxDrawdownPct: holdoutRun.metrics.maxDrawdownPct,
          totalTrades: holdoutRun.metrics.totalTrades,
        },
        provenance: this.holdoutResult.provenance,
      });
      this.holdoutResult.ledgerEntry = ledgerEntry;
    }

    return this.holdoutResult;
  }
}
