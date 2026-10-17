import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Strict isolation key so data/paper-account.json is NEVER touched
process.env.AMBER_PAPER_STORE_KEY = 'test-paper-hardening-isolated';

const paper = await import('../lib/paper-trading.js');
const trad = (await import('../lib/fn/trad.js')).default;
const store = await import('../lib/store.js');

const HARDENING_PRICES = {
  AAPL: 150.0,
  MSFT: 300.0,
  NVDA: 100.0,
  TSLA: 200.0,
};

function getOriginalUserAccountHash() {
  const userAccountPath = path.join(store.DATA_DIR, 'paper-account.json');
  if (!fs.existsSync(userAccountPath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(userAccountPath)).digest('hex');
}

let initialUserAccountHash = null;

before(() => {
  initialUserAccountHash = getOriginalUserAccountHash();
  paper.setQuoteResolver(async (sym) => {
    const clean = String(sym).toUpperCase().replace(/^[A-Z]+:/, '');
    const px = HARDENING_PRICES[clean];
    if (px === undefined) return null;
    return { id: clean, ticker: clean, name: `${clean} Inc`, price: px };
  });
  paper.resetAccount(100000);
});

after(() => {
  // 1. Verify user file was NEVER mutated
  const finalUserAccountHash = getOriginalUserAccountHash();
  assert.equal(finalUserAccountHash, initialUserAccountHash, 'User data/paper-account.json must never be altered');

  // 2. Clean up isolated test files and any quarantine test files
  try {
    const files = fs.readdirSync(store.DATA_DIR);
    for (const file of files) {
      if (file.startsWith('test-paper-hardening-isolated')) {
        fs.rmSync(path.join(store.DATA_DIR, file), { force: true });
      }
    }
  } catch {}
});

// ==========================================
// 1. Protect Existing User Data & Recovery
// ==========================================

test('hardening: user paper-account.json remains strictly untouched across runs', () => {
  const currentHash = getOriginalUserAccountHash();
  assert.equal(currentHash, initialUserAccountHash, 'User paper-account.json hash must match initial state exactly');
});

test('hardening: corrupted json file on disk is quarantined and recovers safely', () => {
  const isolateKey = 'test-paper-hardening-isolated-corrupt';
  const filePath = path.join(store.DATA_DIR, `${isolateKey}.json`);
  const corruptPayload = '{"cash": 50000, "positions": { broken json syntax';
  fs.writeFileSync(filePath, corruptPayload, 'utf8');

  // Temporarily switch key
  const prevKey = process.env.AMBER_PAPER_STORE_KEY;
  process.env.AMBER_PAPER_STORE_KEY = isolateKey;

  try {
    // Calling getAccount should catch the syntax error, quarantine the corrupt file, and safely recover
    const acc = paper.getAccount();
    assert.equal(acc.cash, 100000, 'Must recover with clean default cash');
    assert.deepEqual(acc.positions, {}, 'Must recover with clean positions');

    // Verify quarantine file exists
    const files = fs.readdirSync(store.DATA_DIR);
    const quarantineFile = files.find((f) => f.startsWith(`${isolateKey}.corrupted.`));
    assert.ok(quarantineFile, 'A quarantine backup must be created for corrupted file');
    const quarantinedContent = fs.readFileSync(path.join(store.DATA_DIR, quarantineFile), 'utf8');
    assert.equal(quarantinedContent, corruptPayload, 'Quarantine backup must preserve the exact corrupted bytes');

    // Clean up
    fs.rmSync(filePath, { force: true });
    fs.rmSync(path.join(store.DATA_DIR, quarantineFile), { force: true });
  } finally {
    process.env.AMBER_PAPER_STORE_KEY = prevKey;
  }
});

test('hardening: uncorrupted state round-trips and persists across simulated restarts', () => {
  const acc = paper.getAccount();
  acc.cash = 88888.5;
  acc.positions['AAPL'] = {
    symbol: 'AAPL',
    name: 'Apple Inc',
    qty: 50,
    avgPrice: 150.0,
    costBasis: 7500.0,
    realizedPnl: 0,
  };
  paper.saveAccount(acc);

  // Read fresh from disk
  const reloaded = paper.getAccount();
  assert.equal(reloaded.cash, 88888.5);
  assert.equal(reloaded.positions['AAPL'].qty, 50);
  assert.equal(reloaded.positions['AAPL'].costBasis, 7500.0);
});

// ==========================================
// 2. Order Lifecycle Validation
// ==========================================

test('lifecycle: limit BUY order price improvement executes at lower market price', async () => {
  await paper.resetAccount(100000);
  HARDENING_PRICES.AAPL = 140.0;

  // Trader places limit buy at $150 (above market $140) -> fills immediately at $140
  const res = await paper.placeOrder({
    symbol: 'AAPL',
    side: 'BUY',
    type: 'LIMIT',
    qty: 10,
    price: 150.0,
  });

  assert.equal(res.ok, true);
  assert.equal(res.status, 'FILLED');
  assert.equal(res.order.execPrice, 140.0, 'Must execute with price improvement at market price $140');

  const acc = paper.getAccount();
  assert.equal(acc.cash, 100000 - 1400); // 10 * 140 = 1400
  assert.equal(acc.positions['AAPL'].qty, 10);
  assert.equal(acc.positions['AAPL'].avgPrice, 140.0);
});

test('lifecycle: limit SELL order price improvement executes at higher market price', async () => {
  // Holding 10 AAPL @ 140. Market price is now $165.
  HARDENING_PRICES.AAPL = 165.0;

  // Trader places limit sell at $150 (below market $165) -> fills immediately at $165
  const res = await paper.placeOrder({
    symbol: 'AAPL',
    side: 'SELL',
    type: 'LIMIT',
    qty: 10,
    price: 150.0,
  });

  assert.equal(res.ok, true);
  assert.equal(res.status, 'FILLED');
  assert.equal(res.order.execPrice, 165.0, 'Must execute with price improvement at market price $165');

  const acc = paper.getAccount();
  assert.equal(acc.cash, 98600 + 1650); // 100250
  assert.equal(acc.positions['AAPL'], undefined, 'Position should be closed');
  assert.equal(acc.realizedPnl, 250.0, 'Realized PnL: 10 * (165 - 140) = 250');
});

test('lifecycle: pending limit SELL reserves shares and prevents double-selling', async () => {
  await paper.resetAccount(100000);
  HARDENING_PRICES.MSFT = 300.0;

  // Buy 10 MSFT @ 300 = $3,000
  await paper.placeOrder({ symbol: 'MSFT', side: 'BUY', type: 'MARKET', qty: 10 });

  // Place pending limit sell for all 10 shares @ $350 (market is 300)
  const pendingSell = await paper.placeOrder({
    symbol: 'MSFT',
    side: 'SELL',
    type: 'LIMIT',
    qty: 10,
    price: 350.0,
  });
  assert.equal(pendingSell.status, 'PENDING');

  // Attempt to sell 1 share via market order while all 10 are committed to pending limit order
  await assert.rejects(
    async () => paper.placeOrder({ symbol: 'MSFT', side: 'SELL', type: 'MARKET', qty: 1 }),
    /Insufficient position.*reserved in pending limit orders/,
    'Must prevent double-selling shares already committed to pending orders',
  );

  // Cancel the pending limit sell
  const cancelRes = await paper.cancelOrder(pendingSell.order.id);
  assert.equal(cancelRes.ok, true);
  assert.equal(cancelRes.order.status, 'CANCELLED');

  // Now selling the 10 shares succeeds
  const marketSell = await paper.placeOrder({ symbol: 'MSFT', side: 'SELL', type: 'MARKET', qty: 10 });
  assert.equal(marketSell.status, 'FILLED');
});

test('lifecycle: invalid cancellations throw 400 error', async () => {
  await paper.resetAccount(100000);
  HARDENING_PRICES.AAPL = 150.0;
  const buyRes = await paper.placeOrder({ symbol: 'AAPL', side: 'BUY', type: 'MARKET', qty: 10 });

  // 1. Cannot cancel filled order
  await assert.rejects(
    async () => paper.cancelOrder(buyRes.order.id),
    /Cannot cancel order in status 'FILLED'/,
  );

  // 2. Cannot cancel non-existent order
  await assert.rejects(
    async () => paper.cancelOrder('ORD-DOES-NOT-EXIST'),
    /Order ORD-DOES-NOT-EXIST not found/,
  );
});

test('lifecycle: rejected orders do not corrupt cash, positions, or reservations', async () => {
  await paper.resetAccount(100000);
  const baseline = JSON.parse(JSON.stringify(paper.getAccount()));

  // Attempt invalid inputs
  const invalidAttempts = [
    () => paper.placeOrder({ symbol: '', side: 'BUY', qty: 10 }),
    () => paper.placeOrder({ symbol: 'AAPL', side: 'INVALID_SIDE', qty: 10 }),
    () => paper.placeOrder({ symbol: 'AAPL', side: 'BUY', type: 'STOP', qty: 10 }),
    () => paper.placeOrder({ symbol: 'AAPL', side: 'BUY', qty: -5 }),
    () => paper.placeOrder({ symbol: 'AAPL', side: 'BUY', qty: 0 }),
    () => paper.placeOrder({ symbol: 'AAPL', side: 'BUY', type: 'LIMIT', qty: 10, price: -10 }),
    () => paper.placeOrder({ symbol: 'UNKNOWN_TICKER', side: 'BUY', qty: 10 }), // unresolvable
    () => paper.placeOrder({ symbol: 'AAPL', side: 'BUY', qty: 10000 }), // insufficient funds
    () => paper.placeOrder({ symbol: 'AAPL', side: 'SELL', qty: 10 }), // no position
  ];

  for (const fn of invalidAttempts) {
    await assert.rejects(fn);
  }

  const afterState = paper.getAccount();
  assert.equal(afterState.cash, baseline.cash);
  assert.equal(afterState.reservedCash, baseline.reservedCash);
  assert.deepEqual(afterState.positions, baseline.positions);
  assert.deepEqual(afterState.orders, baseline.orders);
  assert.deepEqual(afterState.journal, baseline.journal);
});

// ==========================================
// 3. Portfolio Accounting Audit
// ==========================================

test('accounting: multi-tranche weighted average entry price and partial close', async () => {
  await paper.resetAccount(100000);

  // Tranche 1: Buy 10 NVDA @ $100 = $1,000
  HARDENING_PRICES.NVDA = 100.0;
  await paper.placeOrder({ symbol: 'NVDA', side: 'BUY', type: 'MARKET', qty: 10 });

  // Tranche 2: Buy 20 NVDA @ $130 = $2,600
  HARDENING_PRICES.NVDA = 130.0;
  await paper.placeOrder({ symbol: 'NVDA', side: 'BUY', type: 'MARKET', qty: 20 });

  let acc = paper.getAccount();
  let pos = acc.positions['NVDA'];
  assert.equal(pos.qty, 30);
  assert.equal(pos.costBasis, 3600.0);
  // Weighted Average: (10 * 100 + 20 * 130) / 30 = 3600 / 30 = 120.00
  assert.equal(pos.avgPrice, 120.0);
  assert.equal(acc.cash, 100000 - 3600); // 96400

  // Partial close: Sell 15 NVDA @ $140. Proceeds = 15 * 140 = $2,100
  // Cost sold = 15 * 120 = $1,800. Realized = $2,100 - $1,800 = +$300.00
  HARDENING_PRICES.NVDA = 140.0;
  await paper.placeOrder({ symbol: 'NVDA', side: 'SELL', type: 'MARKET', qty: 15 });

  acc = paper.getAccount();
  pos = acc.positions['NVDA'];
  assert.equal(pos.qty, 15);
  assert.equal(pos.avgPrice, 120.0, 'Average entry price remains unchanged after partial close');
  assert.equal(pos.costBasis, 1800.0);
  assert.equal(pos.realizedPnl, 300.0);
  assert.equal(acc.cash, 96400 + 2100); // 98500
  assert.equal(acc.realizedPnl, 300.0);

  // Full close: Sell remaining 15 NVDA @ $160. Proceeds = 15 * 160 = $2,400
  // Cost sold = 15 * 120 = $1,800. Realized on tranche = +$600.00
  // Cumulative Realized = 300 + 600 = +$900.00
  HARDENING_PRICES.NVDA = 160.0;
  await paper.placeOrder({ symbol: 'NVDA', side: 'SELL', type: 'MARKET', qty: 15 });

  acc = paper.getAccount();
  assert.equal(acc.positions['NVDA'], undefined);
  assert.equal(acc.cash, 98500 + 2400); // 100900
  assert.equal(acc.realizedPnl, 900.0);

  // Check syncAndValuate
  const val = await paper.syncAndValuate();
  assert.equal(val.account.equity, 100900.0);
  assert.equal(val.account.totalPnl, 900.0);
  assert.ok(Math.abs(val.account.totalPnlPct - 0.9) < 1e-4); // 900 / 100000 = 0.9%
});

test('accounting: fee model deduction and tracking', async () => {
  await paper.resetAccount(100000);
  HARDENING_PRICES.NVDA = 100.0;

  // Set fee model: $2.00 flat + 10 bps (0.10%)
  await paper.setFeeModel({ feePerOrder: 2.0, feeBps: 10 });

  // Buy 10 NVDA @ 100 = $1,000. Notional fee = 2.00 + (1000 * 0.001) = $3.00
  await paper.placeOrder({ symbol: 'NVDA', side: 'BUY', type: 'MARKET', qty: 10 });

  let acc = paper.getAccount();
  assert.equal(acc.cash, 100000 - 1000 - 3.0); // 98997.0
  assert.equal(acc.totalFees, 3.0);

  // Sell 10 NVDA @ 120 = $1,200. Proceeds fee = 2.00 + (1200 * 0.001) = $3.20
  // Net proceeds = 1200 - 3.20 = 1196.80.
  // Realized PnL = 1200 - 1000 - 3.20 = 196.80
  HARDENING_PRICES.NVDA = 120.0;
  await paper.placeOrder({ symbol: 'NVDA', side: 'SELL', type: 'MARKET', qty: 10 });

  acc = paper.getAccount();
  assert.equal(acc.totalFees, 3.0 + 3.20); // 6.20
  assert.equal(acc.cash, 98997.0 + 1196.80); // 100193.80
  assert.equal(acc.realizedPnl, 196.80);

  // Reset fee model to 0
  await paper.setFeeModel({ feePerOrder: 0, feeBps: 0 });
});

// ==========================================
// 4. Configurable Risk Controls
// ==========================================

test('risk controls: maximum order notional constraint', async () => {
  await paper.resetAccount(100000);
  HARDENING_PRICES.AAPL = 150.0;

  // Set max order notional = $2,000
  await paper.setRiskLimits({ maxOrderNotional: 2000 });
  const limits = paper.getRiskLimits();
  assert.equal(limits.maxOrderNotional, 2000);

  // 10 AAPL @ 150 = $1,500 <= $2,000 -> succeeds
  const okOrder = await paper.placeOrder({ symbol: 'AAPL', side: 'BUY', type: 'MARKET', qty: 10 });
  assert.equal(okOrder.status, 'FILLED');

  // 20 AAPL @ 150 = $3,000 > $2,000 -> rejected
  await assert.rejects(
    async () => paper.placeOrder({ symbol: 'AAPL', side: 'BUY', type: 'MARKET', qty: 20 }),
    /Risk control rejection: Order notional \$3000\.00 exceeds maximum limit \$2000\.00/,
  );

  // Clear limit
  await paper.setRiskLimits({ maxOrderNotional: null });
});

test('risk controls: maximum position notional constraint', async () => {
  await paper.resetAccount(100000);
  HARDENING_PRICES.AAPL = 150.0;

  // Set max position notional = $3,000
  await paper.setRiskLimits({ maxPositionNotional: 3000 });

  // Buy 15 AAPL @ 150 = $2,250 -> succeeds (position cost basis = $2,250 <= $3,000)
  await paper.placeOrder({ symbol: 'AAPL', side: 'BUY', type: 'MARKET', qty: 15 });

  // Attempting to buy 10 more AAPL @ 150 ($1,500) would bring position to $3,750 > $3,000 -> rejected
  await assert.rejects(
    async () => paper.placeOrder({ symbol: 'AAPL', side: 'BUY', type: 'MARKET', qty: 10 }),
    /Risk control rejection: Projected position notional \$3750\.00 exceeds maximum limit \$3000\.00/,
  );

  // Clear limit
  await paper.setRiskLimits({ maxPositionNotional: null });
});

test('risk controls: daily loss limit constraint', async () => {
  await paper.resetAccount(100000);
  HARDENING_PRICES.TSLA = 200.0;

  // Set daily loss limit = $500
  await paper.setRiskLimits({ maxDailyLoss: 500 });

  // Buy 10 TSLA @ 200 = $2,000
  await paper.placeOrder({ symbol: 'TSLA', side: 'BUY', type: 'MARKET', qty: 10 });

  // Price drops to 160. Sell 5 TSLA @ 160 -> loss = 5 * (160 - 200) = -$200.
  // Cumulative loss = $200 <= $500 -> allowed
  HARDENING_PRICES.TSLA = 160.0;
  await paper.placeOrder({ symbol: 'TSLA', side: 'SELL', type: 'MARKET', qty: 5 });

  // Price drops to 120. Sell remaining 5 TSLA @ 120 -> loss on this tranche = 5 * (120 - 200) = -$400.
  // Cumulative today loss would become $200 + $400 = $600 > $500.
  HARDENING_PRICES.TSLA = 120.0;
  await paper.placeOrder({ symbol: 'TSLA', side: 'SELL', type: 'MARKET', qty: 5 });

  // Now cumulative daily loss is $600 >= $500 limit. Any new order is rejected!
  HARDENING_PRICES.AAPL = 150.0;
  await assert.rejects(
    async () => paper.placeOrder({ symbol: 'AAPL', side: 'BUY', type: 'MARKET', qty: 1 }),
    /Risk control rejection: Daily loss limit of \$500\.00 has been reached for today/,
  );

  // Clear limit
  await paper.setRiskLimits({ maxDailyLoss: null });
});

// ==========================================
// 5. Market-Data Failure Handling & Labeling
// ==========================================

test('market data: stale or unavailable quote rejects order and marks priceStatus', async () => {
  await paper.resetAccount(100000);
  HARDENING_PRICES.NVDA = 100.0;

  // Buy 10 NVDA @ 100
  await paper.placeOrder({ symbol: 'NVDA', side: 'BUY', type: 'MARKET', qty: 10 });

  // Simulate market data outage: quote resolver returns null for all symbols
  paper.setQuoteResolver(async () => null);

  // New orders fail gracefully
  await assert.rejects(
    async () => paper.placeOrder({ symbol: 'NVDA', side: 'BUY', type: 'MARKET', qty: 5 }),
    /Could not resolve market price/,
  );

  // syncAndValuate still works offline, falling back safely to cost basis and marking status
  const val = await paper.syncAndValuate();
  assert.equal(val.positions.length, 1);
  const pos = val.positions[0];
  assert.equal(pos.symbol, 'NVDA');
  assert.equal(pos.currentPrice, 100.0); // Cost basis fallback
  assert.equal(pos.priceStatus, 'fallback-cost-basis', 'Must explicitly label fallback pricing and never mark as live');

  // Restore quote resolver
  paper.setQuoteResolver(async (sym) => {
    const clean = String(sym).toUpperCase().replace(/^[A-Z]+:/, '');
    const px = HARDENING_PRICES[clean];
    if (px === undefined) return null;
    return { id: clean, ticker: clean, name: `${clean} Inc`, price: px };
  });

  const valLive = await paper.syncAndValuate();
  assert.equal(valLive.positions[0].priceStatus, 'live', 'Must label live quotes correctly');
});

// ==========================================
// 6. Operational Recovery & Concurrency
// ==========================================

test('operational: trad terminal function and risk limits endpoints work seamlessly', async () => {
  // Test trad function get/set risk limits
  const setRes = await trad({
    action: 'set-risk-limits',
    limits: { maxOrderNotional: 50000 },
  });
  assert.equal(setRes.ok, true);
  assert.equal(setRes.riskLimits.maxOrderNotional, 50000);

  const getRes = await trad({ action: 'get-risk-limits' });
  assert.equal(getRes.ok, true);
  assert.equal(getRes.riskLimits.maxOrderNotional, 50000);

  // Clean up
  await trad({ action: 'set-risk-limits', limits: { maxOrderNotional: null } });
});

test('operational: concurrent order burst preserves balance and prevents race conditions', async () => {
  await paper.resetAccount(100000);
  HARDENING_PRICES.AAPL = 150.0;

  // Launch 10 simultaneous orders for 20 shares ($3,000 each = $30,000 total)
  const orders = Array.from({ length: 10 }, () =>
    paper.placeOrder({ symbol: 'AAPL', side: 'BUY', type: 'MARKET', qty: 20 }),
  );

  const results = await Promise.all(orders);
  assert.equal(results.length, 10);
  for (const r of results) {
    assert.equal(r.status, 'FILLED');
  }

  const acc = paper.getAccount();
  assert.equal(acc.cash, 100000 - 30000); // 70,000
  assert.equal(acc.positions['AAPL'].qty, 200);
  assert.equal(acc.positions['AAPL'].costBasis, 30000.0);
  assert.equal(acc.reservedCash, 0.0);
});
