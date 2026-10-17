// /api/fn/opay : Institutional Options Strategy Construction & Analytical Greeks Engine.
// Evaluates multi-leg options structures, exact piecewise expiration boundaries,
// Black-Scholes-Merton valuation with continuous dividend yields, and second-order Greeks.

// High-precision cumulative normal distribution approximation (Abramowitz & Stegun 7.1.26)
export function cdf(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2.0);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return 0.5 * (1.0 + sign * y);
}

export function pdf(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function bsPrice(type, S, K, T, r, v, q = 0) {
  if (S <= 0 || K <= 0) throw new Error("Spot and strike prices must be positive numbers");
  if (v <= 0) throw new Error("Implied volatility must be positive");
  if (T < 0) throw new Error("Time to expiry cannot be negative");

  const cleanType = String(type).toLowerCase().trim();
  if (cleanType !== "call" && cleanType !== "put") {
    throw new Error("Option type must be 'call' or 'put'");
  }

  if (T === 0 || T < 1e-8) {
    return cleanType === "call" ? Math.max(0, S - K) : Math.max(0, K - S);
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * v * v) * T) / (v * sqrtT);
  const d2 = d1 - v * sqrtT;

  if (cleanType === "call") {
    return S * Math.exp(-q * T) * cdf(d1) - K * Math.exp(-r * T) * cdf(d2);
  } else {
    return K * Math.exp(-r * T) * cdf(-d2) - S * Math.exp(-q * T) * cdf(-d1);
  }
}

export function bsGreeks(type, S, K, T, r, v, q = 0) {
  if (S <= 0 || K <= 0) throw new Error("Spot and strike prices must be positive numbers");
  if (v <= 0) throw new Error("Implied volatility must be positive");
  if (T < 0) throw new Error("Time to expiry cannot be negative");

  const cleanType = String(type).toLowerCase().trim();
  if (cleanType !== "call" && cleanType !== "put") {
    throw new Error("Option type must be 'call' or 'put'");
  }

  if (T === 0 || T < 1e-8) {
    const isCall = cleanType === "call";
    const delta = isCall ? (S > K ? 1 : S === K ? 0.5 : 0) : (S < K ? -1 : S === K ? -0.5 : 0);
    return { delta, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * v * v) * T) / (v * sqrtT);
  const d2 = d1 - v * sqrtT;
  const eqT = Math.exp(-q * T);
  const erT = Math.exp(-r * T);
  const isCall = cleanType === "call";

  // Delta
  const delta = isCall ? eqT * cdf(d1) : -eqT * cdf(-d1);

  // Gamma (identical for Call and Put)
  const gamma = (eqT * pdf(d1)) / (S * v * sqrtT);

  // Vega (per 1% shift in IV)
  const vega = (S * eqT * pdf(d1) * sqrtT) / 100;

  // Theta: continuous dividend yield Black-Scholes-Merton formula (per calendar day / 365)
  const thetaAnnual = isCall
    ? -(S * eqT * pdf(d1) * v) / (2 * sqrtT) + q * S * eqT * cdf(d1) - r * K * erT * cdf(d2)
    : -(S * eqT * pdf(d1) * v) / (2 * sqrtT) - q * S * eqT * cdf(-d1) + r * K * erT * cdf(-d2);
  const theta = thetaAnnual / 365;

  // Rho: interest rate sensitivity (per 1% change in r)
  const rho = isCall
    ? (K * T * erT * cdf(d2)) / 100
    : (-K * T * erT * cdf(-d2)) / 100;

  return { delta, gamma, theta, vega, rho };
}

export const PRESET_STRATEGIES = {
  LONG_CALL: (spot) => [
    { type: "call", strike: spot, qty: 1, action: "buy" },
  ],
  LONG_PUT: (spot) => [
    { type: "put", strike: spot, qty: 1, action: "buy" },
  ],
  BULL_CALL_SPREAD: (spot) => [
    { type: "call", strike: spot, qty: 1, action: "buy" },
    { type: "call", strike: Number((spot * 1.05).toFixed(1)), qty: 1, action: "sell" },
  ],
  BEAR_PUT_SPREAD: (spot) => [
    { type: "put", strike: spot, qty: 1, action: "buy" },
    { type: "put", strike: Number((spot * 0.95).toFixed(1)), qty: 1, action: "sell" },
  ],
  LONG_STRADDLE: (spot) => [
    { type: "call", strike: spot, qty: 1, action: "buy" },
    { type: "put", strike: spot, qty: 1, action: "buy" },
  ],
  IRON_CONDOR: (spot) => [
    { type: "put", strike: Number((spot * 0.90).toFixed(1)), qty: 1, action: "buy" },
    { type: "put", strike: Number((spot * 0.95).toFixed(1)), qty: 1, action: "sell" },
    { type: "call", strike: Number((spot * 1.05).toFixed(1)), qty: 1, action: "sell" },
    { type: "call", strike: Number((spot * 1.10).toFixed(1)), qty: 1, action: "buy" },
  ],
};

