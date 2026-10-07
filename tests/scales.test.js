'use strict';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('./load-app');

let app;
beforeEach(() => { app = loadApp(); });

const course = (unit, grade, code = '', title = 'Course') => ({ title, code, unit: String(unit), grade });
const tenPoint = { label: '10-point', grades: { A: 10, B: 8, C: 6, D: 4, F: 0 } };
const saveSem = (name, courses, scale = '5.0') =>
  app.Storage.addSemester(name, courses, app.Calculator.calculate(courses, scale), scale);

/* ─────────────── built-in plus/minus scale ─────────────── */
describe('4.0 ± built-in scale', () => {
  it('exists with sensible values and sorted options', () => {
    const s = app.GRADE_SCALES['4.0pm'];
    assert.equal(s.grades['A-'], 3.7);
    assert.equal(s.grades['B+'], 3.3);
    assert.equal(s.max, 4);
    assert.equal(s.options[0].value, 'A');
    assert.equal(s.options[s.options.length - 1].value, 'F');
    assert.equal(s.custom, false);
  });

  it('calculates with plus/minus grades', () => {
    const r = app.Calculator.calculate([course(3, 'A-'), course(3, 'B+')], '4.0pm');
    assert.equal(r.gpa, 3.5);                       // (11.1 + 9.9) / 6
  });

  it('classifies like the plain 4.0 scale', () => {
    app.State.courses = [course(3, 'A')];
    assert.equal(app.Calculator.classify(3.6, '4.0pm').label, 'First Class');
    assert.equal(app.Calculator.classify(3.59, '4.0pm').label, 'Second Class Upper');
  });
});

/* ─────────────── validation ─────────────── */
describe('Scales.validate', () => {
  const bad = (def, re) => {
    const v = app.Scales.validate(def);
    assert.equal(v.ok, false);
    assert.match(v.error, re);
  };

  it('accepts a good definition and derives max', () => {
    const v = app.Scales.validate(tenPoint);
    assert.equal(v.ok, true);
    assert.equal(v.clean.max, 10);
    assert.match(v.clean.id, /^custom_[a-z0-9]+$/);
  });

  it('normalises grade labels to upper case', () => {
    const v = app.Scales.validate({ label: 'x', grades: { a: 4, 'b+': 3, f: 0 } });
    assert.deepEqual(Object.keys(v.clean.grades), ['A', 'B+', 'F']);
  });

  it('rejects bad names, grade counts, labels and points', () => {
    bad({ label: '', grades: tenPoint.grades }, /name/);
    bad({ label: 'x'.repeat(25), grades: tenPoint.grades }, /name/);
    bad({ label: 'x', grades: { A: 5 } }, /2 and 20/);
    bad({ label: 'x', grades: { '1A': 5, B: 3 } }, /not valid/);
    bad({ label: 'x', grades: { A: 5, a: 3 } }, /twice/);
    bad({ label: 'x', grades: { A: -1, B: 3 } }, /between 0 and 20/);
    bad({ label: 'x', grades: { A: 4.123, B: 3 } }, /2 decimals/);
    bad({ label: 'x', grades: { A: 0.5, B: 0 } }, /at least 1/);
  });

  it('strips markup characters from the name and refuses prototype-style grade keys', () => {
    const v = app.Scales.validate({ label: '<b>Mine</b>', grades: { A: 4, B: 2 } });
    assert.equal(v.clean.label, 'bMine/b');
    assert.equal(app.Scales.validate({ label: 'x', grades: { __proto__x: 4, B: 2 } }).ok, false);
  });

  it('requireId rejects definitions without a valid id', () => {
    assert.equal(app.Scales.validate(tenPoint, { requireId: true }).ok, false);
  });
});

