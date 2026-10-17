process.env.QT_OFFLINE = '1';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import askb, { generateFinancialIntelligence } from '../lib/fn/askb.js';

test('ai assistant: returns default market intelligence summary', async () => {
  const data = await askb({});
  assert.ok(data.answer);
  assert.ok(Array.isArray(data.quickPrompts));
  assert.ok(data.quickPrompts.length > 0);
  assert.ok(Array.isArray(data.relatedFunctions));
  assert.ok(data.source.includes('Tavoryn Intelligence'));
});

test('ai assistant: handles function directory query', async () => {
  const res = await generateFinancialIntelligence('What are the terminal function codes?');
  assert.ok(res.answer.includes('Tavoryn Terminal Function Directory'));
  assert.ok(res.answer.includes('WEI'));
  assert.ok(res.answer.includes('BNDC'));
  assert.ok(res.answer.includes('TRAD'));
});

test('ai assistant: handles macro Fed rate expectations query', async () => {
  const res = await generateFinancialIntelligence('What is the market pricing for the Federal Reserve rate path?');
  assert.ok(res.answer.includes('Federal Reserve Rate Path'));
  assert.ok(res.relatedFunctions.some((f) => f.code === 'WIRP'));
});

test('ai assistant: handles specific security inquiry', async () => {
  const res = await generateFinancialIntelligence('Tell me about AAPL');
  assert.ok(res.answer.includes('AAPL'));
  assert.ok(res.relatedFunctions.some((f) => f.code.includes('DES')));
});
