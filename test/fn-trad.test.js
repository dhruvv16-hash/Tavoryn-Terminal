import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Isolate test state so the user's real paper-account.json is NEVER touched
process.env.AMBER_PAPER_STORE_KEY = 'test-paper-account-isolated';

const paper = await import('../lib/paper-trading.js');
const trad = (await import('../lib/fn/trad.js')).default;
const store = await import('../lib/store.js');

// Mock deterministic price resolver so all tests run 100% offline
const TEST_PRICES = {
  AAPL: 150.0,
  MSFT: 300.0,
  NVDA: 100.0,
  TSLA: 200.0,
};

before(() => {
  paper.setQuoteResolver(async (sym) => {
    const clean = String(sym).toUpperCase().replace(/^[A-Z]+:/, '');
    const px = TEST_PRICES[clean] ?? 100.0;
    return { id: clean, ticker: clean, name: `${clean} Inc`, price: px };
  });
  paper.resetAccount(100000);
});

after(() => {
  // Clean up temporary test file
  try {
    const testFile = path.join(store.DATA_DIR, 'test-paper-account-isolated.json');
    if (fs.existsSync(testFile)) fs.rmSync(testFile, { force: true });
  } catch {}
});

test('paper trading: reset account to $100,000 baseline', async () => {
  const acc = await paper.resetAccount(100000);
  assert.equal(acc.cash, 100000);
  assert.equal(acc.reservedCash, 0);
  assert.equal(acc.initialCash, 100000);
  assert.equal(acc.realizedPnl, 0);
  assert.deepEqual(acc.positions, {});
  assert.deepEqual(acc.orders, []);
  assert.deepEqual(acc.journal, []);
});

test('paper trading: rejects invalid order inputs', async () => {
  await assert.rejects(
    async () => paper.placeOrder({ symbol: '', side: 'BUY', qty: 10 }),
    /Order requires a symbol/,
  );
  await assert.rejects(
    async () => paper.placeOrder({ symbol: 'AAPL', side: 'HOLD', qty: 10 }),
    /Order side must be 'BUY' or 'SELL'/,
  );
  await assert.rejects(
    async () => paper.placeOrder({ symbol: 'AAPL', side: 'BUY', qty: -5 }),
    /Order quantity must be a positive number/,
  );
  await assert.rejects(
    async () => paper.placeOrder({ symbol: 'AAPL', side: 'BUY', type: 'LIMIT', qty: 10, price: 0 }),
    /Limit orders require a positive price/,
  );
});

test('paper trading: buy market order and position tracking', async () => {
  await paper.resetAccount(100000);

  // Buy 10 AAPL @ $150 = $1,500
  const res = await paper.placeOrder({ symbol: 'AAPL', side: 'BUY', type: 'MARKET', qty: 10 });
  assert.equal(res.ok, true);
  assert.equal(res.status, 'FILLED');
  assert.equal(res.order.execPrice, 150.0);

  const acc = paper.getAccount();
  assert.equal(acc.cash, 98500.0); // 100000 - 1500
  assert.equal(acc.reservedCash, 0);
  assert.equal(acc.positions['AAPL'].qty, 10);
  assert.equal(acc.positions['AAPL'].avgPrice, 150.0);
  assert.equal(acc.positions['AAPL'].costBasis, 1500.0);
  assert.equal(acc.journal.length, 1);
});

test('paper trading: adding to position updates average price correctly', async () => {
  // Currently holding 10 AAPL @ $150
  // Buy 10 more AAPL at higher price $200 (mock price update)
  TEST_PRICES.AAPL = 200.0;
  const res = await paper.placeOrder({ symbol: 'AAPL', side: 'BUY', type: 'MARKET', qty: 10 });
  assert.equal(res.ok, true);
  assert.equal(res.status, 'FILLED');

  const acc = paper.getAccount();
  assert.equal(acc.cash, 96500.0); // 98500 - 2000
  const pos = acc.positions['AAPL'];
  assert.equal(pos.qty, 20);
  // (10 * 150 + 10 * 200) / 20 = 175
  assert.equal(pos.avgPrice, 175.0);
  assert.equal(pos.costBasis, 3500.0);
});

test('paper trading: partial close preserves remaining position and cost basis', async () => {
  // Currently holding 20 AAPL @ $175 (Cost = $3,500, Cash = $96,500)
  // Sell 5 AAPL at $220. Proceeds = 5 * 220 = $1,100.
  TEST_PRICES.AAPL = 220.0;
  const res = await paper.placeOrder({ symbol: 'AAPL', side: 'SELL', type: 'MARKET', qty: 5 });
  assert.equal(res.ok, true);
  assert.equal(res.status, 'FILLED');

  const acc = paper.getAccount();
  assert.equal(acc.cash, 97600.0); // 96500 + 1100
  const pos = acc.positions['AAPL'];
  assert.equal(pos.qty, 15);
  assert.equal(pos.avgPrice, 175.0); // Entry price unchanged
  assert.equal(pos.costBasis, 15 * 175.0); // 2625.0
  // Realized PnL = 5 * (220 - 175) = +$225.0
  assert.equal(pos.realizedPnl, 225.0);
  assert.equal(acc.realizedPnl, 225.0);
});