/* ─────────────── custom scales: save, classify, persist ─────────────── */
describe('custom scales', () => {
  it('registers a scale that Calculator and classify can use', () => {
    const { id } = app.Scales.save(tenPoint);
    assert.equal(app.GRADE_SCALES[id].max, 10);
    assert.equal(app.Calculator.calculate([course(2, 'A'), course(2, 'C')], id).gpa, 8);
    app.State.courses = [course(2, 'A')];
    assert.equal(app.Calculator.classify(9.0, id).label, 'First Class');
    assert.equal(app.Calculator.classify(8.99, id).label, 'Second Class Upper');
  });

  it('derived class bands reproduce the built-in 5.0 table exactly', () => {
    const derived = app.Scales.deriveBands(5).map(b => [b.min, b.max, b.label]);
    const builtin = app.CLASSIFICATIONS['5.0'].map(b => [b.min, b.max, b.label]);
    assert.deepEqual(derived, builtin);
  });

  it('survives a reload (persisted in localStorage)', () => {
    const { id } = app.Scales.save(tenPoint);
    const again = loadApp({ store: app.store });
    assert.equal(again.GRADE_SCALES[id], undefined);          // not registered until loadCustom runs…
    again.Scales.loadCustom();
    assert.equal(again.GRADE_SCALES[id].label, '10-point');   // …exactly what App.init does
    assert.equal(again.GRADE_SCALES[id].grades.B, 8);
  });

  it('ignores corrupt stored data instead of crashing', () => {
    app.store.set('gpapro_custom_scales', '{not json');
    assert.doesNotThrow(() => app.Scales.loadCustom());
    app.store.set('gpapro_custom_scales', JSON.stringify([{ id: '__proto__', label: 'x', grades: { A: 4, B: 2 } }]));
    assert.doesNotThrow(() => app.Scales.loadCustom());
    assert.equal(app.Scales.listCustom().length, 0);
  });

  it('caps the number of custom scales', () => {
    for (let i = 0; i < 10; i++) assert.equal(app.Scales.save({ ...tenPoint, label: `S${i}` }).ok, true);
    assert.match(app.Scales.save(tenPoint).error, /up to 10/);
  });

  it('built-in scales cannot be edited or deleted', () => {
    assert.equal(app.Scales.save({ id: '5.0', ...tenPoint }).ok, false);
    assert.equal(app.Scales.remove('5.0').ok, false);
    assert.equal(app.Scales.remove('4.0pm').ok, false);
  });
});

describe('custom scales used by saved semesters', () => {
  let id;
  beforeEach(() => {
    id = app.Scales.save(tenPoint).id;
    saveSem('S1', [course(3, 'A')], id);
  });

  it('can be renamed, but points and grades are locked', () => {
    const sems = app.Storage.loadSemesters();
    assert.equal(app.Scales.save({ id, label: 'Renamed', grades: tenPoint.grades }, sems).ok, true);
    assert.equal(app.GRADE_SCALES[id].label, 'Renamed');
    const changed = app.Scales.save({ id, label: 'Renamed', grades: { ...tenPoint.grades, A: 9 } }, sems);
    assert.equal(changed.ok, false);
    assert.match(changed.error, /1 saved semester/);
  });

  it('cannot be deleted while in use, can be once unused', () => {
    assert.equal(app.Scales.remove(id, app.Storage.loadSemesters()).ok, false);
    assert.equal(app.Scales.remove(id, []).ok, true);
    assert.equal(app.GRADE_SCALES[id], undefined);
  });

  it('unused scales can be freely edited', () => {
    const free = app.Scales.save({ ...tenPoint, label: 'Free' }).id;
    assert.equal(app.Scales.save({ id: free, label: 'Free', grades: { A: 9, B: 5 } }, app.Storage.loadSemesters()).ok, true);
  });
});

/* ─────────────── switching scale ─────────────── */
describe('Scales.reconcileGrades', () => {
  it('keeps valid grades, maps A-/B+ to A/B, clears the rest', () => {
    const r = app.Scales.reconcileGrades([course(3, 'A-'), course(3, 'B'), course(3, 'E'), course(3, '')], '4.0');
    assert.deepEqual(r.courses.map(c => c.grade), ['A', 'B', '', '']);
    assert.equal(r.mapped, 1);
    assert.equal(r.cleared, 1);
  });

  it('leaves everything alone when switching to the plus/minus scale', () => {
    const r = app.Scales.reconcileGrades([course(3, 'A'), course(3, 'B')], '4.0pm');
    assert.equal(r.mapped + r.cleared, 0);
  });
});

/* ─────────────── repeat / retake rules ─────────────── */
describe('repeat rules', () => {
  const list = [course(3, 'F', 'MTH101'), course(3, 'A', 'mth101 '), course(3, 'B', 'PHY101')];

  it('"all" counts every attempt (default, unchanged behaviour)', () => {
    assert.equal(app.Calculator.calculate(list, '5.0').totalUnits, 9);
  });

  it('"latest" keeps only the last valid attempt, matching codes case-insensitively', () => {
    const r = app.Calculator.calculate(list, '5.0', 'latest');
    assert.equal(r.totalUnits, 6);
    assert.equal(r.totalPoints, 27);                // A (15) + B (12)
  });

  it('"best" keeps the highest grade whatever the order', () => {
    const r = app.Calculator.calculate([course(3, 'A', 'X1'), course(3, 'C', 'X1')], '5.0', 'best');
    assert.equal(r.totalPoints, 15);
    assert.equal(r.totalUnits, 3);
  });

  it('a blank or invalid retake never replaces a valid earlier grade', () => {
    const r = app.Calculator.calculate([course(3, 'B', 'X1'), course(3, '', 'X1'), course(0, 'A', 'X1')], '5.0', 'latest');
    assert.equal(r.totalPoints, 12);
  });

  it('courses without a code are never merged', () => {
    const r = app.Calculator.calculate([course(3, 'A'), course(3, 'A')], '5.0', 'latest');
    assert.equal(r.totalUnits, 6);
  });

  it('repeatsIgnored reports how many attempts were left out', () => {
    assert.equal(app.Calculator.repeatsIgnored(list, '5.0', 'latest'), 1);
    assert.equal(app.Calculator.repeatsIgnored(list, '5.0', 'all'), 0);
  });
});

