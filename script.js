/**
 * GPA Calculator Pro — app.js
 * ============================================================
 * Architecture: Module-object pattern — all logic is grouped
 * into clearly named modules (Calculator, Storage, Export, UI)
 * with a single App controller for init and event wiring.
 *
 * Folder: js/app.js
 * Dependencies: jsPDF + jsPDF-autotable (CDN, see index.html)
 * ============================================================
 */

'use strict';

/* ============================================================
   1. CONSTANTS
   ============================================================ */

/**
 * Grade point lookup tables for each supported scale.
 * Extend this object to add more grading systems.
 */
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

/**
 * GPA Classification rules per scale.
 *
 * Each entry: { min, max, label, cssClass, desc }
 *
 * CLASSIFICATION LOGIC:
 * ─────────────────────
 * The rules below follow the Nigerian university system
 * (common in West Africa). Adjust the min/max values to
 * match any other institution's classification system.
 *
 * 5.0 Scale:
 *   4.50 – 5.00 → First Class
 *   3.50 – 4.49 → Second Class Upper
 *   2.40 – 3.49 → Second Class Lower
 *   1.50 – 2.39 → Third Class
 *   1.00 – 1.49 → Pass
 *   0.00 – 0.99 → Fail
 *
 * 4.0 Scale:
 *   3.60 – 4.00 → First Class
 *   3.00 – 3.59 → Second Class Upper
 *   2.00 – 2.99 → Second Class Lower
 *   1.00 – 1.99 → Third Class
 *   0.50 – 0.99 → Pass
 *   0.00 – 0.49 → Fail
 */
const CLASSIFICATIONS = {
  '5.0': [
    { min: 4.50, max: 5.00, label: 'First Class',        cssClass: 'first-class',  desc: 'Outstanding academic performance' },
    { min: 3.50, max: 4.49, label: 'Second Class Upper', cssClass: 'second-upper', desc: 'Excellent academic performance' },
    { min: 2.40, max: 3.49, label: 'Second Class Lower', cssClass: 'second-lower', desc: 'Good academic performance' },
    { min: 1.50, max: 2.39, label: 'Third Class',        cssClass: 'third-class',  desc: 'Satisfactory academic performance' },
    { min: 1.00, max: 1.49, label: 'Pass',               cssClass: 'pass',         desc: 'Minimum passing threshold' },
    { min: 0.00, max: 0.99, label: 'Fail',               cssClass: 'fail',         desc: 'Below minimum passing threshold' },
  ],
  '4.0': [
    { min: 3.60, max: 4.00, label: 'First Class',        cssClass: 'first-class',  desc: 'Outstanding academic performance' },
    { min: 3.00, max: 3.59, label: 'Second Class Upper', cssClass: 'second-upper', desc: 'Excellent academic performance' },
    { min: 2.00, max: 2.99, label: 'Second Class Lower', cssClass: 'second-lower', desc: 'Good academic performance' },
    { min: 1.00, max: 1.99, label: 'Third Class',        cssClass: 'third-class',  desc: 'Satisfactory academic performance' },
    { min: 0.50, max: 0.99, label: 'Pass',               cssClass: 'pass',         desc: 'Minimum passing threshold' },
    { min: 0.00, max: 0.49, label: 'Fail',               cssClass: 'fail',         desc: 'Below minimum passing threshold' },
  ],
};

/** localStorage key */
const STORAGE_KEY = 'gpapro_semesters';
const THEME_KEY   = 'gpapro_theme';
const SCALE_KEY   = 'gpapro_scale';

/** Ring circumference for SVG progress circle (2π × radius 52) */
const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // ≈ 326.7


/* ============================================================
   2. APPLICATION STATE
   ============================================================ */

/**
 * Central state object. All mutable data lives here.
 * The UI is derived from this state on every update.
 */
const State = {
  /** Array of course objects currently in the calculator */
  courses: [],

  /** Active grading scale key: '5.0' | '4.0' */
  scale: '5.0',

  /** Dark or light theme */
  theme: 'dark',

  /** Counter used to generate unique course IDs */
  _idCounter: 0,

  /** Generate a unique course ID */
  nextId() {
    return `course_${++this._idCounter}`;
  },
};


/* ============================================================
   3. CALCULATOR MODULE
   Handles all GPA-related math. Pure functions — no DOM access.
   ============================================================ */

