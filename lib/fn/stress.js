// /api/fn/stress : Portfolio Macro Crisis Scenario & Stress Testing Engine.
// Evaluates portfolio vulnerability across 8 historical market crises and 4 macro factor shocks.
import { valuePortfolio } from "./eq-port.js";
import * as store from "../store.js";

export const HISTORICAL_SCENARIOS = [
  {
    id: "gfc_2008",
    name: "2008 Global Financial Crisis (Lehman Bankruptcy)",
    period: "Sep 2008 - Mar 2009",
    type: "historical_proxy",
    source: "Historical S&P 500 / Dow Jones / Bloomberg peak-to-trough drawdowns",
    calibration: "Holding-level beta and sector proxy sensitivity mapping",
    marketShock: -0.500, // S&P 500 -50%
    techShock: -0.450,
    finShock: -0.750,
    cryptoShock: -0.700,
    ratesShock: 0.150, // Long Treasuries rallied
    commodityShock: -0.450,
    description: "Systemic banking crisis, severe credit contraction, global recession.",
    limitations: "Linear beta scaling; excludes credit default cascades and emergency liquidations.",
  },
  {
    id: "covid_2020",
    name: "2020 COVID-19 Flash Crash",
    period: "Feb 2020 - Mar 2020",
    type: "historical_proxy",
    source: "Historical market indices over March 2020 liquidity shock",
    calibration: "Holding-level beta and sector proxy sensitivity mapping",
    marketShock: -0.339, // S&P 500 -33.9%
    techShock: -0.280,
    finShock: -0.400,
    cryptoShock: -0.500,
    ratesShock: 0.080,
    commodityShock: -0.550, // WTI crude oil crash
    description: "Rapid liquidity contraction and global economic lockdown shock.",
    limitations: "Single-month peak drawdown; does not account for subsequent monetary stimulus rebound.",
  },
  {
    id: "rate_shock_2022",
    name: "2022 Fed Tightening & Tech Drawdown",
    period: "Jan 2022 - Oct 2022",
    type: "historical_proxy",
    source: "Historical Federal Reserve aggressive rate hike cycle",
    calibration: "Holding-level beta and sector proxy sensitivity mapping",
    marketShock: -0.254, // S&P 500 -25.4%
    techShock: -0.331,   // Nasdaq -33.1%
    finShock: -0.150,
    cryptoShock: -0.640,
    ratesShock: -0.180,  // Bonds sold off with equities
    commodityShock: 0.250,
    description: "Surging inflation, aggressive Fed rate hikes, simultaneous equity and bond drawdowns.",
    limitations: "Assumes continuous linear duration drag; does not model coupon reinvestment.",
  },
  {
    id: "dotcom_2000",
    name: "2000-2002 Dot-Com Bubble Collapse",
    period: "Mar 2000 - Oct 2002",
    type: "historical_proxy",
    source: "Historical Nasdaq Composite and S&P 500 dot-com collapse",
    calibration: "Holding-level beta and sector proxy sensitivity mapping",
    marketShock: -0.491,
    techShock: -0.780, // Nasdaq -78%
    finShock: -0.200,
    cryptoShock: -0.800,
    ratesShock: 0.140,
    commodityShock: -0.100,
    description: "Speculative tech equity unwinding, telecom overcapacity, dot-com bubble collapse.",
    limitations: "Extended 2.5-year multi-stage bear market condensed into an instantaneous factor shock.",
  },
  {
    id: "black_monday_1987",
    name: "1987 Black Monday Crash",
    period: "Oct 19, 1987",
    type: "historical_proxy",
    source: "Single-day market crash historical records",
    calibration: "Holding-level beta and sector proxy sensitivity mapping",
    marketShock: -0.226, // S&P 500 -22.6% in 1 day
    techShock: -0.250,
    finShock: -0.260,
    cryptoShock: -0.400,
    ratesShock: 0.040,
    commodityShock: -0.100,
    description: "Portfolio insurance cascades, rapid automated selling, single-day panic.",
    limitations: "Assumes immediate liquidity at stressed prices without circuit-breaker halts.",
  },
  {
    id: "us_downgrade_2011",
    name: "2011 US Debt Ceiling & Sovereign Downgrade",
    period: "Jul 2011 - Aug 2011",
    type: "historical_proxy",
    source: "Historical market reaction to S&P US sovereign credit downgrade",
    calibration: "Holding-level beta and sector proxy sensitivity mapping",
    marketShock: -0.163,
    techShock: -0.180,
    finShock: -0.280,
    cryptoShock: -0.250,
    ratesShock: 0.060,
    commodityShock: -0.120,
    description: "S&P downgrade of US sovereign credit rating, fiscal confrontation in Congress.",
    limitations: "Duration-weighted flight-to-quality proxy; does not model foreign reserve reallocations.",
  },
  {
    id: "china_deval_2015",
    name: "2015 China Currency Devaluation Shock",
    period: "Aug 2015 - Sep 2015",
    type: "historical_proxy",
    source: "Historical market indices over PBOC Renminbi adjustment",
    calibration: "Holding-level beta and sector proxy sensitivity mapping",
    marketShock: -0.124,
    techShock: -0.140,
    finShock: -0.150,
    cryptoShock: -0.200,
    ratesShock: 0.030,
    commodityShock: -0.220,
    description: "Surprise PBOC Yuan devaluation, emerging market capital flight and commodity slump.",
    limitations: "Assumes USD reporting currency baseline.",
  },
  {
    id: "svb_banking_2023",
    name: "2023 US Regional Banking Liquidity Shock",
    period: "Mar 2023",
    type: "historical_proxy",
    source: "KBW Regional Banking Index and S&P 500 March 2023 moves",
    calibration: "Holding-level beta and sector proxy sensitivity mapping",
    marketShock: -0.085,
    techShock: 0.020, // Mega-cap tech acted as flight-to-safety
    finShock: -0.320,  // Regional bank run
    cryptoShock: -0.120,
    ratesShock: 0.050,
    commodityShock: -0.050,
    description: "Silicon Valley Bank and Signature Bank runs, balance sheet duration mismatch.",
    limitations: "Sector-concentrated stress; mega-cap resilience may not repeat in broader bank runs.",
  },
];

