// Backtest Validation & Robustness Framework
// Chronological data partitioning (In-Sample / Out-of-Sample),
// Walk-Forward analysis, and automated look-ahead bias verification.

import { runReplay } from "./replay-engine.js";
import { sharpe } from "../public/lib/quant.js";

/**
 * Splits bars strictly chronologically into Train / Validation / Test sets.
 * No data leakage, no random shuffling.
 */
export function splitBars(bars, { trainPct = 0.6, valPct = 0.2, testPct = 0.2 } = {}) {
  if (!Array.isArray(bars) || bars.length < 10) {
    throw new Error("splitBars requires at least 10 bars");
  }

  const total = trainPct + valPct + testPct;
  if (Math.abs(total - 1.0) > 1e-4) {
    throw new Error(`Split percentages must sum to 1.0 (received ${total.toFixed(4)})`);
  }

  const n = bars.length;
  const trainEnd = Math.floor(n * trainPct);
  const valEnd = Math.floor(n * (trainPct + valPct));

  const train = bars.slice(0, trainEnd);
  const val = bars.slice(trainEnd, valEnd);
  const test = bars.slice(valEnd);

  return {
    train,
    val,
    test,
    metadata: {
      totalBars: n,
      trainCount: train.length,
      valCount: val.length,
      testCount: test.length,
      trainFrom: train[0]?.isoTime || new Date(train[0]?.time * 1000).toISOString(),
      trainTo: train.at(-1)?.isoTime || new Date(train.at(-1)?.time * 1000).toISOString(),
      valFrom: val[0]?.isoTime || new Date(val[0]?.time * 1000).toISOString(),
      valTo: val.at(-1)?.isoTime || new Date(val.at(-1)?.time * 1000).toISOString(),
      testFrom: test[0]?.isoTime || new Date(test[0]?.time * 1000).toISOString(),
      testTo: test.at(-1)?.isoTime || new Date(test.at(-1)?.time * 1000).toISOString(),
    },
  };
}

/**
 * Runs walk-forward validation across chronological folds.
 * Optimizes parameters on in-sample (train) partition only, then scores on unseen out-of-sample (test) partition.
 */
export function walkForwardValidation(bars, strategyFactory, paramGrid = [], options = {}) {
  if (!Array.isArray(bars) || bars.length < 60) {
    throw new Error("walkForwardValidation requires at least 60 bars");
  }
  if (!Array.isArray(paramGrid) || paramGrid.length === 0) {
    throw new Error("paramGrid must contain at least one parameter setting");
  }

  const folds = options.folds || 4;
  const isRatio = options.isRatio || 0.6; // In-sample share per fold
  const n = bars.length;
  const foldSize = Math.floor(n / folds);

  if (foldSize < 15) {
    throw new Error(`Insufficient bars per fold (${foldSize}). Need at least 15 bars per fold.`);
  }

  const results = [];
  let totalIsSharpe = 0;
  let totalOosSharpe = 0;
  let validFolds = 0;

  for (let f = 0; f < folds; f++) {
    // Sliding or anchored fold
    const startIdx = options.anchored ? 0 : f * Math.floor(foldSize * (1 - isRatio));
    const endIdx = Math.min(n, (f + 1) * foldSize);
    const foldBars = bars.slice(startIdx, endIdx);

    if (foldBars.length < 20) continue;

    const splitIdx = Math.floor(foldBars.length * isRatio);
    const isBars = foldBars.slice(0, splitIdx);
    const oosBars = foldBars.slice(splitIdx);

    if (isBars.length < 10 || oosBars.length < 5) continue;

    // 1. In-Sample Optimization: score each candidate parameter set
    let bestParams = null;
    let bestIsScore = -Infinity;
    let bestIsMetrics = null;

    for (const params of paramGrid) {
      const strat = strategyFactory(params);
      const isRun = runReplay(isBars, strat, options.replayOptions || {});
      const score =
        options.metric === "netProfit"
          ? isRun.metrics.netProfit
          : isRun.metrics.sharpe ?? -10;

      if (score > bestIsScore) {
        bestIsScore = score;
        bestParams = params;
        bestIsMetrics = isRun.metrics;
      }
    }

    if (!bestParams) bestParams = paramGrid[0];

    // 2. Out-of-Sample Evaluation: test the winning parameter set on unseen bars
    const oosStrat = strategyFactory(bestParams);
    const oosRun = runReplay(oosBars, oosStrat, options.replayOptions || {});

    const isSharpe = bestIsMetrics?.sharpe ?? 0;
    const oosSharpe = oosRun.metrics.sharpe ?? 0;

    totalIsSharpe += isSharpe;
    totalOosSharpe += oosSharpe;
    validFolds++;

    results.push({
      fold: f + 1,
      isRange: { from: isBars[0].time, to: isBars.at(-1).time, bars: isBars.length },
      oosRange: { from: oosBars[0].time, to: oosBars.at(-1).time, bars: oosBars.length },
      chosenParams: bestParams,
      isSharpe,
      oosSharpe,
      isReturnPct: bestIsMetrics?.netProfitPct ?? 0,
      oosReturnPct: oosRun.metrics.netProfitPct,
      oosTrades: oosRun.metrics.totalTrades,
      oosWinRate: oosRun.metrics.winRatePct,
    });
  }

  const avgIsSharpe = validFolds > 0 ? totalIsSharpe / validFolds : 0;
  const avgOosSharpe = validFolds > 0 ? totalOosSharpe / validFolds : 0;
  const efficiency = avgIsSharpe > 0 ? avgOosSharpe / avgIsSharpe : null;
  const positiveOosFolds = results.filter((r) => r.oosReturnPct > 0).length;

  return {
    folds: results,
    validFolds,
    avgIsSharpe: Number(avgIsSharpe.toFixed(2)),
    avgOosSharpe: Number(avgOosSharpe.toFixed(2)),
    walkForwardEfficiency: efficiency != null ? Number(efficiency.toFixed(2)) : null,
    positiveFolds: positiveOosFolds,
    robust: efficiency != null && efficiency > 0.4 && positiveOosFolds >= Math.ceil(validFolds / 2),
  };
}

