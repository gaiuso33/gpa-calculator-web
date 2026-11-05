'use strict';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load-app');

let app;
beforeEach(() => { app = loadApp(); });

const data = (over = {}) => ({
  hasData: true, gpa: 4.52, scaleMax: 5, scaleLabel: '5.0', classLabel: 'First Class',
  totalUnits: 18, cgpa: 4.31, cgpaCount: 2, ...over,
});
const all = { gpa: true, classification: true, cgpa: true, units: true, scale: true };
const none = { gpa: false, classification: false, cgpa: false, units: false, scale: false };

/* Records every canvas call so draw() can be tested without a browser. */
function fakeCtx() {
  const calls = [];
  const ctx = new Proxy({ calls, texts: [] }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return s => ({ width: String(s).length * 20 });
      if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (...a) => { calls.push(k); if (k === 'fillText') t.texts.push(String(a[0])); };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return ctx;
}

describe('ShareCard.buildModel', () => {
  it('includes exactly what the user chose', () => {
    const m = app.ShareCard.buildModel(data(), { ...none, gpa: true, cgpa: true });
    assert.equal(m.hero.value, '4.52');
    assert.deepEqual(m.lines.map(l => l.label), ['Cumulative GPA']);
  });

  it('shows every detail when all are chosen', () => {
    const m = app.ShareCard.buildModel(data(), all);
    assert.deepEqual(m.lines.map(l => l.label), ['Classification', 'Cumulative GPA', 'Total units', 'Grading scale']);
    assert.equal(m.hero.kind, 'gpa');
    assert.equal(m.hero.pct, 4.52 / 5);
  });

  it('caps the ring at 100%', () => {
    assert.equal(app.ShareCard.buildModel(data({ gpa: 5.4 }), all).hero.pct, 1);
  });

  it('promotes the first chosen detail to the headline when GPA is off', () => {
    const m = app.ShareCard.buildModel(data(), { ...none, classification: true, units: true });
    assert.deepEqual([m.hero.kind, m.hero.label, m.hero.value], ['text', 'Classification', 'First Class']);
    assert.deepEqual(m.lines.map(l => l.label), ['Total units']);
  });

  it('skips CGPA when no semesters are saved', () => {
    const m = app.ShareCard.buildModel(data({ cgpaCount: 0 }), { ...none, gpa: true, cgpa: true });
    assert.equal(m.lines.length, 0);
  });

  it('reports why it is empty', () => {
    assert.match(app.ShareCard.buildModel(data({ hasData: false }), all).reason, /complete course/);
    assert.match(app.ShareCard.buildModel(data(), none).reason, /at least one detail/);
    assert.match(app.ShareCard.buildModel(data({ cgpaCount: 0 }), { ...none, cgpa: true }).reason, /at least one detail/);
  });

  it('trims the caption to 40 characters', () => {
    const m = app.ShareCard.buildModel(data(), all, '   ' + 'x'.repeat(60));
    assert.equal(m.caption.length, 40);
  });
});

describe('ShareCard.shareText', () => {
  it('summarises the card in one line', () => {
    const t = app.ShareCard.shareText(app.ShareCard.buildModel(data(), { ...none, gpa: true, classification: true }));
    assert.match(t, /^GPA 4\.52 out of 5\.0 · Classification: First Class — made with GPA Calculator Pro$/);
  });
  it('is empty for an empty model', () => {
    assert.equal(app.ShareCard.shareText({ empty: true }), '');
  });
});

describe('ShareCard.fit', () => {
  it('leaves short text alone and truncates long text with an ellipsis', () => {
    const ctx = fakeCtx();
    assert.equal(app.ShareCard.fit(ctx, 'abc', 100), 'abc');
    const out = app.ShareCard.fit(ctx, 'abcdefghijklmnop', 100);   // 20px per char → max 5 chars
    assert.ok(out.endsWith('…'));
    assert.ok(ctx.measureText(out).width <= 100);
  });
});

describe('ShareCard.draw', () => {
  it('draws the chosen values and nothing else', () => {
    const ctx = fakeCtx();
    app.ShareCard.draw(ctx, app.ShareCard.buildModel(data(), { ...none, gpa: true, classification: true }, 'Year 2'));
    for (const s of ['4.52', 'First Class', 'Year 2', 'GPA Pro']) assert.ok(ctx.texts.includes(s), `missing "${s}"`);
    assert.ok(!ctx.texts.some(t => /Total units|Grading scale|Cumulative/.test(t)), 'drew an unchosen detail');
    assert.ok(ctx.calls.includes('arc'), 'GPA ring not drawn');
  });

  it('draws the ring progress only when the GPA is above zero', () => {
    const ctx = fakeCtx();
    app.ShareCard.draw(ctx, app.ShareCard.buildModel(data({ gpa: 0 }), { ...none, gpa: true }));
    assert.equal(ctx.calls.filter(c => c === 'arc').length, 1);     // track only
  });

  it('draws a friendly message for an empty model', () => {
    const ctx = fakeCtx();
    app.ShareCard.draw(ctx, { empty: true, reason: 'Add at least one complete course first.' });
    assert.ok(ctx.texts.some(t => t.includes('Add at least one')));
  });

  it('never draws more than four detail rows', () => {
    const ctx = fakeCtx();
    const m = app.ShareCard.buildModel(data(), all);
    m.lines.push({ label: 'Extra', value: 'x' });
    app.ShareCard.draw(ctx, m);
    assert.ok(!ctx.texts.includes('Extra'));
  });
});
