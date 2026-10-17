import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import scrn, { setScreenerProviders } from '../lib/fn/scrn.js';

// Deterministic mock fixtures for offline testing
const MOCK_CRYPTO_ROWS = [
  { symbol: 'BINANCE:BTCUSDT', ticker: 'BTCUSDT', name: 'Bitcoin', price: 65000, changePct: 3.5, volume: 500000000 },
  { symbol: 'BINANCE:ETHUSDT', ticker: 'ETHUSDT', name: 'Ethereum', price: 3500, changePct: -1.2, volume: 200000000 },
  { symbol: 'BINANCE:SOLUSDT', ticker: 'SOLUSDT', name: 'Solana', price: 150, changePct: 8.4, volume: 80000000 },
  { symbol: 'BINANCE:BNBUSDT', ticker: 'BNBUSDT', name: 'BNB', price: 580, changePct: 0.5, volume: 40000000 },
  { symbol: 'BINANCE:DOGEUSDT', ticker: 'DOGEUSDT', name: 'Dogecoin', price: 0.12, changePct: -4.5, volume: 15000000 },
];

const MOCK_FOREX_ROWS = [
  { symbol: 'FX:EURUSD', ticker: 'EUR/USD', name: 'EUR to USD', price: 1.0850, changePct: 0.25, pips: 27.1, volume: 1000000 },
  { symbol: 'FX:USDJPY', ticker: 'USD/JPY', name: 'USD to JPY', price: 154.20, changePct: -0.40, pips: -61.7, volume: 800000 },
  { symbol: 'FX:GBPUSD', ticker: 'GBP/USD', name: 'GBP to USD', price: 1.2950, changePct: 0.10, pips: 13.0, volume: 600000 },
];

before(() => {
  setScreenerProviders({
    crypto: async () => MOCK_CRYPTO_ROWS,
    forex: async () => MOCK_FOREX_ROWS,
  });
});

after(() => {
  setScreenerProviders({ crypto: null, forex: null });
});

test('screener: crypto universe returns deterministic rows and stats', async () => {
  const data = await scrn({ universe: 'crypto' });
  assert.equal(data.universe, 'crypto');
  assert.equal(data.status, 'OK');
  assert.equal(data.total, 5);
  assert.equal(data.gainers, 3);
  assert.equal(data.losers, 2);
  assert.ok(data.totalVolume > 0);
  assert.ok(data.timestamp);
  assert.ok(data.source.includes('Binance 24hr ticker feed'));
});

test('screener: forex universe returns currency pairs with pip calculation', async () => {
  const data = await scrn({ universe: 'forex' });
  assert.equal(data.universe, 'forex');
  assert.equal(data.status, 'OK');
  assert.ok(data.rows.length > 0);

  const eurUsd = data.rows.find((r) => r.symbol === 'FX:EURUSD');
  assert.ok(eurUsd, 'EURUSD must exist in forex universe');
  assert.equal(eurUsd.price, 1.0850);
  assert.ok(typeof eurUsd.pips === 'number');

  const usdJpy = data.rows.find((r) => r.symbol === 'FX:USDJPY');
  assert.ok(usdJpy, 'USDJPY must exist in forex universe');
  assert.ok(typeof usdJpy.pips === 'number');
});

test('screener: filtering by search query and numerical thresholds', async () => {
  // Filter for BTC
  const dataBtc = await scrn({ universe: 'crypto', q: 'BTC' });
  assert.equal(dataBtc.total, 1);
  assert.equal(dataBtc.rows[0].ticker, 'BTCUSDT');

  // Filter min price $1000
  const dataPrice = await scrn({ universe: 'crypto', minPrice: 1000 });
  assert.equal(dataPrice.total, 2); // BTC (65k) and ETH (3.5k)
  assert.ok(dataPrice.rows.every((r) => r.price >= 1000));

  // Filter min volume $50M
  const dataVol = await scrn({ universe: 'crypto', minVolume: 50000000 });
  assert.ok(dataVol.rows.every((r) => r.volume >= 50000000));
});

test('screener: sorting by changePct, price, and volume', async () => {
  // Sort by changePct descending
  const dataDesc = await scrn({ universe: 'crypto', sort: 'changePct', dir: 'desc' });
  assert.equal(dataDesc.rows[0].ticker, 'SOLUSDT'); // +8.4%
  assert.equal(dataDesc.rows.at(-1).ticker, 'DOGEUSDT'); // -4.5%

  // Sort by price ascending
  const dataAscPrice = await scrn({ universe: 'crypto', sort: 'price', dir: 'asc' });
  assert.equal(dataAscPrice.rows[0].ticker, 'DOGEUSDT'); // $0.12
  assert.equal(dataAscPrice.rows.at(-1).ticker, 'BTCUSDT'); // $65,000
});

test('screener: provider failure is handled gracefully without crashing', async () => {
  setScreenerProviders({
    crypto: async () => {
      throw new Error('503 Service Unavailable');
    },
  });

  const data = await scrn({ universe: 'crypto' });
  assert.equal(data.status, 'UNAVAILABLE');
  assert.equal(data.total, 0);
  assert.deepEqual(data.rows, []);
  assert.ok(data.source.includes('Provider unavailable'));

  // Restore mock
  setScreenerProviders({
    crypto: async () => MOCK_CRYPTO_ROWS,
  });
});
