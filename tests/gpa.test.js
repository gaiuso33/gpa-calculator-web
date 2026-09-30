'use strict';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert')   // loose deepEqual: objects come from a separate VM realm;
const { loadApp } = require('./load-app');

let app;
beforeEach(() => { app = loadApp(); });          // fresh state + empty localStorage per test

const course = (unit, grade, title = 'Course') => ({ title, code: '', unit: String(unit), grade });

/* ─────────────── Calculator.calculate ─────────────── */
describe('Calculator.calculate', () => {
  it('returns zeros for no courses', () => {
    assert.deepEqual(app.Calculator.calculate([], '5.0'),
      { gpa: 0, totalUnits: 0, totalPoints: 0, validCount: 0 });
  });

  it('weights grade points by units (5.0 scale)', () => {
    const r = app.Calculator.calculate([course(3, 'A'), course(2, 'C'), course(1, 'F')], '5.0');
    assert.equal(r.totalPoints, 21);            // 15 + 6 + 0
    assert.equal(r.totalUnits, 6);
    assert.equal(r.gpa, 3.5);
  });

  it('uses the 4.0 scale values', () => {
    const r = app.Calculator.calculate([course(3, 'A'), course(1, 'B')], '4.0');
    assert.equal(r.gpa, 3.75);                  // (12 + 3) / 4
  });

  it('rounds GPA to 2 decimal places', () => {
    const r = app.Calculator.calculate([course(1, 'A'), course(1, 'A'), course(1, 'B')], '5.0');
    assert.equal(r.gpa, 4.67);                  // 14 / 3 = 4.666…
  });

  it('supports fractional units', () => {
    const r = app.Calculator.calculate([course(1.5, 'A'), course(0.5, 'B')], '5.0');
    assert.equal(r.totalUnits, 2);
    assert.equal(r.gpa, 4.75);
  });

  it('counts an F in units but adds zero points', () => {
    const r = app.Calculator.calculate([course(3, 'F')], '5.0');
    assert.equal(r.gpa, 0);
    assert.equal(r.totalUnits, 3);
    assert.equal(r.validCount, 1);
  });

  it('ignores incomplete or invalid rows', () => {
    const r = app.Calculator.calculate([
      course(3, 'A'),
      course(3, ''),            // no grade
      course(0, 'A'),           // zero units
      course(-2, 'A'),          // negative units
      course('abc', 'A'),       // NaN units
      course(3, 'Z'),           // grade not on scale
    ], '5.0');
    assert.equal(r.validCount, 1);
    assert.equal(r.gpa, 5);
  });

  it('treats grade E as invalid on the 4.0 scale', () => {
    const r = app.Calculator.calculate([course(3, 'E')], '4.0');
    assert.equal(r.validCount, 0);
  });
});

/* ─────────────── Calculator.classify ─────────────── */
describe('Calculator.classify', () => {
  const cases = {
    '5.0': [[5.0, 'First Class'], [4.5, 'First Class'], [4.49, 'Second Class Upper'], [3.5, 'Second Class Upper'],
            [3.49, 'Second Class Lower'], [2.4, 'Second Class Lower'], [2.39, 'Third Class'], [1.5, 'Third Class'],
            [1.49, 'Pass'], [1.0, 'Pass'], [0.99, 'Fail'], [0.0, 'Fail']],
    '4.0': [[4.0, 'First Class'], [3.6, 'First Class'], [3.59, 'Second Class Upper'], [3.0, 'Second Class Upper'],
            [2.99, 'Second Class Lower'], [2.0, 'Second Class Lower'], [1.99, 'Third Class'], [1.0, 'Third Class'],
            [0.99, 'Pass'], [0.5, 'Pass'], [0.49, 'Fail'], [0.0, 'Fail']],
  };

  for (const [scale, table] of Object.entries(cases)) {
    for (const [gpa, label] of table) {
      it(`${scale} scale: ${gpa} → ${label}`, () => {
        app.State.courses = [course(3, 'A')];   // classify() returns null when there is no data
        assert.equal(app.Calculator.classify(gpa, scale).label, label);
      });
    }
  }

  it('returns null when there is no valid course data', () => {
    app.State.courses = [];
    assert.equal(app.Calculator.classify(0, '5.0'), null);
  });

  it('does not fall through to Fail for unrounded values between bands', () => {
    app.State.courses = [course(3, 'A')];
    assert.equal(app.Calculator.classify(4.495, '5.0').label, 'Second Class Upper');   // gap 4.49–4.50
    assert.equal(app.Calculator.classify(3.595, '4.0').label, 'Second Class Upper');   // gap 3.59–3.60
  });
});

