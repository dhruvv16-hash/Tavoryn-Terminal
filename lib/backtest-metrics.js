// Backtest Metrics & Statistical Analysis Engine
// Quantitative performance evaluation: CAGR, Drawdown, Win Rate, Expectancy,
// Profit Factor, Sharpe, Sortino, Turnover, Exposure, Fees, Slippage, and Trade Journal.
// Strict handling of zero-trade and zero-loss edge cases without NaN or Infinity.

/**
 * Rounds a number to a fixed number of decimals, returning null if non-finite.
 */
function round(v, d = 2) {
  if (v == null || !Number.isFinite(v)) return null;
  return Number(v.toFixed(d));
}

/**
 * Calculates periods per year from bar timestamps
 */
export function calculatePeriodsPerYear(bars) {
  if (!bars || bars.length < 2) return 252;
  const firstTime = bars[0].time;
  const lastTime = bars[bars.length - 1].time;
  const timeSpan = lastTime - firstTime;
  if (timeSpan <= 0) return 252;
  const step = timeSpan / (bars.length - 1);
  return (365 * 86400) / step;
}

/**
 * Computes comprehensive institutional metrics from trades and equity series.
 */
export function computeBacktestMetrics(trades = [], equity = [], bars = [], config = {}) {
  const initialCapital = Number(config.initialCapital) > 0 ? Number(config.initialCapital) : 10000;
  const finalEquity = equity.length > 0 ? equity[equity.length - 1].value : initialCapital;
  const netProfit = finalEquity - initialCapital;
  const netProfitPct = (netProfit / initialCapital) * 100;

  // Buy & hold benchmark
  let buyHoldPct = null;
  if (bars && bars.length > 1 && bars[0].close > 0) {
    buyHoldPct = ((bars[bars.length - 1].close - bars[0].close) / bars[0].close) * 100;
  }

  // Time span and CAGR
  let years = 0;
  if (bars && bars.length > 1 && bars[bars.length - 1].time > bars[0].time) {
    years = (bars[bars.length - 1].time - bars[0].time) / (365 * 86400);
  }

  let cagrPct = null;
  if (years > 0 && finalEquity > 0 && initialCapital > 0) {
    cagrPct = ((finalEquity / initialCapital) ** (1 / years) - 1) * 100;
  }

  // Drawdown calculation (pct, dollar, duration in bars)
  let peak = -Infinity;
  let maxDrawdownPct = 0;
  let maxDrawdownDollars = 0;
  let maxDrawdownDurationBars = 0;
  let currentDrawdownBars = 0;

  for (let i = 0; i < equity.length; i++) {
    const val = equity[i].value;
    if (val > peak) {
      peak = val;
      currentDrawdownBars = 0;
    } else {
      currentDrawdownBars++;
      if (currentDrawdownBars > maxDrawdownDurationBars) {
        maxDrawdownDurationBars = currentDrawdownBars;
      }
      const ddDollars = peak - val;
      if (ddDollars > maxDrawdownDollars) maxDrawdownDollars = ddDollars;
      const ddPct = peak > 0 ? (ddDollars / peak) * 100 : 0;
      if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
    }
  }

  // Returns and Risk-adjusted ratios
  const perBarReturns = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1].value;
    const curr = equity[i].value;
    perBarReturns.push(prev > 0 ? curr / prev - 1 : 0);
  }

  const rfAnnual = Number(config.riskFreeRate) || 0;
  const ppy = calculatePeriodsPerYear(bars);
  const annFactor = Math.sqrt(ppy);
  const rfPerBar = rfAnnual / ppy;

  let meanReturn = 0;
  let sdReturn = 0;
  let downsideSd = 0;
  if (perBarReturns.length > 1) {
    const excess = perBarReturns.map((r) => r - rfPerBar);
    meanReturn = excess.reduce((acc, r) => acc + r, 0) / excess.length;
    const variance =
      excess.reduce((acc, r) => acc + (r - meanReturn) ** 2, 0) /
      (excess.length - 1);
    sdReturn = Math.sqrt(Math.max(0, variance));

    const downsideVariance =
      excess.reduce((acc, r) => acc + Math.min(0, r) ** 2, 0) /
      (excess.length - 1);
    downsideSd = Math.sqrt(Math.max(0, downsideVariance));
  }

  const sharpe = sdReturn > 0 ? (meanReturn / sdReturn) * annFactor : null;
  const sortino = downsideSd > 0 ? (meanReturn / downsideSd) * annFactor : null;

  // Trade statistics & Expectancy
  const totalTrades = trades.length;
  const winningTrades = trades.filter((t) => t.pnl > 0);
  const losingTrades = trades.filter((t) => t.pnl < 0);
  const evenTrades = trades.filter((t) => t.pnl === 0);

  const grossWins = winningTrades.reduce((acc, t) => acc + t.pnl, 0);
  const grossLosses = Math.abs(losingTrades.reduce((acc, t) => acc + t.pnl, 0));

  const winRate = totalTrades > 0 ? winningTrades.length / totalTrades : 0;
  const lossRate = totalTrades > 0 ? losingTrades.length / totalTrades : 0;
  const winRatePct = winRate * 100;
  const lossRatePct = lossRate * 100;

  const avgTradePct =
    totalTrades > 0
      ? trades.reduce((acc, t) => acc + (t.pnlPct || 0), 0) / totalTrades
      : null;

  const avgWinPct =
    winningTrades.length > 0
      ? winningTrades.reduce((acc, t) => acc + (t.pnlPct || 0), 0) / winningTrades.length
      : null;

  const avgLossPct =
    losingTrades.length > 0
      ? losingTrades.reduce((acc, t) => acc + (t.pnlPct || 0), 0) / losingTrades.length
      : null;

  // Expectancy calculation:
  // Mathematical Expectancy % = (WinRate * AvgWinPct) - (LossRate * |AvgLossPct|)
  let expectancyPct = null;
  if (totalTrades > 0) {
    const aw = avgWinPct || 0;
    const al = Math.abs(avgLossPct || 0);
    expectancyPct = (winRate * aw) - (lossRate * al);
  }

  const expectancyPerTrade = totalTrades > 0 ? netProfit / totalTrades : 0;

  // Profit Factor (handling 0 losses and 0 trades)
  let profitFactor = null;
  let profitFactorNote = null;
  if (totalTrades === 0) {
    profitFactor = 0;
    profitFactorNote = "No trades executed";
  } else if (grossLosses === 0) {
    if (grossWins > 0) {
      profitFactor = null;
      profitFactorNote = "No losing trades";
    } else {
      profitFactor = 0;
      profitFactorNote = "Zero P&L across all trades";
    }
  } else {
    profitFactor = grossWins / grossLosses;
  }

  const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map((t) => t.pnl)) : null;
  const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map((t) => t.pnl)) : null;

  const avgTradeDollars = totalTrades > 0 ? netProfit / totalTrades : 0;
  const avgWinDollars = winningTrades.length > 0 ? grossWins / winningTrades.length : null;
  const avgLossDollars = losingTrades.length > 0 ? grossLosses / losingTrades.length : null;

  let totalTradedNotional = 0;
  let totalBarsInTrade = 0;
  let totalCommissions = 0;
  let totalFees = 0;
  let totalSlippage = 0;
  let totalBorrowFees = Number(config.totalBorrowFees) || 0;

  for (const t of trades) {
    const entryNotional = (t.entryPrice || 0) * (t.qty || 0);
    const exitNotional = (t.exitPrice || 0) * (t.qty || 0);
    totalTradedNotional += entryNotional + exitNotional;
    totalBarsInTrade += t.bars || 0;
    const comm = t.commissions != null ? t.commissions : Math.max(0, (t.fees || 0) - (t.borrowFees || 0));
    totalCommissions += comm;
    totalFees += t.fees || 0;
    totalSlippage += t.slippage || 0;
    if (!config.totalBorrowFees) totalBorrowFees += t.borrowFees || 0;
  }

  const turnoverPct = initialCapital > 0 ? (totalTradedNotional / initialCapital) * 100 : 0;

  // 1. Time-in-Market Exposure (fraction of bars where an active position was held: strictly 0% to 100%)
  let distinctPositionBars = 0;
  if (config.distinctPositionBars != null) {
    distinctPositionBars = Number(config.distinctPositionBars);
  } else if (bars && bars.length > 0) {
    const activeIndices = new Set();
    for (const t of trades) {
      if (t.entryIndex != null && t.exitIndex != null) {
        for (let b = t.entryIndex; b <= t.exitIndex && b < bars.length; b++) {
          activeIndices.add(b);
        }
      } else if (t.entryTime != null && t.exitTime != null) {
        for (let b = 0; b < bars.length; b++) {
          if (bars[b].time >= t.entryTime && bars[b].time <= t.exitTime) {
            activeIndices.add(b);
          }
        }
      }
    }
    if (activeIndices.size > 0) {
      distinctPositionBars = activeIndices.size;
    } else {
      // Fallback if synthetic fixture without timestamps/indices:
      // Clamp to bars.length so timeInMarketPct NEVER exceeds 100%
      distinctPositionBars = Math.min(bars.length, totalBarsInTrade);
    }
  }

  const timeInMarketPct =
    bars && bars.length > 0 ? Math.min(100, Math.max(0, (distinctPositionBars / bars.length) * 100)) : 0;

  // 2. Gross Notional Exposure (cumulative trade bars / total bars, or from engine config)
  let grossExposurePct = 0;
  if (config.avgGrossExposurePct != null) {
    grossExposurePct = Number(config.avgGrossExposurePct);
  } else if (bars && bars.length > 0) {
    grossExposurePct = (totalBarsInTrade / bars.length) * 100;
  }

  return {
    initialCapital: round(initialCapital, 2),
    finalEquity: round(finalEquity, 2),
    netProfit: round(netProfit, 2),
    netProfitPct: round(netProfitPct, 2),
    buyHoldPct: round(buyHoldPct, 2),
    cagrPct: round(cagrPct, 2),
    totalTrades,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    evenTrades: evenTrades.length,
    winRatePct: round(winRatePct, 2),
    lossRatePct: round(lossRatePct, 2),
    profitFactor: profitFactor != null ? round(profitFactor, 2) : null,
    profitFactorNote,
    expectancyPct: round(expectancyPct, 2),
    expectancyPerTrade: round(expectancyPerTrade, 2),
    avgTradePct: round(avgTradePct, 2),
    avgWinPct: round(avgWinPct, 2),
    avgLossPct: round(avgLossPct, 2),
    avgTradeDollars: round(avgTradeDollars, 2),
    avgWinDollars: round(avgWinDollars, 2),
    avgLossDollars: round(avgLossDollars, 2),
    largestWin: round(largestWin, 2),
    largestLoss: round(largestLoss, 2),
    maxDrawdownPct: round(maxDrawdownPct, 2),
    maxDrawdownDollars: round(maxDrawdownDollars, 2),
    maxDrawdownDurationBars,
    sharpe: round(sharpe, 2),
    sortino: round(sortino, 2),
    turnoverPct: round(turnoverPct, 2),
    exposurePct: round(timeInMarketPct, 2),
    timeInMarketPct: round(timeInMarketPct, 2),
    grossExposurePct: round(grossExposurePct, 2),
    distinctPositionBars,
    totalCommissions: round(totalCommissions, 2),
    totalFees: round(totalFees, 2),
    totalSlippage: round(totalSlippage, 2),
    totalBorrowFees: round(totalBorrowFees, 2),
    tradesCount: totalTrades,
    barsCount: bars ? bars.length : 0,
  };
}