/**
 * Automates lookahead bias verification.
 * Proves that future bars do not mutate or influence decisions on historical bars.
 */
export function verifyNoLookaheadBias(strategyFactory, baseBars) {
  if (!Array.isArray(baseBars) || baseBars.length < 30) {
    throw new Error("verifyNoLookaheadBias requires at least 30 base bars");
  }

  const testIndex = Math.floor(baseBars.length * 0.6);
  const historicalBars = baseBars.slice(0, testIndex);

  // Run 1: Historical slice only
  const run1 = runReplay(historicalBars, strategyFactory());

  // Run 2: Same historical bars + 20 synthetic altered future bars
  const step = historicalBars[1].time - historicalBars[0].time;
  const lastTime = historicalBars.at(-1).time;
  const futureBars = [];

  for (let k = 1; k <= 20; k++) {
    const t = lastTime + k * step;
    const price = historicalBars.at(-1).close * (1 + (Math.sin(k) * 0.1));
    futureBars.push({
      time: t,
      isoTime: new Date(t * 1000).toISOString(),
      symbol: historicalBars[0].symbol,
      open: price,
      high: price * 1.02,
      low: price * 0.98,
      close: price * 1.01,
      volume: 100,
      timeframe: historicalBars[0].timeframe,
    });
  }

  const combinedBars = [...historicalBars, ...futureBars];
  const run2 = runReplay(combinedBars, strategyFactory());

  // Verify that all trade entries and exits completed within the historical window match exactly
  const run1Completed = run1.trades.filter((t) => t.exitReason !== "End of data");
  const run2Completed = run2.trades.filter((t) => t.exitTime <= historicalBars.at(-1).time);

  let match = true;
  let reason = null;

  if (run1Completed.length !== run2Completed.length) {
    match = false;
    reason = `Completed trade count mismatch: run1 has ${run1Completed.length}, run2 has ${run2Completed.length}`;
  } else {
    for (let i = 0; i < run1Completed.length; i++) {
      const t1 = run1Completed[i];
      const t2 = run2Completed[i];
      if (t1.entryTime !== t2.entryTime || Math.abs(t1.entryPrice - t2.entryPrice) > 1e-6) {
        match = false;
        reason = `Trade #${i + 1} entry altered by future bars!`;
        break;
      }
      if (t1.exitTime !== t2.exitTime || Math.abs(t1.exitPrice - t2.exitPrice) > 1e-6) {
        match = false;
        reason = `Trade #${i + 1} exit altered by future bars!`;
        break;
      }
    }
  }

  return {
    passed: match,
    historicalBarsEvaluated: historicalBars.length,
    run1TradeCount: run1Completed.length,
    run2TradeCount: run2Completed.length,
    reason,
  };
}

function run2TradesCount(trades) {
  return trades ? trades.length : 0;
}
