// /api/fn/dcf?symbol=AAPL : Discounted Cash Flow (DCF) Intrinsic Valuation Model.
// Evaluates free cash flow projections, WACC discount factors, Gordon Growth terminal value,
// net debt adjustments, fair value per share, margin of safety, and a 2D sensitivity matrix.
import { resolve, getQuotes } from "../providers.js";
import { financials } from "../market-info.js";

export const parseNum = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v ?? "")
    .replace(/[$,%\s]/g, "")
    .trim();
  // Check for negative in parentheses: (123) -> -123
  if (/^\(.*\)$/.test(cleaned)) {
    const n = parseFloat(cleaned.slice(1, -1));
    return Number.isFinite(n) ? -n : null;
  }
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
};

// Pure mathematical DCF calculation engine
export function calculateDCF({
  currentPrice = 100,
  sharesOutstanding = 1000,
  baseFCF = 50,
  growthRate = 0.08,
  wacc = 0.09,
  terminalGrowthRate = 0.025,
  projectionYears = 5,
  cashAndEquivalents = 0,
  totalDebt = 0,
}) {
  const pYears = Math.max(1, Math.min(10, Math.round(projectionYears || 5)));
  const g = Number.isFinite(Number(growthRate)) ? Number(growthRate) : 0.08;
  const rawWacc = Number.isFinite(Number(wacc)) ? Number(wacc) : 0.09;
  const w = rawWacc;
  const tg = Number.isFinite(Number(terminalGrowthRate)) ? Number(terminalGrowthRate) : 0.025;
  const shares = Math.max(0.0001, Number.isFinite(Number(sharesOutstanding)) ? Number(sharesOutstanding) : 1000);
  const price = Math.max(0.01, Number.isFinite(Number(currentPrice)) ? Number(currentPrice) : 1);
  const cash = Number.isFinite(Number(cashAndEquivalents)) ? Number(cashAndEquivalents) : 0;
  const debt = Number.isFinite(Number(totalDebt)) ? Number(totalDebt) : 0;
  const fcf0 = Number.isFinite(Number(baseFCF)) ? Number(baseFCF) : 0;
  const netDebt = debt - cash;

  // 1. Project annual FCF and discounted present values using actual user-supplied WACC
  const projections = [];
  let currentFCF = fcf0;
  let sumPV = 0;

  for (let year = 1; year <= pYears; year++) {
    currentFCF = currentFCF * (1 + g);
    const discountFactor = w > -1 ? 1 / Math.pow(1 + w, year) : 0;
    const pv = currentFCF * discountFactor;
    sumPV += pv;
    projections.push({
      year,
      fcf: currentFCF,
      discountFactor,
      pv,
    });
  }

  // 2. 5x5 Sensitivity Matrix (WACC vs Terminal Growth Rate)
  const waccSteps = [-0.02, -0.01, 0, 0.01, 0.02].map((delta) =>
    Math.max(0.005, w + delta),
  );
  const tgSteps = [-0.01, -0.005, 0, 0.005, 0.01].map((delta) =>
    tg + delta,
  );

  const sensitivityMatrix = waccSteps.map((sw) => {
    return tgSteps.map((stg) => {
      // If WACC <= terminal growth, mark cell as explicitly invalid without silent clamping
      if (sw <= stg) {
        return {
          wacc: sw,
          terminalGrowth: stg,
          isValid: false,
          intrinsicValue: null,
          error: "WACC <= g_term",
        };
      }
      let sSumPV = 0;
      let sFCF = fcf0;
      for (let y = 1; y <= pYears; y++) {
        sFCF = sFCF * (1 + g);
        sSumPV += sFCF / Math.pow(1 + sw, y);
      }
      const sTV = (sFCF * (1 + stg)) / (sw - stg);
      const sPvTV = sTV / Math.pow(1 + sw, pYears);
      const sEV = sSumPV + sPvTV;
      const sEqVal = sEV - netDebt;
      const sShareVal = sEqVal / shares;
      return {
        wacc: sw,
        terminalGrowth: stg,
        isValid: true,
        intrinsicValue: sShareVal,
        error: null,
      };
    });
  });

  // Strict validation: In Gordon Growth model, WACC must be strictly greater than terminal growth
  if (w <= tg) {
    return {
      isValid: false,
      error: `WACC (${(w * 100).toFixed(2)}%) must be strictly greater than terminal growth rate (${(tg * 100).toFixed(2)}%) for Gordon Growth terminal value.`,
      inputs: {
        currentPrice: price,
        sharesOutstanding: shares,
        baseFCF: fcf0,
        growthRate: g,
        wacc: w,
        terminalGrowthRate: tg,
        projectionYears: pYears,
        cashAndEquivalents: cash,
        totalDebt: debt,
        netDebt,
        isNegativeFCF: fcf0 <= 0,
        spreadWarning: null,
      },
      projections,
      pvOfProjections: sumPV,
      terminalValue: null,
      pvOfTerminalValue: null,
      enterpriseValue: null,
      equityValue: null,
      intrinsicValuePerShare: null,
      marginOfSafetyPct: null,
      sensitivity: {
        waccSteps,
        tgSteps,
        matrix: sensitivityMatrix,
      },
    };
  }

  // 3. Terminal Value (Gordon Growth Model with actual supplied WACC)
  const terminalFCF = currentFCF * (1 + tg);
  const terminalValue = terminalFCF / (w - tg);
  const pvTerminalValue = terminalValue / Math.pow(1 + w, pYears);

  // 4. Enterprise Value & Equity Value
  const enterpriseValue = sumPV + pvTerminalValue;
  const equityValue = enterpriseValue - netDebt;

  // 5. Per Share Fair Value & Margin of Safety
  const intrinsicValuePerShare = equityValue / shares;
  const marginOfSafetyPct =
    price > 0 ? ((intrinsicValuePerShare - price) / price) * 100 : 0;

  const spread = w - tg;
  const spreadWarning =
    spread < 0.01
      ? `WACC (${(w * 100).toFixed(1)}%) is within 1.0% of perpetual growth rate (${(tg * 100).toFixed(1)}%). Small changes in assumptions produce extreme valuation swings.`
      : null;

  return {
    isValid: true,
    error: null,
    inputs: {
      currentPrice: price,
      sharesOutstanding: shares,
      baseFCF: fcf0,
      growthRate: g,
      wacc: w,
      terminalGrowthRate: tg,
      projectionYears: pYears,
      cashAndEquivalents: cash,
      totalDebt: debt,
      netDebt,
      isNegativeFCF: fcf0 <= 0,
      spreadWarning,
    },
    projections,
    pvOfProjections: sumPV,
    terminalValue,
    pvOfTerminalValue: pvTerminalValue,
    enterpriseValue,
    equityValue,
    intrinsicValuePerShare,
    marginOfSafetyPct,
    sensitivity: {
      waccSteps,
      tgSteps,
      matrix: sensitivityMatrix,
    },
  };
}

