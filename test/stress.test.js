import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateHoldingShock,
  stressPortfolio,
  HISTORICAL_SCENARIOS,
  MACRO_FACTOR_SHOCKS,
  BENCHMARK_PORTFOLIO,
} from "../lib/fn/stress.js";

// 1. Portfolio with known holdings and manually calculated scenario losses
test("1. Manually calculated portfolio stress test scenario loss", () => {
  const gfc = HISTORICAL_SCENARIOS.find((s) => s.id === "gfc_2008");
  assert.ok(gfc);

  // Exact known portfolio:
  // Position 1: $100,000 SPY (Index, shock = -50%) -> Stressed = $50,000, Loss = -$50,000
  // Position 2: $50,000 TLT (Rates / Treasury, shock = +15%) -> Stressed = $57,500, Gain = +$7,500
  // Position 3: $50,000 USD (Cash, shock = 0%) -> Stressed = $50,000, Loss = $0
  // Total Value = $200,000
  // Stressed Total Value = $50,000 + $57,500 + $50,000 = $157,500
  // Total Dollar Loss = -$42,500
  // Total Drawdown Pct = (-42,500 / 200,000) * 100 = -21.25%
  const portfolio = {
    totals: { value: 200000 },
    holdings: [
      { sec: "SPY US EQUITY", ticker: "SPY", value: 100000, beta: 1.0, sector: "Index" },
      { sec: "TLT US EQUITY", ticker: "TLT", value: 50000, beta: -0.2, sector: "Treasury" },
      { sec: "USD CASH", ticker: "USD", value: 50000, beta: 0.0, sector: "Cash" },
    ],
  };

  const res = stressPortfolio(portfolio, [gfc]);
  const gfcRes = res.scenarioResults[0];

  assert.equal(gfcRes.stressedTotalValue, 157500);
  assert.equal(gfcRes.totalDollarLoss, -42500);
  assert.equal(gfcRes.totalDrawdownPct, -21.25);
});

// 2. Equal-weight and unequal-weight portfolios
test("2. Equal vs unequal weighting impacts scenario drawdown", () => {
  const dotcom = HISTORICAL_SCENARIOS.find((s) => s.id === "dotcom_2000");

  // Portfolio A: 90% Tech ($90k), 10% Gold ($10k)
  const heavyTech = {
    totals: { value: 100000 },
    holdings: [
      { sec: "QQQ", ticker: "QQQ", value: 90000, beta: 1.2, sector: "Technology" },
      { sec: "GLD", ticker: "GLD", value: 10000, beta: 0.1, sector: "Commodity", kind: "CMDTY" },
    ],
  };

  // Portfolio B: 10% Tech ($10k), 90% Gold ($90k)
  const heavyGold = {
    totals: { value: 100000 },
    holdings: [
      { sec: "QQQ", ticker: "QQQ", value: 10000, beta: 1.2, sector: "Technology" },
      { sec: "GLD", ticker: "GLD", value: 90000, beta: 0.1, sector: "Commodity", kind: "CMDTY" },
    ],
  };

  const resA = stressPortfolio(heavyTech, [dotcom]);
  const resB = stressPortfolio(heavyGold, [dotcom]);

  assert.ok(
    Math.abs(resA.scenarioResults[0].totalDollarLoss) > Math.abs(resB.scenarioResults[0].totalDollarLoss),
    "Heavy tech portfolio must suffer substantially larger drawdown in Dot-com crash"
  );
});

