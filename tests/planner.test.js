'use strict';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');       // loose deepEqual: objects come from a separate VM realm
const { loadApp } = require('./load-app');

let app;
beforeEach(() => { app = loadApp(); });

const planned = (...units) => units.map((u, i) => ({ title: `C${i + 1}`, unit: u }));
const round2  = x => Math.round(x * 100) / 100;

describe('Planner.standing', () => {
  it('sums saved semesters on the same scale and ignores the other scale', () => {
    const sem = (scale, unit, grade) => ({ scale, courses: [{ unit: String(unit), grade }] });
    const s = app.Planner.standing([sem('5.0', 3, 'A'), sem('5.0', 3, 'C'), sem('4.0', 3, 'A')], '5.0');
    assert.equal(s.units, 6);
    assert.equal(s.points, 24);            // 15 + 9
    assert.equal(s.cgpa, 4);
    assert.equal(s.used, 2);
    assert.equal(s.ignored, 1);
  });

  it('returns a null cgpa when there is no history', () => {
    const s = app.Planner.standing([], '5.0');
    assert.equal(s.cgpa, null);
    assert.equal(s.units, 0);
  });
});

describe('Planner.classTargets', () => {
  it('lists class thresholds best-first', () => {
    const t = app.Planner.classTargets('5.0');
    assert.equal(t[0].label, 'First Class');
    assert.equal(t[0].min, 4.5);
    assert.equal(app.Planner.classTargets('4.0')[0].min, 3.6);
  });
});

describe('Planner.plan — validation', () => {
  it('needs at least one planned course with units', () => {
    assert.equal(app.Planner.plan({ courses: [], target: 4, scale: '5.0' }).status, 'invalid');
    assert.equal(app.Planner.plan({ courses: [{ title: 'x', unit: 0 }], target: 4, scale: '5.0' }).status, 'invalid');
  });

  it('rejects targets outside the scale', () => {
    for (const target of [0, -1, 5.1, NaN]) {
      assert.equal(app.Planner.plan({ courses: planned(3), target, scale: '5.0' }).status, 'invalid');
    }
    assert.equal(app.Planner.plan({ courses: planned(3), target: 4.5, scale: '4.0' }).status, 'invalid');
  });
});

describe('Planner.plan — outcomes', () => {
  it('reachable: computes required average and valid combinations', () => {
    // 60 units @ 3.5 CGPA (210 pts) + 5 courses x 3 units, aiming for 3.75
    const r = app.Planner.plan({ units: 60, points: 210, courses: planned(3, 3, 3, 3, 3), target: 3.75, scale: '5.0' });
    assert.equal(r.status, 'reachable');
    assert.equal(r.currentCGPA, 3.5);
    assert.equal(r.plannedUnits, 15);
    assert.equal(r.requiredAverage, 4.73);          // (3.745*75 - 210) / 15 = 4.725
    assert.equal(r.maxAchievable, 3.8);             // (210 + 75) / 75
  });

  it('every combination really reaches the target once rounded', () => {
    const r = app.Planner.plan({ units: 60, points: 210, courses: planned(3, 3, 3, 3, 3), target: 3.75, scale: '5.0' });
    assert.ok(r.combos.length >= 2);
    for (const c of r.combos) assert.ok(c.resultCGPA >= 3.75, `${c.label} → ${c.resultCGPA}`);
  });

  it('mixed combination upgrades only as many courses as needed', () => {
    const r = app.Planner.plan({ units: 60, points: 210, courses: planned(3, 3, 3, 3, 3), target: 3.75, scale: '5.0' });
    const mixed = r.combos.find(c => c.label.startsWith('Mixed'));
    const grades = mixed.assignments.map(a => a.grade).sort().join('');
    assert.equal(grades, 'AAAAB');                   // four A's and one B = 72 pts ≥ 70.875
  });

  it('works with no history at all', () => {
    const r = app.Planner.plan({ courses: planned(3, 3, 3, 3), target: 3.0, scale: '4.0' });
    assert.equal(r.status, 'reachable');
    assert.equal(r.currentCGPA, null);
    assert.equal(r.combos[0].assignments[0].grade, 'B');
  });

  it('unreachable: says so and reports the best possible CGPA', () => {
    const r = app.Planner.plan({ units: 60, points: 150, courses: planned(3, 3, 3, 3, 3), target: 4.5, scale: '5.0' });
    assert.equal(r.status, 'unreachable');
    assert.equal(r.maxAchievable, 3);               // (150 + 75) / 75
    assert.equal(r.combos.length, 0);
  });

  it('secured: target already safe even with failing grades', () => {
    const r = app.Planner.plan({ units: 60, points: 270, courses: planned(3), target: 3.0, scale: '5.0' });
    assert.equal(r.status, 'secured');
    assert.ok(r.minAchievable >= 3.0 - 0.005);
  });

  it('uses the same rounding as the app (4.496 counts as 4.50)', () => {
    // 99 units / 445.5 pts + one 1-unit course: a B gives 449.5/100 = 4.495, which the app shows as 4.50
    const r = app.Planner.plan({ units: 99, points: 445.5, courses: planned(1), target: 4.5, scale: '5.0' });
    assert.equal(r.status, 'reachable');
    assert.equal(r.combos[0].assignments[0].grade, 'B');
    assert.equal(r.combos[0].resultCGPA, 4.5);
  });

  it('property: any reachable plan gives combos that meet the rounded target', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let n = 0; n < 300; n++) {
      const scale = rnd() < 0.5 ? '5.0' : '4.0';
      const max = scale === '5.0' ? 5 : 4;
      const units = Math.floor(rnd() * 90);
      const points = round2(units * rnd() * max);
      const courses = planned(...Array.from({ length: 1 + Math.floor(rnd() * 7) }, () => 1 + Math.floor(rnd() * 4)));
      const target = round2(0.5 + rnd() * (max - 0.5));
      const r = app.Planner.plan({ units, points, courses, target, scale });
      if (r.status !== 'reachable') continue;
      assert.ok(r.combos.length >= 1, 'reachable plans must offer at least one combination');
      for (const c of r.combos) {
        assert.ok(c.resultCGPA >= target - 1e-9,
          `${scale} target ${target}: "${c.label}" gave ${c.resultCGPA}`);
      }
    }
  });
});
