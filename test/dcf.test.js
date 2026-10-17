import test from "node:test";
import assert from "node:assert/strict";
import { calculateDCF, parseNum } from "../lib/fn/dcf.js";

// 1. Manually verified valuation example
test("1. Manually verified DCF benchmark example", () => {
  // Input parameters:
  // Base FCF = $100M
  // 5-year growth = 10%
  // WACC = 10% (0.10)
  // Terminal growth = 3% (0.03)
  // Cash = $50M, Debt = $150M -> Net Debt = $100M
  // Shares = 50M, Current Price = $40.00
  const result = calculateDCF({
    currentPrice: 40,
    sharesOutstanding: 50,
    baseFCF: 100,
    growthRate: 0.10,
    wacc: 0.10,
    terminalGrowthRate: 0.03,
    projectionYears: 5,
    cashAndEquivalents: 50,
    totalDebt: 150,
  });

  // Hand calculations:
  // Year 1: FCF = 100 * 1.10 = 110.00; PV = 110 / 1.10 = 100.00
  // Year 2: FCF = 110 * 1.10 = 121.00; PV = 121 / (1.10)^2 = 100.00
  // Year 3: FCF = 121 * 1.10 = 133.10; PV = 133.10 / (1.10)^3 = 100.00
  // Year 4: FCF = 133.10 * 1.10 = 146.41; PV = 146.41 / (1.10)^4 = 100.00
  // Year 5: FCF = 146.41 * 1.10 = 161.051; PV = 161.051 / (1.10)^5 = 100.00
  // Sum PV of 5-year FCF = exactly 500.00
  assert.equal(result.projections.length, 5);
  for (let i = 0; i < 5; i++) {
    assert.ok(Math.abs(result.projections[i].pv - 100.0) < 1e-4, `Year ${i + 1} PV should be exactly 100.00`);
  }
  assert.ok(Math.abs(result.pvOfProjections - 500.0) < 1e-4, "Sum of PV(FCF) should be 500.00");

  // Terminal Value:
  // TV = FCF_5 * (1 + g) / (WACC - g) = 161.051 * 1.03 / (0.10 - 0.03) = 165.88253 / 0.07 = 2369.750428
  const expectedTV = (161.051 * 1.03) / 0.07;
  assert.ok(Math.abs(result.terminalValue - expectedTV) < 1e-3, "Terminal value matches Gordon Growth formula");

  // PV of Terminal Value:
  // PV(TV) = 2369.750428 / (1.10)^5 = 2369.750428 / 1.61051 = 1471.428571
  const expectedPvTV = expectedTV / Math.pow(1.10, 5);
  assert.ok(Math.abs(result.pvOfTerminalValue - expectedPvTV) < 1e-3, "PV of TV discounted correctly");

  // Enterprise Value:
  // EV = 500.00 + 1471.428571 = 1971.428571
  const expectedEV = 500.0 + expectedPvTV;
  assert.ok(Math.abs(result.enterpriseValue - expectedEV) < 1e-3, "EV is PV(FCF) + PV(TV)");

  // Equity Value:
  // Equity Value = EV - Net Debt = 1971.428571 - (150 - 50) = 1971.428571 - 100 = 1871.428571
  const expectedEquity = expectedEV - 100.0;
  assert.ok(Math.abs(result.equityValue - expectedEquity) < 1e-3, "Equity Value reconciled with net debt");

  // Intrinsic Value Per Share:
  // Per share = 1871.428571 / 50 = $37.428571
  const expectedPerShare = expectedEquity / 50;
  assert.ok(Math.abs(result.intrinsicValuePerShare - expectedPerShare) < 1e-3, "Per-share value exact");

  // Margin of Safety:
  // MoS = (37.428571 - 40) / 40 = -2.571429 / 40 = -6.42857% (Overvalued by 6.43%)
  const expectedMoS = ((expectedPerShare - 40) / 40) * 100;
  assert.ok(Math.abs(result.marginOfSafetyPct - expectedMoS) < 1e-3, "Margin of safety exact");
});

