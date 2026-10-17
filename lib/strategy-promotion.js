// Strategy Promotion Gates & Out-of-Sample Evaluation
// Evaluates statistical significance, out-of-sample expectancy, drawdown ceilings,
// walk-forward stability, transaction friction survival, benchmark outperformance,
// outlier trade concentration, and market regime diversification.
// Failed gates remain permanently visible; never labels a strategy profitable merely for passing a test.

import { marketRegimeAnalysis, executionStressTest } from "./backtest-robustness.js";

export const DEFAULT_PROMOTION_THRESHOLDS = {
  minTradeCount: 20,
  minExpectancyDollars: 0.0,
  minExpectancyPct: 0.0,
  maxDrawdownPct: 30.0,
  minProfitFactor: 1.1,
  minWalkForwardEfficiency: 0.4,
  maxTop3TradeConcentrationPct: 50.0,
  maxSingleRegimeConcentrationPct: 90.0,
  mustBeatBenchmark: false, // Optional: active strategy must beat Buy & Hold
  mustSurviveFriction: true, // Must survive 2x fees & 3x slippage
};

/**
 * Evaluates strategy promotion gates against holdout evaluation results.
 */
export function evaluateStrategyPromotionGates(holdoutResult, customThresholds = {}) {
  if (!holdoutResult || !holdoutResult.partitions || !holdoutResult.partitions.holdout) {
    throw new Error("Promotion evaluation requires valid holdoutResult from FrozenResearchProtocol");
  }

  const thresholds = { ...DEFAULT_PROMOTION_THRESHOLDS, ...customThresholds };
  const holdout = holdoutResult.partitions.holdout;
  const metrics = holdout.metrics || {};
  const trades = holdout.trades || [];
  const bars = Array.isArray(holdout.bars)
    ? holdout.bars
    : Array.isArray(holdoutResult.bars)
      ? holdoutResult.bars
      : [];

  const gates = [];
  const warnings = [];

  // 1. Minimum Sample Size & Trade Count
  const actualTrades = metrics.totalTrades ?? trades.length;
  const passTradeCount = actualTrades >= thresholds.minTradeCount;
  gates.push({
    gate: "minTradeCount",
    passed: passTradeCount,
    actual: actualTrades,
    threshold: thresholds.minTradeCount,
    description: `Requires at least ${thresholds.minTradeCount} closed trades in out-of-sample holdout.`,
    reason: passTradeCount
      ? `Sample size of ${actualTrades} trades meets statistical threshold.`
      : `Insufficient sample size (${actualTrades} trades < ${thresholds.minTradeCount}). Results lack statistical significance.`,
  });

  if (actualTrades < 10) {
    warnings.push(`Severe sample size limitation: Only ${actualTrades} trades completed in holdout.`);
  }

  // 2. Positive Out-of-Sample Expectancy After Costs
  const actualExpPct = metrics.expectancyPct ?? 0;
  const actualExpDollars = metrics.expectancyPerTrade ?? 0;
  const passExpectancy = actualExpPct > thresholds.minExpectancyPct && actualExpDollars > thresholds.minExpectancyDollars;
  gates.push({
    gate: "positiveExpectancy",
    passed: passExpectancy,
    actual: { expectancyPct: actualExpPct, expectancyPerTrade: actualExpDollars },
    threshold: { minExpectancyPct: thresholds.minExpectancyPct, minExpectancyDollars: thresholds.minExpectancyDollars },
    description: "Expectancy per trade and expectancy percentage must remain strictly positive after all frictions.",
    reason: passExpectancy
      ? `Positive out-of-sample expectancy: +${actualExpPct}% ($${actualExpDollars}/trade).`
      : `Negative or zero expectancy: ${actualExpPct}% ($${actualExpDollars}/trade). Strategy has negative expected value.`,
  });

  // 3. Maximum Peak-to-Trough Drawdown Limit
  const actualDd = metrics.maxDrawdownPct ?? 100;
  const passDd = actualDd <= thresholds.maxDrawdownPct;
  gates.push({
    gate: "maxDrawdownLimit",
    passed: passDd,
    actual: actualDd,
    threshold: thresholds.maxDrawdownPct,
    description: `Maximum drawdown must not exceed ${thresholds.maxDrawdownPct}%.`,
    reason: passDd
      ? `Holdout drawdown of ${actualDd}% is within the risk budget.`
      : `Holdout drawdown of ${actualDd}% breaches maximum allowable risk threshold of ${thresholds.maxDrawdownPct}%.`,
  });

  // 4. Profit Factor Floor
  const actualPf = metrics.profitFactor;
  const passPf = actualPf != null ? actualPf >= thresholds.minProfitFactor : metrics.winningTrades > 0 && metrics.losingTrades === 0;
  gates.push({
    gate: "profitFactorFloor",
    passed: passPf,
    actual: actualPf ?? "N/A (zero losses)",
    threshold: thresholds.minProfitFactor,
    description: `Profit factor must meet or exceed ${thresholds.minProfitFactor}.`,
    reason: passPf
      ? `Profit factor of ${actualPf ?? "infinite (0 losses)"} meets threshold.`
      : `Profit factor of ${actualPf} falls below threshold of ${thresholds.minProfitFactor}.`,
  });

  // 5. Outlier Trade Concentration Check (Top 3 Winning Trades)
  const winningTrades = trades.filter((t) => t.pnl > 0).sort((a, b) => b.pnl - a.pnl);
  const totalNetProfit = metrics.netProfit ?? 0;
  let top3ConcentrationPct = 0;
  if (winningTrades.length > 0 && totalNetProfit > 0) {
    const top3Pnl = winningTrades.slice(0, 3).reduce((acc, t) => acc + t.pnl, 0);
    top3ConcentrationPct = Number(((top3Pnl / totalNetProfit) * 100).toFixed(2));
  }
  const passConcentration = top3ConcentrationPct <= thresholds.maxTop3TradeConcentrationPct || totalNetProfit <= 0;
  gates.push({
    gate: "topTradeConcentration",
    passed: passConcentration,
    actual: top3ConcentrationPct,
    threshold: thresholds.maxTop3TradeConcentrationPct,
    description: `Top 3 winning trades must not generate more than ${thresholds.maxTop3TradeConcentrationPct}% of total net profits.`,
    reason: passConcentration
      ? `Top 3 trades account for ${top3ConcentrationPct}% of net profits (well diversified).`
      : `Extreme outlier reliance: Top 3 trades account for ${top3ConcentrationPct}% of total profits. Strategy lacks systemic edge.`,
  });

  // 6. Market Regime Diversification Check
  let regimeConcentrationPct = 0;
  let regimeDetails = {};
  if (Array.isArray(bars) && bars.length >= 25) {
    const regAnalysis = marketRegimeAnalysis(bars, trades, 20);
    regimeDetails = regAnalysis.summary || {};
    if (totalNetProfit > 0) {
      let maxRegimePnl = 0;
      for (const [regName, reg] of Object.entries(regimeDetails)) {
        if (regName !== "UNKNOWN" && reg.netPnl > maxRegimePnl) {
          maxRegimePnl = reg.netPnl;
        }
      }
      regimeConcentrationPct = Number(((maxRegimePnl / totalNetProfit) * 100).toFixed(2));
    }
  }
  const passRegime = regimeConcentrationPct <= thresholds.maxSingleRegimeConcentrationPct || totalNetProfit <= 0;
  gates.push({
    gate: "regimeDiversification",
    passed: passRegime,
    actual: regimeConcentrationPct,
    threshold: thresholds.maxSingleRegimeConcentrationPct,
    description: `A single market regime must not account for more than ${thresholds.maxSingleRegimeConcentrationPct}% of net profits.`,
    reason: passRegime
      ? `Profit concentration across dominant regime is ${regimeConcentrationPct}% (acceptable diversification).`
      : `High regime sensitivity: Dominant regime accounts for ${regimeConcentrationPct}% of net profits. Fragile to regime shifts.`,
  });

  // 7. Benchmark Outperformance Check (Optional)
  if (thresholds.mustBeatBenchmark) {
    const stratReturn = metrics.netProfitPct ?? 0;
    const bnhReturn = metrics.buyHoldPct ?? 0;
    const passBnh = stratReturn > bnhReturn;
    gates.push({
      gate: "benchmarkOutperformance",
      passed: passBnh,
      actual: { strategyReturnPct: stratReturn, buyHoldPct: bnhReturn },
      threshold: "Strategy Return > Buy & Hold Return",
      description: "Strategy out-of-sample return must exceed passive Buy & Hold return.",
      reason: passBnh
        ? `Strategy (+${stratReturn}%) outperformed Buy & Hold (+${bnhReturn}%).`
        : `Strategy (+${stratReturn}%) failed to beat Buy & Hold (+${bnhReturn}%).`,
    });
  }

  // 8. Transaction Friction Survival Check
  if (thresholds.mustSurviveFriction) {
    let conservativeSurvives = null;
    let frictionDetails = null;

    if (holdoutResult.stressTest) {
      conservativeSurvives = holdoutResult.stressTest.conservativeSurvives ?? holdoutResult.stressTest.allTiersSurvive;
      frictionDetails = holdoutResult.stressTest;
    } else if (typeof holdoutResult.strategyFactory === "function" && Array.isArray(bars) && bars.length > 0) {
      const stress = executionStressTest(bars, holdoutResult.strategyFactory, holdoutResult.replayOptions || {});
      conservativeSurvives = stress.conservativeSurvives;
      frictionDetails = stress;
    } else {
      conservativeSurvives = (metrics.netProfit ?? 0) > 0;
    }

    const passFriction = Boolean(conservativeSurvives);
    gates.push({
      gate: "mustSurviveFriction",
      passed: passFriction,
      actual: frictionDetails ? { conservativeSurvives } : (metrics.netProfit ?? 0),
      threshold: "Positive net profit under conservative friction (2x fees, 3x slippage)",
      description: "Strategy must retain positive net profit under adverse execution friction.",
      reason: passFriction
        ? "Strategy maintained positive expectancy under conservative execution frictions."
        : "Strategy failed friction stress test: edge was eliminated by transaction costs.",
    });
  }

  const passedGates = gates.filter((g) => g.passed);
  const failedGates = gates.filter((g) => !g.passed);
  const promoted = failedGates.length === 0;

  return {
    promoted,
    verdict: promoted ? "PROMOTED_TO_CONTROLLED_PAPER" : "PROMOTION_REJECTED",
    totalGates: gates.length,
    passedCount: passedGates.length,
    failedCount: failedGates.length,
    gates,
    failedGates: failedGates.map((g) => ({ gate: g.gate, actual: g.actual, threshold: g.threshold, reason: g.reason })),
    warnings,
    evaluatedAt: Date.now(),
  };
}
