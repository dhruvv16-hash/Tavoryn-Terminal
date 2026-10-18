import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

process.env.QT_OFFLINE = '1';
process.env.NETLIFY = 'true';
process.env.QT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qt-netlify-test-'));

const { handler } = await import('../netlify/functions/api.js');

test('Netlify Function: GET /api/health responds with 200 OK and valid health payload', async () => {
  const event = {
    path: '/.netlify/functions/api/health',
    httpMethod: 'GET',
    headers: { host: 'tavoryn.netlify.app' },
  };

  const res = await handler(event, {});
  assert.equal(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('application/json'));

  const body = JSON.parse(res.body);
  assert.equal(body.ok, true);
  assert.equal(body.app, 'tavoryn-terminal');
});

test('Netlify Function: GET /api/fn/dcf executes DCF mathematical valuation model', async () => {
  const event = {
    path: '/api/fn/dcf',
    queryStringParameters: { symbol: 'AAPL' },
    httpMethod: 'GET',
    headers: { host: 'tavoryn.netlify.app' },
  };

  const res = await handler(event, {});
  assert.equal(res.statusCode, 200);

  const body = JSON.parse(res.body);
  assert.equal(body.ticker, 'AAPL');
  assert.ok(typeof body.baseCase?.intrinsicValuePerShare === 'number');
  assert.equal(body.baseCase.projections.length, 5);
});

test('Netlify Function: GET /api/fn/stress executes benchmark scenario analysis', async () => {
  const event = {
    path: '/.netlify/functions/api/fn/stress',
    rawQuery: 'benchmark=1',
    httpMethod: 'GET',
    headers: { host: 'tavoryn.netlify.app' },
  };

  const res = await handler(event, {});
  assert.equal(res.statusCode, 200);

  const body = JSON.parse(res.body);
  assert.equal(body.isBenchmark, true);
  assert.equal(body.historicalCrises.length, 8);
  assert.equal(body.macroShocks.length, 4);
});

test('Netlify Function: POST /api/trad/order enforces security header protection', async () => {
  // Mutation without x-qt header must fail with 403
  const forbiddenEvent = {
    path: '/api/trad/order',
    httpMethod: 'POST',
    headers: { host: 'tavoryn.netlify.app', 'content-type': 'application/json' },
    body: JSON.stringify({ symbol: 'AAPL', qty: 10, side: 'BUY' }),
  };

  const forbiddenRes = await handler(forbiddenEvent, {});
  assert.equal(forbiddenRes.statusCode, 403);
});

test('Netlify Function: Web Request (v2 syntax) compatibility', async () => {
  if (typeof Request !== 'undefined') {
    const webReq = new Request('https://tavoryn.netlify.app/api/health', {
      method: 'GET',
      headers: { 'x-netlify-function': '1' },
    });

    const webRes = await handler(webReq, {});
    assert.equal(webRes.status, 200);
    const data = await webRes.json();
    assert.equal(data.ok, true);
    assert.equal(data.app, 'tavoryn-terminal');
  }
});
