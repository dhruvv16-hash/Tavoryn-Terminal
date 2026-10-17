import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

process.env.QT_OFFLINE = '1';
const { start } = await import('../server.js');
let server, base;

before(async () => {
  const s = await start(39500 + Math.floor(Math.random() * 400));
  server = s.server;
  base = `http://127.0.0.1:${s.port}`;
});

after(() => server?.close());

test('User Manual routes return 200 OK and render SPA shell', async () => {
  const routes = ['/help', '/user-manual', '/manual'];
  for (const r of routes) {
    const res = await fetch(`${base}${r}`);
    assert.equal(res.status, 200, `Route ${r} should return status 200`);
    assert.ok(
      (res.headers.get('content-type') || '').includes('text/html'),
      `Route ${r} should return text/html`,
    );
    const html = await res.text();
    assert.ok(html.includes('Tavoryn Terminal'), `Route ${r} should contain app title`);
    assert.ok(html.includes('manualView'), `Route ${r} should contain manualView container`);
    assert.ok(html.includes('/css/manual.css'), `Route ${r} should link manual.css`);
  }
});

test('Help button in index.html is internal and does not redirect externally', async () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('id="helpLink"'), 'Must have id="helpLink"');
  assert.ok(indexHtml.includes('href="/user-manual"'), 'Must point to /user-manual');
  assert.ok(!indexHtml.includes('target="_blank"'), 'Must not open external tab with target="_blank"');
  assert.ok(!indexHtml.includes('part-timequant.com'), 'Must not link to external part-timequant.com');
});

test('Manual static screenshot assets exist and are served via HTTP', async () => {
  const assetsDir = path.join(process.cwd(), 'docs', 'user-manual', 'assets');
  assert.ok(fs.existsSync(assetsDir), 'docs/user-manual/assets must exist');

  const requiredScreenshots = [
    'dashboard-workspace-overview.png',
    'world-markets-wei.png',
    'chart-technical-analysis-gp.png',
    'dcf-valuation-model.png',
    'portfolio-stress-testing.png',
    'backtest-replay-engine.png',
    'options-chain-omon.png',
    'sec-filings-cf.png',
    'economic-calendar-eco.png',
    'rates-curve-gc.png',
    'paper-trading-trad.png',
    'portfolio-holdings-port.png',
    'financial-analysis-fa.png',
    'screener-equity-scrn.png',
    'ai-research-assistant-ask.png',
    'user-manual-interface.png',
    'user-manual-search.png',
    'user-manual-mobile.png',
  ];

  for (const filename of requiredScreenshots) {
    const filePath = path.join(assetsDir, filename);
    assert.ok(fs.existsSync(filePath), `Screenshot ${filename} must exist on disk`);
    const stat = fs.statSync(filePath);
    assert.ok(stat.size > 10000, `Screenshot ${filename} must be valid image (>10KB), was ${stat.size}`);

    // Verify HTTP access
    const res = await fetch(`${base}/manual/assets/${filename}`);
    assert.equal(res.status, 200, `/manual/assets/${filename} should be 200 OK`);
    assert.equal(res.headers.get('content-type'), 'image/png');
  }
});

test('All required markdown and CSV documentation deliverables exist and are populated', () => {
  const docsDir = path.join(process.cwd(), 'docs', 'user-manual');
  const requiredFiles = [
    'README.md',
    'getting-started.md',
    'feature-inventory.md',
    'troubleshooting.md',
    'glossary.md',
    'coverage-matrix.csv',
    'verification-report.md',
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(docsDir, file);
    assert.ok(fs.existsSync(filePath), `Documentation file ${file} must exist`);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.length > 500, `Documentation file ${file} must be populated (>500 bytes)`);
  }
});

test('Coverage matrix accounts for every registered terminal function', async () => {
  const { FUNCS } = await import('../public/js/fn/index.js');
  const csvContent = fs.readFileSync(
    path.join(process.cwd(), 'docs', 'user-manual', 'coverage-matrix.csv'),
    'utf8',
  );
  const registeredCodes = Object.keys(FUNCS);

  for (const code of registeredCodes) {
    const regex = new RegExp(`^${code},`, 'm');
    assert.ok(
      regex.test(csvContent),
      `Registered function ${code} must be present in coverage-matrix.csv`,
    );
  }

  // Verify all rows have "Fully Documented" status
  const lines = csvContent.trim().split('\n').slice(1);
  assert.ok(lines.length >= registeredCodes.length, 'Matrix must cover all functions');
  for (const line of lines) {
    assert.ok(line.includes('Fully Documented'), `Row must be Fully Documented: ${line}`);
    assert.ok(line.includes('PASS'), `Row must have PASS test status: ${line}`);
  }
});

test('Manual component exports 16 sections with verified content structure', async () => {
  const { MANUAL_SECTIONS, UserManual } = await import('../public/js/manual.js');
  assert.ok(Array.isArray(MANUAL_SECTIONS), 'MANUAL_SECTIONS must be an array');
  assert.equal(MANUAL_SECTIONS.length, 16, 'Must define exactly 16 core documentation modules');
  assert.equal(typeof UserManual, 'function', 'UserManual class must be exported');

  for (const sec of MANUAL_SECTIONS) {
    assert.ok(sec.id && sec.id.length > 0, 'Section must have valid id');
    assert.ok(sec.title && sec.title.length > 0, 'Section must have title');
    assert.ok(sec.code && sec.code.length > 0, 'Section must have code badge');
    assert.ok(sec.summary && sec.summary.length > 0, 'Section must have summary');
    assert.ok(sec.content && sec.content.length > 100, 'Section must have substantive content');
  }
});

test('Paper trading ledger integrity remains byte-for-byte identical', () => {
  const ledgerPath = path.join(process.cwd(), 'data', 'paper-account.json');
  assert.ok(fs.existsSync(ledgerPath), 'data/paper-account.json must exist');
  const buf = fs.readFileSync(ledgerPath);
  assert.equal(buf.length, 2386, 'Ledger size must remain exactly 2,386 bytes');
  const hash = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
  assert.equal(
    hash,
    '8090DF43BBD04EC8254C0DC08C21DF4A4CD326505609ABD4886684523A5BCC4D',
    'Ledger SHA-256 must match baseline exactly',
  );
});