export const MACRO_FACTOR_SHOCKS = [
  {
    id: "rates_up_200bp",
    name: "Yield Curve Parallel Shift (+200 bps)",
    type: "macro_hypothetical",
    source: "Parametric interest rate shift assumption",
    calibration: "Holding-level duration and equity cost of capital proxy",
    equityShock: -0.120,
    techShock: -0.180,
    ratesShock: -0.140, // Bond values drop
    commodityShock: -0.050,
    cryptoShock: -0.200,
    description: "Sudden 200 bps interest rate hike across all sovereign tenors.",
    limitations: "Parallel curve assumption; excludes twist or steepening dynamics.",
  },
  {
    id: "stagflation",
    name: "Stagflationary Supply Shock",
    type: "macro_hypothetical",
    source: "Parametric cost-push inflation scenario",
    calibration: "Sector-specific margin compression and commodity pass-through",
    equityShock: -0.180,
    techShock: -0.220,
    ratesShock: -0.100,
    commodityShock: 0.350, // Commodities surge
    cryptoShock: -0.250,
    description: "Cost-push inflation surge coupled with GDP contraction.",
    limitations: "Assumes rigid consumer demand; does not model substitution effects.",
  },
  {
    id: "usd_crunch",
    name: "USD Global Liquidity Crunch (+10% USD)",
    type: "macro_hypothetical",
    source: "Parametric trade-weighted US Dollar Index surge",
    calibration: "Multinational revenue exposure and emerging market currency drag",
    equityShock: -0.100,
    techShock: -0.120,
    ratesShock: 0.020,
    commodityShock: -0.180,
    cryptoShock: -0.300,
    description: "Sharp USD appreciation, offshore dollar shortages, export revenue drag.",
    limitations: "Assumes unhedged foreign currency exposures.",
  },
  {
    id: "oil_surge",
    name: "Global Energy Disruption (+50% Crude Oil)",
    type: "macro_hypothetical",
    source: "Parametric energy commodity price surge",
    calibration: "Energy sector tailwinds vs transportation and consumer headwinds",
    equityShock: -0.080,
    techShock: -0.090,
    ratesShock: -0.050,
    commodityShock: 0.400,
    cryptoShock: -0.150,
    description: "Major maritime transit choke-point disruption escalating oil prices.",
    limitations: "Assumes instantaneous supply shock without strategic reserve releases.",
  },
];

// Institutional benchmark portfolio configuration
export const BENCHMARK_PORTFOLIO = [
  { sec: "SPY US EQUITY", shares: 400, cost: 500, notes: "S&P 500 Benchmark (40%)" },
  { sec: "QQQ US EQUITY", shares: 300, cost: 450, notes: "Nasdaq 100 Benchmark (30%)" },
  { sec: "TLT US EQUITY", shares: 150, cost: 95, notes: "20+ Year Treasury Benchmark (15%)" },
  { sec: "GLD US EQUITY", shares: 100, cost: 210, notes: "Gold / Real Asset Benchmark (10%)" },
  { sec: "BTC", shares: 0.5, cost: 65000, notes: "Digital Asset Benchmark (5%)" },
];