// Analytical strategy risk evaluator using exact strike breakpoints and terminal asymptotic slopes
export function computeStrategyPayoffBounds(legs, netCost) {
  // Check net slope as S -> infinity
  // Call: buy has slope +1, sell has slope -1
  // Put: slope is 0 as S -> infinity
  let slopeInfinity = 0;
  for (const leg of legs) {
    const sign = leg.action === "buy" ? 1 : -1;
    if (leg.type === "call") {
      slopeInfinity += sign * leg.qty;
    }
  }

  // Check net slope at S = 0
  // Call: payoff is 0 at S = 0
  // Put: buy has value K - S (slope -1), sell has value -(K - S) (slope +1)
  let pnlAtZero = -netCost;
  for (const leg of legs) {
    const sign = leg.action === "buy" ? 1 : -1;
    if (leg.type === "put") {
      pnlAtZero += sign * leg.strike * leg.qty;
    }
  }

  // Evaluate payoff at all distinct strike points
  const distinctStrikes = [...new Set(legs.map((l) => l.strike))].sort((a, b) => a - b);
  const strikePnls = distinctStrikes.map((K) => {
    let pnl = -netCost;
    for (const leg of legs) {
      const sign = leg.action === "buy" ? 1 : -1;
      const val = leg.type === "call" ? Math.max(0, K - leg.strike) : Math.max(0, leg.strike - K);
      pnl += sign * val * leg.qty;
    }
    return { strike: K, pnl };
  });

  const allPnlPoints = [pnlAtZero, ...strikePnls.map((s) => s.pnl)];

  // If slopeInfinity > 0, profit is unbounded as S -> infinity
  // If slopeInfinity < 0, loss is unbounded as S -> infinity
  let maxProfit = "Unlimited";
  let maxLoss = "Unlimited";

  if (slopeInfinity > 0) {
    maxProfit = "Unlimited";
  } else {
    maxProfit = Number(Math.max(...allPnlPoints).toFixed(2));
  }

  if (slopeInfinity < 0) {
    maxLoss = "Unlimited";
  } else {
    const minPnl = Math.min(...allPnlPoints);
    maxLoss = minPnl < 0 ? Number(Math.abs(minPnl).toFixed(2)) : 0;
  }

  // Calculate analytical breakeven points across line segments
  const breakevens = [];
  const criticalPoints = [
    { spot: 0, pnl: pnlAtZero },
    ...strikePnls.map((s) => ({ spot: s.strike, pnl: s.pnl })),
  ];

  // Intercepts between consecutive points
  for (let i = 0; i < criticalPoints.length - 1; i++) {
    const p1 = criticalPoints[i];
    const p2 = criticalPoints[i + 1];
    if (Math.sign(p1.pnl) !== Math.sign(p2.pnl) && p1.pnl !== p2.pnl) {
      const be = p1.spot + (-p1.pnl / (p2.pnl - p1.pnl)) * (p2.spot - p1.spot);
      breakevens.push(Number(be.toFixed(2)));
    }
  }

  // Intercept past the last strike towards infinity if slopeInfinity !== 0
  if (slopeInfinity !== 0) {
    const last = criticalPoints[criticalPoints.length - 1];
    const beInf = last.spot - (last.pnl / slopeInfinity);
    if (beInf > last.spot) {
      breakevens.push(Number(beInf.toFixed(2)));
    }
  }

  return {
    maxProfit,
    maxLoss,
    breakevens: [...new Set(breakevens)].sort((a, b) => a - b),
    slopeInfinity,
    pnlAtZero: Number(pnlAtZero.toFixed(2)),
  };
}