const Calculator = {
  /**
   * Get the numeric grade point for a letter grade on a given scale.
   * @param {string} grade  - e.g. 'A', 'B'
   * @param {string} scale  - '5.0' | '4.0'
   * @returns {number|null} - null if grade is empty / invalid
   */
  gradePoint(grade, scale) {
    if (!grade) return null;
    const points = GRADE_SCALES[scale]?.grades;
    return points?.[grade] ?? null;
  },

  /**
   * Calculate total weighted grade points for a single course.
   * Formula: unit × gradePoint
   * @param {number} unit
   * @param {string} grade
   * @param {string} scale
   * @returns {number|null}
   */
  coursePoints(unit, grade, scale) {
    const gp = this.gradePoint(grade, scale);
    if (gp === null || isNaN(unit) || unit <= 0) return null;
    return unit * gp;
  },

  /**
   * Calculate GPA from an array of course objects.
   *
   * GPA Formula:
   *   GPA = Σ(unit × gradePoint) / Σ(unit)
   *
   * Only courses with valid unit AND valid grade contribute.
   *
   * @param {Array}  courses - array of { unit, grade }
   * @param {string} scale   - '5.0' | '4.0'
   * @returns {{ gpa: number, totalUnits: number, totalPoints: number, validCount: number }}
   */
  calculate(courses, scale) {
    let totalPoints = 0;
    let totalUnits  = 0;
    let validCount  = 0;

    for (const course of courses) {
      const unit = parseFloat(course.unit);
      const gp   = this.gradePoint(course.grade, scale);

      // Skip courses with missing or invalid data
      if (!course.grade || isNaN(unit) || unit <= 0 || gp === null) continue;

      totalPoints += unit * gp;
      totalUnits  += unit;
      validCount  += 1;
    }

    // Avoid division by zero
    const gpa = totalUnits > 0 ? totalPoints / totalUnits : 0;

    return {
      gpa: Math.round(gpa * 100) / 100, // round to 2 d.p.
      totalUnits,
      totalPoints: Math.round(totalPoints * 100) / 100,
      validCount,
    };
  },

  /**
   * Determine GPA classification.
   * @param {number} gpa
   * @param {string} scale
   * @returns {Object|null} classification entry or null
   */
  classify(gpa, scale) {
    if (gpa <= 0 && State.courses.filter(c => c.grade && parseFloat(c.unit) > 0).length === 0) {
      return null;
    }
    const rules = CLASSIFICATIONS[scale] ?? [];
    return rules.find(r => gpa >= r.min && gpa <= r.max) ?? rules[rules.length - 1];
  },
};


/* ============================================================
   4. STORAGE MODULE
   All localStorage read/write operations.
   ============================================================ */

const Storage = {
  /**
   * Load all saved semesters from localStorage.
   * @returns {Array} Array of semester objects
   */
  loadSemesters() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  /**
   * Save all semesters back to localStorage.
   * @param {Array} semesters
   */
  saveSemesters(semesters) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(semesters));
    } catch (err) {
      console.error('GPA Pro: localStorage write failed', err);
    }
  },

  /**
   * Add a new semester entry.
   * @param {string} name     - Semester label
   * @param {Array}  courses  - Course data snapshot
   * @param {Object} result   - { gpa, totalUnits, totalPoints }
   * @param {string} scale    - grading scale used
   * @returns {Object} the saved semester
   */
  addSemester(name, courses, result, scale) {
    const semesters = this.loadSemesters();
    const entry = {
      id:          `sem_${Date.now()}`,
      name:        name.trim(),
      scale,
      gpa:         result.gpa,
      totalUnits:  result.totalUnits,
      totalPoints: result.totalPoints,
      courses:     courses.map(c => ({ ...c })), // deep copy snapshot
      savedAt:     new Date().toISOString(),
    };
    semesters.unshift(entry); // newest first
    this.saveSemesters(semesters);
    return entry;
  },

  /**
   * Delete a semester by ID.
   * @param {string} id
   */
  deleteSemester(id) {
    const semesters = this.loadSemesters().filter(s => s.id !== id);
    this.saveSemesters(semesters);
  },

  /**
   * Rename a semester.
   * @param {string} id
   * @param {string} newName
   */
  renameSemester(id, newName) {
    const semesters = this.loadSemesters();
    const target = semesters.find(s => s.id === id);
    if (target) {
      target.name = newName.trim();
      this.saveSemesters(semesters);
    }
  },

  /** Persist theme preference */
  saveTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
  },

  loadTheme() {
    return localStorage.getItem(THEME_KEY) || 'dark';
  },

  /** Persist scale preference */
  saveScale(scale) {
    localStorage.setItem(SCALE_KEY, scale);
  },

  loadScale() {
    return localStorage.getItem(SCALE_KEY) || '5.0';
  },
};


/* ============================================================
   5. EXPORT MODULE
   Handles CSV and PDF export. No external state mutation.
   ============================================================ */

