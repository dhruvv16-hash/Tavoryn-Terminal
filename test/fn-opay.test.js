import { test } from 'node:test';
import assert from 'node:assert/strict';
import opay, { bsPrice, bsGreeks, evaluateStrategy, PRESET_STRATEGIES } from '../lib/fn/opay.js';

test('black-scholes: benchmark analytical reference case (Hull)', () => {
  // Classic benchmark: S=49, K=50, r=0.05, v=0.20, T=0.3846 (~20 weeks), q=0
  const S = 49;
  const K = 50;
  const r = 0.05;
  const v = 0.20;
  const T = 0.3846;

  const call = bsPrice('call', S, K, T, r, v);
  const put = bsPrice('put', S, K, T, r, v);

  // Hull textbook reference values: Call ~ 2.40, Put ~ 2.45
  assert.ok(Math.abs(call - 2.40) < 0.05, `Call price ${call} differs from reference 2.40`);
  assert.ok(Math.abs(put - 2.45) < 0.05, `Put price ${put} differs from reference 2.45`);

  // Exact Put-Call Parity: C - P = S - K * exp(-r * T)
  const parityDiff = (call - put) - (S - K * Math.exp(-r * T));
  assert.ok(Math.abs(parityDiff) < 1e-4, `Parity discrepancy: ${parityDiff}`);
});

test('black-scholes: continuous dividend yield put-call parity', () => {
  const S = 100;
  const K = 105;
  const T = 0.5;
  const r = 0.04;
  const v = 0.22;
  const q = 0.025; // 2.5% dividend yield

  const call = bsPrice('call', S, K, T, r, v, q);
  const put = bsPrice('put', S, K, T, r, v, q);

  // Parity with dividend: C - P = S * exp(-q * T) - K * exp(-r * T)
  const expectedDiff = S * Math.exp(-q * T) - K * Math.exp(-r * T);
  const actualDiff = call - put;
  assert.ok(Math.abs(actualDiff - expectedDiff) < 1e-4, `Dividend parity violation: ${actualDiff - expectedDiff}`);
});

test('black-scholes: comprehensive greeks directional and magnitude checks', () => {
  const S = 100;
  const K = 100;
  const T = 0.5;
  const r = 0.04;
  const v = 0.25;
  const q = 0.015;

  const callG = bsGreeks('call', S, K, T, r, v, q);
  assert.ok(callG.delta > 0.4 && callG.delta < 0.65, 'ATM call delta should be near 0.5');
  assert.ok(callG.gamma > 0, 'Long call gamma must be positive');
  assert.ok(callG.vega > 0, 'Long call vega must be positive');
  assert.ok(callG.theta < 0, 'Long call theta must be negative');
  assert.ok(callG.rho > 0, 'Long call rho must be positive (higher rates benefit calls)');

  const putG = bsGreeks('put', S, K, T, r, v, q);
  assert.ok(putG.delta < 0 && putG.delta > -0.65, 'ATM put delta should be near -0.5');
  assert.ok(Math.abs(callG.gamma - putG.gamma) < 1e-6, 'Call and Put gamma must be identical');
  assert.ok(Math.abs(callG.vega - putG.vega) < 1e-6, 'Call and Put vega must be identical');
  assert.ok(putG.rho < 0, 'Long put rho must be negative');
});

test('black-scholes: input validation and edge cases', () => {
  // Negative spot
  assert.throws(() => bsPrice('call', -10, 100, 1, 0.05, 0.2), /positive numbers/);
  // Negative strike
  assert.throws(() => bsPrice('put', 100, -50, 1, 0.05, 0.2), /positive numbers/);
  // Non-positive volatility
  assert.throws(() => bsPrice('call', 100, 100, 1, 0.05, 0), /volatility must be positive/);
  // Negative expiry
  assert.throws(() => bsPrice('call', 100, 100, -0.5, 0.05, 0.2), /cannot be negative/);

  // Expiration boundary T = 0
  const itmCall = bsPrice('call', 110, 100, 0, 0.05, 0.2);
  assert.equal(itmCall, 10);
  const otmCall = bsPrice('call', 90, 100, 0, 0.05, 0.2);
  assert.equal(otmCall, 0);
  const itmPut = bsPrice('put', 90, 100, 0, 0.05, 0.2);
  assert.equal(itmPut, 10);
});

test('strategy risk: long call has strictly unlimited max profit and bounded loss', () => {
  const spot = 100;
  const legs = PRESET_STRATEGIES.LONG_CALL(spot);
  const res = evaluateStrategy(spot, legs, 30, 0.25);

  assert.equal(res.maxProfit, 'Unlimited', 'Long call profit must be Unlimited, not a clamped finite number');
  assert.ok(typeof res.maxLoss === 'number');
  assert.equal(res.maxLoss, res.netCost, 'Long call max loss must equal net premium paid');
  assert.ok(res.breakevens.length > 0);
  assert.ok(res.breakevens[0] > spot, 'Long call breakeven must be above spot strike');
});

test('strategy risk: long put has bounded max profit at S=0 and bounded loss', () => {
  const spot = 100;
  const legs = PRESET_STRATEGIES.LONG_PUT(spot);
  const res = evaluateStrategy(spot, legs, 30, 0.25);

  assert.ok(typeof res.maxProfit === 'number', 'Long put max profit is bounded at S=0');
  assert.equal(res.maxProfit, Number((spot - res.netCost).toFixed(2)), 'Long put max profit is Strike - Premium');
  assert.equal(res.maxLoss, res.netCost, 'Long put max loss is Premium');
});

test('strategy risk: iron condor defined risk boundaries', () => {
  const spot = 100;
  const legs = PRESET_STRATEGIES.IRON_CONDOR(spot);
  const res = evaluateStrategy(spot, legs, 30, 0.25);

  assert.equal(res.isCredit, true, 'Iron condor must be net credit');
  assert.ok(typeof res.maxProfit === 'number', 'Iron condor max profit is defined credit');
  assert.ok(typeof res.maxLoss === 'number', 'Iron condor max loss is defined spread width minus credit');
  assert.equal(res.breakevens.length, 2, 'Iron condor must have exactly 2 breakeven boundaries');
});

test('opay endpoint returns complete schema and source attribution', async () => {
  const res = await opay({ spot: 350 });
  assert.ok(res.availableStrategies.includes('BULL_CALL_SPREAD'));
  assert.ok(res.availableStrategies.includes('IRON_CONDOR'));
  assert.ok(res.greeks);
  assert.ok(typeof res.greeks.netRho === 'number');
  assert.ok(res.payoffCurve);
  assert.ok(res.source.includes('Black-Scholes-Merton'));
});