/* ─────────────── Import.parseCSV ─────────────── */
describe('Import.parseCSV', () => {
  it('parses a basic file and normalises grade case', () => {
    const { courses, errors } = app.Import.parseCSV('Course Title,Code,Units,Grade\nMath,MTH101,3,a\nPhysics,PHY101,2,B');
    assert.equal(errors.length, 0);
    assert.deepEqual(courses.map(c => [c.title, c.code, c.unit, c.grade]),
      [['Math', 'MTH101', '3', 'A'], ['Physics', 'PHY101', '2', 'B']]);
  });

  it('accepts header aliases', () => {
    const { courses } = app.Import.parseCSV('course,credits,grade\nChem,4,C');
    assert.equal(courses[0].unit, '4');
  });

  it('handles quoted commas, escaped quotes, CRLF and a BOM', () => {
    const csv = '\uFEFFCourse Title,Code,Units,Grade\r\n"Intro, Part ""I""",X1,3,A\r\n';
    const { courses } = app.Import.parseCSV(csv);
    assert.equal(courses[0].title, 'Intro, Part "I"');
  });

  it('stops at the blank line so export summary rows are not imported', () => {
    const csv = 'Course Title,Code,Units,Grade,Grade Points\nMath,,3,A,15.00\n\nGrading Scale,5.0 Scale\nGPA,5.00\n';
    const { courses } = app.Import.parseCSV(csv);
    assert.equal(courses.length, 1);
  });

  it('rejects grades not on the active scale, with a row number', () => {
    const { courses, errors } = app.Import.parseCSV('Title,Units,Grade\nA,3,B+\nB,3,B');
    assert.equal(courses.length, 1);
    assert.match(errors[0], /Row 2.*"B\+".*5\.0 scale/);
  });

  it('validates against the 4.0 scale when selected', () => {
    app.State.scale = '4.0';
    const { errors } = app.Import.parseCSV('Title,Units,Grade\nX,3,E');
    assert.equal(errors.length, 1);
  });

  it('reports missing title and bad units, and allows a blank grade', () => {
    const { courses, errors } = app.Import.parseCSV('Title,Units,Grade\n,3,A\nX,zero,A\nY,2,');
    assert.equal(errors.length, 2);
    assert.equal(courses.length, 1);
    assert.equal(courses[0].grade, '');
  });

  it('throws on missing required columns or no data rows', () => {
    assert.throws(() => app.Import.parseCSV('Foo,Bar\n1,2'), /Course Title.*Units/);
    assert.throws(() => app.Import.parseCSV('Title,Units,Grade'), /header row/);
  });
});

/* ─────────────── Import.parseJSON ─────────────── */
describe('Import.parseJSON', () => {
  it('parses a top-level array with name/units aliases', () => {
    const { courses } = app.Import.parseJSON('[{"name":"Bio","units":3,"grade":"a"}]');
    assert.deepEqual([courses[0].title, courses[0].unit, courses[0].grade], ['Bio', '3', 'A']);
  });

  it('parses { courses: [...] }', () => {
    const { courses } = app.Import.parseJSON('{"courses":[{"title":"Art","unit":2,"grade":"B"}]}');
    assert.equal(courses.length, 1);
  });

  it('collects errors for invalid items', () => {
    const { courses, errors } = app.Import.parseJSON('[{"title":"A","unit":3,"grade":"Q"},{"title":"B","unit":3,"grade":"A"}]');
    assert.equal(courses.length, 1);
    assert.match(errors[0], /Item 1/);
  });

  it('throws on the wrong shape or malformed JSON', () => {
    assert.throws(() => app.Import.parseJSON('{"foo":1}'), /expected an array/);
    assert.throws(() => app.Import.parseJSON('not json'));
  });
});

/* ─────────────── CGPA ─────────────── */
describe('CGPA.calculate', () => {
  const save = (name, courses, scale = '5.0') =>
    app.Storage.addSemester(name, courses, app.Calculator.calculate(courses, scale), scale);

  it('returns an empty result with no semesters', () => {
    assert.deepEqual(app.CGPA.calculate(), { cgpa: 0, count: 0, trend: null });
  });

  it('weights by units across semesters', () => {
    save('S1', [course(3, 'A')]);               // 15 pts / 3 units
    save('S2', [course(1, 'F')]);               //  0 pts / 1 unit
    assert.equal(app.CGPA.calculate().cgpa, 3.75);
  });

  it('reports improving when the NEWEST semester is higher', () => {
    save('Older', [course(3, 'C')]);            // 3.0
    save('Newer', [course(3, 'A')]);            // 5.0 (saved last → stored first)
    assert.equal(app.CGPA.calculate().trend, 'improving');
  });

  it('reports declining and stable correctly', () => {
    save('Older', [course(3, 'A')]);
    save('Newer', [course(3, 'C')]);
    assert.equal(app.CGPA.calculate().trend, 'declining');
    save('Newest', [course(3, 'C')]);
    assert.equal(app.CGPA.calculate().trend, 'stable');
  });
});