// 3. Short position mathematics, underlying decline/increase, extreme bounds, and accounting identities
test("3. Short positions gain value and reduce portfolio drawdown during market crashes", () => {
  const gfc = HISTORICAL_SCENARIOS.find((s) => s.id === "gfc_2008");

  // 3a. Short position with a 50% underlying decline
  // Initial liability V = -$10,000, underlying return r = -0.50
  // Stressed liability V_stressed = -$10,000 * (1 - 0.50) = -$5,000
  // Change in position value deltaV = -$5,000 - (-$10,000) = +$5,000 (gain)
  const shortDecline = {
    totals: { value: -10000 },
    holdings: [{ sec: "SPY SHORT", ticker: "SPY", value: -10000, beta: 1.0, sector: "Index" }],
  };
  const resDecline = stressPortfolio(shortDecline, [{ id: "drop50", name: "50% Drop", marketShock: -0.50 }]);
  const sResDecline = resDecline.scenarioResults[0];
  assert.equal(sResDecline.stressedTotalValue, -5000);
  assert.equal(sResDecline.totalDollarLoss, 5000, "50% drop must yield +$5,000 gain for short");
  assert.equal(sResDecline.reconciles, true);

  // 3b. Short position with a 50% underlying increase
  // Initial liability V = -$10,000, underlying return r = +0.50
  // Stressed liability V_stressed = -$10,000 * (1 + 0.50) = -$15,000
  // Change in position value deltaV = -$15,000 - (-$10,000) = -$5,000 (loss)
  const resIncrease = stressPortfolio(shortDecline, [{ id: "up50", name: "50% Rally", marketShock: 0.50 }]);
  const sResIncrease = resIncrease.scenarioResults[0];
  assert.equal(sResIncrease.stressedTotalValue, -15000);
  assert.equal(sResIncrease.totalDollarLoss, -5000, "50% rally must yield -$5,000 loss for short");
  assert.equal(sResIncrease.reconciles, true);

  // 3c. Underlying decline approaching 100% and exactly 100% (wipeout)
  const resWipeout = stressPortfolio(shortDecline, [
    { id: "drop99", name: "99.99% Drop", marketShock: -0.9999 },
    { id: "drop100", name: "100% Drop", marketShock: -1.00 },
  ]);
  const s99 = resWipeout.scenarioResults[0];
  assert.ok(Math.abs(s99.stressedTotalValue - (-1.00)) < 1e-4);
  assert.ok(Math.abs(s99.totalDollarLoss - 9999.00) < 1e-4);
  const s100 = resWipeout.scenarioResults[1];
  assert.equal(s100.stressedTotalValue, 0);
  assert.equal(s100.totalDollarLoss, 10000, "100% drop extinguishes liability, max gain $10,000");

  // 3d. Underlying decline below -100% (e.g. -150% shock)
  // For limited-liability cash assets, price cannot be negative (clamped at 0)
  const resSub100 = stressPortfolio(shortDecline, [{ id: "drop150", name: "150% Drop", marketShock: -1.50 }]);
  const s150 = resSub100.scenarioResults[0];
  assert.equal(s150.stressedTotalValue, 0);
  assert.equal(s150.totalDollarLoss, 10000, "Price non-negativity caps short gain at 100% of liability");

  // 3e. Long and short positions in the same instrument
  const paired = {
    totals: { value: 0 },
    // Need non-zero totalValue or explicit holdings for stressPortfolio
  };
  const pairedHoldings = {
    totals: { value: 1e-9 }, // epsilon to pass non-zero check
    holdings: [
      { sec: "SPY LONG", ticker: "SPY", value: 10000, beta: 1.0, sector: "Index" },
      { sec: "SPY SHORT", ticker: "SPY", value: -10000, beta: 1.0, sector: "Index" },
    ],
  };
  const resPaired = stressPortfolio(pairedHoldings, [{ id: "drop30", name: "30% Drop", marketShock: -0.30 }]);
  const sPaired = resPaired.scenarioResults[0];
  assert.ok(Math.abs(sPaired.stressedTotalValue) < 1e-4, "Net stressed value must be 0");
  assert.ok(Math.abs(sPaired.totalDollarLoss) < 1e-4, "Net P&L must be 0 for perfectly paired long/short");

  // 3f. Hedged portfolio with known holdings and manually calculated net P&L
  // Long $100,000 SPY (beta 1.0, shock -50% -> stressed $50,000, loss -$50,000)
  // Short -$40,000 QQQ (tech shock -60% -> stressed -$16,000, gain +$24,000)
  // Cash $20,000 USD (beta 0.0, shock 0% -> stressed $20,000, P&L $0)
  // Starting Value = $80,000
  // Stressed Value = $50,000 - $16,000 + $20,000 = $54,000
  // Net P&L = -$50,000 + $24,000 + $0 = -$26,000
  // Drawdown on net equity = (-26,000 / 80,000) * 100 = -32.50%
  const hedgedPort = {
    totals: { value: 80000 },
    holdings: [
      { sec: "SPY US", ticker: "SPY", value: 100000, beta: 1.0, kind: "INDEX" },
      { sec: "QQQ SHORT", ticker: "QQQ", value: -40000, beta: 1.0, sector: "tech" },
      { sec: "USD CASH", ticker: "USD", value: 20000, beta: 0.0, kind: "CASH" },
    ],
  };
  const customCrash = {
    id: "custom_gfc",
    name: "Custom GFC Proxy",
    marketShock: -0.50,
    techShock: -0.60,
  };
  const resHedged = stressPortfolio(hedgedPort, [customCrash]);
  const sHedged = resHedged.scenarioResults[0];
  assert.equal(sHedged.startingValue, 80000);
  assert.equal(sHedged.stressedTotalValue, 54000);
  assert.equal(sHedged.totalDollarLoss, -26000);
  assert.equal(sHedged.totalDrawdownPct, -32.5);
  assert.equal(sHedged.reconciles, true);

  // 3g. Unhedged vs Hedged comparison under 2008 GFC
  const unhedged = {
    totals: { value: 100000 },
    holdings: [{ sec: "SPY", ticker: "SPY", value: 100000, beta: 1.0, sector: "Index" }],
  };
  const resUnhedged = stressPortfolio(unhedged, [gfc]);
  assert.equal(resUnhedged.scenarioResults[0].totalDollarLoss, -50000);
});

