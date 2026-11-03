import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

test('Tour Module: Defines comprehensive steps covering all workspace tabs and engines', async () => {
  const { TOUR_STEPS, tour, startTour } = await import('../public/js/tour.js');
  assert.ok(Array.isArray(TOUR_STEPS), 'TOUR_STEPS must be an array');
  assert.ok(TOUR_STEPS.length >= 20, `Expected at least 20 tour steps, got ${TOUR_STEPS.length}`);
  assert.equal(typeof startTour, 'function', 'startTour must be an exported function');
  assert.ok(tour && typeof tour.start === 'function', 'tour instance must be exported');
  assert.equal(typeof tour.goToStep, 'function', 'tour.goToStep must be an exported method');

  // Verify each step has required structural properties
  const stepIds = new Set();
  for (const step of TOUR_STEPS) {
    assert.ok(step.id && typeof step.id === 'string', 'Step must have string id');
    assert.ok(!stepIds.has(step.id), `Step id must be unique: ${step.id}`);
    stepIds.add(step.id);

    assert.ok(step.target && typeof step.target === 'string', `Step ${step.id} must have target selector`);
    assert.ok(step.chapter && typeof step.chapter === 'string', `Step ${step.id} must have chapter`);
    assert.ok(step.title && typeof step.title === 'string', `Step ${step.id} must have title`);
    assert.ok(step.desc && typeof step.desc === 'string' && step.desc.length > 20, `Step ${step.id} must have substantive description`);
    assert.ok(['top', 'bottom', 'left', 'right'].includes(step.placement), `Step ${step.id} must have valid placement`);
  }

  // Verify critical features are explicitly covered
  const coveredIds = TOUR_STEPS.map((s) => s.id);
  const requiredCovers = [
    'welcome',
    'global-cmd',
    'yellow-keys',
    'macro-monitors',
    'rates-curves',
    'cross-asset',
    'movers-screener',
    'watchlists',
    'alerts',
    'paper-trading',
    'ai-desk',
    'data-status',
    'layout-switcher',
    'panel-header',
    'panel-export',
    'panel-controls',
    'dcf-valuation',
    'charting-engine',
    'backtest-stress',
    'options-chain',
    'tape-stream',
    'user-manual',
  ];

  for (const req of requiredCovers) {
    assert.ok(coveredIds.includes(req), `Tour must cover ${req}`);
  }
});

test('Tour Integration: index.html links tour.css and exposes TOUR header trigger', () => {
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('/css/tour.css'), 'index.html must link /css/tour.css');
  assert.ok(indexHtml.includes('id="tourBtn"'), 'index.html must include id="tourBtn"');
  assert.ok(indexHtml.includes('>TOUR</button>'), 'index.html must display TOUR text');
});

test('Tour Function: TOUR command is registered in terminal meta functions', async () => {
  const { FUNCS } = await import('../public/js/fn/index.js');
  const tourFn = FUNCS.TOUR;
  assert.ok(tourFn, 'TOUR function must be defined in FUNCS');
  assert.equal(tourFn.name, 'Interactive Onboarding Tour');
  assert.equal(typeof tourFn.render, 'function');
});

test('Tour Styles: tour.css defines CRT amber spotlight, card and transitions', () => {
  const cssPath = path.join(process.cwd(), 'public', 'css', 'tour.css');
  assert.ok(fs.existsSync(cssPath), 'public/css/tour.css must exist');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.ok(css.includes('.tour-overlay'), 'Must define .tour-overlay');
  assert.ok(css.includes('.tour-spotlight'), 'Must define .tour-spotlight');
  assert.ok(css.includes('.tour-card'), 'Must define .tour-card');
  assert.ok(css.includes('--amber'), 'Must incorporate --amber color tokens');
  assert.ok(css.includes('.tour-key-btn'), 'Must define .tour-key-btn for clickable navigation buttons');
  assert.ok(css.includes('.tour-progress-bar'), 'Must define .tour-progress-bar');
  assert.ok(css.includes('cursor: pointer'), 'Progress bar and key buttons must have cursor: pointer');
});

test('Tour Interactivity: Progress bar and arrow buttons are interactive in tour.js', () => {
  const jsPath = path.join(process.cwd(), 'public', 'js', 'tour.js');
  const js = fs.readFileSync(jsPath, 'utf8');
  assert.ok(js.includes('tour-progress-bar'), 'tour.js must render .tour-progress-bar');
  assert.ok(js.includes('tour-key-btn tour-prev'), 'tour.js must render clickable ← button');
  assert.ok(js.includes('tour-key-btn tour-next'), 'tour.js must render clickable → button');
  assert.ok(js.includes('tour-key-btn tour-skip'), 'tour.js must render clickable Esc button');
  assert.ok(js.includes('goToStep'), 'tour.js must implement goToStep scrub navigation');
});

test('Safety: Zero npm dependencies and paper trading ledger remains byte-for-byte identical', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies || {}, {}, 'Dependencies must remain empty (zero runtime npm dependencies)');

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