/* ─────────────── Backup / restore (#15) ─────────────── */
describe('Storage backup & restore', () => {
  const save = (name, courses) =>
    app.Storage.addSemester(name, courses, app.Calculator.calculate(courses, '5.0'), '5.0');

  it('round-trips through replace', () => {
    save('S1', [course(3, 'A')]);
    save('S2', [course(2, 'B')]);
    const backup = app.Storage.buildBackup();
    app.localStorage.clear();
    const r = app.Storage.restoreBackup(backup, 'replace');
    assert.equal(r.added, 2);
    assert.deepEqual(app.Storage.loadSemesters().map(s => s.name).sort(), ['S1', 'S2']);
  });

  it('replace discards the current history', () => {
    save('Keep?', [course(3, 'A')]);
    const backup = JSON.stringify({ app: 'gpapro', version: 1, semesters: [
      { id: 'x1', name: 'Only', scale: '5.0', savedAt: '2025-01-01', courses: [course(3, 'B')] }] });
    app.Storage.restoreBackup(backup, 'replace');
    assert.deepEqual(app.Storage.loadSemesters().map(s => s.name), ['Only']);
  });

  it('merge adds new semesters and skips ones whose id already exists', () => {
    save('S1', [course(3, 'A')]);
    const backup = app.Storage.buildBackup();   // contains S1 already
    const r = app.Storage.restoreBackup(backup, 'merge');
    assert.equal(r.added, 0);
    assert.equal(r.duplicates, 1);
    assert.equal(app.Storage.loadSemesters().length, 1);
  });

  it('merge keeps newest-first ordering', () => {
    const mk = (id, savedAt) => ({ id, name: id, scale: '5.0', savedAt, courses: [course(3, 'A')] });
    app.Storage.saveSemesters([mk('mid', '2025-06-01T00:00:00Z')]);
    const backup = JSON.stringify({ app: 'gpapro', version: 1, semesters: [
      mk('old', '2024-01-01T00:00:00Z'), mk('new', '2026-01-01T00:00:00Z')] });
    app.Storage.restoreBackup(backup, 'merge');
    assert.deepEqual(app.Storage.loadSemesters().map(s => s.id), ['new', 'mid', 'old']);
  });

  it('rejects files that are not GPA Pro backups', () => {
    assert.throws(() => app.Storage.parseBackup('nope'), /not valid JSON/);
    assert.throws(() => app.Storage.parseBackup('{"semesters":[]}'), /Not a GPA Pro backup/);
    assert.throws(() => app.Storage.parseBackup('{"app":"gpapro","version":9,"semesters":[]}'), /newer version/);
  });

  it('skips malformed semesters and recomputes totals instead of trusting the file', () => {
    const backup = JSON.stringify({ app: 'gpapro', version: 1, semesters: [
      { id: 'a', name: 'Good', scale: '5.0', gpa: 99, totalUnits: 999, courses: [course(3, 'A')] },
      { id: 'b', name: '', scale: '5.0', courses: [course(3, 'A')] },
      { id: 'c', name: 'BadScale', scale: '9.0', courses: [course(3, 'A')] },
      { id: 'd', name: 'NoValidCourses', scale: '5.0', courses: [course(3, '')] } ] });
    const { semesters, skipped } = app.Storage.parseBackup(backup);
    assert.equal(skipped, 3);
    assert.equal(semesters[0].gpa, 5);
    assert.equal(semesters[0].totalUnits, 3);
  });

  it('sanitises fields that the UI renders as HTML', () => {
    const backup = JSON.stringify({ app: 'gpapro', version: 1, semesters: [
      { id: 'a', name: 'X', scale: '5.0', courses: [
        { title: 'ok', unit: '<img src=x onerror=alert(1)>', grade: '<b>A</b>' },
        course(3, 'A') ] }] });
    const c = app.Storage.parseBackup(backup).semesters[0].courses;
    assert.equal(c[0].unit, '');
    assert.equal(c[0].grade, '');
  });
});