// 2. Terminal-value calculations
test("2. Terminal Value Gordon Growth edge cases", () => {
  // Test varying terminal growth rates
  const base = calculateDCF({ currentPrice: 50, sharesOutstanding: 10, baseFCF: 20, wacc: 0.08, terminalGrowthRate: 0.02 });
  const higherTg = calculateDCF({ currentPrice: 50, sharesOutstanding: 10, baseFCF: 20, wacc: 0.08, terminalGrowthRate: 0.03 });
  assert.ok(higherTg.terminalValue > base.terminalValue, "Higher terminal growth must produce higher terminal value");
});

// 3. Enterprise-to-equity-value reconciliation
test("3. Enterprise to Equity value bridge reconciliation", () => {
  const zeroDebt = calculateDCF({ currentPrice: 50, sharesOutstanding: 10, baseFCF: 10, totalDebt: 0, cashAndEquivalents: 0 });
  assert.equal(zeroDebt.enterpriseValue, zeroDebt.equityValue, "When Debt=0 and Cash=0, EV must equal Equity Value");

  const withCash = calculateDCF({ currentPrice: 50, sharesOutstanding: 10, baseFCF: 10, totalDebt: 0, cashAndEquivalents: 100 });
  assert.equal(withCash.equityValue, withCash.enterpriseValue + 100, "Cash must add directly to Equity Value");

  const withDebt = calculateDCF({ currentPrice: 50, sharesOutstanding: 10, baseFCF: 10, totalDebt: 100, cashAndEquivalents: 0 });
  assert.equal(withDebt.equityValue, withDebt.enterpriseValue - 100, "Debt must subtract directly from Equity Value");
});

// 4. Per-share calculations
test("4. Diluted per-share calculations scale linearly with share count", () => {
  const r100 = calculateDCF({ currentPrice: 50, sharesOutstanding: 100, baseFCF: 50 });
  const r200 = calculateDCF({ currentPrice: 50, sharesOutstanding: 200, baseFCF: 50 });
  assert.ok(Math.abs(r100.intrinsicValuePerShare - 2 * r200.intrinsicValuePerShare) < 1e-4, "Doubling shares must halve intrinsic value per share");
});

// 5. WACC less than, equal to, and greater than terminal growth
test("5. WACC vs Terminal Growth boundary conditions", () => {
  // WACC > Terminal Growth (valid valuation)
  const normal = calculateDCF({ baseFCF: 10, wacc: 0.08, terminalGrowthRate: 0.025 });
  assert.equal(normal.isValid, true);
  assert.equal(normal.error, null);
  assert.ok(normal.terminalValue > 0);
  assert.ok(normal.intrinsicValuePerShare > 0);
  assert.equal(normal.inputs.spreadWarning, null);

  // WACC == Terminal Growth (strictly invalid, Gordon Growth denominator = 0)
  const equal = calculateDCF({ baseFCF: 10, wacc: 0.03, terminalGrowthRate: 0.03 });
  assert.equal(equal.isValid, false);
  assert.equal(equal.terminalValue, null);
  assert.equal(equal.pvOfTerminalValue, null);
  assert.equal(equal.enterpriseValue, null);
  assert.equal(equal.intrinsicValuePerShare, null);
  assert.equal(equal.marginOfSafetyPct, null);
  assert.ok(/must be strictly greater/i.test(equal.error));

  // WACC < Terminal Growth (strictly invalid, perpetual growth cannot exceed cost of capital)
  const inverted = calculateDCF({ baseFCF: 10, wacc: 0.02, terminalGrowthRate: 0.04 });
  assert.equal(inverted.isValid, false);
  assert.equal(inverted.terminalValue, null);
  assert.equal(inverted.pvOfTerminalValue, null);
  assert.equal(inverted.enterpriseValue, null);
  assert.equal(inverted.intrinsicValuePerShare, null);
  assert.equal(inverted.marginOfSafetyPct, null);
  assert.ok(/must be strictly greater/i.test(inverted.error));

  // WACC barely above Terminal Growth (valid but triggers sensitivity warning when spread < 1%)
  const barely = calculateDCF({ baseFCF: 10, wacc: 0.035, terminalGrowthRate: 0.03 });
  assert.equal(barely.isValid, true);
  assert.ok(barely.terminalValue > 0);
  assert.ok(barely.intrinsicValuePerShare > 0);
  assert.ok(barely.inputs.spreadWarning != null, "Spread < 1% must trigger sensitivity warning disclosure");
  assert.ok(/within 1\.0%/i.test(barely.inputs.spreadWarning));

  // Explicit discounting consistency: confirm actual supplied WACC is used
  const wacc = 0.07;
  const consistent = calculateDCF({ baseFCF: 20, wacc, terminalGrowthRate: 0.02, projectionYears: 3 });
  assert.equal(consistent.isValid, true);
  for (let y = 0; y < 3; y++) {
    const expectedDf = 1 / Math.pow(1 + wacc, y + 1);
    assert.ok(Math.abs(consistent.projections[y].discountFactor - expectedDf) < 1e-6);
  }
  const expectedPvTV = consistent.terminalValue / Math.pow(1 + wacc, 3);
  assert.ok(Math.abs(consistent.pvOfTerminalValue - expectedPvTV) < 1e-4);
});

