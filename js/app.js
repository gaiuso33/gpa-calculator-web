/**
 * GPA Calculator Pro — app.js (ENHANCED)
 * ============================================================
 * Architecture: Module-object pattern with improvements:
 * - Global error handling with try-catch blocks
 * - Keyboard shortcuts (Ctrl+N, Ctrl+S, Ctrl+E, Ctrl+Z, Escape)
 * - SVG ring animations for smooth GPA updates
 * - Enhanced input validation with edge cases
 * - CSV & JSON import functionality
 * - Cumulative GPA tracking (CGPA)
 * - Undo/Redo system for course operations
 * - Improved error handling for all exports
 *
 * Folder: js/app.js
 * Dependencies: jsPDF + jsPDF-autotable (CDN, see index.html)
 * ============================================================
 */

'use strict';

/* ============================================================
   1. CONSTANTS
   ============================================================ */

const GRADE_SCALES = {
  '5.0': {
    label: '5.0',
    max: 5.0,
    grades: {
      A: 5,
      B: 4,
      C: 3,
      D: 2,
      E: 1,
      F: 0,
    },
    options: [
      { value: 'A', label: 'A — 5' },
      { value: 'B', label: 'B — 4' },
      { value: 'C', label: 'C — 3' },
      { value: 'D', label: 'D — 2' },
      { value: 'E', label: 'E — 1' },
      { value: 'F', label: 'F — 0' },
    ],
  },
  '4.0': {
    label: '4.0',
    max: 4.0,
    grades: {
      A: 4,
      B: 3,
      C: 2,
      D: 1,
      F: 0,
    },
    options: [
      { value: 'A', label: 'A — 4' },
      { value: 'B', label: 'B — 3' },
      { value: 'C', label: 'C — 2' },
      { value: 'D', label: 'D — 1' },
      { value: 'F', label: 'F — 0' },
    ],
  },
};

const CLASSIFICATIONS = {
  '5.0': [
    { min: 4.50, max: 5.00, label: 'First Class', cssClass: 'first-class', desc: 'Outstanding academic performance' },
    { min: 3.50, max: 4.49, label: 'Second Class Upper', cssClass: 'second-upper', desc: 'Excellent academic performance' },
    { min: 2.40, max: 3.49, label: 'Second Class Lower', cssClass: 'second-lower', desc: 'Good academic performance' },
    { min: 1.50, max: 2.39, label: 'Third Class', cssClass: 'third-class', desc: 'Satisfactory academic performance' },
    { min: 1.00, max: 1.49, label: 'Pass', cssClass: 'pass', desc: 'Minimum passing threshold' },
    { min: 0.00, max: 0.99, label: 'Fail', cssClass: 'fail', desc: 'Below minimum passing threshold' },
  ],
  '4.0': [
    { min: 3.60, max: 4.00, label: 'First Class', cssClass: 'first-class', desc: 'Outstanding academic performance' },
    { min: 3.00, max: 3.59, label: 'Second Class Upper', cssClass: 'second-upper', desc: 'Excellent academic performance' },
    { min: 2.00, max: 2.99, label: 'Second Class Lower', cssClass: 'second-lower', desc: 'Good academic performance' },
    { min: 1.00, max: 1.99, label: 'Third Class', cssClass: 'third-class', desc: 'Satisfactory academic performance' },
    { min: 0.50, max: 0.99, label: 'Pass', cssClass: 'pass', desc: 'Minimum passing threshold' },
    { min: 0.00, max: 0.49, label: 'Fail', cssClass: 'fail', desc: 'Below minimum passing threshold' },
  ],
};

const STORAGE_KEY = 'gpapro_semesters';
const THEME_KEY = 'gpapro_theme';
const SCALE_KEY = 'gpapro_scale';
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;


/* ============================================================
   2. APPLICATION STATE
   ============================================================ */

const State = {
  courses: [],
  scale: '5.0',
  repeatRule: 'all',
  theme: 'dark',
  _idCounter: 0,

  nextId() {
    return `course_${++this._idCounter}`;
  },
};


/* ============================================================
   3. CALCULATOR MODULE
   ============================================================ */

const Calculator = {
  gradePoint(grade, scale) {
    if (!grade) return null;
    const points = GRADE_SCALES[scale]?.grades;
    return points?.[grade] ?? null;
  },

  coursePoints(unit, grade, scale) {
    const gp = this.gradePoint(grade, scale);
    if (gp === null || isNaN(unit) || unit <= 0) return null;
    return unit * gp;
  },

  _isValid(c, scale) {
    const u = parseFloat(c.unit);
    return !!c.grade && !isNaN(u) && u > 0 && this.gradePoint(c.grade, scale) !== null;
  },

  /** rule: 'all' (default) | 'latest' | 'best'. Retakes are matched by course code, case-insensitively. */
  resolveRepeats(courses, scale, rule = 'all') {
    if (rule !== 'latest' && rule !== 'best') return courses;
    const key = c => String(c.code ?? '').trim().toLowerCase();
    const winner = new Map();                                    // code → index of the attempt that counts
    courses.forEach((c, i) => {
      const k = key(c);
      if (!k || !this._isValid(c, scale)) return;                // blank/invalid retakes never replace a real grade
      const cur = winner.get(k);
      if (cur === undefined || rule === 'latest' ||
        this.gradePoint(c.grade, scale) >= this.gradePoint(courses[cur].grade, scale)) winner.set(k, i);
    });
    const keep = new Set(winner.values());
    return courses.filter((c, i) => !key(c) || !this._isValid(c, scale) || keep.has(i));
  },

  /** How many valid attempts the rule leaves out (for the "n repeats not counted" note). */
  repeatsIgnored(courses, scale, rule = 'all') {
    const count = list => list.filter(c => this._isValid(c, scale)).length;
    return count(courses) - count(this.resolveRepeats(courses, scale, rule));
  },

  /** Units/points of the semesters on `scale`, pooled oldest-first (storage is newest-first),
      with the repeat rule applied ACROSS semesters so a resit replaces the earlier attempt. */
  pool(semesters, scale, rule = 'all') {
    const flat = [...semesters].reverse().filter(s => s.scale === scale).flatMap(s => s.courses || []);
    const r = this.calculate(flat, scale, rule);
    return { units: r.totalUnits, points: r.totalPoints };
  },

  calculate(courses, scale, rule = 'all') {
    courses = this.resolveRepeats(courses, scale, rule);         // ← the only new line; rest is unchanged
    let totalPoints = 0;
    let totalUnits = 0;
    let validCount = 0;

    for (const course of courses) {
      const unit = parseFloat(course.unit);
      const gp = this.gradePoint(course.grade, scale);
      if (!course.grade || isNaN(unit) || unit <= 0 || gp === null) continue;
      totalPoints += unit * gp;
      totalUnits += unit;
      validCount += 1;
    }

    const gpa = totalUnits > 0 ? totalPoints / totalUnits : 0;
    return {
      gpa: Math.round(gpa * 100) / 100,
      totalUnits,
      totalPoints: Math.round(totalPoints * 100) / 100,
      validCount,
    };
  },


  classify(gpa, scale) {
    if (gpa <= 0 && State.courses.filter(c => c.grade && parseFloat(c.unit) > 0).length === 0) {
      return null;
    }
    const rules = CLASSIFICATIONS[scale] ?? [];
    return rules.find(r => gpa >= r.min) ?? rules[rules.length - 1];
  },
};


/* ============================================================
   4. STORAGE MODULE
   ============================================================ */

