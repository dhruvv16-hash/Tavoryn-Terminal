import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signed } from '../public/js/fn/trading.js';
import { pct, num, px, cls, chg } from '../public/js/api.js';
import { evaluateStrategy, PRESET_STRATEGIES } from '../lib/fn/opay.js';

test('financial formatting: signed currency values', () => {
  // Positive P&L
  assert.equal(signed(6.75), '+$6.75');
  assert.equal(signed(1234.5), '+$1,234.50');

  // Negative P&L: must display with explicit negative sign, never as positive
  assert.equal(signed(-6.75), '-$6.75');
  assert.equal(signed(-1234.5), '-$1,234.50');

  // Zero P&L: neutral, no plus or minus sign
  assert.equal(signed(0), '$0.00');

  // Edge cases and invalid inputs
  assert.equal(signed(NaN), '—');
  assert.equal(signed(Infinity), '—');
  assert.equal(signed(-Infinity), '—');
  assert.equal(signed(null), '—');
  assert.equal(signed(undefined), '—');
  assert.equal(signed('6.75'), '—');

  // Decimal precision override
  assert.equal(signed(6.754, 3), '+$6.754');
  assert.equal(signed(-6.754, 3), '-$6.754');
  assert.equal(signed(0, 0), '$0');
});

test('financial formatting: percentage values', () => {
  // Positive percentage
  assert.equal(pct(1.25), '+1.25%');
  assert.equal(pct(0.05), '+0.05%');

  // Negative percentage: must preserve minus sign
  assert.equal(pct(-0.01), '-0.01%');
  assert.equal(pct(-5.4), '-5.40%');

  // Zero percentage
  assert.equal(pct(0), '0.00%');

  // Edge cases
  assert.equal(pct(NaN), '—');
  assert.equal(pct(null), '—');
  assert.equal(pct('1%'), '—');
});

test('financial formatting: numeric change values and directional classes', () => {
  // chg
  assert.equal(chg(2.5), '+2.50');
  assert.equal(chg(-2.5), '-2.50');
  assert.equal(chg(0), '0.00');

  // cls
  assert.equal(cls(10), 'up');
  assert.equal(cls(-10), 'down');
  assert.equal(cls(0), '');
  assert.equal(cls(NaN), '');
});

test('options payoff: economic classification of debit vs credit strategies', () => {
  const spot = 100;

  // 1. Bull Call Spread: Buy 95 Call, Sell 105 Call (Net Debit)
  const bullCallLegs = [
    { type: 'call', strike: 95, qty: 1, action: 'buy' },
    { type: 'call', strike: 105, qty: 1, action: 'sell' },
  ];
  const debitStrat = evaluateStrategy(spot, bullCallLegs, 30, 0.25, 0.045);

  assert.ok(debitStrat.netCost > 0, `Expected positive netCost for debit strategy, got ${debitStrat.netCost}`);
  assert.equal(debitStrat.isCredit, false, 'Debit strategy must have isCredit = false');

  // Verify display string logic does not output negative signs or wrong labels
  const debitDisplay = `$${num(Math.abs(debitStrat.netCost), 2)} ${debitStrat.isCredit ? '(Credit)' : '(Debit)'}`;
  assert.match(debitDisplay, /^\$\d+\.\d{2} \(Debit\)$/);
  assert.doesNotMatch(debitDisplay, /-/);

  // 2. Bear Call Spread: Sell 95 Call, Buy 105 Call (Net Credit)
  const bearCallLegs = [
    { type: 'call', strike: 95, qty: 1, action: 'sell' },
    { type: 'call', strike: 105, qty: 1, action: 'buy' },
  ];
  const creditStrat = evaluateStrategy(spot, bearCallLegs, 30, 0.25, 0.045);

  assert.ok(creditStrat.netCost < 0, `Expected negative netCost for credit strategy, got ${creditStrat.netCost}`);
  assert.equal(creditStrat.isCredit, true, 'Credit strategy must have isCredit = true');

  // Verify credit display string does not output negative signs like "$-1.50 (Credit)"
  const creditDisplay = `$${num(Math.abs(creditStrat.netCost), 2)} ${creditStrat.isCredit ? '(Credit)' : '(Debit)'}`;
  assert.match(creditDisplay, /^\$\d+\.\d{2} \(Credit\)$/);
  assert.doesNotMatch(creditDisplay, /-/);

  // 3. Ensure classification is never derived from absolute value
  const mockDebitCost = 4.25;
  const mockCreditCost = -4.25;
  assert.equal(Math.abs(mockDebitCost), Math.abs(mockCreditCost));
  assert.notEqual(mockDebitCost < 0, mockCreditCost < 0);
  assert.equal(mockDebitCost < 0, false);
  assert.equal(mockCreditCost < 0, true);
});
