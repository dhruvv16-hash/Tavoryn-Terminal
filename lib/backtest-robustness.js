// Backtest Robustness & Sensitivity Framework
// Parameter sweeps, execution stress tests, market regime segmentation,
// and statistical Monte Carlo permutation analysis.

import { runReplay } from "./replay-engine.js";

/**
 * Seeded pseudo-random generator for deterministic Monte Carlo
 */
function seededRng(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sweeps strategy parameters across a specified grid to assess stability and detect cliff-edges.
 */
export function parameterSensitivitySweep(bars, strategyFactory, paramGrid = [], options = {}) {
  if (!Array.isArray(paramGrid) || paramGrid.length === 0) {
    throw new Error("paramGrid must contain at least one parameter setting");
  }

  const results = [];
  for (const params of paramGrid) {
    const strat = strategyFactory(params);
    const r = runReplay(bars, strat, options.replayOptions || {});
    results.push({
      params,
      netProfitPct: r.metrics.netProfitPct,
      sharpe: r.metrics.sharpe,
      maxDrawdownPct: r.metrics.maxDrawdownPct,
      totalTrades: r.metrics.totalTrades,
      winRatePct: r.metrics.winRatePct,
    });
  }

  const sharpes = results.map((r) => r.sharpe).filter((s) => s != null && Number.isFinite(s));
  const netProfits = results.map((r) => r.netProfitPct).filter((p) => Number.isFinite(p));

  const meanSharpe =
    sharpes.length > 0 ? sharpes.reduce((a, b) => a + b, 0) / sharpes.length : null;
  const bestSharpe = sharpes.length > 0 ? Math.max(...sharpes) : null;
  const worstSharpe = sharpes.length > 0 ? Math.min(...sharpes) : null;

  // Fragility: proportion of variants that drop Sharpe by > 50% relative to best
  let fragileCount = 0;
  if (bestSharpe != null && bestSharpe > 0) {
    for (const s of sharpes) {
      if (s < bestSharpe * 0.5) fragileCount++;
    }
  }

  const fragilityScore = sharpes.length > 0 ? (fragileCount / sharpes.length) * 100 : 0;
  const robustShare = 100 - fragilityScore;

  const trialsCount = results.length;
  const bonferroniAlpha = 0.05 / Math.max(1, trialsCount);
  const multiplicityRisk = trialsCount > 10 ? "HIGH" : trialsCount > 4 ? "MODERATE" : "LOW";

  return {
    trials: results.length,
    multiplicityRisk,
    bonferroniAlpha: Number(bonferroniAlpha.toFixed(5)),
    meanSharpe: meanSharpe != null ? Number(meanSharpe.toFixed(2)) : null,
    bestSharpe: bestSharpe != null ? Number(bestSharpe.toFixed(2)) : null,
    worstSharpe: worstSharpe != null ? Number(worstSharpe.toFixed(2)) : null,
    robustSharePct: Number(robustShare.toFixed(1)),
    isRobust: robustShare >= 60,
    results,
  };
}

/**
 * Evaluates strategy robustness under increasing execution friction tiers.
 */
export function executionStressTest(bars, strategy, baseConfig = {}) {
  const tiers = {
    baseline: {
      ...baseConfig,
      feePct: baseConfig.feePct ?? 0.1,
      slippagePct: baseConfig.slippagePct ?? 0.05,
      spreadPct: baseConfig.spreadPct ?? 0,
      intrabar: baseConfig.intrabar ?? "ohlc",
    },
    conservative: {
      ...baseConfig,
      feePct: Number(((baseConfig.feePct ?? 0.1) * 2).toFixed(4)),
      slippagePct: Number((Math.max((baseConfig.slippagePct ?? 0.05) * 3, 0.1)).toFixed(4)),
      spreadPct: Number(((baseConfig.spreadPct ?? 0.05) * 2).toFixed(4)),
      intrabar: "worst",
    },
    liquidityConstrained: {
      ...baseConfig,
      feePct: (baseConfig.feePct ?? 0.1) * 2,
      slippagePct: (baseConfig.slippagePct ?? 0.05) * 2,
      maxVolumeParticipationPct: 5,
      allowPartialFills: true,
      intrabar: "worst",
    },
    extremeFriction: {
      ...baseConfig,
      feePct: (baseConfig.feePct ?? 0.1) * 3,
      slippagePct: (baseConfig.slippagePct ?? 0.05) * 5,
      spreadPct: 0.2,
      borrowFeePctAnnual: 3.0,
      intrabar: "worst",
    },
  };

  const stressResults = {};
  for (const [tierName, cfg] of Object.entries(tiers)) {
    const run = runReplay(bars, strategy, cfg);
    stressResults[tierName] = {
      config: {
        feePct: cfg.feePct,
        slippagePct: cfg.slippagePct,
        spreadPct: cfg.spreadPct,
        borrowFeePctAnnual: cfg.borrowFeePctAnnual || 0,
        maxVolumeParticipationPct: cfg.maxVolumeParticipationPct || null,
        allowPartialFills: cfg.allowPartialFills !== false,
        intrabar: cfg.intrabar,
      },
      netProfitPct: run.metrics.netProfitPct,
      maxDrawdownPct: run.metrics.maxDrawdownPct,
      sharpe: run.metrics.sharpe,
      totalTrades: run.metrics.totalTrades,
      totalFees: run.metrics.totalFees,
      totalSlippage: run.metrics.totalSlippage,
      survives: run.metrics.netProfitPct > 0,
    };
  }

  const allTiersSurvive = Object.values(stressResults).every((t) => t.survives);
  const conservativeSurvives = stressResults.conservative.survives;

  return {
    tiers: stressResults,
    conservativeSurvives,
    allTiersSurvive,
    recommendation: conservativeSurvives
      ? "Strategy demonstrates positive expectancy under 3x slippage and double fees."
      : "Strategy fails under conservative execution assumptions (edge eliminated by friction).",
  };
}

/**
 * Segments strategy performance by historical market regime.
 */
export function marketRegimeAnalysis(bars, trades = [], lookback = 20) {
  if (!Array.isArray(bars) || bars.length < lookback + 5) {
    return { regimes: {}, notes: "Insufficient bars for regime classification" };
  }

  // Label each bar
  const barRegimes = new Array(bars.length);
  for (let i = lookback; i < bars.length; i++) {
    const ret = (bars[i].close - bars[i - lookback].close) / bars[i - lookback].close;
    // Volatility approximation
    let trSum = 0;
    for (let k = i - lookback + 1; k <= i; k++) {
      trSum += Math.abs(bars[k].high - bars[k].low) / bars[k].close;
    }
    const avgTr = trSum / lookback;

    let regime;
    if (ret > 0.05) {
      regime = avgTr > 0.03 ? "BULL_VOLATILE" : "BULL_TRENDING";
    } else if (ret < -0.05) {
      regime = avgTr > 0.03 ? "BEAR_PANIC" : "BEAR_TRENDING";
    } else {
      regime = avgTr > 0.025 ? "HIGH_VOL_CHURN" : "LOW_VOL_CONSOLIDATION";
    }
    barRegimes[i] = regime;
  }

  // Aggregate trade metrics per regime
  const regimeStats = {};
  for (const t of trades) {
    const entryIdx = bars.findIndex((b) => b.time === t.entryTime);
    const regime = (entryIdx >= 0 && barRegimes[entryIdx]) ? barRegimes[entryIdx] : "UNKNOWN";

    if (!regimeStats[regime]) {
      regimeStats[regime] = { trades: 0, wins: 0, grossWin: 0, grossLoss: 0, netPnl: 0 };
    }
    const r = regimeStats[regime];
    r.trades++;
    r.netPnl += t.pnl;
    if (t.pnl > 0) {
      r.wins++;
      r.grossWin += t.pnl;
    } else {
      r.grossLoss += Math.abs(t.pnl);
    }
  }

  // Finalize statistics
  const summary = {};
  for (const [regime, data] of Object.entries(regimeStats)) {
    const winRate = data.trades > 0 ? (data.wins / data.trades) * 100 : 0;
    const pf = data.grossLoss > 0 ? data.grossWin / data.grossLoss : data.grossWin > 0 ? null : 0;
    summary[regime] = {
      trades: data.trades,
      winRatePct: Number(winRate.toFixed(1)),
      netPnl: Number(data.netPnl.toFixed(2)),
      profitFactor: pf != null ? Number(pf.toFixed(2)) : null,
    };
  }

  return { summary };
}

/**
 * Monte Carlo trade sequence permutation test
 * Supports both standard IID bootstrap and block bootstrap (to capture serial dependence / clustered losses).
 */
export function monteCarloPermutation(trades, runs = 1000, seed = 42, options = {}) {
  if (!Array.isArray(trades) || trades.length < 5) {
    return { error: "Monte Carlo permutation requires at least 5 completed trades" };
  }

  const blockSize = Math.max(1, Number(options.blockSize) || 1);
  const ruinThresholdPct = Number(options.ruinThresholdPct) || 50;

  const rng = seededRng(seed);
  const tradePcts = trades.map((t) => t.pnlPct || 0);
  const finalReturns = [];
  const maxDrawdowns = [];

  for (let k = 0; k < runs; k++) {
    let eq = 1;
    let peak = 1;
    let dd = 0;

    let i = 0;
    while (i < tradePcts.length) {
      if (blockSize <= 1) {
        const idx = Math.floor(rng() * tradePcts.length);
        eq *= 1 + tradePcts[idx] / 100;
        if (eq > peak) peak = eq;
        const currentDd = peak > 0 ? (peak - eq) / peak : 0;
        if (currentDd > dd) dd = currentDd;
        i++;
      } else {
        const maxStart = Math.max(0, tradePcts.length - blockSize);
        const startIdx = Math.floor(rng() * (maxStart + 1));
        const blockLen = Math.min(blockSize, tradePcts.length - i);
        for (let b = 0; b < blockLen; b++) {
          const tradeIdx = (startIdx + b) % tradePcts.length;
          eq *= 1 + tradePcts[tradeIdx] / 100;
          if (eq > peak) peak = eq;
          const currentDd = peak > 0 ? (peak - eq) / peak : 0;
          if (currentDd > dd) dd = currentDd;
        }
        i += blockLen;
      }
    }

    finalReturns.push((eq - 1) * 100);
    maxDrawdowns.push(dd * 100);
  }

  const quantile = (arr, q) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
  };

  const ruinCount = maxDrawdowns.filter((d) => d >= ruinThresholdPct).length;

  return {
    runs,
    blockSize,
    samplingMethod: blockSize > 1 ? `block_bootstrap_size_${blockSize}` : "iid_bootstrap",
    ruinThresholdPct,
    returnP5: Number(quantile(finalReturns, 0.05).toFixed(2)),
    returnP50: Number(quantile(finalReturns, 0.5).toFixed(2)),
    returnP95: Number(quantile(finalReturns, 0.95).toFixed(2)),
    drawdownP50: Number(quantile(maxDrawdowns, 0.5).toFixed(2)),
    drawdownP95: Number(quantile(maxDrawdowns, 0.95).toFixed(2)),
    ruinProbabilityPct: Number(((ruinCount / runs) * 100).toFixed(2)),
  };
}