const Storage = {
  loadSemesters() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error('Failed to load semesters:', err);
      return [];
    }
  },
  saveRepeatRule(rule) {
    try { localStorage.setItem('gpapro_repeat_rule', rule); } catch (err) { console.warn('Could not save repeat rule', err); }
  },

  loadRepeatRule() {
    try {
      const v = localStorage.getItem('gpapro_repeat_rule');
      return (v === 'latest' || v === 'best') ? v : 'all';
    } catch { return 'all'; }
  },
  /* ── Backup / restore (#15, extended for custom scales in #19) ──
   Replace buildBackup, parseBackup, mergeSemesters and restoreBackup in your Storage object with these. */

  buildBackup() {
    return JSON.stringify({
      app: 'gpapro', version: 1,
      exportedAt: new Date().toISOString(),
      semesters: this.loadSemesters(),
      customScales: Scales.listCustom(),          // so restored semesters keep their grading scale
    }, null, 2);
  },

  /** Validates a backup and returns what WOULD be restored. Has no side effects (safe for previews). */
  parseBackup(text) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('File is not valid JSON'); }
    if (!data || data.app !== 'gpapro' || !Array.isArray(data.semesters)) throw new Error('Not a GPA Pro backup file');
    if (data.version > 1) throw new Error('Backup was made by a newer version of GPA Pro');

    // Scales defined inside the file, validated but NOT registered yet
    const fileScales = (Array.isArray(data.customScales) ? data.customScales : [])
      .map(d => Scales.validate(d, { requireId: true })).filter(v => v.ok).map(v => v.clean);
    const tableOf = id => GRADE_SCALES[id] || fileScales.find(d => d.id === id);

    // Totals computed against the scale's own table, so a scale we have not registered yet still works
    const totals = (courses, table) => {
      let units = 0, points = 0, valid = 0;
      for (const c of courses) {
        const u = parseFloat(c.unit);
        if (!c.grade || isNaN(u) || u <= 0 || !Object.hasOwn(table.grades, c.grade)) continue;
        units += u; points += u * table.grades[c.grade]; valid++;
      }
      const r2 = x => Math.round((x + 1e-9) * 100) / 100;
      return { gpa: units > 0 ? r2(points / units) : 0, totalUnits: units, totalPoints: r2(points), validCount: valid };
    };

    const semesters = []; let skipped = 0;
    data.semesters.forEach((s, i) => {
      const name = typeof s?.name === 'string' ? s.name.trim().slice(0, 60) : '';
      const table = tableOf(s?.scale);
      if (!name || !table || !Array.isArray(s.courses)) { skipped++; return; }

      const courses = s.courses.map(c => {
        const g = String(c?.grade ?? '').toUpperCase();
        const n = parseFloat(c?.unit);
        return {
          id: `course_${i}_${Math.random().toString(36).slice(2, 8)}`,
          title: String(c?.title ?? '').slice(0, 100),
          code: String(c?.code ?? '').slice(0, 20),
          unit: (isFinite(n) && n > 0 && n <= 50) ? String(n) : '',
          grade: Object.hasOwn(table.grades, g) ? g : '',
        };
      });

      const r = totals(courses, table);             // recompute; never trust totals in the file
      if (r.validCount === 0) { skipped++; return; }
      const d = new Date(s.savedAt);
      semesters.push({
        id: (typeof s.id === 'string' && /^[\w-]+$/.test(s.id)) ? s.id : `sem_${Date.now()}_${i}`,
        name, scale: s.scale, gpa: r.gpa, totalUnits: r.totalUnits, totalPoints: r.totalPoints, courses,
        savedAt: isNaN(d) ? new Date().toISOString() : d.toISOString(),
      });
    });

    const usedScales = new Set(semesters.map(s => s.scale));
    return { semesters, skipped, customScales: fileScales.filter(d => usedScales.has(d.id)) };
  },

  mergeSemesters(existing, incoming) {
    const ids = new Set(existing.map(s => s.id));
    const fresh = incoming.filter(s => !ids.has(s.id));
    const all = [...existing, ...fresh].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    return { semesters: all, added: fresh.length, duplicates: incoming.length - fresh.length };
  },

  restoreBackup(text, mode) {
    const { semesters, skipped, customScales } = this.parseBackup(text);
    Scales.importDefs(customScales);                // register the scales these semesters need
    if (mode === 'replace') { this.saveSemesters(semesters); return { added: semesters.length, duplicates: 0, skipped }; }
    const m = this.mergeSemesters(this.loadSemesters(), semesters);
    this.saveSemesters(m.semesters);
    return { added: m.added, duplicates: m.duplicates, skipped };
  },


  saveSemesters(semesters) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(semesters));
    } catch (err) {
      console.error('GPA Pro: localStorage write failed', err);
      UI.toast('Could not save to local storage', 'error');
    }
  },

  addSemester(name, courses, result, scale) {
    const semesters = this.loadSemesters();
    const entry = {
      id: `sem_${Date.now()}`,
      name: name.trim(),
      scale,
      gpa: result.gpa,
      totalUnits: result.totalUnits,
      totalPoints: result.totalPoints,
      courses: courses.map(c => ({ ...c })),
      savedAt: new Date().toISOString(),
    };
    semesters.unshift(entry);
    this.saveSemesters(semesters);
    return entry;
  },

  deleteSemester(id) {
    const semesters = this.loadSemesters().filter(s => s.id !== id);
    this.saveSemesters(semesters);
  },

  renameSemester(id, newName) {
    const semesters = this.loadSemesters();
    const target = semesters.find(s => s.id === id);
    if (target) {
      target.name = newName.trim();
      this.saveSemesters(semesters);
    }
  },

  saveTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      console.warn('Could not save theme preference', err);
    }
  },

  loadTheme() {
    try {
      return localStorage.getItem(THEME_KEY) || 'dark';
    } catch {
      return 'dark';
    }
  },

  saveScale(scale) {
    try {
      localStorage.setItem(SCALE_KEY, scale);
    } catch (err) {
      console.warn('Could not save scale preference', err);
    }
  },

  loadScale() {
    try {
      return localStorage.getItem(SCALE_KEY) || '5.0';
    } catch {
      return '5.0';
    }
  },
};


/* ============================================================
   5. EXPORT MODULE — Enhanced with error handling
   ============================================================ */

const Export = {
  toCSV(courses, result, scale) {
    try {
      if (courses.length === 0) {
        UI.toast('No courses to export.', 'error');
        return;
      }

      const classInfo = Calculator.classify(result.gpa, scale);
      const scaleLabel = GRADE_SCALES[scale].label;

      const header = ['Course Title', 'Course Code', 'Units', 'Grade', 'Grade Points'];

      const rows = courses.map(c => {
        const unit = parseFloat(c.unit);
        const gp = Calculator.gradePoint(c.grade, scale);
        const pts = (unit > 0 && gp !== null) ? (unit * gp).toFixed(2) : '';
        return [c.title || '', c.code || '', c.unit || '', c.grade || '', pts];
      });

      const summary = [
        [],
        ['Grading Scale', `${scaleLabel} Scale`],
        ['Total Units', result.totalUnits],
        ['Total Grade Points', result.totalPoints.toFixed(2)],
        ['GPA', result.gpa.toFixed(2)],
        ['Classification', classInfo ? classInfo.label : '—'],
        ['Generated', new Date().toISOString()],   // locale-independent, no commas
      ];

      // Escape every cell exactly once, here (rows above are raw values now).
      // BOM makes Excel read UTF-8 correctly (the "—" character).
      const csvContent = '\uFEFF' + [header, ...rows, ...summary]
        .map(row => row.map(v => this._csvEscape(v)).join(','))
        .join('\r\n');

      this._downloadFile(csvContent, 'gpa-report.csv', 'text/csv;charset=utf-8;');
      UI.toast('CSV downloaded!', 'success');
    } catch (err) {
      console.error('CSV export error:', err);
      UI.toast('Failed to export CSV. Please try again.', 'error');
    }
  },

  toPDF(courses, result, scale) {
    try {
      if (courses.length === 0) {
        UI.toast('No courses to export.', 'error');
        return;
      }

      if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
        UI.toast('PDF library not available — using print mode.', 'info');
        window.print();
        return;
      }

      const { jsPDF } = window.jspdf || window;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const classInfo = Calculator.classify(result.gpa, scale);
      const scaleLabel = GRADE_SCALES[scale].label;
      const pageW = doc.internal.pageSize.getWidth();

      /* Header */
      doc.setFillColor(8, 12, 24);
      doc.rect(0, 0, pageW, 35, 'F');

      doc.setTextColor(52, 211, 153);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('GPA Calculator Pro', 14, 16);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(180, 190, 210);
      doc.text('Academic Performance Report', 14, 23);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 29);

      /* GPA Summary Box */
      doc.setFillColor(20, 30, 53);
      doc.roundedRect(14, 42, pageW - 28, 32, 3, 3, 'F');

      doc.setTextColor(52, 211, 153);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(26);
      doc.text(result.gpa.toFixed(2), 24, 60);

      doc.setFontSize(9);
      doc.setTextColor(180, 190, 210);
      doc.text(`out of ${scaleLabel}`, 24, 66);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text(classInfo ? classInfo.label : '—', 70, 58);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(180, 190, 210);
      doc.text(`Total Units: ${result.totalUnits}   |   Grade Points: ${result.totalPoints.toFixed(2)}   |   Scale: ${scaleLabel}`, 70, 65);

      /* Course Table */
      const tableBody = courses
        .filter(c => c.title || c.unit || c.grade)
        .map(c => {
          const unit = parseFloat(c.unit);
          const gp = Calculator.gradePoint(c.grade, scale);
          const pts = (unit > 0 && gp !== null) ? (unit * gp).toFixed(2) : '—';
          return [
            c.title || '—',
            c.code || '—',
            c.unit || '—',
            c.grade || '—',
            gp !== null ? String(gp) : '—',
            pts,
          ];
        });

      doc.autoTable({
        startY: 82,
        head: [['Course Title', 'Code', 'Units', 'Grade', 'GP/Unit', 'Total GP']],
        body: tableBody,
        theme: 'grid',
        headStyles: {
          fillColor: [20, 30, 53],
          textColor: [52, 211, 153],
          fontStyle: 'bold',
          fontSize: 9,
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [30, 30, 30],
        },
        alternateRowStyles: {
          fillColor: [245, 248, 255],
        },
        styles: {
          cellPadding: 3,
          lineColor: [220, 225, 240],
          lineWidth: 0.2,
        },
        margin: { left: 14, right: 14 },
      });

      const finalY = doc.lastAutoTable.finalY + 6;
      doc.setFontSize(8);
      doc.setTextColor(160, 170, 185);
      doc.text('Generated by GPA Calculator Pro', 14, finalY);

      doc.save('gpa-report.pdf');
      UI.toast('PDF downloaded!', 'success');
    } catch (err) {
      console.error('PDF generation failed:', err);
      UI.toast('PDF generation failed. Attempting print fallback...', 'error');
      try {
        window.print();
      } catch (printErr) {
        console.error('Print fallback failed:', printErr);
      }
    }
  },

  _csvEscape(value) {
    let str = String(value ?? '');
    if (/^[=+\-@]/.test(str) && isNaN(Number(str))) str = "'" + str; // formula-injection guard
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  },

  _downloadFile(content, filename, mimeType) {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
      UI.toast('Download failed. Please try again.', 'error');
    }
  },
};


/* ============================================================
   6. IMPORT MODULE — NEW: CSV & JSON import
   ============================================================ */

