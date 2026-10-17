// /api/fn/bndc : Institutional Bond Pricing & Fixed Income Analytics.
// Calculates clean price, dirty price, accrued interest, yield to maturity (YTM),
// Macaulay duration, modified duration, convexity, DV01, cash-flow schedules,
// and interest-rate shock scenarios.
// Day count assumption: US Treasury semi-annual compounding convention.

export function priceFromYield(couponPct, ytmPct, maturityYears, freq = 2, face = 100, settlementFraction = 0) {
  if (maturityYears <= 0) throw new Error("Maturity must be positive");
  if (freq <= 0) throw new Error("Coupon frequency must be positive");
  if (face <= 0) throw new Error("Face value must be positive");

  const n = Math.max(1, Math.round(maturityYears * freq));
  const c = ((couponPct / 100) * face) / freq;
  const y = (ytmPct / 100) / freq;
  const f = Math.max(0, Math.min(settlementFraction, 0.999999));

  // If zero coupon bond
  if (c === 0) {
    const dirty = face / Math.pow(1 + y, n - f);
    return { cleanPrice: dirty, dirtyPrice: dirty, accruedInterest: 0 };
  }

  if (y === 0) {
    const undiscounted = c * n + face;
    const ai = c * f;
    return { cleanPrice: undiscounted - ai, dirtyPrice: undiscounted, accruedInterest: ai };
  }

  // Dirty price = sum of PV of future cash flows discounted from settlement
  let dirtyPv = 0;
  for (let t = 1; t <= n; t++) {
    const cash = t === n ? c + face : c;
    dirtyPv += cash / Math.pow(1 + y, t - f);
  }

  const accruedInterest = c * f;
  const cleanPrice = dirtyPv - accruedInterest;

  return { cleanPrice, dirtyPrice: dirtyPv, accruedInterest };
}

export function yieldFromPrice(couponPct, targetPrice, maturityYears, freq = 2, face = 100, settlementFraction = 0) {
  if (targetPrice <= 0) throw new Error("Target bond price must be positive");
  if (maturityYears <= 0) throw new Error("Maturity must be positive");
  if (freq <= 0) throw new Error("Frequency must be positive");

  const n = Math.max(1, Math.round(maturityYears * freq));
  const c = ((couponPct / 100) * face) / freq;
  const f = Math.max(0, Math.min(settlementFraction, 0.999999));

  // Closed-form analytic solution for Zero-Coupon Bonds
  if (c === 0) {
    const yPeriodic = Math.pow(face / targetPrice, 1 / (n - f)) - 1;
    return yPeriodic * freq * 100;
  }

  // Hybrid Newton-Raphson / Bisection solver
  let lowYield = -0.10; // -10% lower bound
  let highYield = 1.00; // 100% upper bound

  // Expand bounds if necessary
  while (priceFromYield(couponPct, highYield * 100, maturityYears, freq, face, f).cleanPrice > targetPrice && highYield < 5.0) {
    highYield += 1.0;
  }

  let y = couponPct > 0 ? couponPct / 100 : 0.05; // Initial guess

  for (let iter = 0; iter < 100; iter++) {
    const p = priceFromYield(couponPct, y * 100, maturityYears, freq, face, f).cleanPrice;
    const diff = p - targetPrice;
    if (Math.abs(diff) < 1e-7) return y * 100;

    // Update bracket
    if (diff > 0) {
      lowYield = Math.max(lowYield, y);
    } else {
      highYield = Math.min(highYield, y);
    }

    // Numerical derivative
    const dy = 0.0001;
    const pUp = priceFromYield(couponPct, (y + dy) * 100, maturityYears, freq, face, f).cleanPrice;
    const dp = (pUp - p) / dy;

    let nextY = dp !== 0 ? y - diff / dp : (lowYield + highYield) / 2;

    // If Newton step jumps outside the bracket, bisect
    if (nextY <= lowYield || nextY >= highYield) {
      nextY = (lowYield + highYield) / 2;
    }

    y = nextY;
  }

  return y * 100;
}