// Determine holding-specific shock given scenario and asset characteristics
export function calculateHoldingShock(holding, scenario) {
  const beta = Number.isFinite(holding.beta) ? holding.beta : 1.0;
  const sector = String(holding.sector || "").toLowerCase();
  const kind = String(holding.kind || "").toUpperCase();
  const sec = String(holding.sec || "").toUpperCase();
  const ticker = String(holding.ticker || "").toUpperCase();

  // Cash and USD holdings experience zero equity beta shock
  if (sec.includes("USD") || ticker === "USD" || kind === "CASH" || sector === "cash") {
    return 0.0;
  }

  const isCrypto = holding.crypto || kind === "CRYPTO" || sector.includes("crypto") || ticker === "BTC" || ticker === "ETH";
  if (isCrypto) {
    return scenario.cryptoShock ?? scenario.marketShock * 1.5;
  }

  // Fixed Income / Rates holdings
  if (sector.includes("treasury") || sector.includes("bond") || sector.includes("fixed income") || ticker === "TLT" || ticker === "IEF") {
    return scenario.ratesShock ?? 0.0;
  }

  // Commodities / Gold
  if (kind === "CMDTY" || sector.includes("commodity") || ticker === "GLD" || ticker === "USO") {
    return scenario.commodityShock ?? (scenario.marketShock ?? -0.20) * 0.8;
  }

  // Technology sector
  if (sector.includes("tech") || sector.includes("software") || sector.includes("semiconductor") || ticker === "QQQ") {
    const sShock = scenario.techShock ?? (scenario.marketShock ?? -0.20) * 1.25;
    return Math.max(-0.95, sShock * (beta > 0 ? (0.5 + 0.5 * beta) : 1.0));
  }

  // Financials / Banks
  if (sector.includes("financial") || sector.includes("bank")) {
    const sShock = scenario.finShock ?? (scenario.marketShock ?? -0.20) * 1.3;
    return Math.max(-0.95, sShock * (beta > 0 ? (0.5 + 0.5 * beta) : 1.0));
  }

  // Broad index
  if (kind === "INDEX" || sector.includes("index") || ticker === "SPY") {
    return scenario.marketShock ?? scenario.equityShock ?? -0.20;
  }

  // General equity calculation: scale market shock by holding beta
  const generalShock = (scenario.marketShock ?? scenario.equityShock ?? -0.20) * (beta > 0 ? beta : 1.0);
  return Math.max(-1.0, Math.min(1.5, generalShock));
}

// Stresses an entire portfolio against a list of scenarios, correctly handling long and short positions
export function stressPortfolio(portfolioResult, scenarios) {
  const holdings = portfolioResult.holdings || [];
  const totalValue = portfolioResult.totals?.value || 0;

  if (!holdings.length || totalValue === 0) {
    return {
      totalValue: 0,
      scenarioResults: [],
      vulnerabilities: [],
    };
  }

  const scenarioResults = scenarios.map((scen) => {
    let stressedTotalValue = 0;
    const holdingShocks = holdings.map((h) => {
      const shockPct = calculateHoldingShock(h, scen);
      const val = h.value || 0;

      // Universal signed position market-value stress valuation:
      // For any cash asset with limited liability (P >= 0), underlying price multiplier is m = Math.max(0, 1 + shockPct).
      // Long position (val > 0): stressedVal = val * m. If shockPct < 0, m < 1 => stressedVal < val => dollarLoss < 0 (loss).
      // Short position (val < 0): stressedVal = val * m. If shockPct < 0, m < 1 => liability shrinks => stressedVal is less negative => dollarLoss > 0 (gain).
      const priceMultiplier = Math.max(0, 1 + shockPct);
      const stressedVal = val * priceMultiplier;
      const dollarLoss = stressedVal - val;
      stressedTotalValue += stressedVal;

      return {
        sec: h.sec,
        ticker: h.ticker || h.sec,
        value: val,
        weight: totalValue !== 0 ? (val / totalValue) * 100 : 0,
        beta: h.beta,
        sector: h.sector,
        shockPct: shockPct * 100,
        priceMultiplier,
        stressedVal,
        dollarLoss,
      };
    });

    const totalDollarLoss = stressedTotalValue - totalValue;
    const totalDrawdownPct = totalValue !== 0 ? (totalDollarLoss / Math.abs(totalValue)) * 100 : 0;

    return {
      id: scen.id,
      name: scen.name,
      period: scen.period || "Stress Factor",
      type: scen.type || "scenario",
      source: scen.source || "Historical observation proxy",
      description: scen.description,
      limitations: scen.limitations,
      startingValue: totalValue,
      stressedTotalValue,
      totalDollarLoss,
      totalDrawdownPct,
      reconciles: Math.abs((totalValue + totalDollarLoss) - stressedTotalValue) < 1e-4,
      holdingShocks: holdingShocks.sort((a, b) => a.dollarLoss - b.dollarLoss), // largest dollar losses first
    };
  });

  // Calculate worst-case holding vulnerability across all scenarios
  const holdingVulnMap = new Map();
  for (const s of scenarioResults) {
    for (const hs of s.holdingShocks) {
      const cur = holdingVulnMap.get(hs.sec) || {
        sec: hs.sec,
        ticker: hs.ticker,
        value: hs.value,
        weight: hs.weight,
        sector: hs.sector,
        beta: hs.beta,
        worstLoss: 0,
        worstLossPct: 0,
        worstScenario: "",
      };
      if (hs.dollarLoss < cur.worstLoss) {
        cur.worstLoss = hs.dollarLoss;
        cur.worstLossPct = hs.shockPct;
        cur.worstScenario = s.name;
      }
      holdingVulnMap.set(hs.sec, cur);
    }
  }

  const vulnerabilities = [...holdingVulnMap.values()].sort(
    (a, b) => a.worstLoss - b.worstLoss,
  );

  return {
    totalValue,
    scenarioResults,
    vulnerabilities,
  };
}