describe('repeat rules across saved semesters (carry-over)', () => {
  beforeEach(() => {
    saveSem('Year 1', [course(3, 'F', 'MTH101'), course(3, 'B', 'PHY101')]);
    saveSem('Year 2 (resit)', [course(3, 'A', 'MTH101')]);
  });

  it('CGPA counts a resit once under "latest" and "best"', () => {
    assert.equal(app.CGPA.calculate('5.0', 'all').cgpa, 9 / 3 >= 0 ? (0 + 12 + 15) / 9 : 0);
    assert.equal(app.CGPA.calculate('5.0', 'latest').cgpa, (12 + 15) / 6);
    assert.equal(app.CGPA.calculate('5.0', 'best').cgpa, (12 + 15) / 6);
  });

  it('the semester count and trend are not affected by the rule', () => {
    assert.equal(app.CGPA.calculate('5.0', 'latest').count, 2);
  });

  it('Planner.standing applies the same rule', () => {
    const sems = app.Storage.loadSemesters();
    assert.equal(app.Planner.standing(sems, '5.0', 'all').units, 9);
    assert.equal(app.Planner.standing(sems, '5.0', 'latest').units, 6);
  });
});

describe('CGPA only mixes semesters from the same scale', () => {
  it('ignores semesters saved on another scale', () => {
    saveSem('5.0 sem', [course(3, 'A')], '5.0');
    saveSem('4.0 sem', [course(3, 'F')], '4.0');
    assert.equal(app.CGPA.calculate('5.0').cgpa, 5);
    assert.equal(app.CGPA.calculate('4.0').cgpa, 0);
    assert.equal(app.CGPA.otherScaleCount('5.0'), 1);
  });
});

/* ─────────────── backups carry custom scales ─────────────── */
describe('backup & restore with custom scales', () => {
  it('restores semesters and their custom scale on a fresh install', () => {
    const { id } = app.Scales.save(tenPoint);
    saveSem('Custom sem', [course(3, 'B')], id);
    const backup = app.Storage.buildBackup();
    assert.equal(JSON.parse(backup).customScales.length, 1);

    const fresh = loadApp();                                     // new device: no custom scale known
    assert.equal(fresh.GRADE_SCALES[id], undefined);
    const r = fresh.Storage.restoreBackup(backup, 'replace');
    assert.equal(r.added, 1);
    assert.equal(fresh.GRADE_SCALES[id].grades.B, 8);
    assert.equal(fresh.Storage.loadSemesters()[0].gpa, 8);
    assert.equal(fresh.Scales.listCustom().length, 1);           // and it is now persisted
  });

  it('previewing a backup (parseBackup) does not register anything', () => {
    const { id } = app.Scales.save(tenPoint);
    saveSem('Custom sem', [course(3, 'B')], id);
    const backup = app.Storage.buildBackup();
    const fresh = loadApp();
    const parsed = fresh.Storage.parseBackup(backup);
    assert.equal(parsed.semesters.length, 1);
    assert.equal(fresh.GRADE_SCALES[id], undefined);
  });

  it('skips semesters whose scale is unknown and not included in the file', () => {
    const backup = JSON.stringify({ app: 'gpapro', version: 1, semesters: [
      { id: 'a', name: 'Ghost', scale: 'custom_zzzz9999', savedAt: '2025-01-01', courses: [course(3, 'A')] }] });
    const r = app.Storage.parseBackup(backup);
    assert.equal(r.semesters.length, 0);
    assert.equal(r.skipped, 1);
  });

  it('importDefs ignores invalid definitions and existing ids', () => {
    const { id } = app.Scales.save(tenPoint);
    const n = app.Scales.importDefs([{ id, label: 'dup', grades: { A: 4, B: 2 } }, { id: 'bad', label: 'x' }, null]);
    assert.equal(n, 0);
  });
});