const Import = {
  /** Quote-aware CSV tokenizer. Stops at the first blank line (export summary block). */
  _tokenize(text) {
    const rows = []; let row = [], cell = '', q = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.every(c => c.trim() === '')) break;   // blank line = end of course table
        rows.push(row); row = [];
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); if (!row.every(c => c.trim() === '')) rows.push(row); }
    return rows;
  },

  /** Validate one raw record against the active scale. Returns { course } or { error }. */
  _validate(raw, label) {
    const title = String(raw.title ?? '').trim();
    const code = String(raw.code ?? '').trim();
    const unit = String(raw.unit ?? '').trim();
    const grade = String(raw.grade ?? '').trim().toUpperCase();
    const scale = GRADE_SCALES[State.scale];

    if (!title) return { error: `${label}: missing course title` };
    const n = parseFloat(unit);
    if (isNaN(n) || n <= 0 || n > 50) return { error: `${label}: units "${unit}" must be a number between 0 and 50` };
    if (grade && !(grade in scale.grades)) {
      const valid = Object.keys(scale.grades).join(', ');
      return { error: `${label}: grade "${raw.grade}" is not valid on the ${State.scale} scale (use ${valid})` };
    }
    return { course: { id: State.nextId(), title, code, unit: String(n), grade } };
  },

  parseCSV(text) {
    const rows = this._tokenize(text);
    if (rows.length < 2) throw new Error('CSV must have a header row and at least one data row');
    const header = rows[0].map(h => h.trim().toLowerCase());
    const col = names => header.findIndex(h => names.includes(h));
    const idx = {
      title: col(['title', 'course', 'course title']),
      code: col(['code', 'course code']),
      unit: col(['unit', 'units', 'credit', 'credits']),
      grade: col(['grade']),
    };
    if (idx.title < 0 || idx.unit < 0) throw new Error('CSV needs "Course Title" and "Units" columns');

    const courses = [], errors = [];
    rows.slice(1).forEach((r, i) => {
      const res = this._validate({
        title: r[idx.title], code: idx.code >= 0 ? r[idx.code] : '',
        unit: r[idx.unit], grade: idx.grade >= 0 ? r[idx.grade] : '',
      }, `Row ${i + 2}`);
      res.error ? errors.push(res.error) : courses.push(res.course);
    });
    return { courses, errors };
  },

  parseJSON(text) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data?.courses;
    if (!Array.isArray(list)) throw new Error('Invalid JSON: expected an array or { "courses": [...] }');
    const courses = [], errors = [];
    list.forEach((c, i) => {
      const res = this._validate({
        title: c.title ?? c.name, code: c.code, unit: c.unit ?? c.units, grade: c.grade,
      }, `Item ${i + 1}`);
      res.error ? errors.push(res.error) : courses.push(res.course);
    });
    return { courses, errors };
  },

  async handleImport(file) {
    try {
      if (!file) return;
      const text = await file.text();
      const isJSON = file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
      const { courses, errors } = isJSON ? this.parseJSON(text) : this.parseCSV(text);

      if (errors.length) {
        console.warn('Import issues:\n' + errors.join('\n'));
        const shown = errors.slice(0, 2).join(' · ') + (errors.length > 2 ? ` (+${errors.length - 2} more, see console)` : '');
        UI.toast(`${courses.length} imported, ${errors.length} skipped — ${shown}`, courses.length ? 'info' : 'error');
      }
      if (courses.length === 0) {
        if (!errors.length) UI.toast('No courses found in file', 'info');
        return;
      }

      UndoManager.saveState();
      // Drop the untouched blank starter row if present
      State.courses = State.courses.filter(c => c.title || c.unit || c.grade);
      State.courses.push(...courses);
      UI.renderCourseList();
      UI.updateDashboard();                       // was Calculator.updateDashboard (didn't exist)
      if (!errors.length) UI.toast(`${courses.length} course${courses.length !== 1 ? 's' : ''} imported!`, 'success');
    } catch (error) {
      console.error('Import error:', error);
      UI.toast(`Import failed: ${error.message}`, 'error');
    }
  },
};


/* ============================================================
   7. UNDO/REDO MANAGER — NEW
   ============================================================ */

const UndoManager = {
  stack: [],
  maxSize: 20,

  /**
   * Save current state snapshot for undo
   */
  saveState() {
    const snapshot = {
      courses: JSON.parse(JSON.stringify(State.courses)),
      scale: State.scale,
      timestamp: Date.now()
    };

    this.stack.push(snapshot);

    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    }
  },

  /**
   * Restore previous state
   */
  undo() {
    if (this.stack.length === 0) {
      UI.toast('Nothing to undo', 'info');
      return;
    }

    const previousState = this.stack.pop();
    State.courses = JSON.parse(JSON.stringify(previousState.courses));
    State.scale = previousState.scale;

    UI.renderCourseList();
    UI.updateDashboard();
    UI.toast('Changes undone', 'success');
  }
};


/* ============================================================
   8. CGPA MODULE — NEW: Cumulative GPA tracking
   ============================================================ */

const CGPA = {
  /** CGPA over saved semesters on ONE scale (4.0 and 5.0 points are never mixed). */
  calculate(scale = State.scale, rule = State.repeatRule) {
    const sems = Storage.loadSemesters().filter(s => s.scale === scale);      // newest-first
    const perSem = sems.map(s => Calculator.calculate(s.courses || [], scale)).filter(r => r.totalUnits > 0);
    if (perSem.length === 0) return { cgpa: 0, count: 0, trend: null };

    const pooled = Calculator.pool(sems, scale, rule);
    const cgpa = pooled.units > 0 ? pooled.points / pooled.units : 0;

    let trend = null;
    if (perSem.length > 1) {
      const [latest, previous] = perSem.map(r => r.gpa);
      trend = latest > previous + 0.1 ? 'improving' : latest < previous - 0.1 ? 'declining' : 'stable';
    }
    return { cgpa, count: perSem.length, trend };
  },
  otherScaleCount(scale = State.scale) {
    return Storage.loadSemesters().filter(s => s.scale !== scale).length;
  },

  /**
   * Update CGPA display in UI
   */
  updateDisplay() {
    try {
      const data = this.calculate();
      const cgpaDisplay = document.querySelector('#cgpa-display');
      const cgpaCount = document.querySelector('#cgpa-count');

      if (!cgpaDisplay || !cgpaCount) return;

      if (data.count === 0) {
        cgpaDisplay.textContent = '—';
        cgpaCount.textContent = 'Save semesters to see CGPA';
      } else {
        cgpaDisplay.textContent = data.cgpa.toFixed(2);

        let countText = `${data.count} semester${data.count !== 1 ? 's' : ''}`;
        if (data.trend) {
          const trendEmoji = data.trend === 'improving' ? '📈' : data.trend === 'declining' ? '📉' : '➡️';
          countText += ` • ${data.trend.charAt(0).toUpperCase() + data.trend.slice(1)} ${trendEmoji}`;
        }
        cgpaCount.textContent = countText;
      }
    } catch (err) {
      console.error('CGPA update failed:', err);
    }
  }
};

/* ============================================================
   PLANNER MODULE — Target-GPA planner (Jira #18)
   Paste into js/app.js right after the CGPA module.
   Pure logic only: no DOM access, so it is unit-testable.
   ============================================================ */

const Planner = {
  /** Units/points already banked in saved semesters on the given scale. */
  standing(semesters, scale, rule = 'all') {
    const same = semesters.filter(s => s.scale === scale);
    const used = same.filter(s => Calculator.calculate(s.courses || [], scale).totalUnits > 0).length;
    const { units, points } = Calculator.pool(same, scale, rule);
    return {
      units, points, used, ignored: semesters.length - same.length,
      cgpa: units > 0 ? Math.round((points / units) * 100) / 100 : null,
    };
  },
  /** Class thresholds for the scale, best first: [{ label, min }] */
  classTargets(scale) {
    return (CLASSIFICATIONS[scale] ?? []).map(r => ({ label: r.label, min: r.min }));
  },

  /**
   * @param {object} p
   * @param {number} p.units    units already completed (saved semesters)
   * @param {number} p.points   grade points already earned
   * @param {{title:string, unit:number}[]} p.courses  planned courses
   * @param {number} p.target   target CGPA
   * @param {string} p.scale    '5.0' | '4.0'
   * @returns status: 'invalid' | 'secured' | 'reachable' | 'unreachable'
   *
   * The app rounds GPA to 2 d.p. before classifying, so a CGPA of 4.496 shows
   * as 4.50 and counts as First Class. The planner uses the same rule
   * (target - 0.005) so its advice matches what the app will display.
   */
  plan({ units = 0, points = 0, courses, target, scale }) {
    const round2 = x => Math.round((x + 1e-9) * 100) / 100;   // tiny nudge: 4.495 → 4.50, not 4.49
    const EPS = 1e-9;
    const table = GRADE_SCALES[scale];
    if (!table) return { status: 'invalid', message: 'Unknown grading scale.' };

    const list = (courses || []).filter(c => c && c.unit > 0);
    if (list.length === 0) {
      return { status: 'invalid', message: 'Add at least one planned course with units first.' };
    }
    if (!isFinite(target) || target <= 0 || target > table.max) {
      return { status: 'invalid', message: `Enter a target between 0 and ${table.max}.` };
    }

    const plannedUnits = list.reduce((s, c) => s + c.unit, 0);
    const totalUnits = units + plannedUnits;
    const needed = (target - 0.005) * totalUnits - points;   // points required from planned courses
    const required = needed / plannedUnits;                    // required average grade value

    const out = {
      status: 'reachable',
      target, scale,
      currentCGPA: units > 0 ? round2(points / units) : null,
      completedUnits: units,
      plannedUnits,
      requiredAverage: round2(Math.max(0, required)),
      maxAchievable: round2((points + table.max * plannedUnits) / totalUnits),
      minAchievable: round2(points / totalUnits),
      combos: [],
    };

    if (needed <= EPS) { out.status = 'secured'; return out; }
    if (required > table.max + EPS) { out.status = 'unreachable'; return out; }

    /* ── Example grade combinations ── */
    const grades = Object.entries(table.grades).sort((a, b) => a[1] - b[1]);   // ascending
    const [lowL, lowV] = grades[0];
    const [topL, topV] = grades[grades.length - 1];
    const val = g => table.grades[g];
    const pointsOf = g => g.reduce((s, x, i) => s + list[i].unit * val(x), 0);
    const meets = g => pointsOf(g) >= needed - EPS;
    const order = list.map((_, i) => i).sort((a, b) => list[b].unit - list[a].unit);   // biggest first
    const seen = new Set();

    const add = (label, g) => {
      const sig = g.join('');
      if (seen.has(sig) || !meets(g)) return;
      seen.add(sig);
      out.combos.push({
        label,
        assignments: list.map((c, i) => ({ title: c.title, unit: c.unit, grade: g[i] })),
        resultCGPA: round2((points + pointsOf(g)) / totalUnits),
      });
    };

    // 1. Steady: the same grade everywhere
    const uni = grades.find(([, v]) => v * plannedUnits >= needed - EPS)[0];
    add(`Steady: ${uni} in every course`, list.map(() => uni));

    // 2. Mixed: lower grade baseline, upgrade the biggest courses until the target is met
    const floor = [...grades].reverse().find(([, v]) => v <= required + EPS);
    if (floor && floor[0] !== uni) {
      const g = list.map(() => floor[0]);
      for (const i of order) { if (meets(g)) break; g[i] = uni; }
      add(`Mixed: mostly ${floor[0]}, ${uni} in the biggest courses`, g);
    }

    // 3. Stretch: top grade in the biggest courses, lowest grade on the rest
    {
      const g = list.map(() => lowL);
      for (const i of order) {
        if (meets(g)) break;
        const rem = needed - (pointsOf(g) - lowV * list[i].unit);
        if (topV * list[i].unit <= rem + EPS) { g[i] = topL; continue; }
        g[i] = grades.find(([, v]) => v * list[i].unit >= rem - EPS)[0];
        break;
      }
      add(`Stretch: ${topL} in the biggest courses, lighter grades elsewhere`, g);
    }

    return out;
  },
};