export function bondAnalytics(couponPct, ytmPct, maturityYears, freq = 2, face = 100, settlementDays = 0, periodDays = 180) {
  if (maturityYears <= 0) throw new Error("Maturity must be positive");
  if (freq <= 0) throw new Error("Frequency must be positive");
  if (face <= 0) throw new Error("Face value must be positive");

  const settlementFraction = periodDays > 0 ? Math.max(0, Math.min(settlementDays / periodDays, 0.999999)) : 0;
  const pricing = priceFromYield(couponPct, ytmPct, maturityYears, freq, face, settlementFraction);
  const cleanPrice = pricing.cleanPrice;
  const dirtyPrice = pricing.dirtyPrice;
  const accruedInterest = pricing.accruedInterest;

  const n = Math.max(1, Math.round(maturityYears * freq));
  const c = ((couponPct / 100) * face) / freq;
  const y = (ytmPct / 100) / freq;
  const f = settlementFraction;

  // Duration & Convexity calculated against dirty price (actual cash outflow)
  let weightedTime = 0;
  let weightedConvexityTime = 0;
  const cashflows = [];

  for (let t = 1; t <= n; t++) {
    const isMaturity = t === n;
    const cash = isMaturity ? c + face : c;
    const df = Math.pow(1 + y, t - f);
    const pv = cash / df;
    const timeYears = (t - f) / freq;

    weightedTime += timeYears * pv;
    weightedConvexityTime += ((t - f) * (t - f + 1) / (freq * freq)) * (cash / Math.pow(1 + y, t - f + 2));

    cashflows.push({
      period: t,
      timeYears: Number(timeYears.toFixed(2)),
      cashflow: Number(cash.toFixed(2)),
      pv: Number(pv.toFixed(2)),
      df: Number((1 / df).toFixed(4)),
    });
  }

  const macaulayDuration = dirtyPrice > 0 ? weightedTime / dirtyPrice : 0;
  const modifiedDuration = macaulayDuration / (1 + y);
  const convexity = dirtyPrice > 0 ? weightedConvexityTime / dirtyPrice : 0;
  const dv01 = (modifiedDuration * dirtyPrice * 0.0001); // Dollar value of 1 bp
  const currentYield = cleanPrice > 0 ? ((couponPct * face) / cleanPrice) : 0;

  // Rate shock scenarios (-200bp to +200bp)
  const shocksBp = [-200, -100, -50, -25, 0, 25, 50, 100, 200];
  const scenarios = shocksBp.map((bp) => {
    const shockedYtm = ytmPct + bp / 100;
    const newPrice = priceFromYield(couponPct, shockedYtm, maturityYears, freq, face, settlementFraction).cleanPrice;
    const pnl = newPrice - cleanPrice;
    const pnlPct = cleanPrice > 0 ? (pnl / cleanPrice) * 100 : 0;
    return {
      bp,
      shockedYtm: Number(shockedYtm.toFixed(3)),
      newPrice: Number(newPrice.toFixed(3)),
      pnl: Number(pnl.toFixed(3)),
      pnlPct: Number(pnlPct.toFixed(2)),
    };
  });

  return {
    inputs: {
      couponPct,
      ytmPct,
      maturityYears,
      freq,
      face,
      settlementDays,
      periodDays,
      settlementFraction: Number(settlementFraction.toFixed(4)),
    },
    pricing: {
      cleanPrice: Number(cleanPrice.toFixed(3)),
      dirtyPrice: Number(dirtyPrice.toFixed(3)),
      accruedInterest: Number(accruedInterest.toFixed(3)),
      currentYield: Number(currentYield.toFixed(2)),
      macaulayDuration: Number(macaulayDuration.toFixed(2)),
      modifiedDuration: Number(modifiedDuration.toFixed(2)),
      convexity: Number(convexity.toFixed(2)),
      dv01: Number(dv01.toFixed(4)),
    },
    conventions: {
      compounding: "Semi-annual periodic compounding (US Treasury standard)",
      dayCount: "Actual/Actual or 30/360 day-count convention",
      settlement: settlementDays > 0 ? `${settlementDays}/${periodDays} days into period` : "On coupon date (clean = dirty)",
    },
    scenarios,
    cashflows: cashflows.slice(0, 24),
  };
}

export default async function (query = {}) {
  const coupon = query.coupon !== undefined ? Number(query.coupon) : 4.5;
  const ytm = query.ytm !== undefined ? Number(query.ytm) : 4.65;
  const maturity = query.maturity !== undefined ? Number(query.maturity) : 10;
  const freq = query.freq !== undefined ? Number(query.freq) : 2;
  const face = query.face !== undefined ? Number(query.face) : 100;
  const settlementDays = query.settlementDays !== undefined ? Number(query.settlementDays) : 0;

  const result = bondAnalytics(coupon, ytm, maturity, freq, face, settlementDays);

  return {
    ...result,
    benchmarks: [
      { name: "US Treasury 2Y", coupon: 4.25, maturity: 2, ytm: 4.82, note: "Static benchmark reference" },
      { name: "US Treasury 5Y", coupon: 4.125, maturity: 5, ytm: 4.95, note: "Static benchmark reference" },
      { name: "US Treasury 10Y Benchmark", coupon: 4.5, maturity: 10, ytm: 5.12, note: "Static benchmark reference" },
      { name: "US Treasury 30Y Long Bond", coupon: 4.625, maturity: 30, ytm: 5.48, note: "Static benchmark reference" },
    ],
    source: "Fixed income analytical models based on US Treasury conventions. Clean and dirty pricing with accrued interest.",
  };
}