// 6. Missing, zero, negative, and non-finite inputs
test("6. Non-finite, missing, and negative input resilience", () => {
  const result = calculateDCF({
    currentPrice: NaN,
    sharesOutstanding: null,
    baseFCF: undefined,
    growthRate: Infinity,
    wacc: -0.5,
  });
  // WACC = -0.5 is <= default terminal growth 0.025, so it must safely return invalid
  assert.equal(result.isValid, false);
  assert.equal(result.intrinsicValuePerShare, null);
  assert.ok(result.error);
});

// 7. Missing cash, debt, or share-count fields
test("7. Missing capital structure fields default safely", () => {
  const res = calculateDCF({
    currentPrice: 100,
    baseFCF: 20,
    wacc: 0.09,
    terminalGrowthRate: 0.025,
    // totalDebt and cashAndEquivalents omitted
  });
  assert.equal(res.inputs.totalDebt, 0);
  assert.equal(res.inputs.cashAndEquivalents, 0);
  assert.equal(res.inputs.netDebt, 0);
  assert.equal(res.enterpriseValue, res.equityValue);
});

// 8. Scenario separation
test("8. Conservative, Base, and Optimistic scenario hierarchy", () => {
  const base = calculateDCF({ baseFCF: 50, growthRate: 0.08, wacc: 0.09, terminalGrowthRate: 0.025 });
  const conservative = calculateDCF({ baseFCF: 50, growthRate: 0.06, wacc: 0.10, terminalGrowthRate: 0.02 });
  const optimistic = calculateDCF({ baseFCF: 50, growthRate: 0.10, wacc: 0.08, terminalGrowthRate: 0.03 });

  assert.ok(conservative.intrinsicValuePerShare < base.intrinsicValuePerShare, "Conservative intrinsic value must be less than base");
  assert.ok(base.intrinsicValuePerShare < optimistic.intrinsicValuePerShare, "Base intrinsic value must be less than optimistic");
});