// 4. Cash and USD holdings have zero beta shock
test("4. Cash holdings preserve 100% of value across market shocks", () => {
  const covid = HISTORICAL_SCENARIOS.find((s) => s.id === "covid_2020");
  const cashHolding = { sec: "USD CASH", ticker: "USD", value: 100000, sector: "Cash" };
  const shock = calculateHoldingShock(cashHolding, covid);
  assert.equal(shock, 0.0, "Cash holding shock must be exactly 0.0");
});

// 5. Missing or stale prices / malformed entries
test("5. Malformed holding values or betas default safely", () => {
  const gfc = HISTORICAL_SCENARIOS.find((s) => s.id === "gfc_2008");
  const malformed = {
    totals: { value: 50000 },
    holdings: [
      { sec: "UNKNOWN", ticker: "UNKNOWN", value: 50000, beta: null, sector: null },
    ],
  };
  const res = stressPortfolio(malformed, [gfc]);
  assert.ok(Number.isFinite(res.scenarioResults[0].totalDollarLoss));
  assert.ok(res.scenarioResults[0].totalDollarLoss < 0);
});

// 6. Empty and zero-value portfolios
test("6. Empty portfolio produces clear zero-drawdown structure", () => {
  const empty = { totals: { value: 0 }, holdings: [] };
  const res = stressPortfolio(empty, HISTORICAL_SCENARIOS);
  assert.equal(res.totalValue, 0);
  assert.equal(res.scenarioResults.length, 0);
  assert.equal(res.vulnerabilities.length, 0);
});

// 7. Benchmark portfolio structure
test("7. Institutional benchmark portfolio has valid multi-asset allocation", () => {
  assert.equal(BENCHMARK_PORTFOLIO.length, 5);
  const tickers = BENCHMARK_PORTFOLIO.map((h) => h.sec);
  assert.ok(tickers.some((t) => t.includes("SPY")));
  assert.ok(tickers.some((t) => t.includes("QQQ")));
  assert.ok(tickers.some((t) => t.includes("TLT")));
  assert.ok(tickers.some((t) => t.includes("GLD")));
  assert.ok(tickers.some((t) => t.includes("BTC")));
});