export function evaluateStrategy(spot, legs, daysToExpiry = 30, iv = 0.25, rate = 0.045, divYield = 0.0) {
  if (spot <= 0) throw new Error("Spot price must be positive");
  if (daysToExpiry < 0) throw new Error("Days to expiry cannot be negative");
  if (iv <= 0) throw new Error("Implied volatility must be positive");

  const T = Math.max(daysToExpiry / 365, 0.0001);
  const pricedLegs = legs.map((leg) => {
    const theoretical = bsPrice(leg.type, spot, leg.strike, T, rate, iv, divYield);
    const premium = leg.premium ?? Number(theoretical.toFixed(2));
    const greeks = bsGreeks(leg.type, spot, leg.strike, T, rate, iv, divYield);
    return { ...leg, premium, ...greeks };
  });

  // Calculate net debit / credit and aggregate Greeks
  let netCost = 0;
  let netDelta = 0;
  let netGamma = 0;
  let netTheta = 0;
  let netVega = 0;
  let netRho = 0;

  for (const leg of pricedLegs) {
    const sign = leg.action === "buy" ? 1 : -1;
    netCost += sign * leg.premium * leg.qty;
    netDelta += sign * leg.delta * leg.qty;
    netGamma += sign * leg.gamma * leg.qty;
    netTheta += sign * leg.theta * leg.qty;
    netVega += sign * leg.vega * leg.qty;
    netRho += sign * (leg.rho ?? 0) * leg.qty;
  }

  // Exact analytical boundaries
  const bounds = computeStrategyPayoffBounds(pricedLegs, netCost);

  // Generate visualization curve across spot range (-25% to +25%)
  const minSpot = spot * 0.75;
  const maxSpot = spot * 1.25;
  const steps = 50;
  const stepSize = (maxSpot - minSpot) / steps;
  const payoffCurve = [];

  for (let s = minSpot; s <= maxSpot + 1e-5; s += stepSize) {
    let expiryPnl = -netCost;
    let halfLifePnl = -netCost;

    for (const leg of pricedLegs) {
      const sign = leg.action === "buy" ? 1 : -1;
      const expiryVal = leg.type === "call" ? Math.max(0, s - leg.strike) : Math.max(0, leg.strike - s);
      const halfVal = bsPrice(leg.type, s, leg.strike, T * 0.5, rate, iv, divYield);
      expiryPnl += sign * expiryVal * leg.qty;
      halfLifePnl += sign * halfVal * leg.qty;
    }

    payoffCurve.push({
      spot: Number(s.toFixed(2)),
      expiryPnl: Number(expiryPnl.toFixed(2)),
      halfLifePnl: Number(halfLifePnl.toFixed(2)),
    });
  }

  return {
    spot,
    daysToExpiry,
    iv: iv * 100,
    rate: rate * 100,
    divYield: divYield * 100,
    legs: pricedLegs,
    netCost: Number(netCost.toFixed(2)),
    isCredit: netCost < 0,
    maxProfit: bounds.maxProfit,
    maxLoss: bounds.maxLoss,
    breakevens: bounds.breakevens,
    greeks: {
      netDelta: Number(netDelta.toFixed(3)),
      netGamma: Number(netGamma.toFixed(4)),
      netTheta: Number(netTheta.toFixed(3)),
      netVega: Number(netVega.toFixed(3)),
      netRho: Number(netRho.toFixed(3)),
    },
    payoffCurve,
  };
}

export default async function (query = {}) {
  const spot = query.spot !== undefined ? Number(query.spot) : 345.0; // Default AAPL
  const strategyName = (query.strategy || "BULL_CALL_SPREAD").toUpperCase();
  const dte = query.dte !== undefined ? Number(query.dte) : 30;
  const iv = query.iv !== undefined ? Number(query.iv) / 100 : 0.28;
  const rate = query.rate !== undefined ? Number(query.rate) / 100 : 0.045;
  const q = query.q !== undefined ? Number(query.q) / 100 : 0.0;

  const builder = PRESET_STRATEGIES[strategyName] || PRESET_STRATEGIES.BULL_CALL_SPREAD;
  const legs = builder(spot);
  const result = evaluateStrategy(spot, legs, dte, iv, rate, q);

  return {
    strategyName,
    availableStrategies: Object.keys(PRESET_STRATEGIES),
    ...result,
    source: "Black-Scholes-Merton options valuation with continuous dividend yields, analytical Greeks, and exact piecewise expiration payoff boundaries.",
  };
}