// 9. Sensitivity-matrix correctness and invalid cell marking
test("9. 5x5 Sensitivity Matrix structure, invalid cell handling, and monotonicity", () => {
  const res = calculateDCF({ baseFCF: 30, wacc: 0.09, terminalGrowthRate: 0.025 });
  const { matrix, waccSteps, tgSteps } = res.sensitivity;

  assert.equal(waccSteps.length, 5);
  assert.equal(tgSteps.length, 5);
  assert.equal(matrix.length, 5);
  assert.equal(matrix[0].length, 5);

  // Check that any cell with WACC <= TG is marked invalid with null intrinsicValue
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const cell = matrix[r][c];
      if (cell.wacc <= cell.terminalGrowth) {
        assert.equal(cell.isValid, false, `Cell (${r}, ${c}) with WACC <= TG must be invalid`);
        assert.equal(cell.intrinsicValue, null);
      } else {
        assert.equal(cell.isValid, true);
        assert.ok(cell.intrinsicValue > 0);
      }
    }
  }

  // Check monotonic properties for valid cells across rows and columns
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 4; c++) {
      if (matrix[r][c].isValid && matrix[r][c + 1].isValid) {
        // Across row: higher terminal growth should increase intrinsic value
        assert.ok(matrix[r][c + 1].intrinsicValue >= matrix[r][c].intrinsicValue);
      }
    }
  }
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r < 4; r++) {
      if (matrix[r][c].isValid && matrix[r + 1][c].isValid) {
        // Down column: higher WACC should decrease intrinsic value
        assert.ok(matrix[r + 1][c].intrinsicValue <= matrix[r][c].intrinsicValue);
      }
    }
  }
});

// 10. Negative Free Cash Flow handling
test("10. Negative Free Cash Flow transparently produces negative intrinsic value", () => {
  const burnResult = calculateDCF({
    currentPrice: 20,
    sharesOutstanding: 10,
    baseFCF: -50, // Cash burn of $50M/yr
    growthRate: 0.05,
    wacc: 0.09,
    terminalGrowthRate: 0.02,
  });
  assert.equal(burnResult.inputs.isNegativeFCF, true);
  assert.ok(burnResult.enterpriseValue < 0, "Sustained cash burn must yield negative enterprise value");
  assert.ok(burnResult.intrinsicValuePerShare < 0, "Sustained cash burn must yield negative intrinsic value per share");
  assert.ok(burnResult.marginOfSafetyPct < -100, "Overvaluation must exceed 100%");
});

// 11. ParseNum financial string parser
test("11. parseNum handles currency, commas, percentages, and parentheses", () => {
  assert.equal(parseNum("$1,234.56"), 1234.56);
  assert.equal(parseNum("  (500,000) "), -500000);
  assert.equal(parseNum("25.4%"), 25.4);
  assert.equal(parseNum("N/A"), null);
  assert.equal(parseNum("—"), null);
  assert.equal(parseNum(""), null);
});