const Export = {
  /**
   * Export current courses to a CSV file.
   * Triggers a browser download — works fully offline.
   */
  toCSV(courses, result, scale) {
    if (courses.length === 0) {
      UI.toast('No courses to export.', 'error');
      return;
    }

    const classInfo = Calculator.classify(result.gpa, scale);
    const scaleLabel = GRADE_SCALES[scale].label;

    // Build CSV rows
    const header = ['Course Title', 'Course Code', 'Units', 'Grade', 'Grade Points'];
    const rows   = courses.map(c => {
      const unit = parseFloat(c.unit);
      const gp   = Calculator.gradePoint(c.grade, scale);
      const pts  = (unit > 0 && gp !== null) ? (unit * gp).toFixed(2) : '';
      return [
        this._csvEscape(c.title  || ''),
        this._csvEscape(c.code   || ''),
        c.unit  || '',
        c.grade || '',
        pts,
      ];
    });

    // Summary rows
    const summary = [
      [],
      ['Grading Scale', `${scaleLabel} Scale`],
      ['Total Units',   result.totalUnits],
      ['Total Grade Points', result.totalPoints.toFixed(2)],
      ['GPA', result.gpa.toFixed(2)],
      ['Classification', classInfo ? classInfo.label : '—'],
      ['Generated', new Date().toLocaleString()],
    ];

    const csvContent = [header, ...rows, ...summary]
      .map(row => row.join(','))
      .join('\n');

    this._downloadFile(csvContent, 'gpa-report.csv', 'text/csv;charset=utf-8;');
    UI.toast('CSV downloaded!', 'success');
  },

  /**
   * Export current courses to a PDF file using jsPDF.
   * Falls back to window.print() if jsPDF is unavailable
   * (e.g. offline with no cached CDN).
   */
  toPDF(courses, result, scale) {
    if (courses.length === 0) {
      UI.toast('No courses to export.', 'error');
      return;
    }

    // Fallback: browser print (works 100% offline)
    if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
      UI.toast('PDF library not loaded — using print mode.', 'info');
      window.print();
      return;
    }

    try {
      const { jsPDF } = window.jspdf || window;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const classInfo  = Calculator.classify(result.gpa, scale);
      const scaleLabel = GRADE_SCALES[scale].label;
      const pageW      = doc.internal.pageSize.getWidth();

      /* ─── Header ─── */
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

      /* ─── GPA Summary Box ─── */
      doc.setFillColor(20, 30, 53);
      doc.roundedRect(14, 42, pageW - 28, 32, 3, 3, 'F');

      // GPA value
      doc.setTextColor(52, 211, 153);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(26);
      doc.text(result.gpa.toFixed(2), 24, 60);

      doc.setFontSize(9);
      doc.setTextColor(180, 190, 210);
      doc.text(`out of ${scaleLabel}`, 24, 66);

      // Classification
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text(classInfo ? classInfo.label : '—', 70, 58);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(180, 190, 210);
      doc.text(`Total Units: ${result.totalUnits}   |   Grade Points: ${result.totalPoints.toFixed(2)}   |   Scale: ${scaleLabel}`, 70, 65);

      /* ─── Course Table ─── */
      doc.setTextColor(40, 40, 40);

      const tableBody = courses
        .filter(c => c.title || c.unit || c.grade)
        .map(c => {
          const unit = parseFloat(c.unit);
          const gp   = Calculator.gradePoint(c.grade, scale);
          const pts  = (unit > 0 && gp !== null) ? (unit * gp).toFixed(2) : '—';
          return [
            c.title || '—',
            c.code  || '—',
            c.unit  || '—',
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
          fillColor:  [20, 30, 53],
          textColor:  [52, 211, 153],
          fontStyle:  'bold',
          fontSize:   9,
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

      /* ─── Footer ─── */
      const finalY = doc.lastAutoTable.finalY + 6;
      doc.setFontSize(8);
      doc.setTextColor(160, 170, 185);
      doc.text('Generated by GPA Calculator Pro', 14, finalY);

      doc.save('gpa-report.pdf');
      UI.toast('PDF downloaded!', 'success');
    } catch (err) {
      console.error('PDF generation failed:', err);
      UI.toast('PDF failed — using print mode.', 'error');
      window.print();
    }
  },

  /** Escape a value for CSV (wrap in quotes if it contains commas or quotes) */
  _csvEscape(value) {
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  },

  /** Trigger a file download in the browser */
  _downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};


/* ============================================================
   6. UI MODULE
   All DOM rendering and interaction helpers.
   ============================================================ */

const UI = {
  /* ── Cached DOM references (set in App.init) ── */
  els: {},

  /** Toast notification with auto-dismiss */
  _toastTimer: null,

  toast(message, type = 'info') {
    const el = this.els.toast;
    el.textContent     = message;
    el.className       = `toast show toast-${type}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.classList.remove('show');
    }, 3200);
  },

  /* ────────────────────────────────────────────────────────
     COURSE ROWS
  ──────────────────────────────────────────────────────── */

  /**
   * Build the HTML string for one course row.
   * Using a template function keeps row creation DRY and
   * avoids inline event handlers.
   * @param {Object} course - { id, title, code, unit, grade }
   * @param {string} scale  - current grading scale key
   * @returns {HTMLElement}
   */
  buildCourseRow(course, scale) {
    const row      = document.createElement('div');
    row.className  = 'course-row';
    row.dataset.id = course.id;
    row.setAttribute('role', 'listitem');

    const gradeOptions = GRADE_SCALES[scale].options
      .map(o => `<option value="${o.value}" ${course.grade === o.value ? 'selected' : ''}>${o.label}</option>`)
      .join('');

    row.innerHTML = `
      <!-- Course Title -->
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

      <!-- Course Code (optional) -->
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

      <!-- Credit Units -->
      <div class="field-group">
        <input
          type="number"
          class="field-input course-unit"
          placeholder="Units"
          value="${course.unit || ''}"
          min="0.5"
          max="20"
          step="0.5"
          aria-label="Credit units"
        />
        <span class="field-error" role="alert"></span>
      </div>

      <!-- Grade Select -->
      <div class="field-group">
        <select class="field-input course-grade" aria-label="Grade">
          <option value="">Grade</option>
          ${gradeOptions}
        </select>
        <span class="field-error" role="alert"></span>
      </div>

      <!-- Grade Points Display (read-only, calculated) -->
      <div class="gp-display" aria-label="Grade points for this course">
        <span class="gp-value">—</span>
        <span class="gp-label">GP</span>
      </div>

      <!-- Remove Button -->
      <button
        class="remove-btn"
        data-action="remove"
        aria-label="Remove this course"
        title="Remove course"
      >✕</button>
    `;

    // Immediately update its GP display if course has data
    this._updateRowGP(row, course, scale);

    return row;
  },

  /**
   * Update the grade points display cell within a row.
   * @param {HTMLElement} row
   * @param {Object}      course - { unit, grade }
   * @param {string}      scale
   */
  _updateRowGP(row, course, scale) {
    const unit   = parseFloat(course.unit);
    const gp     = Calculator.gradePoint(course.grade, scale);
    const total  = (unit > 0 && gp !== null) ? (unit * gp).toFixed(2) : null;
    const gpCell = row.querySelector('.gp-value');
    if (gpCell) {
      gpCell.textContent = total !== null ? total : '—';
      gpCell.style.color = total !== null ? 'var(--accent)' : 'var(--text-faint)';
    }
  },

  /**
   * Rebuild the entire course list from State.courses.
   * Uses DocumentFragment for a single DOM insert (performance).
   */
  renderCourseList() {
    const list = this.els.courseList;
    list.innerHTML = '';

    const fragment = document.createDocumentFragment();
    for (const course of State.courses) {
      fragment.appendChild(this.buildCourseRow(course, State.scale));
    }
    list.appendChild(fragment);

    // Toggle empty state
    const hasRows = State.courses.length > 0;
    this.els.emptyState.classList.toggle('hidden', hasRows);

    // Update course count badge
    const n = State.courses.length;
    this.els.courseCount.textContent = `${n} course${n !== 1 ? 's' : ''}`;
  },

  /* ────────────────────────────────────────────────────────
     DASHBOARD UPDATE
  ──────────────────────────────────────────────────────── */

  /**
   * Update GPA ring, value, classification badge and stat numbers.
   * Called on every input change event.
   */
  updateDashboard() {
    const result     = Calculator.calculate(State.courses, State.scale);
    const classInfo  = Calculator.classify(result.gpa, State.scale);
    const scaleMax   = GRADE_SCALES[State.scale].max;
    const hasData    = result.validCount > 0;

    /* GPA display */
    this.els.gpaDisplay.textContent = hasData ? result.gpa.toFixed(2) : '—';

    /* Ring progress animation */
    const pct    = hasData ? Math.min(result.gpa / scaleMax, 1) : 0;
    const offset = RING_CIRCUMFERENCE - pct * RING_CIRCUMFERENCE;
    this.els.ringFill.style.strokeDashoffset = offset;

    /* Stat cards */
    this.els.totalUnits.textContent  = result.totalUnits;
    this.els.totalPoints.textContent = result.totalPoints.toFixed(2);
    this.els.scaleLabel.textContent  = `/ ${scaleMax}`;

    /* Classification badge */
    const badge = this.els.classificationBadge;
    const desc  = this.els.classDesc;

    if (!hasData || !classInfo) {
      badge.textContent = 'No Data';
      badge.className   = 'classification-badge no-data';
      desc.textContent  = 'Add courses to see your classification';
    } else {
      badge.textContent = classInfo.label;
      badge.className   = `classification-badge ${classInfo.cssClass}`;
      desc.textContent  = classInfo.desc;
    }
  },

  /* ────────────────────────────────────────────────────────
     GRADE SELECT OPTIONS — update when scale changes
  ──────────────────────────────────────────────────────── */

  /**
   * Rebuild all <select> elements in existing course rows
   * to reflect the newly selected grading scale.
   */
  refreshGradeSelects() {
    const selects = this.els.courseList.querySelectorAll('.course-grade');
    const options = GRADE_SCALES[State.scale].options;

    selects.forEach(select => {
      const current = select.value; // preserve selection if possible
      select.innerHTML = `<option value="">Grade</option>` +
        options.map(o => `<option value="${o.value}" ${current === o.value ? 'selected' : ''}>${o.label}</option>`).join('');
    });
  },

  /* ────────────────────────────────────────────────────────
     SEMESTER HISTORY LIST
  ──────────────────────────────────────────────────────── */

  /**
   * Render the semester history cards from localStorage.
   */
  renderHistory() {
    const semesters = Storage.loadSemesters();
    const list      = this.els.historyList;
    list.innerHTML  = '';

    const hasHistory = semesters.length > 0;
    this.els.historyEmpty.classList.toggle('hidden', hasHistory);

    // Update count badge
    this.els.historyCount.textContent = `${semesters.length} saved`;

    if (!hasHistory) return;

    const fragment = document.createDocumentFragment();

    for (const sem of semesters) {
      const classInfo = Calculator.classify(sem.gpa, sem.scale);
      const card      = document.createElement('div');
      card.className  = 'history-card';
      card.dataset.id = sem.id;
      card.setAttribute('role', 'listitem');

      const savedDate = new Date(sem.savedAt).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      });

      const badgeStyle = classInfo
        ? `style="color: var(--badge-${classInfo.cssClass.replace('first-class','fc').replace('second-upper','scu').replace('second-lower','scl').replace('third-class','tc').replace('pass','pass').replace('fail','fail')}); border-color: currentColor;"`
        : '';

      card.innerHTML = `
        <div class="history-card-info">
          <div class="history-card-name" title="${this._escape(sem.name)}">${this._escape(sem.name)}</div>
          <div class="history-card-meta">
            ${sem.courses.length} courses · ${sem.totalUnits} units · ${sem.scale} scale · ${savedDate}
          </div>
          ${classInfo ? `<span class="history-badge" ${badgeStyle}>${classInfo.label}</span>` : ''}
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
  },

  /* ────────────────────────────────────────────────────────
     VIEW SEMESTER MODAL
  ──────────────────────────────────────────────────────── */

  openViewModal(semesterId) {
    const semesters = Storage.loadSemesters();
    const sem       = semesters.find(s => s.id === semesterId);
    if (!sem) return;

    const classInfo  = Calculator.classify(sem.gpa, sem.scale);
    const scaleLabel = GRADE_SCALES[sem.scale].label;

    this.els.viewModalTitle.textContent = sem.name;

    const rows = sem.courses.map(c => {
      const unit = parseFloat(c.unit);
      const gp   = Calculator.gradePoint(c.grade, sem.scale);
      const pts  = (unit > 0 && gp !== null) ? (unit * gp).toFixed(2) : '—';
      return `
        <tr>
          <td>${this._escape(c.title || '—')}</td>
          <td>${this._escape(c.code  || '—')}</td>
          <td>${c.unit  || '—'}</td>
          <td>${c.grade || '—'}</td>
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
  },

  closeViewModal() {
    this.els.viewModal.hidden = true;
    document.body.style.overflow = '';
  },

  /* ────────────────────────────────────────────────────────
     SAVE MODAL
  ──────────────────────────────────────────────────────── */

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

  /* ────────────────────────────────────────────────────────
     RENAME MODAL
  ──────────────────────────────────────────────────────── */

  openRenameModal(semesterId) {
    const semesters = Storage.loadSemesters();
    const sem = semesters.find(s => s.id === semesterId);
    if (!sem) return;

    this.els.renameModal.dataset.targetId = semesterId;
    this.els.renameInput.value = sem.name;
    this.els.renameError.textContent = '';
    this.els.renameModal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => this.els.renameInput.focus(), 100);
  },

  closeRenameModal() {
    this.els.renameModal.hidden = true;
    document.body.style.overflow = '';
  },

  /* ────────────────────────────────────────────────────────
     THEME
  ──────────────────────────────────────────────────────── */

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    State.theme = theme;
    Storage.saveTheme(theme);
  },

  toggleTheme() {
    const next = State.theme === 'dark' ? 'light' : 'dark';
    this.applyTheme(next);
  },

  /* ────────────────────────────────────────────────────────
     UTILITY
  ──────────────────────────────────────────────────────── */

  /** Escape HTML special chars to prevent XSS */
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
   7. VALIDATION MODULE
   Returns error messages for individual fields.
   ============================================================ */

const Validate = {
  /**
   * Validate a course title field.
   * @returns {string} error message, or empty string if valid
   */
  title(value) {
    if (!value.trim()) return 'Course title is required';
    return '';
  },

  /**
   * Validate a unit input.
   * @returns {string} error message, or empty string if valid
   */
  unit(value) {
    if (value === '' || value === null || value === undefined) return 'Unit is required';
    const n = parseFloat(value);
    if (isNaN(n))       return 'Enter a valid number';
    if (n <= 0)         return 'Unit must be greater than 0';
    if (n > 20)         return 'Unit seems too high (max 20)';
    return '';
  },

  /**
   * Validate a grade selection.
   * @returns {string} error message, or empty string if valid
   */
  grade(value) {
    if (!value) return 'Please select a grade';
    return '';
  },

  /**
   * Validate all courses before saving/exporting.
   * Returns true if ALL courses with any data filled are fully valid.
   * Rows that are completely empty are ignored (they'll be skipped in calc).
   */
  allCourses() {
    let allValid = true;
    const rows   = document.querySelectorAll('.course-row');

    rows.forEach(row => {
      const titleInput = row.querySelector('.course-title');
      const unitInput  = row.querySelector('.course-unit');
      const gradeInput = row.querySelector('.course-grade');

      const titleVal = titleInput.value;
      const unitVal  = unitInput.value;
      const gradeVal = gradeInput.value;

      // If the row is entirely empty, skip it
      if (!titleVal && !unitVal && !gradeVal) return;

      // Otherwise validate each field
      const titleErr = this.title(titleVal);
      const unitErr  = this.unit(unitVal);
      const gradeErr = this.grade(gradeVal);

      showFieldError(row.querySelector('.course-title + .field-error'), titleErr);
      showFieldError(row.querySelector('.course-unit  + .field-error'), unitErr);
      showFieldError(row.querySelector('.course-grade + .field-error'), gradeErr);

      if (titleErr || unitErr || gradeErr) allValid = false;
    });

    return allValid;
  },
};

/** Helper: show or clear an error message for a field */
function showFieldError(errorEl, message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  const input = errorEl.previousElementSibling;
  if (input) input.classList.toggle('error', !!message);
}

/** Helper: clear all error states in a row */
function clearRowErrors(row) {
  row.querySelectorAll('.field-error').forEach(el => el.textContent = '');
  row.querySelectorAll('.field-input').forEach(el => el.classList.remove('error'));
}


/* ============================================================
   8. STATE SYNC — Read DOM back into State.courses
   ============================================================ */

/**
 * Walk all course rows and rebuild State.courses from DOM values.
 * This is called on every input event (real-time sync).
 *
 * Using DOM-as-source-of-truth for rows avoids maintaining a
 * parallel array that can desync on user edits.
 */
function syncStateFromDOM() {
  State.courses = [];
  const rows = document.querySelectorAll('.course-row');

  rows.forEach(row => {
    State.courses.push({
      id:    row.dataset.id,
      title: row.querySelector('.course-title')?.value ?? '',
      code:  row.querySelector('.course-code')?.value  ?? '',
      unit:  row.querySelector('.course-unit')?.value  ?? '',
      grade: row.querySelector('.course-grade')?.value ?? '',
    });
  });
}

/**
 * Update the GP display cell within a single row after any change.
 */
function updateRowGP(row) {
  const unit  = parseFloat(row.querySelector('.course-unit')?.value);
  const grade = row.querySelector('.course-grade')?.value;
  const gp    = Calculator.gradePoint(grade, State.scale);
  const total = (unit > 0 && gp !== null) ? (unit * gp).toFixed(2) : null;
  const cell  = row.querySelector('.gp-value');
  if (cell) {
    cell.textContent = total !== null ? total : '—';
    cell.style.color = total !== null ? 'var(--accent)' : 'var(--text-faint)';
  }
}


/* ============================================================
   9. COURSE MANAGEMENT
   ============================================================ */

/**
 * Add a new blank course row to the UI and State.
 */
function addCourse() {
  const course = {
    id:    State.nextId(),
    title: '',
    code:  '',
    unit:  '',
    grade: '',
  };

  State.courses.push(course);
  const row = UI.buildCourseRow(course, State.scale);
  UI.els.courseList.appendChild(row);

  // Hide empty state
  UI.els.emptyState.classList.add('hidden');

  // Update course count
  const n = State.courses.length;
  UI.els.courseCount.textContent = `${n} course${n !== 1 ? 's' : ''}`;

  // Focus the title field of the new row
  setTimeout(() => row.querySelector('.course-title')?.focus(), 50);

  UI.updateDashboard();
}

/**
 * Remove a course row by its ID, update State, recalculate.
 * @param {string} courseId
 */
function removeCourse(courseId) {
  const row = UI.els.courseList.querySelector(`[data-id="${courseId}"]`);
  if (!row) return;

  // Animate out
  row.style.transition = 'opacity 0.2s, transform 0.2s';
  row.style.opacity    = '0';
  row.style.transform  = 'translateX(20px)';

  setTimeout(() => {
    row.remove();
    syncStateFromDOM();
    UI.updateDashboard();

    const n = State.courses.length;
    UI.els.courseCount.textContent = `${n} course${n !== 1 ? 's' : ''}`;
    UI.els.emptyState.classList.toggle('hidden', n > 0);
  }, 200);
}

/**
 * Reset all courses — clear the list and dashboard.
 */
function resetSemester() {
  if (State.courses.length === 0) {
    UI.toast('Nothing to reset.', 'info');
    return;
  }

  // Animate all rows out
  document.querySelectorAll('.course-row').forEach((row, i) => {
    setTimeout(() => {
      row.style.transition = 'opacity 0.15s, transform 0.15s';
      row.style.opacity    = '0';
      row.style.transform  = 'translateY(-6px)';
    }, i * 30);
  });

  setTimeout(() => {
    State.courses = [];
    UI.els.courseList.innerHTML = '';
    UI.els.emptyState.classList.remove('hidden');
    UI.els.courseCount.textContent = '0 courses';
    UI.updateDashboard();
    UI.toast('Semester reset.', 'info');
  }, State.courses.length * 30 + 200);
}


/* ============================================================
   10. SAVE SEMESTER FLOW
   ============================================================ */

/**
 * Confirm saving. Called when user clicks "Save" in the modal.
 */
function confirmSave() {
  const name  = UI.els.semesterNameInput.value.trim();
  const errEl = UI.els.semesterNameError;

  if (!name) {
    errEl.textContent = 'Please enter a semester name';
    UI.els.semesterNameInput.classList.add('error');
    UI.els.semesterNameInput.focus();
    return;
  }

  // Must have at least one valid course
  const result = Calculator.calculate(State.courses, State.scale);
  if (result.validCount === 0) {
    UI.closeSaveModal();
    UI.toast('Add at least one complete course before saving.', 'error');
    return;
  }

  Storage.addSemester(name, State.courses, result, State.scale);
  UI.closeSaveModal();
  UI.renderHistory();
  UI.toast(`"${name}" saved!`, 'success');
}


/* ============================================================
   11. EVENT WIRING
   Uses event delegation on containers for dynamic rows.
   ============================================================ */

function wireEvents() {
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

  /* ── Save Modal Confirm ── */
  els.modalConfirm.addEventListener('click', confirmSave);

  /* ── Save Modal Cancel ── */
  els.modalCancel.addEventListener('click', () => UI.closeSaveModal());

  /* ── Semester name input — Enter key ── */
  els.semesterNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmSave();
    if (e.key === 'Escape') UI.closeSaveModal();
  });

  /* ── Rename Modal ── */
  els.renameConfirm.addEventListener('click', () => {
    const id      = els.renameModal.dataset.targetId;
    const newName = els.renameInput.value.trim();
    const errEl   = els.renameError;

    if (!newName) {
      errEl.textContent = 'Please enter a name';
      return;
    }
    Storage.renameSemester(id, newName);
    UI.closeRenameModal();
    UI.renderHistory();
    UI.toast('Semester renamed.', 'success');
  });

  els.renameCancel.addEventListener('click', () => UI.closeRenameModal());

  els.renameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter')  els.renameConfirm.click();
    if (e.key === 'Escape') UI.closeRenameModal();
  });

  /* ── View Modal Close ── */
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

  /* ── Grading Scale Change ── */
  els.gradingScale.addEventListener('change', () => {
    State.scale = els.gradingScale.value;
    Storage.saveScale(State.scale);
    els.scaleLabel.textContent = `/ ${GRADE_SCALES[State.scale].max}`;
    syncStateFromDOM();
    UI.refreshGradeSelects();
    UI.updateDashboard();
    UI.toast(`Switched to ${State.scale} scale`, 'info');
  });

  /* ── Dark Mode Toggle ── */
  els.themeToggle.addEventListener('click', () => UI.toggleTheme());

  /* ── Export CSV ── */
  els.exportCSVBtn.addEventListener('click', () => {
    syncStateFromDOM();
    const result = Calculator.calculate(State.courses, State.scale);
    Export.toCSV(State.courses, result, State.scale);
  });

  /* ── Export PDF ── */
  els.exportPDFBtn.addEventListener('click', () => {
    syncStateFromDOM();
    const result = Calculator.calculate(State.courses, State.scale);
    Export.toPDF(State.courses, result, State.scale);
  });

  /* ── Clear All History ── */
  els.clearHistoryBtn.addEventListener('click', () => {
    const sems = Storage.loadSemesters();
    if (sems.length === 0) {
      UI.toast('History is already empty.', 'info');
      return;
    }
    if (confirm(`Delete all ${sems.length} saved semester(s)?`)) {
      Storage.saveSemesters([]);
      UI.renderHistory();
      UI.toast('History cleared.', 'success');
    }
  });

  /* ── EVENT DELEGATION: Course list input changes (real-time calc) ── */
  els.courseList.addEventListener('input', e => {
    const target = e.target;
    const row    = target.closest('.course-row');
    if (!row) return;

    // Clear the error for the field that changed
    const errEl = target.nextElementSibling;
    if (errEl?.classList.contains('field-error')) {
      errEl.textContent = '';
      target.classList.remove('error');
    }

    // Validate inline for unit field
    if (target.classList.contains('course-unit')) {
      const err = Validate.unit(target.value);
      if (err) {
        showFieldError(target.nextElementSibling, err);
      }
    }

    // Sync state → recalculate → update dashboard
    syncStateFromDOM();
    updateRowGP(row);
    UI.updateDashboard();
  });

  /* ── EVENT DELEGATION: Course list clicks (remove button) ── */
  els.courseList.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    if (btn.dataset.action === 'remove') {
      const row = btn.closest('.course-row');
      if (row) removeCourse(row.dataset.id);
    }
  });

  /* ── EVENT DELEGATION: History list clicks ── */
  els.historyList.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const id = btn.dataset.id;

    if (btn.dataset.action === 'view') {
      UI.openViewModal(id);
    } else if (btn.dataset.action === 'rename') {
      UI.openRenameModal(id);
    } else if (btn.dataset.action === 'delete') {
      const sems   = Storage.loadSemesters();
      const target = sems.find(s => s.id === id);
      if (target && confirm(`Delete "${target.name}"?`)) {
        Storage.deleteSemester(id);
        UI.renderHistory();
        UI.toast(`"${target.name}" deleted.`, 'info');
      }
    }
  });

  /* ── Keyboard: Escape closes any open modal ── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      UI.closeSaveModal();
      UI.closeViewModal();
      UI.closeRenameModal();
    }
  });
}


/* ============================================================
   12. APP INITIALISATION
   ============================================================ */

const App = {
  /**
   * Boot the application.
   * Order of operations:
   *  1. Cache all DOM elements
   *  2. Restore persisted preferences (theme, scale)
   *  3. Wire all events
   *  4. Add the first blank course row
   *  5. Render history
   */
  init() {
    /* ── Cache DOM elements ── */
    UI.els = {
      /* Header */
      gradingScale:      document.getElementById('grading-scale'),
      themeToggle:       document.getElementById('theme-toggle'),

      /* Dashboard */
      gpaDisplay:        document.getElementById('gpa-display'),
      ringFill:          document.getElementById('ring-fill'),
      scaleLabel:        document.getElementById('scale-label'),
      totalUnits:        document.getElementById('total-units'),
      totalPoints:       document.getElementById('total-points'),
      classificationBadge: document.getElementById('classification-badge'),
      classDesc:         document.getElementById('class-desc'),

      /* Calculator */
      addCourseBtn:      document.getElementById('add-course-btn'),
      courseList:        document.getElementById('course-list'),
      courseCount:       document.getElementById('course-count'),
      emptyState:        document.getElementById('empty-state'),
      resetBtn:          document.getElementById('reset-btn'),
      saveBtn:           document.getElementById('save-btn'),
      exportCSVBtn:      document.getElementById('export-csv-btn'),
      exportPDFBtn:      document.getElementById('export-pdf-btn'),

      /* Save modal */
      saveModal:         document.getElementById('save-modal'),
      semesterNameInput: document.getElementById('semester-name-input'),
      semesterNameError: document.getElementById('semester-name-error'),
      modalConfirm:      document.getElementById('modal-confirm'),
      modalCancel:       document.getElementById('modal-cancel'),

      /* View modal */
      viewModal:         document.getElementById('view-modal'),
      viewModalTitle:    document.getElementById('view-modal-title'),
      viewModalBody:     document.getElementById('view-modal-body'),
      viewModalClose:    document.getElementById('view-modal-close'),

      /* Rename modal */
      renameModal:       document.getElementById('rename-modal'),
      renameInput:       document.getElementById('rename-input'),
      renameError:       document.getElementById('rename-error'),
      renameConfirm:     document.getElementById('rename-confirm'),
      renameCancel:      document.getElementById('rename-cancel'),

      /* History */
      historyList:       document.getElementById('history-list'),
      historyEmpty:      document.getElementById('history-empty'),
      historyCount:      document.getElementById('history-count'),
      clearHistoryBtn:   document.getElementById('clear-history-btn'),

      /* Toast */
      toast:             document.getElementById('toast'),
    };

    /* ── Restore preferences ── */
    const savedTheme = Storage.loadTheme();
    const savedScale = Storage.loadScale();

    UI.applyTheme(savedTheme);
    State.scale                         = savedScale;
    UI.els.gradingScale.value           = savedScale;
    UI.els.scaleLabel.textContent       = `/ ${GRADE_SCALES[savedScale].max}`;
    UI.els.ringFill.style.strokeDasharray = RING_CIRCUMFERENCE;
    UI.els.ringFill.style.strokeDashoffset = RING_CIRCUMFERENCE;

    /* ── Wire all event listeners ── */
    wireEvents();

    /* ── Add first course row automatically ── */
    addCourse();

    /* ── Render saved semesters ── */
    UI.renderHistory();

    console.log('✅ GPA Calculator Pro initialised.');
  },
};

/* ── Boot on DOM ready ── */
document.addEventListener('DOMContentLoaded', () => App.init());