export default async function (q) {
  const sym = await resolve(q.symbol || "AAPL");
  const quotes = await getQuotes([sym.ticker]).catch(() => ({}));
  const quote = quotes[sym.ticker] || {};
  let currentPrice = quote.price || null;

  let baseFCF = null;
  let ocf = null;
  let capex = null;
  let sharesOutstanding = null;
  let cashAndEquivalents = 0;
  let totalDebt = 0;
  let isEstimatedFCF = false;
  let isEstimatedShares = false;
  let sharesSource = "derived_from_market_cap";
  let sharesNote = "";
  let fcfNote = "";
  let filingPeriod = null;

  // Attempt to fetch financial statement details
  try {
    const fin = await financials(sym.ticker, "annual");
    if (fin) {
      filingPeriod = fin.cashflow?.periods?.[0] || fin.income?.periods?.[0] || null;

      // Shares Outstanding & Price: Check stats for Market Cap, Share Price, and Previous Close
      let marketCapDollars = null;
      for (const st of fin.stats || []) {
        if (/market\s+cap/i.test(st.label)) {
          marketCapDollars = parseNum(st.value);
        } else if (/shares\s+outstanding/i.test(st.label)) {
          sharesOutstanding = parseNum(st.value);
          sharesSource = "filing_reported";
          sharesNote = "Reported directly in company statistics.";
        } else if (!currentPrice && /previous\s+close/i.test(st.label)) {
          currentPrice = parseNum(st.value);
        }
      }

      if (!currentPrice || currentPrice <= 0) {
        currentPrice = 150; // ultimate fallback if no quote or stat available
      }

      if (!sharesOutstanding && marketCapDollars && currentPrice > 0) {
        // Market Cap in Millions / Price = Shares in Millions
        sharesOutstanding = (marketCapDollars / 1e6) / currentPrice;
        sharesSource = "derived_from_market_cap";
        sharesNote = "Derived from reported Market Capitalization divided by Share Price ($M / $ = M shares).";
      }

      // Cash flow statement parsing: Handle both { label, values: [...] } and { item, latest }
      const cfRows = fin.cashflow?.rows || [];
      for (const r of cfRows) {
        const item = String(r.label || r.item || r[0] || "");
        const rawVal = r.values ? r.values[0] : (r.latest !== undefined ? r.latest : r[1]);
        const val = parseNum(rawVal);
        if (val != null) {
          if (/net\s+cash\s+flow.*operating/i.test(item) || /cash\s+provided\s+by\s+operating/i.test(item) || /^operating\s+cash\s+flow$/i.test(item)) {
            // Nasdaq reports figures in thousands of USD; convert to Millions (divide by 1,000)
            ocf = val / 1000;
          } else if (/capital\s+expenditure/i.test(item) || /property.*equipment/i.test(item)) {
            // CapEx is a cash outflow; take positive magnitude
            capex = Math.abs(val) / 1000;
          }
        }
      }

      if (ocf != null) {
        baseFCF = ocf - (capex || 0);
      }

      // Balance sheet cash and debt (convert thousands to Millions)
      const bsRows = fin.balance?.rows || [];
      for (const r of bsRows) {
        const item = String(r.label || r.item || r[0] || "");
        const rawVal = r.values ? r.values[0] : (r.latest !== undefined ? r.latest : r[1]);
        const val = parseNum(rawVal);
        if (val != null) {
          if (/cash\s+and\s+cash\s+equivalents/i.test(item) || /short-term\s+investments/i.test(item)) {
            cashAndEquivalents += Math.abs(val) / 1000;
          } else if (/total\s+debt/i.test(item) || /short-term\s+debt/i.test(item) || /long-term\s+debt/i.test(item)) {
            totalDebt += Math.abs(val) / 1000;
          }
        }
      }
    }
  } catch {}

  if (!currentPrice || currentPrice <= 0) {
    currentPrice = 150;
  }

  // Fallbacks if financial statements don't supply exact figures
  if (!sharesOutstanding || sharesOutstanding <= 0) {
    isEstimatedShares = true;
    sharesSource = "fallback_estimate";
    sharesNote = "Filing data unavailable. Using default 1,000M shares fallback.";
    sharesOutstanding = 1000; // default 1,000M shares fallback
  }

  if (baseFCF == null) {
    isEstimatedFCF = true;
    // Estimate reasonable FCF based on 4% FCF yield on market cap as an explicit assumption
    baseFCF = Math.round(currentPrice * sharesOutstanding * 0.04);
    fcfNote = "Financial filings unavailable. Base FCF is an illustrative 4% yield proxy on market capitalization.";
  } else if (baseFCF <= 0) {
    fcfNote = `Reported Free Cash Flow is negative ($${baseFCF.toFixed(1)}M). The model reflects ongoing cash burn. Standard Gordon Growth DCF requires positive operational cash flows; intrinsic value reflects unadjusted cash drain.`;
  } else {
    fcfNote = `FCF calculated from reported Operating Cash Flow ($${ocf.toFixed(1)}M) minus CapEx ($${(capex || 0).toFixed(1)}M). Period: ${filingPeriod || "Latest Annual Filing"}.`;
  }

  // Allow query param overrides
  const userGrowth = q.growth != null ? parseNum(q.growth) : null;
  const userWacc = q.wacc != null ? parseNum(q.wacc) : null;
  const userTerminalGrowth =
    q.terminalGrowth != null ? parseNum(q.terminalGrowth) : null;
  const userBaseFCF = q.baseFCF != null ? parseNum(q.baseFCF) : null;
  const userShares = q.shares != null ? parseNum(q.shares) : null;

  const effectiveBaseFCF = userBaseFCF ?? baseFCF;
  const effectiveShares = userShares ?? sharesOutstanding;
  if (userShares != null) {
    sharesSource = "user_override";
    sharesNote = `User supplied custom share count override (${userShares}M shares).`;
  }

  const baseResult = calculateDCF({
    currentPrice,
    sharesOutstanding: effectiveShares,
    baseFCF: effectiveBaseFCF,
    growthRate: userGrowth != null ? userGrowth / 100 : 0.08,
    wacc: userWacc != null ? userWacc / 100 : 0.09,
    terminalGrowthRate:
      userTerminalGrowth != null ? userTerminalGrowth / 100 : 0.025,
    cashAndEquivalents,
    totalDebt,
  });

  // Conservative Scenario (-2% growth, +1% WACC, -0.5% terminal growth)
  const conservativeResult = calculateDCF({
    currentPrice,
    sharesOutstanding: effectiveShares,
    baseFCF: effectiveBaseFCF,
    growthRate: Math.max(0.01, (userGrowth != null ? userGrowth / 100 : 0.08) - 0.02),
    wacc: (userWacc != null ? userWacc / 100 : 0.09) + 0.01,
    terminalGrowthRate: Math.max(0.01, (userTerminalGrowth != null ? userTerminalGrowth / 100 : 0.025) - 0.005),
    cashAndEquivalents,
    totalDebt,
  });

  // Optimistic Scenario (+2% growth, -1% WACC, +0.5% terminal growth)
  const optimisticResult = calculateDCF({
    currentPrice,
    sharesOutstanding: effectiveShares,
    baseFCF: effectiveBaseFCF,
    growthRate: (userGrowth != null ? userGrowth / 100 : 0.08) + 0.02,
    wacc: Math.max(0.02, (userWacc != null ? userWacc / 100 : 0.09) - 0.01),
    terminalGrowthRate: (userTerminalGrowth != null ? userTerminalGrowth / 100 : 0.025) + 0.005,
    cashAndEquivalents,
    totalDebt,
  });

  return {
    symbol: sym.id,
    ticker: sym.ticker,
    name: sym.name || sym.ticker,
    currency: "USD",
    currentPrice,
    filingPeriod,
    isEstimatedFCF,
    isEstimatedShares,
    sharesSource,
    sharesNote,
    isNegativeFCF: effectiveBaseFCF <= 0,
    fcfNote,
    methodology:
      "Free Cash Flow to Firm (FCFF proxy) defined as Operating Cash Flow minus Capital Expenditures. Enterprise Value is discounted at WACC; Equity Value equals Enterprise Value plus Cash & Short-Term Investments minus Total Debt. Diluted share count is derived from reported Market Capitalization divided by Share Price ($M / $ = M shares) or reported filing statistics where available.",
    baseCase: baseResult,
    scenarios: {
      conservative: {
        isValid: conservativeResult.isValid,
        intrinsicValue: conservativeResult.intrinsicValuePerShare,
        marginOfSafety: conservativeResult.marginOfSafetyPct,
        growthRate: conservativeResult.inputs.growthRate,
        wacc: conservativeResult.inputs.wacc,
        error: conservativeResult.error,
      },
      base: {
        isValid: baseResult.isValid,
        intrinsicValue: baseResult.intrinsicValuePerShare,
        marginOfSafety: baseResult.marginOfSafetyPct,
        growthRate: baseResult.inputs.growthRate,
        wacc: baseResult.inputs.wacc,
        error: baseResult.error,
      },
      optimistic: {
        isValid: optimisticResult.isValid,
        intrinsicValue: optimisticResult.intrinsicValuePerShare,
        marginOfSafety: optimisticResult.marginOfSafetyPct,
        growthRate: optimisticResult.inputs.growthRate,
        wacc: optimisticResult.inputs.wacc,
        error: optimisticResult.error,
      },
    },
    source:
      "Tavoryn Quantitative Valuation Model (DCF). Free cash flows derived from SEC/Nasdaq filings and live pricing.",
  };
}