/* ============================================================
   SCALES MODULE — plus/minus + custom grading scales (Jira #19)
   Paste into js/app.js right after the Planner module.
   Registers extra scales INTO the existing GRADE_SCALES and
   CLASSIFICATIONS objects, so all existing code keeps working.
   ============================================================ */

const Scales = {
  KEY: 'gpapro_custom_scales',
  MAX_CUSTOM: 10,
  _fractions: [0.9, 0.7, 0.48, 0.3, 0.2],       // class boundaries as a share of the scale maximum (= the 5.0 bands)

  buildOptions(grades) {
    return Object.entries(grades)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([g, p]) => ({ value: g, label: `${g} — ${p}` }));
  },

  /** Class bands for any maximum, using the same proportions as the built-in 5.0 scale. */
  deriveBands(max) {
    const r2 = x => Math.round(x * 100) / 100;
    const mins = [...this._fractions.map(f => r2(max * f)), 0];
    return CLASSIFICATIONS['5.0'].map((t, i) => ({
      min: mins[i],
      max: i === 0 ? max : r2(mins[i - 1] - 0.01),
      label: t.label, cssClass: t.cssClass, desc: t.desc,
    }));
  },

  /** Validate a user/imported definition. Returns { ok, error } or { ok, clean }. */
  validate(def, { requireId = false } = {}) {
    const fail = error => ({ ok: false, error });
    const label = String(def?.label ?? '').replace(/[\u0000-\u001f<>]/g, '').trim();
    if (label.length < 1 || label.length > 24) return fail('Scale name must be 1–24 characters');

    const entries = Object.entries(def?.grades ?? {});
    if (entries.length < 2 || entries.length > 20) return fail('A scale needs between 2 and 20 grades');

    const grades = {};
    for (const [rawLabel, rawPts] of entries) {
      const g = String(rawLabel).trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9+\-]{0,3}$/.test(g)) return fail(`Grade "${rawLabel}" is not valid (use 1–4 characters like A, B+, C-)`);
      if (Object.hasOwn(grades, g)) return fail(`Grade "${g}" appears twice`);
      const p = typeof rawPts === 'number' ? rawPts : parseFloat(rawPts);
      if (!isFinite(p) || p < 0 || p > 20) return fail(`Points for ${g} must be between 0 and 20`);
      if (Math.round(p * 100) / 100 !== p) return fail(`Points for ${g} can have at most 2 decimals`);
      grades[g] = p;
    }
    const max = Math.max(...Object.values(grades));
    if (max < 1) return fail('The highest grade must be worth at least 1 point');

    let id = String(def?.id ?? '');
    if (!/^custom_[a-z0-9]{4,20}$/.test(id)) {
      if (requireId) return fail('Missing or invalid scale id');
      id = 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    return { ok: true, clean: { id, label, max, grades } };
  },

  register(def, builtin = false, bands = null) {
    GRADE_SCALES[def.id] = {
      label: def.label, max: def.max, grades: { ...def.grades },
      options: this.buildOptions(def.grades), custom: !builtin,
    };
    CLASSIFICATIONS[def.id] = bands || this.deriveBands(def.max);
  },

  registerBuiltIns() {
    this.register({
      id: '4.0pm', label: '4.0 ±', max: 4,
      grades: { A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, 'C-': 1.7, 'D+': 1.3, D: 1, F: 0 },
    }, true, CLASSIFICATIONS['4.0']);
  },

  isCustom: id => !!GRADE_SCALES[id]?.custom,

  listCustom() {
    return Object.entries(GRADE_SCALES).filter(([, s]) => s.custom)
      .map(([id, s]) => ({ id, label: s.label, grades: { ...s.grades } }));
  },

  usage: (id, semesters) => semesters.filter(s => s.scale === id).length,

  _persist() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.listCustom())); }
    catch (err) { console.warn('Could not save custom scales', err); }
  },

  /** Call once at startup, before restoring the selected scale. */
  loadCustom() {
    try {
      const list = JSON.parse(localStorage.getItem(this.KEY) || '[]');
      for (const d of Array.isArray(list) ? list : []) {
        const v = this.validate(d, { requireId: true });
        if (v.ok && !GRADE_SCALES[v.clean.id]) this.register(v.clean);
      }
    } catch (err) { console.warn('Could not load custom scales', err); }
    return this.listCustom();
  },

  /** Create (no id) or edit (existing custom id). Grades are locked once a saved semester uses the scale. */
  save(def, semesters = []) {
    if (def?.id && GRADE_SCALES[def.id] && !GRADE_SCALES[def.id].custom) {
      return { ok: false, error: 'Built-in scales cannot be changed' };
    }
    const v = this.validate(def);
    if (!v.ok) return v;
    const c = v.clean;
    const existing = GRADE_SCALES[c.id];
    if (existing && !existing.custom) return { ok: false, error: 'Built-in scales cannot be changed' };

    if (existing) {
      const used = this.usage(c.id, semesters);
      const norm = g => JSON.stringify(Object.entries(g).sort((a, b) => a[0].localeCompare(b[0])));
      if (used > 0 && norm(existing.grades) !== norm(c.grades)) {
        return { ok: false, error: `Used by ${used} saved semester${used !== 1 ? 's' : ''}. Rename it, or duplicate it to change grades or points.` };
      }
    } else if (this.listCustom().length >= this.MAX_CUSTOM) {
      return { ok: false, error: `You can keep up to ${this.MAX_CUSTOM} custom scales` };
    }
    this.register(c);
    this._persist();
    return { ok: true, id: c.id };
  },

  remove(id, semesters = []) {
    if (!this.isCustom(id)) return { ok: false, error: 'Only custom scales can be deleted' };
    const used = this.usage(id, semesters);
    if (used > 0) return { ok: false, error: `Used by ${used} saved semester${used !== 1 ? 's' : ''}. Delete those first.` };
    delete GRADE_SCALES[id];
    delete CLASSIFICATIONS[id];
    this._persist();
    return { ok: true };
  },

  /** Register definitions from a backup file; skips invalid ones, existing ids and anything over the cap. */
  importDefs(defs) {
    let added = 0;
    for (const d of Array.isArray(defs) ? defs : []) {
      const v = this.validate(d, { requireId: true });
      if (!v.ok || GRADE_SCALES[v.clean.id] || this.listCustom().length >= this.MAX_CUSTOM) continue;
      this.register(v.clean);
      added++;
    }
    if (added) this._persist();
    return added;
  },

  /** After switching scale: keep grades that exist, map A-/B+ to A/B, clear the rest. */
  reconcileGrades(courses, scale) {
    const table = GRADE_SCALES[scale]?.grades ?? {};
    let cleared = 0, mapped = 0;
    const out = courses.map(c => {
      if (!c.grade || Object.hasOwn(table, c.grade)) return c;
      const base = c.grade.replace(/[+-]$/, '');
      if (base !== c.grade && Object.hasOwn(table, base)) { mapped++; return { ...c, grade: base }; }
      cleared++;
      return { ...c, grade: '' };
    });
    return { courses: out, cleared, mapped };
  },
};

Scales.registerBuiltIns();

/* ============================================================
   9. UI MODULE
   ============================================================ */