// 12. Statement unit scaling and shares provenance invariants
test("12. Financial statement unit scaling and shares derivation invariants", () => {
  // Test unit scaling: Raw Nasdaq statement formatted strings in thousands ($k) scaled to Millions ($M)
  // Raw OCF string from Nasdaq API = "$111,482,000" (which means $111,482,000k = $111.482B)
  const rawOcfStr = "$111,482,000";
  const parsedOcf = parseNum(rawOcfStr);
  assert.equal(parsedOcf, 111482000, "parseNum must strip currency symbols and commas");
  const ocfMillions = parsedOcf / 1000;
  assert.equal(ocfMillions, 111482, "Dividing by 1,000 scales raw thousands to exactly $111,482M");

  // Raw CapEx string from Nasdaq API = "($12,718,000)" or "-$12,718,000"
  const rawCapexStr = "($12,718,000)";
  const parsedCapex = Math.abs(parseNum(rawCapexStr));
  assert.equal(parsedCapex, 12718000, "parseNum must parse parenthesized negatives and take magnitude");
  const capexMillions = parsedCapex / 1000;
  assert.equal(capexMillions, 12718, "Dividing by 1,000 scales CapEx thousands to exactly $12,718M");

  // Normalized Free Cash Flow
  const fcfMillions = ocfMillions - capexMillions;
  assert.equal(fcfMillions, 98764, "FCF must equal OCF minus CapEx ($98,764M)");

  // Test derived diluted shares: Market Cap ($M) / Price ($) = Shares (M)
  // Raw Market Cap string from summary API = "$3,500,000,000,000" ($3.5T in whole dollars)
  const rawMcapStr = "$3,500,000,000,000";
  const mcapDollars = parseNum(rawMcapStr);
  assert.equal(mcapDollars, 3500000000000);
  const sharePrice = 225.0;
  const derivedSharesM = (mcapDollars / 1e6) / sharePrice;
  assert.ok(Math.abs(derivedSharesM - 15555.555555) < 1e-4, "Derived share count in millions must be exact");

  // Evaluate calculateDCF end-to-end with these verified inputs
  const res = calculateDCF({
    currentPrice: sharePrice,
    sharesOutstanding: derivedSharesM,
    baseFCF: fcfMillions,
    growthRate: 0.08,
    wacc: 0.09,
    terminalGrowthRate: 0.025,
  });

  assert.equal(res.isValid, true);
  // Year 1 FCF = 98764 * 1.08 = 106665.12; PV_1 = 106665.12 / 1.09 = 97857.908
  // 5-year sum PV = 480393.74M; TV = 2288379.02M; PV(TV) = 1487289.35M; EV = 1967683.09M
  assert.ok(Math.abs(res.pvOfProjections - 480393.74) < 1.0, `sumPV should be ~480393.74M, got ${res.pvOfProjections}`);
  assert.ok(Math.abs(res.terminalValue - 2288379.02) < 1.0, `TV should be ~2288379.02M, got ${res.terminalValue}`);
  assert.ok(Math.abs(res.pvOfTerminalValue - 1487289.35) < 1.0, `pvTV should be ~1487289.35M, got ${res.pvOfTerminalValue}`);
  assert.ok(Math.abs(res.enterpriseValue - 1967683.09) < 1.0, `EV should be ~1967683M, got ${res.enterpriseValue}`);
  assert.equal(res.equityValue, res.enterpriseValue, "With debt=0 and cash=0, Equity Value equals EV");

  // Per share = 1967683.09 / 15555.56 = $126.494
  assert.ok(Math.abs(res.intrinsicValuePerShare - 126.49) < 0.05, `Intrinsic per share should be ~$126.49, got ${res.intrinsicValuePerShare}`);

  // MoS = (126.494 - 225) / 225 = -43.78%
  assert.ok(Math.abs(res.marginOfSafetyPct - (-43.78)) < 0.05, `MoS should be ~-43.78%, got ${res.marginOfSafetyPct}`);

  // Equity Bridge Verification with Nonzero Balance Sheet Items:
  // Apple reported cash & short term investments = $35,934,000 + $18,763,000 = $54,697M
  // Apple reported short term + long term debt = $20,329,000 + $78,328,000 = $98,657M
  // Net Debt = $98,657M - $54,697M = $43,960M
  const rawCashStr = "$35,934,000";
  const rawShortInvestStr = "$18,763,000";
  const cashMillions = (parseNum(rawCashStr) + parseNum(rawShortInvestStr)) / 1000;
  assert.equal(cashMillions, 54697, "Cash & short-term investments must sum to $54,697M");

  const rawShortDebtStr = "$20,329,000";
  const rawLongDebtStr = "$78,328,000";
  const debtMillions = (parseNum(rawShortDebtStr) + parseNum(rawLongDebtStr)) / 1000;
  assert.equal(debtMillions, 98657, "Total short and long-term debt must sum to $98,657M");

  const resWithNetDebt = calculateDCF({
    currentPrice: sharePrice,
    sharesOutstanding: derivedSharesM,
    baseFCF: fcfMillions,
    growthRate: 0.08,
    wacc: 0.09,
    terminalGrowthRate: 0.025,
    cashAndEquivalents: cashMillions,
    totalDebt: debtMillions,
  });

  assert.equal(resWithNetDebt.inputs.netDebt, 43960, "Net debt must equal Debt minus Cash ($43,960M)");
  assert.ok(Math.abs(resWithNetDebt.enterpriseValue - 1967683.09) < 1.0, "EV is unaffected by capital structure");
  // Equity = EV - Net Debt = 1967683.09 - 43960 = 1923723.09M
  assert.ok(Math.abs(resWithNetDebt.equityValue - 1923723.09) < 1.0, `Equity should be ~1923723.09M, got ${resWithNetDebt.equityValue}`);
  assert.notEqual(resWithNetDebt.equityValue, resWithNetDebt.enterpriseValue, "With nonzero net debt, Equity Value must NOT equal EV");

  // Per share = 1923723.09 / 15555.56 = $123.667
  assert.ok(Math.abs(resWithNetDebt.intrinsicValuePerShare - 123.67) < 0.05, `Intrinsic per share should be ~$123.67, got ${resWithNetDebt.intrinsicValuePerShare}`);

  // MoS = (123.667 - 225) / 225 = -45.04%
  assert.ok(Math.abs(resWithNetDebt.marginOfSafetyPct - (-45.04)) < 0.05, `MoS should be ~-45.04%, got ${resWithNetDebt.marginOfSafetyPct}`);
});