// 8. All 8 historical crisis scenarios exist and have negative equity shocks
test("8. Complete inventory of 8 historical crisis scenarios", () => {
  assert.equal(HISTORICAL_SCENARIOS.length, 8);
  for (const scen of HISTORICAL_SCENARIOS) {
    assert.ok(scen.id, "Scenario must have an ID");
    assert.ok(scen.name, "Scenario must have a Name");
    assert.ok(scen.period, "Scenario must have a Period");
    assert.ok(scen.type === "historical_proxy", "Type must be historical_proxy");
    assert.ok(scen.marketShock < 0, "Historical equity market shock must be negative");
    assert.ok(scen.source, "Must have an authoritative source");
    assert.ok(scen.limitations, "Must disclose limitations");
  }
});

// 9. Hypothetical macro factor shocks exist and have documented transmission channels
test("9. Complete inventory of 4 macroeconomic factor shocks", () => {
  assert.equal(MACRO_FACTOR_SHOCKS.length, 4);
  for (const shock of MACRO_FACTOR_SHOCKS) {
    assert.ok(shock.id);
    assert.ok(shock.name);
    assert.ok(shock.type === "macro_hypothetical");
    assert.ok(shock.description);
    assert.ok(shock.limitations);
  }
});

// 10. Asset-specific shock mapping
test("10. Sector and asset-specific shock differentiation", () => {
  const gfc = HISTORICAL_SCENARIOS.find((s) => s.id === "gfc_2008");

  const bankHolding = { sec: "JPM", ticker: "JPM", beta: 1.2, sector: "Financial Services" };
  const bondHolding = { sec: "TLT", ticker: "TLT", beta: -0.2, sector: "Treasury" };
  const cryptoHolding = { sec: "BTC", ticker: "BTC", beta: 1.5, crypto: true };

  const bankShock = calculateHoldingShock(bankHolding, gfc);
  const bondShock = calculateHoldingShock(bondHolding, gfc);
  const cryptoShock = calculateHoldingShock(cryptoHolding, gfc);

  // In 2008 GFC, bank shock should be severe (-75% or beta-scaled)
  assert.ok(bankShock < -0.50, "Bank holding shock should be severe in GFC");
  // Treasuries rallied in 2008 GFC (+15%)
  assert.ok(bondShock > 0, "Treasuries should have positive shock in GFC flight-to-safety");
  // Crypto shock should be -70%
  assert.equal(cryptoShock, -0.70);
});

// 11. Exposure and vulnerability rankings
test("11. Vulnerability ranking orders holdings from greatest to smallest dollar loss", () => {
  const gfc = HISTORICAL_SCENARIOS.find((s) => s.id === "gfc_2008");
  const portfolio = {
    totals: { value: 300000 },
    holdings: [
      { sec: "SMALL_TECH", ticker: "ST", value: 50000, beta: 1.2, sector: "Technology" },
      { sec: "GIANT_BANK", ticker: "GB", value: 200000, beta: 1.5, sector: "Financial Services" },
      { sec: "BOND", ticker: "BD", value: 50000, beta: -0.1, sector: "Treasury" },
    ],
  };

  const res = stressPortfolio(portfolio, [gfc]);
  const vulns = res.vulnerabilities;

  assert.equal(vulns.length, 3);
  // Index 0 must be GIANT_BANK (largest dollar loss)
  assert.equal(vulns[0].ticker, "GB");
  assert.ok(vulns[0].worstLoss < vulns[1].worstLoss);
});

// 12. Mathematical repeatability
test("12. Stress calculations are strictly deterministic and idempotent", () => {
  const portfolio = {
    totals: { value: 100000 },
    holdings: [
      { sec: "AAPL", ticker: "AAPL", value: 60000, beta: 1.2, sector: "Technology" },
      { sec: "SPY", ticker: "SPY", value: 40000, beta: 1.0, sector: "Index" },
    ],
  };

  const run1 = stressPortfolio(portfolio, HISTORICAL_SCENARIOS);
  const run2 = stressPortfolio(portfolio, HISTORICAL_SCENARIOS);

  assert.deepEqual(run1, run2, "Repeated calculations must produce byte-identical JSON outputs");
});