export default async function (q = {}) {
  const isBenchmarkExplicit =
    q.benchmark === "1" ||
    q.benchmark === "true" ||
    q.mode === "benchmark" ||
    String(q.args || "").toUpperCase().includes("BENCHMARK");

  const stateData = store.read("state", {});
  const userHoldings = stateData.tavorynPort || stateData.amberPort || [];

  // Truthful empty portfolio handling:
  // If the user has NO positions on record and did not explicitly request benchmark mode,
  // do NOT silently fabricate a portfolio. Return an explicit empty state.
  if (!userHoldings.length && !isBenchmarkExplicit) {
    return {
      mode: "empty",
      empty: true,
      portfolioValue: 0,
      holdingsCount: 0,
      marketBeta: null,
      annualVolatility: null,
      historicalCrises: [],
      macroShocks: [],
      vulnerabilities: [],
      notes: [
        "No active positions found in PORT. Add positions via PORT (e.g. PORT ADD SPY 100 500) or run STRESS BENCHMARK to evaluate the standard institutional 5-asset benchmark.",
      ],
      source: "Tavoryn Portfolio Stress Testing Engine (STRESS).",
    };
  }

  const isBenchmark = !userHoldings.length && isBenchmarkExplicit;
  const activeHoldings = isBenchmark ? BENCHMARK_PORTFOLIO : userHoldings;

  const portVal = await valuePortfolio(activeHoldings);
  const historical = stressPortfolio(portVal, HISTORICAL_SCENARIOS);
  const macro = stressPortfolio(portVal, MACRO_FACTOR_SHOCKS);

  return {
    mode: isBenchmark ? "benchmark" : "portfolio",
    empty: false,
    isBenchmark,
    portfolioValue: portVal.totals?.value || 0,
    holdingsCount: portVal.holdings?.length || 0,
    marketBeta: portVal.totals?.beta ?? null,
    annualVolatility: portVal.totals?.vol ?? null,
    historicalCrises: historical.scenarioResults,
    macroShocks: macro.scenarioResults,
    vulnerabilities: historical.vulnerabilities,
    notes: isBenchmark
      ? [
          "BENCHMARK MODE: Evaluating standard institutional 5-asset benchmark (SPY 40%, QQQ 30%, TLT 15%, GLD 10%, BTC 5%). This is NOT your personal portfolio.",
        ]
      : [
          `PORTFOLIO MODE: Evaluating ${portVal.holdings?.length || 0} active positions from your portfolio (data/state.json).`,
        ],
    methodology:
      "Deterministic single-index factor stress simulation across historical crises and hypothetical macro factor shifts. Long and short positions are revalued using signed market-value approximation V_stressed = V * max(0, 1 + r), preserving accounting identity V_start + deltaV = V_stressed. Cash immunity is a base-currency (USD) nominal modeling assumption, not protection against inflation, purchasing power loss, or cross-currency exchange rate risk. Derivatives, margin, and leveraged positions are simplified and do not model non-linear gamma or margin liquidation cascades.",
    source:
      "Tavoryn Portfolio Stress Testing Engine (STRESS). Empirical historical crisis drawdowns and multi-factor shocks applied to holdings.",
  };
}