const UI = {
  els: {},
  _toastTimer: null,

  toast(message, type = 'info') {
    try {
      const el = this.els.toast;
      if (!el) return;
      el.textContent = message;
      el.className = `toast show toast-${type}`;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        el.classList.remove('show');
      }, 3200);
    } catch (err) {
      console.error('Toast error:', err);
    }
  },

  populateScaleSelect() {
    const sel = this.els.gradingScale;
    sel.innerHTML = Object.entries(GRADE_SCALES).map(([id, s]) =>
      `<option value="${this._escape(id)}">${this._escape(s.custom ? s.label : s.label + ' Scale')}</option>`).join('');
    sel.value = GRADE_SCALES[State.scale] ? State.scale : '5.0';
  },
  /* ── COURSE ROWS ── */

  buildCourseRow(course, scale) {
    const row = document.createElement('div');
    row.className = 'course-row';
    row.dataset.id = course.id;
    row.setAttribute('role', 'listitem');
    row.setAttribute('tabindex', '-1');

    const gradeOptions = GRADE_SCALES[scale].options
      .map(o => `<option value="${o.value}" ${course.grade === o.value ? 'selected' : ''}>${o.label}</option>`)
      .join('');

    row.innerHTML = `
      <div class="field-group">
        <input
          type="text"
          class="field-input course-title"
          placeholder="Course title *"
          value="${this._escape(course.title || '')}"
          maxlength="80"
          autocomplete="off"
          aria-label="Course title"
        />
        <span class="field-error" role="alert"></span>
      </div>

      <div class="field-group">
        <input
          type="text"
          class="field-input course-code"
          placeholder="Code (opt.)"
          value="${this._escape(course.code || '')}"
          maxlength="15"
          autocomplete="off"
          aria-label="Course code (optional)"
        />
      </div>

      <div class="field-group">
        <input
          type="number"
          class="field-input course-unit"
          placeholder="Units"
          value="${course.unit || ''}"
          min="0.5"
          max="50"
          step="0.5"
          aria-label="Credit units"
        />
        <span class="field-error" role="alert"></span>
      </div>

      <div class="field-group">
        <select class="field-input course-grade" aria-label="Grade">
          <option value="">Grade</option>
          ${gradeOptions}
        </select>
        <span class="field-error" role="alert"></span>
      </div>

      <div class="gp-display" aria-label="Grade points for this course">
        <span class="gp-value">—</span>
        <span class="gp-label">GP</span>
      </div>

      <button
        class="remove-btn"
        data-action="remove"
        aria-label="Remove this course"
        title="Remove course (Delete key)"
      >✕</button>
    `;

    this._updateRowGP(row, course, scale);
    return row;
  },

  _updateRowGP(row, course, scale) {
    try {
      const unit = parseFloat(course.unit);
      const gp = Calculator.gradePoint(course.grade, scale);
      const total = (unit > 0 && gp !== null) ? (unit * gp).toFixed(2) : null;
      const gpCell = row.querySelector('.gp-value');
      if (gpCell) {
        gpCell.textContent = total !== null ? total : '—';
        gpCell.style.color = total !== null ? 'var(--accent)' : 'var(--text-faint)';
      }
    } catch (err) {
      console.error('Update row GP error:', err);
    }
  },

  renderCourseList() {
    try {
      const list = this.els.courseList;
      list.innerHTML = '';

      const fragment = document.createDocumentFragment();
      for (const course of State.courses) {
        fragment.appendChild(this.buildCourseRow(course, State.scale));
      }
      list.appendChild(fragment);

      const hasRows = State.courses.length > 0;
      this.els.emptyState.classList.toggle('hidden', hasRows);

      const n = State.courses.length;
      this.els.courseCount.textContent = `${n} course${n !== 1 ? 's' : ''}`;
    } catch (err) {
      console.error('Render course list error:', err);
    }
  },

  /* ── DASHBOARD UPDATE ── */

  updateDashboard() {
    try {
      const result = Calculator.calculate(State.courses, State.scale, State.repeatRule);
      const classInfo = Calculator.classify(result.gpa, State.scale);
      const scaleMax = GRADE_SCALES[State.scale].max;
      const hasData = result.validCount > 0;

      this.els.gpaDisplay.textContent = hasData ? result.gpa.toFixed(2) : '—';

      /* Ring animation */
      const pct = hasData ? Math.min(result.gpa / scaleMax, 1) : 0;
      const offset = RING_CIRCUMFERENCE - pct * RING_CIRCUMFERENCE;
      this.els.ringFill.style.strokeDashoffset = offset;

      this.els.totalUnits.textContent = result.totalUnits;
      this.els.totalPoints.textContent = result.totalPoints.toFixed(2);
      this.els.scaleLabel.textContent = `/ ${scaleMax}`;

      const badge = this.els.classificationBadge;
      const desc = this.els.classDesc;

      if (!hasData || !classInfo) {
        badge.textContent = 'No Data';
        badge.className = 'classification-badge no-data';
        desc.textContent = 'Add courses to see your classification';
      } else {
        badge.textContent = classInfo.label;
        badge.className = `classification-badge ${classInfo.cssClass}`;
        desc.textContent = classInfo.desc;
      }
      const note = document.getElementById('repeat-note');
      if (note) {
        const n = Calculator.repeatsIgnored(State.courses, State.scale, State.repeatRule);
        note.textContent = n ? `${n} repeated attempt${n !== 1 ? 's' : ''} not counted (retake rule: ${State.repeatRule === 'best' ? 'best only' : 'latest only'}).` : '';
      }
      // Update CGPA display
      CGPA.updateDisplay();
    } catch (err) {
      console.error('Dashboard update error:', err);
    }
  },

  refreshGradeSelects() {
    try {
      const selects = this.els.courseList.querySelectorAll('.course-grade');
      const options = GRADE_SCALES[State.scale].options;

      selects.forEach(select => {
        const current = select.value;
        select.innerHTML = `<option value="">Grade</option>` +
          options.map(o => `<option value="${o.value}" ${current === o.value ? 'selected' : ''}>${o.label}</option>`).join('');
      });
    } catch (err) {
      console.error('Refresh grade selects error:', err);
    }
  },

  /* ── SEMESTER HISTORY ── */

  renderHistory() {
    try {
      const semesters = Storage.loadSemesters();
      const list = this.els.historyList;
      list.innerHTML = '';

      const hasHistory = semesters.length > 0;
      this.els.historyEmpty.classList.toggle('hidden', hasHistory);
      this.els.historyCount.textContent = `${semesters.length} saved`;

      if (!hasHistory) return;

      const fragment = document.createDocumentFragment();

      for (const sem of semesters) {
        const classInfo = Calculator.classify(sem.gpa, sem.scale);
        const card = document.createElement('div');
        card.className = 'history-card';
        card.dataset.id = sem.id;
        card.setAttribute('role', 'listitem');

        const savedDate = new Date(sem.savedAt).toLocaleDateString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
        });

        card.innerHTML = `
          <div class="history-card-info">
            <div class="history-card-name" title="${this._escape(sem.name)}">${this._escape(sem.name)}</div>
            <div class="history-card-meta">
              ${sem.courses.length} courses · ${sem.totalUnits} units · ${this._escape(GRADE_SCALES[sem.scale]?.label ?? 'unknown')} scale · ${savedDate}
            </div>
            ${classInfo ? `<span class="history-badge">${classInfo.label}</span>` : ''}
          </div>
          <div class="history-card-gpa">${sem.gpa.toFixed(2)}</div>
          <div class="history-card-actions">
            <button class="btn btn-outline btn-sm" data-action="view"   data-id="${sem.id}" title="View details">View</button>
            <button class="btn btn-ghost   btn-sm" data-action="rename" data-id="${sem.id}" title="Rename">✏️</button>
            <button class="btn btn-danger-ghost btn-sm" data-action="delete" data-id="${sem.id}" title="Delete">🗑️</button>
          </div>
        `;

        fragment.appendChild(card);
      }

      list.appendChild(fragment);
    } catch (err) {
      console.error('Render history error:', err);
    }
  },

  populatePlannerTargets() {
    const sel = document.getElementById('planner-class');
    if (!sel) return;
    sel.innerHTML = '<option value="">Custom GPA…</option>' +
      Planner.classTargets(State.scale).filter(t => t.min > 0)
        .map(t => `<option value="${t.min}">${this._escape(t.label)} (≥ ${t.min.toFixed(2)})</option>`).join('');
    const box = document.getElementById('planner-result');
    if (box) box.innerHTML = '';
  },

  renderPlanner(r, standing) {
    const box = document.getElementById('planner-result');
    if (!box) return;
    const max = GRADE_SCALES[State.scale].max;
    let html = '';

    if (r.status === 'invalid') {
      html = `<p class="planner-msg planner-bad">${this._escape(r.message)}</p>`;
    } else if (r.status === 'unreachable') {
      html = `<p class="planner-msg planner-bad"><strong>Not reachable this semester.</strong>
      Even the top grade in every planned course would only give a CGPA of
      <strong>${r.maxAchievable.toFixed(2)}</strong>, below your target of ${r.target.toFixed(2)}.
      Try a lower target, or spread the climb over more semesters.</p>`;
    } else if (r.status === 'secured') {
      html = `<p class="planner-msg planner-good"><strong>Already secured.</strong>
      Even if every planned course went badly, your CGPA would stay at ${r.minAchievable.toFixed(2)} or better,
      which meets your target of ${r.target.toFixed(2)}.</p>`;
    } else {
      const grades = Object.entries(GRADE_SCALES[State.scale].grades).sort((a, b) => a[1] - b[1]);
      const letter = (grades.find(([, v]) => v >= r.requiredAverage) || grades[grades.length - 1])[0];
      html = `<p class="planner-msg"><strong>You need an average grade value of ${r.requiredAverage.toFixed(2)} / ${max}</strong>
      (about a <strong>${letter}</strong>) across your ${r.plannedUnits} planned units to reach ${r.target.toFixed(2)}.
      Best possible: ${r.maxAchievable.toFixed(2)}.</p>` +
        r.combos.map(c => `
        <div class="planner-combo">
          <div class="planner-combo-head"><span>${this._escape(c.label)}</span><span>→ CGPA ${c.resultCGPA.toFixed(2)}</span></div>
          <div class="planner-chips">${c.assignments.map(a =>
          `<span class="planner-chip">${this._escape(a.title)} (${a.unit}u): <strong>${a.grade}</strong></span>`).join('')}</div>
        </div>`).join('');
    }

    if (standing) {
      html += `<p class="planner-note">Based on ${standing.used} saved semester${standing.used !== 1 ? 's' : ''}
      (${standing.units} units${standing.cgpa !== null ? `, CGPA ${standing.cgpa.toFixed(2)}` : ''}).
      ${standing.ignored ? `${standing.ignored} saved on the other scale ${standing.ignored !== 1 ? 'were' : 'was'} ignored.` : ''}</p>`;
    }
    box.innerHTML = html;
  },
  /* ── VIEW MODAL ── */

  openViewModal(semesterId) {
    try {
      const semesters = Storage.loadSemesters();
      const sem = semesters.find(s => s.id === semesterId);
      if (!sem) return;

      const classInfo = Calculator.classify(sem.gpa, sem.scale);
      if (!GRADE_SCALES[sem.scale]) { this.toast('This semester uses a scale that is not installed', 'error'); return; }

      this.els.viewModalTitle.textContent = sem.name;

      const rows = sem.courses.map(c => {
        const unit = parseFloat(c.unit);
        const gp = Calculator.gradePoint(c.grade, sem.scale);
        const pts = (unit > 0 && gp !== null) ? (unit * gp).toFixed(2) : '—';
        return `
          <tr>
            <td>${this._escape(c.title || '—')}</td>
            <td>${this._escape(c.code || '—')}</td>
            <td>${this._escape(c.unit || '—')}</td>
            <td>${this._escape(c.grade || '—')}</td>
            <td>${gp !== null ? gp : '—'}</td>
            <td><strong>${pts}</strong></td>
          </tr>
        `;
      }).join('');

      this.els.viewModalBody.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Course Title</th><th>Code</th><th>Units</th>
              <th>Grade</th><th>GP/Unit</th><th>Total GP</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="view-modal-summary">
          <div class="view-modal-stat">
            <span class="view-modal-stat-label">GPA</span>
            <span class="view-modal-stat-value">${sem.gpa.toFixed(2)} / ${scaleLabel}</span>
          </div>
          <div class="view-modal-stat">
            <span class="view-modal-stat-label">Classification</span>
            <span class="view-modal-stat-value">${classInfo ? classInfo.label : '—'}</span>
          </div>
          <div class="view-modal-stat">
            <span class="view-modal-stat-label">Total Units</span>
            <span class="view-modal-stat-value">${sem.totalUnits}</span>
          </div>
          <div class="view-modal-stat">
            <span class="view-modal-stat-label">Grade Points</span>
            <span class="view-modal-stat-value">${sem.totalPoints.toFixed(2)}</span>
          </div>
        </div>
      `;

      this.els.viewModal.hidden = false;
      document.body.style.overflow = 'hidden';
    } catch (err) {
      console.error('Open view modal error:', err);
      this.toast('Failed to open semester details', 'error');
    }
  },

  closeViewModal() {
    this.els.viewModal.hidden = true;
    document.body.style.overflow = '';
  },

  /* ── SAVE MODAL ── */

  openSaveModal() {
    this.els.semesterNameInput.value = '';
    this.els.semesterNameError.textContent = '';
    this.els.saveModal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => this.els.semesterNameInput.focus(), 100);
  },

  closeSaveModal() {
    this.els.saveModal.hidden = true;
    document.body.style.overflow = '';
  },

  /* ── RENAME MODAL ── */

  openRenameModal(semesterId) {
    try {
      const semesters = Storage.loadSemesters();
      const sem = semesters.find(s => s.id === semesterId);
      if (!sem) return;

      this.els.renameModal.dataset.targetId = semesterId;
      this.els.renameInput.value = sem.name;
      this.els.renameError.textContent = '';
      this.els.renameModal.hidden = false;
      document.body.style.overflow = 'hidden';
      setTimeout(() => this.els.renameInput.focus(), 100);
    } catch (err) {
      console.error('Open rename modal error:', err);
    }
  },

  closeRenameModal() {
    this.els.renameModal.hidden = true;
    document.body.style.overflow = '';
  },

  /* ── THEME ── */

  applyTheme(theme) {
    try {
      document.documentElement.setAttribute('data-theme', theme);
      State.theme = theme;
      Storage.saveTheme(theme);
    } catch (err) {
      console.error('Apply theme error:', err);
    }
  },

  toggleTheme() {
    const next = State.theme === 'dark' ? 'light' : 'dark';
    this.applyTheme(next);
  },

  /* ── UTILITY ── */

  _escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },
};


/* ============================================================
   10. ENHANCED VALIDATION MODULE
   ============================================================ */

const Validate = {
  title(value) {
    if (!value.trim()) return 'Course title is required';
    if (value.trim().length < 2) return 'Title must be at least 2 characters';
    if (value.trim().length > 100) return 'Title must be under 100 characters';
    return '';
  },

  unit(value) {
    if (!value || value === '' || value === null) return 'Unit is required';
    const n = parseFloat(value);
    if (isNaN(n)) return 'Enter a valid number';
    if (n < 0) return 'Units cannot be negative';
    if (n > 50) return 'Units must be 50 or less';
    if (n === 0) return 'Units must be greater than 0';
    return '';
  },

  code(value) {
    if (!value || !value.trim()) return ''; // optional
    if (!/^[A-Za-z0-9\-\/]+$/.test(value)) {
      return 'Code can only contain letters, numbers, hyphens, and slashes';
    }
    if (value.length > 20) return 'Code is too long';
    return '';
  },

  grade(value) {
    if (!value) return 'Please select a grade';
    return '';
  },

  allCourses() {
    let allValid = true;
    const rows = document.querySelectorAll('.course-row');

    rows.forEach(row => {
      const titleInput = row.querySelector('.course-title');
      const unitInput = row.querySelector('.course-unit');
      const gradeInput = row.querySelector('.course-grade');

      const titleVal = titleInput.value;
      const unitVal = unitInput.value;
      const gradeVal = gradeInput.value;

      if (!titleVal && !unitVal && !gradeVal) return;

      const titleErr = this.title(titleVal);
      const unitErr = this.unit(unitVal);
      const gradeErr = this.grade(gradeVal);

      showFieldError(row.querySelector('.course-title + .field-error'), titleErr);
      showFieldError(row.querySelector('.course-unit  + .field-error'), unitErr);
      showFieldError(row.querySelector('.course-grade + .field-error'), gradeErr);

      if (titleErr || unitErr || gradeErr) allValid = false;
    });

    return allValid;
  },
};

function showFieldError(errorEl, message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  const input = errorEl.previousElementSibling;
  if (input) input.classList.toggle('error', !!message);
}

function clearRowErrors(row) {
  row.querySelectorAll('.field-error').forEach(el => el.textContent = '');
  row.querySelectorAll('.field-input').forEach(el => el.classList.remove('error'));
}


/* ============================================================
   11. STATE SYNC
   ============================================================ */

function syncStateFromDOM() {
  State.courses = [];
  const rows = document.querySelectorAll('.course-row');

  rows.forEach(row => {
    State.courses.push({
      id: row.dataset.id,
      title: row.querySelector('.course-title')?.value ?? '',
      code: row.querySelector('.course-code')?.value ?? '',
      unit: row.querySelector('.course-unit')?.value ?? '',
      grade: row.querySelector('.course-grade')?.value ?? '',
    });
  });
}

function updateRowGP(row) {
  try {
    const unit = parseFloat(row.querySelector('.course-unit')?.value);
    const grade = row.querySelector('.course-grade')?.value;
    const gp = Calculator.gradePoint(grade, State.scale);
    const total = (unit > 0 && gp !== null) ? (unit * gp).toFixed(2) : null;
    const cell = row.querySelector('.gp-value');
    if (cell) {
      cell.textContent = total !== null ? total : '—';
      cell.style.color = total !== null ? 'var(--accent)' : 'var(--text-faint)';
    }
  } catch (err) {
    console.error('Update row GP error:', err);
  }
}


/* ============================================================
   12. COURSE MANAGEMENT
   ============================================================ */
/** Switch scale: convert/clear grades that don't exist on the new scale, then redraw everything. */
function applyScale(scale, { silent = false } = {}) {
  try {
    if (!GRADE_SCALES[scale]) scale = '5.0';
    syncStateFromDOM();
    const r = Scales.reconcileGrades(State.courses, scale);
    State.courses = r.courses;
    State.scale = scale;
    Storage.saveScale(scale);
    UI.populateScaleSelect();
    UI.els.scaleLabel.textContent = `/ ${GRADE_SCALES[scale].max}`;
    UI.renderCourseList();                    // rebuilds rows: new grade options and fresh GP cells
    UI.updateDashboard();
    if (UI.populatePlannerTargets) UI.populatePlannerTargets();
    if (!silent) {
      const notes = [];
      if (r.mapped) notes.push(`${r.mapped} grade${r.mapped !== 1 ? 's' : ''} converted`);
      if (r.cleared) notes.push(`${r.cleared} cleared (not on this scale)`);
      UI.toast(`Switched to ${GRADE_SCALES[scale].label}` + (notes.length ? ` — ${notes.join(', ')}` : ''), 'info');
    }
  } catch (err) {
    console.error('Scale change error:', err);
    UI.toast('Could not switch scale', 'error');
  }
}

const ScaleEditor = {
  els: null, editingId: null,

  init() {
    const $ = id => document.getElementById(id);
    this.els = {
      modal: $('scale-modal'), name: $('scale-name'), preset: $('scale-preset'), rows: $('scale-rows'),
      err: $('scale-error'), add: $('scale-add-row'), save: $('scale-save'), cancel: $('scale-cancel'),
      del: $('scale-delete'), dup: $('scale-duplicate'), open: $('scale-manage'), desc: $('scale-modal-desc')
    };
    const e = this.els;
    e.open.addEventListener('click', () => this.open());
    e.cancel.addEventListener('click', () => this.close());
    e.modal.addEventListener('click', ev => { if (ev.target === e.modal) this.close(); });
    e.modal.addEventListener('keydown', ev => { if (ev.key === 'Escape') this.close(); });
    e.add.addEventListener('click', () => this.addRow('', ''));
    e.preset.addEventListener('change', () => { if (GRADE_SCALES[e.preset.value]) this.fill(GRADE_SCALES[e.preset.value].grades); });
    e.rows.addEventListener('click', ev => { const b = ev.target.closest('[data-remove]'); if (b) b.closest('.scale-row').remove(); });
    e.save.addEventListener('click', () => this.save());
    e.del.addEventListener('click', () => this.remove());
    e.dup.addEventListener('click', () => this.duplicate());
  },

  open() {
    const e = this.els, cur = State.scale, editing = Scales.isCustom(cur);
    const used = editing ? Scales.usage(cur, Storage.loadSemesters()) : 0;
    this.editingId = editing ? cur : null;
    e.err.textContent = '';
    e.preset.innerHTML = '<option value="">Start from…</option>' + Object.entries(GRADE_SCALES)
      .map(([id, s]) => `<option value="${UI._escape(id)}">${UI._escape(s.label)}</option>`).join('');
    e.preset.value = editing ? '' : cur;
    e.preset.disabled = editing;
    e.name.value = editing ? GRADE_SCALES[cur].label : '';
    this.fill(GRADE_SCALES[cur].grades);
    e.desc.textContent = !editing ? 'Pick a starting point, then set each grade and what it is worth.'
      : used ? `Used by ${used} saved semester${used !== 1 ? 's' : ''}: you can rename it, but grades and points are locked. Use Duplicate for an editable copy.`
        : 'Edit this scale. Changes apply to every course using it.';
    e.rows.querySelectorAll('input').forEach(i => { i.disabled = used > 0; });
    e.add.disabled = used > 0;
    e.del.hidden = e.dup.hidden = !editing;
    e.modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => e.name.focus(), 50);
  },

  close() { this.els.modal.hidden = true; document.body.style.overflow = ''; },

  fill(grades) {
    this.els.rows.innerHTML = '';
    Object.entries(grades).sort((a, b) => b[1] - a[1]).forEach(([g, p]) => this.addRow(g, p));
  },

  addRow(g, p) {
    const row = document.createElement('div');
    row.className = 'scale-row';
    row.innerHTML = `
      <input class="modal-input" data-g maxlength="4" placeholder="Grade" value="${UI._escape(g)}" aria-label="Grade label" />
      <input class="modal-input" data-p type="number" step="0.01" min="0" max="20" placeholder="Points" value="${UI._escape(p)}" aria-label="Grade points" />
      <button type="button" class="remove-btn" data-remove aria-label="Remove grade">✕</button>`;
    this.els.rows.appendChild(row);
  },

  read() {
    const grades = {};
    let dupe = null;
    this.els.rows.querySelectorAll('.scale-row').forEach(r => {
      const g = r.querySelector('[data-g]').value.trim().toUpperCase();
      const p = r.querySelector('[data-p]').value;
      if (!g && p === '') return;                            // ignore blank rows
      if (Object.hasOwn(grades, g)) dupe = g;
      grades[g] = p === '' ? NaN : Number(p);
    });
    return { dupe, def: { id: this.editingId || undefined, label: this.els.name.value, grades } };
  },

  save() {
    const e = this.els, { def, dupe } = this.read();
    if (dupe) { e.err.textContent = `Grade "${dupe}" appears twice`; return; }
    const res = Scales.save(def, Storage.loadSemesters());
    if (!res.ok) { e.err.textContent = res.error; return; }
    this.close();
    applyScale(res.id, { silent: true });
    UI.toast('Scale saved', 'success');
  },

  duplicate() {
    const { def } = this.read();
    const res = Scales.save({ label: (def.label + ' copy').slice(0, 24), grades: def.grades }, Storage.loadSemesters());
    if (!res.ok) { this.els.err.textContent = res.error; return; }
    applyScale(res.id, { silent: true });
    this.open();                                             // reopen on the editable copy
  },

  remove() {
    const name = GRADE_SCALES[this.editingId]?.label;
    if (!confirm(`Delete the scale "${name}"?`)) return;
    const res = Scales.remove(this.editingId, Storage.loadSemesters());
    if (!res.ok) { this.els.err.textContent = res.error; return; }
    this.close();
    applyScale('5.0', { silent: true });
    UI.toast(`"${name}" deleted`, 'info');
  },
};

function addCourse() {
  try {
    UndoManager.saveState();

    const course = {
      id: State.nextId(),
      title: '',
      code: '',
      unit: '',
      grade: '',
    };

    State.courses.push(course);
    const row = UI.buildCourseRow(course, State.scale);
    UI.els.courseList.appendChild(row);

    UI.els.emptyState.classList.add('hidden');

    const n = State.courses.length;
    UI.els.courseCount.textContent = `${n} course${n !== 1 ? 's' : ''}`;

    setTimeout(() => row.querySelector('.course-title')?.focus(), 50);

    UI.updateDashboard();
    UI.populatePlannerTargets();
  } catch (err) {
    console.error('Add course error:', err);
    UI.toast('Failed to add course', 'error');
  }
}

function removeCourse(courseId) {
  try {
    UndoManager.saveState();

    const row = UI.els.courseList.querySelector(`[data-id="${courseId}"]`);
    if (!row) return;

    row.style.transition = 'opacity 0.2s, transform 0.2s';
    row.style.opacity = '0';
    row.style.transform = 'translateX(20px)';

    setTimeout(() => {
      row.remove();
      syncStateFromDOM();
      UI.updateDashboard();
      UI.populatePlannerTargets();
      const n = State.courses.length;
      UI.els.courseCount.textContent = `${n} course${n !== 1 ? 's' : ''}`;
      UI.els.emptyState.classList.toggle('hidden', n > 0);
    }, 200);
  } catch (err) {
    console.error('Remove course error:', err);
    UI.toast('Failed to remove course', 'error');
  }
}

function resetSemester() {
  try {
    if (State.courses.length === 0) {
      UI.toast('Nothing to reset.', 'info');
      return;
    }

    UndoManager.saveState();

    document.querySelectorAll('.course-row').forEach((row, i) => {
      setTimeout(() => {
        row.style.transition = 'opacity 0.15s, transform 0.15s';
        row.style.opacity = '0';
        row.style.transform = 'translateY(-6px)';
      }, i * 30);
    });

    setTimeout(() => {
      State.courses = [];
      UI.els.courseList.innerHTML = '';
      UI.els.emptyState.classList.remove('hidden');
      UI.els.courseCount.textContent = '0 courses';
      UI.updateDashboard();
      UI.populatePlannerTargets();
      UI.toast('Semester reset.', 'info');
    }, State.courses.length * 30 + 200);
  } catch (err) {
    console.error('Reset semester error:', err);
    UI.toast('Failed to reset semester', 'error');
  }
}


/* ============================================================
   13. SAVE SEMESTER FLOW
   ============================================================ */

function confirmSave() {
  try {
    const name = UI.els.semesterNameInput.value.trim();
    const errEl = UI.els.semesterNameError;

    if (!name) {
      errEl.textContent = 'Please enter a semester name';
      UI.els.semesterNameInput.classList.add('error');
      UI.els.semesterNameInput.focus();
      return;
    }

    if (name.length > 60) {
      errEl.textContent = 'Semester name must be under 60 characters';
      UI.els.semesterNameInput.focus();
      return;
    }

    const result = Calculator.calculate(State.courses, State.scale, State.repeatRule);
    if (result.validCount === 0) {
      UI.closeSaveModal();
      UI.toast('Add at least one complete course before saving.', 'error');
      return;
    }

    Storage.addSemester(name, State.courses, result, State.scale);
    UI.closeSaveModal();
    UI.renderHistory();
    CGPA.updateDisplay();
    UI.toast(`"${name}" saved!`, 'success');

  } catch (err) {
    console.error('Confirm save error:', err);
    UI.toast('Failed to save semester', 'error');
  }
}


/* ============================================================
   14. KEYBOARD SHORTCUTS & EVENT WIRING
   ============================================================ */

function wireEvents() {
  try {
    const els = UI.els;

    /* ── Add Course ── */
    els.addCourseBtn.addEventListener('click', addCourse);

    /* ── Reset ── */
    els.resetBtn.addEventListener('click', resetSemester);

    /* ── Save Semester ── */
    els.saveBtn.addEventListener('click', () => {
      if (State.courses.length === 0) {
        UI.toast('Add courses before saving.', 'error');
        return;
      }
      UI.openSaveModal();
    });

    /* ── Target planner (#18) ── */
    const plannerClass = document.getElementById('planner-class');
    const plannerTarget = document.getElementById('planner-target');
    plannerClass.addEventListener('change', () => { plannerTarget.disabled = !!plannerClass.value; });
    document.getElementById('planner-run').addEventListener('click', () => {
      syncStateFromDOM();
      const standing = Planner.standing(Storage.loadSemesters(), State.scale);
      const courses = State.courses
        .filter(c => parseFloat(c.unit) > 0)
        .map(c => ({ title: (c.title || '').trim() || 'Untitled course', unit: parseFloat(c.unit) }));
      const target = plannerClass.value ? parseFloat(plannerClass.value) : parseFloat(plannerTarget.value);
      UI.renderPlanner(Planner.plan({ units: standing.units, points: standing.points, courses, target, scale: State.scale }), standing);
    });

    /* ── Backup / Restore (#15) ── */
    let pendingBackup = null;
    const $ = id => document.getElementById(id);
    const closeRestore = () => { $('restore-modal').hidden = true; document.body.style.overflow = ''; pendingBackup = null; };

    $('backup-btn').addEventListener('click', () => {
      if (Storage.loadSemesters().length === 0) return UI.toast('No saved semesters to back up.', 'info');
      const stamp = new Date().toISOString().slice(0, 10);
      Export._downloadFile(Storage.buildBackup(), `gpapro-backup-${stamp}.json`, 'application/json');
      UI.toast('Backup downloaded!', 'success');
    });

    $('restore-btn').addEventListener('click', () => $('restore-file').click());

    $('restore-file').addEventListener('change', async e => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const { semesters, skipped } = Storage.parseBackup(text);          // validate before asking
        if (semesters.length === 0) return UI.toast('That backup has no usable semesters.', 'error');
        pendingBackup = text;
        $('restore-summary').textContent =
          `Found ${semesters.length} semester${semesters.length !== 1 ? 's' : ''}` +
          (skipped ? ` (${skipped} unreadable, will be skipped)` : '') + '. How should they be restored?';
        $('restore-modal').hidden = false;
        document.body.style.overflow = 'hidden';
      } catch (err) {
        UI.toast(`Restore failed: ${err.message}`, 'error');
      }
    });

    $('restore-cancel').addEventListener('click', closeRestore);

    $('restore-confirm').addEventListener('click', () => {
      try {
        const mode = document.querySelector('input[name="restore-mode"]:checked').value;
        if (mode === 'replace' && !confirm('Replace your entire saved history? This cannot be undone.')) return;
        const r = Storage.restoreBackup(pendingBackup, mode);
        closeRestore();
        UI.populateScaleSelect()
        UI.renderHistory();
        CGPA.updateDisplay();
        UI.toast(mode === 'replace'
          ? `Restored ${r.added} semester${r.added !== 1 ? 's' : ''}.`
          : `Added ${r.added}, skipped ${r.duplicates} already present.`, 'success');
      } catch (err) {
        UI.toast(`Restore failed: ${err.message}`, 'error');
      }
    });
    /* ── Modal buttons ── */
    els.modalConfirm.addEventListener('click', confirmSave);
    els.modalCancel.addEventListener('click', () => UI.closeSaveModal());

    els.semesterNameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmSave();
      if (e.key === 'Escape') UI.closeSaveModal();
    });

    /* ── Rename Modal ── */
    els.renameConfirm.addEventListener('click', () => {
      try {
        const id = els.renameModal.dataset.targetId;
        const newName = els.renameInput.value.trim();
        const errEl = els.renameError;

        if (!newName) {
          errEl.textContent = 'Please enter a name';
          return;
        }
        if (newName.length > 60) {
          errEl.textContent = 'Name must be under 60 characters';
          return;
        }

        Storage.renameSemester(id, newName);
        UI.closeRenameModal();
        UI.renderHistory();
        UI.toast('Semester renamed.', 'success');
      } catch (err) {
        console.error('Rename semester error:', err);
        UI.toast('Failed to rename semester', 'error');
      }
    });

    els.renameCancel.addEventListener('click', () => UI.closeRenameModal());

    els.renameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') els.renameConfirm.click();
      if (e.key === 'Escape') UI.closeRenameModal();
    });

    /* ── View Modal ── */
    els.viewModalClose.addEventListener('click', () => UI.closeViewModal());

    /* ── Close modals on overlay click ── */
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', e => {
        if (e.target === overlay) {
          UI.closeSaveModal();
          UI.closeViewModal();
          UI.closeRenameModal();
        }
      });
    });

    /* ── Grading Scale ── */
    els.gradingScale.addEventListener('change', () => applyScale(els.gradingScale.value));

    const repeatSel = document.getElementById('repeat-rule');
    repeatSel.value = State.repeatRule;
    repeatSel.addEventListener('change', () => {
      State.repeatRule = repeatSel.value;
      Storage.saveRepeatRule(State.repeatRule);
      UI.updateDashboard();
      UI.toast({ all: 'Counting every attempt', latest: 'Retakes: latest attempt only', best: 'Retakes: best attempt only' }[State.repeatRule], 'info');
    });

    /* ── Theme Toggle ── */
    els.themeToggle.addEventListener('click', () => UI.toggleTheme());

    /* ── Export CSV ── */
    els.exportCSVBtn.addEventListener('click', () => {
      try {
        syncStateFromDOM();
        const result = Calculator.calculate(State.courses, State.scale, State.repeatRule);
        Export.toCSV(State.courses, result, State.scale);
      } catch (err) {
        console.error('CSV export error:', err);
        UI.toast('CSV export failed', 'error');
      }
    });

    /* ── Export PDF ── */
    els.exportPDFBtn.addEventListener('click', () => {
      try {
        syncStateFromDOM();
        const result = Calculator.calculate(State.courses, State.scale, State.repeatRule);
        Export.toPDF(State.courses, result, State.scale);
      } catch (err) {
        console.error('PDF export error:', err);
        UI.toast('PDF export failed', 'error');
      }
    });

    /* ── Import CSV/JSON ── */
    const importBtn = document.getElementById('import-btn');
    const importFile = document.getElementById('import-file');

    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', (e) => {
        if (e.target.files[0]) {
          Import.handleImport(e.target.files[0]);
          e.target.value = '';
        }
      });
    }

    /* ── Clear History ── */
    els.clearHistoryBtn.addEventListener('click', () => {
      try {
        const sems = Storage.loadSemesters();
        if (sems.length === 0) {
          UI.toast('History is already empty.', 'info');
          return;
        }
        if (confirm(`Delete all ${sems.length} saved semester(s)?`)) {
          Storage.saveSemesters([]);
          UI.renderHistory();
          CGPA.updateDisplay();
          UI.toast('History cleared.', 'success');
        }
      } catch (err) {
        console.error('Clear history error:', err);
      }
    });

    /* ── EVENT DELEGATION: Course inputs (real-time calc) ── */
    els.courseList.addEventListener('input', e => {
      try {
        const target = e.target;
        const row = target.closest('.course-row');
        if (!row) return;

        const errEl = target.nextElementSibling;
        if (errEl?.classList.contains('field-error')) {
          errEl.textContent = '';
          target.classList.remove('error');
        }

        if (target.classList.contains('course-unit')) {
          const err = Validate.unit(target.value);
          if (err) {
            showFieldError(target.nextElementSibling, err);
          }
        }

        syncStateFromDOM();
        updateRowGP(row);
        UI.updateDashboard();
      } catch (err) {
        console.error('Input event error:', err);
      }
    });

    /* ── EVENT DELEGATION: Remove button ── */
    els.courseList.addEventListener('click', e => {
      try {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        if (btn.dataset.action === 'remove') {
          const row = btn.closest('.course-row');
          if (row) removeCourse(row.dataset.id);
        }
      } catch (err) {
        console.error('Course list click error:', err);
      }
    });

    /* ── EVENT DELEGATION: History buttons ── */
    els.historyList.addEventListener('click', e => {
      try {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const id = btn.dataset.id;

        if (btn.dataset.action === 'view') {
          UI.openViewModal(id);
        } else if (btn.dataset.action === 'rename') {
          UI.openRenameModal(id);
        } else if (btn.dataset.action === 'delete') {
          const sems = Storage.loadSemesters();
          const target = sems.find(s => s.id === id);
          if (target && confirm(`Delete "${target.name}"?`)) {
            Storage.deleteSemester(id);
            UI.renderHistory();
            CGPA.updateDisplay();
            UI.toast(`"${target.name}" deleted.`, 'info');
          }
        }
      } catch (err) {
        console.error('History click error:', err);
      }
    });

    /* ── KEYBOARD SHORTCUTS ── */
    document.addEventListener('keydown', e => {
      try {
        // Escape closes modals
        if (e.key === 'Escape') {
          UI.closeSaveModal();
          UI.closeViewModal();
          UI.closeRenameModal();
          return;
        }

        // Only process shortcuts if no modal is open and not typing in input
        const isModalOpen = !UI.els.saveModal.hidden || !UI.els.viewModal.hidden || !UI.els.renameModal.hidden;
        const isInputFocused = document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA';

        if (isModalOpen || isInputFocused) return;

        // Ctrl/Cmd + N = Add course
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
          e.preventDefault();
          addCourse();
        }

        // Ctrl/Cmd + S = Save semester
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          if (State.courses.length > 0) {
            UI.openSaveModal();
          } else {
            UI.toast('Add courses before saving.', 'error');
          }
        }

        // Ctrl/Cmd + E = Export CSV
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
          e.preventDefault();
          syncStateFromDOM();
          const result = Calculator.calculate(State.courses, State.scale, State.repeatRule);
          Export.toCSV(State.courses, result, State.scale);
        }

        // Ctrl/Cmd + Z = Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          UndoManager.undo();
        }

        // Ctrl/Cmd + R = Reset semester
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
          e.preventDefault();
          resetSemester();
        }
      } catch (err) {
        console.error('Keyboard shortcut error:', err);
      }
    });
  } catch (err) {
    console.error('Wire events error:', err);
  }

}


/* ============================================================
   15. GLOBAL ERROR HANDLERS
   ============================================================ */

window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error);
  UI.toast('An unexpected error occurred. Your data is safe.', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  UI.toast('A processing error occurred. Please try again.', 'error');
});


/* ============================================================
   16. APP INITIALIZATION
   ============================================================ */

const App = {
  init() {
    try {
      /* ── Cache DOM elements ── */
      UI.els = {
        gradingScale: document.getElementById('grading-scale'),
        themeToggle: document.getElementById('theme-toggle'),

        gpaDisplay: document.getElementById('gpa-display'),
        ringFill: document.getElementById('ring-fill'),
        scaleLabel: document.getElementById('scale-label'),
        totalUnits: document.getElementById('total-units'),
        totalPoints: document.getElementById('total-points'),
        classificationBadge: document.getElementById('classification-badge'),
        classDesc: document.getElementById('class-desc'),

        addCourseBtn: document.getElementById('add-course-btn'),
        courseList: document.getElementById('course-list'),
        courseCount: document.getElementById('course-count'),
        emptyState: document.getElementById('empty-state'),
        resetBtn: document.getElementById('reset-btn'),
        saveBtn: document.getElementById('save-btn'),
        exportCSVBtn: document.getElementById('export-csv-btn'),
        exportPDFBtn: document.getElementById('export-pdf-btn'),

        saveModal: document.getElementById('save-modal'),
        semesterNameInput: document.getElementById('semester-name-input'),
        semesterNameError: document.getElementById('semester-name-error'),
        modalConfirm: document.getElementById('modal-confirm'),
        modalCancel: document.getElementById('modal-cancel'),

        viewModal: document.getElementById('view-modal'),
        viewModalTitle: document.getElementById('view-modal-title'),
        viewModalBody: document.getElementById('view-modal-body'),
        viewModalClose: document.getElementById('view-modal-close'),

        renameModal: document.getElementById('rename-modal'),
        renameInput: document.getElementById('rename-input'),
        renameError: document.getElementById('rename-error'),
        renameConfirm: document.getElementById('rename-confirm'),
        renameCancel: document.getElementById('rename-cancel'),

        historyList: document.getElementById('history-list'),
        historyEmpty: document.getElementById('history-empty'),
        historyCount: document.getElementById('history-count'),
        clearHistoryBtn: document.getElementById('clear-history-btn'),

        toast: document.getElementById('toast'),
      };

      /* ── Restore preferences ── */
      Scales.loadCustom();                                        // must run before reading the saved scale
      State.repeatRule = Storage.loadRepeatRule();
      const savedTheme = Storage.loadTheme();
      let savedScale = Storage.loadScale();
      if (!GRADE_SCALES[savedScale]) savedScale = '5.0';          // saved scale may have been deleted

      UI.applyTheme(savedTheme);
      State.scale = savedScale;
      UI.populateScaleSelect();
      UI.els.scaleLabel.textContent = `/ ${GRADE_SCALES[savedScale].max}`;
      UI.els.ringFill.style.strokeDasharray = RING_CIRCUMFERENCE;
      UI.els.ringFill.style.strokeDashoffset = RING_CIRCUMFERENCE;
      UI.els.ringFill.style.transition = 'stroke-dashoffset 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
      UI.els.ringFill.style.willChange = 'stroke-dashoffset';
      /* ── Wire events ── */
      wireEvents();
      ScaleEditor.init();
      UI.populatePlannerTargets();

      /* ── Initialize ── */
      addCourse();
      UI.renderHistory();
      CGPA.updateDisplay();

      console.log('✅ GPA Calculator Pro enhanced edition initialised.');
      UI.toast('Ready to calculate! Use Ctrl+N to add courses.', 'info');
    } catch (err) {
      console.error('App initialization failed:', err);
      UI.toast('Failed to initialize app', 'error');
    }
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
