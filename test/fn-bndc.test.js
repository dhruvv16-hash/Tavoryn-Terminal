import { test } from 'node:test';
import assert from 'node:assert/strict';
import bndc, { priceFromYield, yieldFromPrice, bondAnalytics } from '../lib/fn/bndc.js';

test('bond pricing: par bond yields par price', () => {
  const p = priceFromYield(5.0, 5.0, 10, 2, 100);
  assert.ok(Math.abs(p.cleanPrice - 100.0) < 1e-4, `Expected 100.0, got ${p.cleanPrice}`);
  assert.equal(p.cleanPrice, p.dirtyPrice);
  assert.equal(p.accruedInterest, 0);
});

test('bond pricing: clean vs dirty price with accrued interest', () => {
  // 6% coupon semi-annual = $3 per period on 100 par.
  // 45 days into a 180-day period = 25% of period.
  // Accrued interest = 0.25 * 3 = $0.75.
  const pricing = priceFromYield(6.0, 5.0, 5, 2, 100, 45 / 180);
  assert.ok(Math.abs(pricing.accruedInterest - 0.75) < 1e-4, `Expected AI 0.75, got ${pricing.accruedInterest}`);
  assert.ok(pricing.dirtyPrice > pricing.cleanPrice);
  assert.ok(Math.abs((pricing.dirtyPrice - pricing.cleanPrice) - pricing.accruedInterest) < 1e-4);
});

test('bond pricing: zero-coupon bond analytic pricing and round-trip', () => {
  const ytm = 4.5;
  const maturity = 5;
  const pricing = priceFromYield(0, ytm, maturity, 2, 100);
  // Zero coupon: P = 100 / (1 + y/2)^(2 * mat)
  const expectedP = 100 / Math.pow(1 + 0.045 / 2, 10);
  assert.ok(Math.abs(pricing.cleanPrice - expectedP) < 1e-4);

  // Closed-form analytic YTM solver round-trip
  const solvedYtm = yieldFromPrice(0, pricing.cleanPrice, maturity, 2, 100);
  assert.ok(Math.abs(solvedYtm - ytm) < 1e-4, `Expected ${ytm}, got ${solvedYtm}`);
});

test('bond yield solver: round-trips price and yield for coupon bonds', () => {
  const coupon = 4.5;
  const initialYtm = 4.85;
  const pricing = priceFromYield(coupon, initialYtm, 10, 2, 100);
  const solvedYtm = yieldFromPrice(coupon, pricing.cleanPrice, 10, 2, 100);
  assert.ok(Math.abs(solvedYtm - initialYtm) < 1e-4, `Expected ${initialYtm}, got ${solvedYtm}`);
});

test('bond analytics: finite-difference validation of duration, convexity, and dv01', () => {
  const coupon = 5.0;
  const ytm = 4.5;
  const maturity = 10;
  const freq = 2;
  const face = 100;

  const analytics = bondAnalytics(coupon, ytm, maturity, freq, face);
  const P0 = analytics.pricing.dirtyPrice;
  const dyDur = 0.0001; // 1 bp for first derivative / duration & DV01
  const dyConv = 0.005;  // 50 bp for second derivative / convexity to prevent floating-point catastrophic cancellation

  const pUpDur = priceFromYield(coupon, ytm + (dyDur * 100), maturity, freq, face).dirtyPrice;
  const pDownDur = priceFromYield(coupon, ytm - (dyDur * 100), maturity, freq, face).dirtyPrice;

  // Numerical Modified Duration: -(P_up - P_down) / (2 * P0 * dy)
  const numericalModDur = -(pUpDur - pDownDur) / (2 * P0 * dyDur);
  assert.ok(
    Math.abs(analytics.pricing.modifiedDuration - numericalModDur) < 0.05,
    `Mod duration ${analytics.pricing.modifiedDuration} vs numerical ${numericalModDur}`,
  );

  // Numerical Convexity: (P_up - 2*P0 + P_down) / (P0 * dy^2)
  const pUpConv = priceFromYield(coupon, ytm + (dyConv * 100), maturity, freq, face).dirtyPrice;
  const pDownConv = priceFromYield(coupon, ytm - (dyConv * 100), maturity, freq, face).dirtyPrice;
  const numericalConvexity = (pUpConv - 2 * P0 + pDownConv) / (P0 * dyConv * dyConv);
  assert.ok(
    Math.abs(analytics.pricing.convexity - numericalConvexity) < 1.0,
    `Convexity ${analytics.pricing.convexity} vs numerical ${numericalConvexity}`,
  );

  // Numerical DV01: P0 - P_up
  const numericalDv01 = P0 - pUpDur;
  assert.ok(
    Math.abs(analytics.pricing.dv01 - numericalDv01) < 0.001,
    `DV01 ${analytics.pricing.dv01} vs numerical ${numericalDv01}`,
  );
});

test('bond analytics: rate shock scenarios and input validation', () => {
  const analytics = bondAnalytics(5.0, 5.0, 10, 2, 100);
  assert.equal(analytics.scenarios.length, 9);
  const base = analytics.scenarios.find((s) => s.bp === 0);
  assert.equal(base.pnl, 0);

  // Input validation
  assert.throws(() => priceFromYield(5, 5, -1), /Maturity must be positive/);
  assert.throws(() => yieldFromPrice(5, -100, 10), /Target bond price must be positive/);
});

test('bndc default endpoint handler returns expected structure', async () => {
  const res = await bndc({ settlementDays: 30 });
  assert.ok(res.pricing);
  assert.ok(res.pricing.accruedInterest > 0);
  assert.ok(res.scenarios);
  assert.ok(res.cashflows);
  assert.ok(res.benchmarks);
  assert.ok(res.source.includes('Fixed income analytical models'));
});