// 13. Metamorphic properties of DCF valuation engine
test("13. Metamorphic properties of DCF valuation engine", () => {
  const baseParams = {
    currentPrice: 100,
    sharesOutstanding: 100,
    baseFCF: 50,
    growthRate: 0.08,
    wacc: 0.09,
    terminalGrowthRate: 0.025,
    projectionYears: 5,
    cashAndEquivalents: 20,
    totalDebt: 40,
  };
  const base = calculateDCF(baseParams);

  // Property 1: Higher forecast growth should increase enterprise value
  const higherGrowth = calculateDCF({ ...baseParams, growthRate: 0.12 });
  assert.ok(
    higherGrowth.enterpriseValue > base.enterpriseValue,
    "Higher growth rate must increase enterprise value",
  );

  // Property 2: Higher WACC should reduce enterprise value
  const higherWacc = calculateDCF({ ...baseParams, wacc: 0.11 });
  assert.ok(
    higherWacc.enterpriseValue < base.enterpriseValue,
    "Higher WACC must reduce enterprise value",
  );

  // Property 3: Additional cash should increase equity value without changing enterprise value
  const moreCash = calculateDCF({ ...baseParams, cashAndEquivalents: baseParams.cashAndEquivalents + 50 });
  assert.equal(
    moreCash.enterpriseValue,
    base.enterpriseValue,
    "Additional cash must NOT change enterprise value",
  );
  assert.equal(
    moreCash.equityValue,
    base.equityValue + 50,
    "Additional cash must increase equity value by exact cash delta",
  );

  // Property 4: Additional debt should reduce equity value without changing enterprise value
  const moreDebt = calculateDCF({ ...baseParams, totalDebt: baseParams.totalDebt + 50 });
  assert.equal(
    moreDebt.enterpriseValue,
    base.enterpriseValue,
    "Additional debt must NOT change enterprise value",
  );
  assert.equal(
    moreDebt.equityValue,
    base.equityValue - 50,
    "Additional debt must reduce equity value by exact debt delta",
  );

  // Property 5: Changing share count should change per-share value without changing enterprise value
  const doubleShares = calculateDCF({ ...baseParams, sharesOutstanding: baseParams.sharesOutstanding * 2 });
  assert.equal(
    doubleShares.enterpriseValue,
    base.enterpriseValue,
    "Doubling shares must NOT change enterprise value",
  );
  assert.equal(
    doubleShares.equityValue,
    base.equityValue,
    "Doubling shares must NOT change equity value",
  );
  assert.ok(
    Math.abs(doubleShares.intrinsicValuePerShare - base.intrinsicValuePerShare / 2) < 1e-4,
    "Doubling shares must halve intrinsic value per share",
  );

  // Property 6: Changing market price should change margin of safety without changing intrinsic value
  const higherPrice = calculateDCF({ ...baseParams, currentPrice: 150 });
  assert.equal(
    higherPrice.intrinsicValuePerShare,
    base.intrinsicValuePerShare,
    "Changing market price must NOT change intrinsic value per share",
  );
  assert.ok(
    higherPrice.marginOfSafetyPct < base.marginOfSafetyPct,
    "Higher market price must reduce margin of safety percentage",
  );
});