test('paper trading: full close deletes position but permanently preserves realized PnL', async () => {
  // Currently holding 15 AAPL @ $175
  // Sell remaining 15 AAPL at $230. Proceeds = 15 * 230 = $3,450.
  // Realized on this tranche = 15 * (230 - 175) = +$825.
  // Total cumulative realized PnL = 225 + 825 = +$1,050.
  TEST_PRICES.AAPL = 230.0;
  const res = await paper.placeOrder({ symbol: 'AAPL', side: 'SELL', type: 'MARKET', qty: 15 });
  assert.equal(res.ok, true);
  assert.equal(res.status, 'FILLED');

  const acc = paper.getAccount();
  assert.equal(acc.cash, 101050.0); // 97600 + 3450
  assert.equal(acc.positions['AAPL'], undefined, 'Position should be deleted on full close');
  assert.equal(acc.realizedPnl, 1050.0, 'Account-level realized PnL must be preserved');

  // Verify syncAndValuate calculates total equity and net PnL exactly
  const val = await paper.syncAndValuate();
  assert.equal(val.account.cash, 101050.0);
  assert.equal(val.account.equity, 101050.0);
  assert.equal(val.account.marketValue, 0.0);
  assert.equal(val.account.realizedPnl, 1050.0);
  assert.equal(val.account.unrealizedPnl, 0.0);
  assert.equal(val.account.totalPnl, 1050.0);
});

test('paper trading: pending limit order reserves buying power and cancellation releases it', async () => {
  await paper.resetAccount(100000);

  // Available cash = 100,000. Place pending BUY limit for 100 shares @ $50 = $5,000.
  TEST_PRICES.MSFT = 300.0;
  const orderRes = await paper.placeOrder({
    symbol: 'MSFT',
    side: 'BUY',
    type: 'LIMIT',
    qty: 100,
    price: 50.0,
  });

  assert.equal(orderRes.ok, true);
  assert.equal(orderRes.status, 'PENDING');

  const acc = paper.getAccount();
  assert.equal(acc.cash, 100000.0); // Settled cash still 100k
  assert.equal(acc.reservedCash, 5000.0); // 5000 reserved
  const val = await paper.syncAndValuate();
  assert.equal(val.account.availableCash, 95000.0);
  assert.equal(val.account.buyingPower, 95000.0);

  // Attempt to buy more than available cash ($96,000) should fail because $5,000 is reserved
  await assert.rejects(
    async () => paper.placeOrder({ symbol: 'MSFT', side: 'BUY', type: 'MARKET', qty: 320 }), // 320 * 300 = 96,000 > 95,000
    /Insufficient funds/,
  );

  // Cancel pending order
  const cancelRes = await paper.cancelOrder(orderRes.order.id);
  assert.equal(cancelRes.ok, true);
  assert.equal(cancelRes.order.status, 'CANCELLED');

  const accAfter = paper.getAccount();
  assert.equal(accAfter.reservedCash, 0.0, 'Cancelled order must release reserved cash');
  const valAfter = await paper.syncAndValuate();
  assert.equal(valAfter.account.availableCash, 100000.0);
  assert.equal(valAfter.account.buyingPower, 100000.0);
});

test('paper trading: concurrent orders are serialized safely without race conditions', async () => {
  await paper.resetAccount(100000);
  TEST_PRICES.NVDA = 100.0;

  // Fire 5 orders concurrently for 50 shares of NVDA each ($5,000 each = $25,000 total)
  const promises = [
    paper.placeOrder({ symbol: 'NVDA', side: 'BUY', type: 'MARKET', qty: 50 }),
    paper.placeOrder({ symbol: 'NVDA', side: 'BUY', type: 'MARKET', qty: 50 }),
    paper.placeOrder({ symbol: 'NVDA', side: 'BUY', type: 'MARKET', qty: 50 }),
    paper.placeOrder({ symbol: 'NVDA', side: 'BUY', type: 'MARKET', qty: 50 }),
    paper.placeOrder({ symbol: 'NVDA', side: 'BUY', type: 'MARKET', qty: 50 }),
  ];

  const results = await Promise.all(promises);
  assert.equal(results.length, 5);
  for (const r of results) {
    assert.equal(r.status, 'FILLED');
  }

  const acc = paper.getAccount();
  // 100000 - 25000 = 75000
  assert.equal(acc.cash, 75000.0);
  assert.equal(acc.positions['NVDA'].qty, 250);
  assert.equal(acc.positions['NVDA'].costBasis, 25000.0);
});

test('paper trading: trad endpoint returns complete portfolio report', async () => {
  const data = await trad({});
  assert.ok(data.account);
  assert.ok(typeof data.account.equity === 'number');
  assert.ok(typeof data.account.cash === 'number');
  assert.ok(typeof data.account.availableCash === 'number');
  assert.ok(typeof data.account.reservedCash === 'number');
  assert.ok(typeof data.account.realizedPnl === 'number');
  assert.ok(Array.isArray(data.positions));
  assert.ok(Array.isArray(data.orders));
  assert.ok(Array.isArray(data.journal));
  assert.ok(data.source.includes('Tavoryn Execution'));
});
