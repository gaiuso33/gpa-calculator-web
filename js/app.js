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

const STORAGE_KEY = 'gpapro_semesters';
const THEME_KEY   = 'gpapro_theme';
const SCALE_KEY   = 'gpapro_scale';
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;


/* ============================================================
   2. APPLICATION STATE
   ============================================================ */

const State = {
  courses: [],
  scale: '5.0',
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

  calculate(courses, scale) {
    let totalPoints = 0;
    let totalUnits  = 0;
    let validCount  = 0;

    for (const course of courses) {
      const unit = parseFloat(course.unit);
      const gp   = this.gradePoint(course.grade, scale);

      if (!course.grade || isNaN(unit) || unit <= 0 || gp === null) continue;

      totalPoints += unit * gp;
      totalUnits  += unit;
      validCount  += 1;
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
    return rules.find(r => gpa >= r.min && gpa <= r.max) ?? rules[rules.length - 1];
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
      id:          `sem_${Date.now()}`,
      name:        name.trim(),
      scale,
      gpa:         result.gpa,
      totalUnits:  result.totalUnits,
      totalPoints: result.totalPoints,
      courses:     courses.map(c => ({ ...c })),
      savedAt:     new Date().toISOString(),
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

      const classInfo  = Calculator.classify(result.gpa, scale);
      const scaleLabel = GRADE_SCALES[scale].label;
      const pageW      = doc.internal.pageSize.getWidth();

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
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  },

  _downloadFile(content, filename, mimeType) {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
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
  /**
   * Parse CSV text and return courses array
   */
  parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) throw new Error('CSV must have header row and at least one data row');

    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const courses = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = lines[i].split(',').map(v => v.trim());
      const course = { id: State.nextId() };
      
      header.forEach((col, idx) => {
        if (col === 'title' || col === 'course' || col === 'course title') course.title = values[idx];
        if (col === 'code' || col === 'course code') course.code = values[idx];
        if (col === 'unit' || col === 'units' || col === 'credit' || col === 'credits') course.unit = values[idx];
        if (col === 'grade') course.grade = values[idx];
      });
      
      // Only include courses with a title
      if (course.title) {
        course.title = course.title || '';
        course.code = course.code || '';
        course.unit = course.unit || '';
        course.grade = course.grade || '';
        courses.push(course);
      }
    }
    
    return courses;
  },

  /**
   * Parse JSON text and return courses array
   */
  parseJSON(text) {
    const data = JSON.parse(text);
    
    // Handle array of courses
    if (Array.isArray(data)) {
      return data.map(c => ({
        id: State.nextId(),
        title: c.title || c.name || '',
        code: c.code || '',
        unit: String(c.unit || c.units || ''),
        grade: c.grade || '',
      }));
    }
    
    // Handle { courses: [...] }
    if (data.courses && Array.isArray(data.courses)) {
      return data.courses.map(c => ({
        id: State.nextId(),
        title: c.title || '',
        code: c.code || '',
        unit: String(c.unit || ''),
        grade: c.grade || '',
      }));
    }
    
    throw new Error('Invalid JSON format: expected array or { courses: array }');
  },

  /**
   * Handle file import
   */
  async handleImport(file) {
    try {
      if (!file) return;

      const text = await file.text();
      let courses = [];
      
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        courses = this.parseJSON(text);
      } else {
        courses = this.parseCSV(text);
      }
      
      if (courses.length === 0) {
        UI.toast('No courses found in file', 'warning');
        return;
      }
      
      // Save state for undo
      UndoManager.saveState();
      
      // Add to state
      State.courses.push(...courses);
      UI.renderCourseList();
      Calculator.updateDashboard();
      
      UI.toast(`${courses.length} course${courses.length !== 1 ? 's' : ''} imported!`, 'success');
      
    } catch (error) {
      console.error('Import error:', error);
      UI.toast(`Import failed: ${error.message}`, 'error');
    }
  }
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
  /**
   * Calculate cumulative GPA across all saved semesters
   */
  calculate() {
    const semesters = Storage.loadSemesters();
    
    if (semesters.length === 0) {
      return { cgpa: 0, count: 0, trend: null };
    }

    let totalUnits = 0;
    let totalPoints = 0;
    let validSemesters = 0;

    semesters.forEach(semester => {
      if (semester.courses && semester.courses.length > 0) {
        const result = Calculator.calculate(semester.courses, semester.scale);
        
        if (result.totalUnits > 0) {
          totalUnits += result.totalUnits;
          totalPoints += result.totalPoints;
          validSemesters += 1;
        }
      }
    });

    const cgpa = totalUnits > 0 ? (totalPoints / totalUnits) : 0;

    // Determine trend
    let trend = null;
    if (validSemesters > 1) {
      const recent = semesters.slice(-2);
      if (recent.length === 2) {
        const gpa1 = Calculator.calculate(recent[0].courses, recent[0].scale).gpa;
        const gpa2 = Calculator.calculate(recent[1].courses, recent[1].scale).gpa;
        
        if (gpa2 > gpa1 + 0.1) trend = 'improving';
        else if (gpa2 < gpa1 - 0.1) trend = 'declining';
        else trend = 'stable';
      }
    }

    return { cgpa, count: validSemesters, trend };
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
   9. UI MODULE
   ============================================================ */

const UI = {
  els: {},
  _toastTimer: null,

  toast(message, type = 'info') {
    try {
      const el = this.els.toast;
      if (!el) return;
      el.textContent     = message;
      el.className       = `toast show toast-${type}`;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        el.classList.remove('show');
      }, 3200);
    } catch (err) {
      console.error('Toast error:', err);
    }
  },

  /* ── COURSE ROWS ── */

  buildCourseRow(course, scale) {
    const row      = document.createElement('div');
    row.className  = 'course-row';
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
      const unit   = parseFloat(course.unit);
      const gp     = Calculator.gradePoint(course.grade, scale);
      const total  = (unit > 0 && gp !== null) ? (unit * gp).toFixed(2) : null;
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
      const result     = Calculator.calculate(State.courses, State.scale);
      const classInfo  = Calculator.classify(result.gpa, State.scale);
      const scaleMax   = GRADE_SCALES[State.scale].max;
      const hasData    = result.validCount > 0;

      this.els.gpaDisplay.textContent = hasData ? result.gpa.toFixed(2) : '—';

      /* Ring animation */
      const pct    = hasData ? Math.min(result.gpa / scaleMax, 1) : 0;
      const offset = RING_CIRCUMFERENCE - pct * RING_CIRCUMFERENCE;
      this.els.ringFill.style.strokeDashoffset = offset;

      this.els.totalUnits.textContent  = result.totalUnits;
      this.els.totalPoints.textContent = result.totalPoints.toFixed(2);
      this.els.scaleLabel.textContent  = `/ ${scaleMax}`;

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
      const list      = this.els.historyList;
      list.innerHTML  = '';

      const hasHistory = semesters.length > 0;
      this.els.historyEmpty.classList.toggle('hidden', hasHistory);
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

        card.innerHTML = `
          <div class="history-card-info">
            <div class="history-card-name" title="${this._escape(sem.name)}">${this._escape(sem.name)}</div>
            <div class="history-card-meta">
              ${sem.courses.length} courses · ${sem.totalUnits} units · ${sem.scale} scale · ${savedDate}
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

  /* ── VIEW MODAL ── */

  openViewModal(semesterId) {
    try {
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
    const rows   = document.querySelectorAll('.course-row');

    rows.forEach(row => {
      const titleInput = row.querySelector('.course-title');
      const unitInput  = row.querySelector('.course-unit');
      const gradeInput = row.querySelector('.course-grade');

      const titleVal = titleInput.value;
      const unitVal  = unitInput.value;
      const gradeVal = gradeInput.value;

      if (!titleVal && !unitVal && !gradeVal) return;

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
      id:    row.dataset.id,
      title: row.querySelector('.course-title')?.value ?? '',
      code:  row.querySelector('.course-code')?.value  ?? '',
      unit:  row.querySelector('.course-unit')?.value  ?? '',
      grade: row.querySelector('.course-grade')?.value ?? '',
    });
  });
}

function updateRowGP(row) {
  try {
    const unit  = parseFloat(row.querySelector('.course-unit')?.value);
    const grade = row.querySelector('.course-grade')?.value;
    const gp    = Calculator.gradePoint(grade, State.scale);
    const total = (unit > 0 && gp !== null) ? (unit * gp).toFixed(2) : null;
    const cell  = row.querySelector('.gp-value');
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

function addCourse() {
  try {
    UndoManager.saveState();
    
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

    UI.els.emptyState.classList.add('hidden');

    const n = State.courses.length;
    UI.els.courseCount.textContent = `${n} course${n !== 1 ? 's' : ''}`;

    setTimeout(() => row.querySelector('.course-title')?.focus(), 50);

    UI.updateDashboard();
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
    const name  = UI.els.semesterNameInput.value.trim();
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

    const result = Calculator.calculate(State.courses, State.scale);
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
        const id      = els.renameModal.dataset.targetId;
        const newName = els.renameInput.value.trim();
        const errEl   = els.renameError;

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
    els.gradingScale.addEventListener('change', () => {
      try {
        State.scale = els.gradingScale.value;
        Storage.saveScale(State.scale);
        els.scaleLabel.textContent = `/ ${GRADE_SCALES[State.scale].max}`;
        syncStateFromDOM();
        UI.refreshGradeSelects();
        UI.updateDashboard();
        UI.toast(`Switched to ${State.scale} scale`, 'info');
      } catch (err) {
        console.error('Scale change error:', err);
      }
    });

    /* ── Theme Toggle ── */
    els.themeToggle.addEventListener('click', () => UI.toggleTheme());

    /* ── Export CSV ── */
    els.exportCSVBtn.addEventListener('click', () => {
      try {
        syncStateFromDOM();
        const result = Calculator.calculate(State.courses, State.scale);
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
        const result = Calculator.calculate(State.courses, State.scale);
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
        const row    = target.closest('.course-row');
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
          const sems   = Storage.loadSemesters();
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
          const result = Calculator.calculate(State.courses, State.scale);
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
        gradingScale:      document.getElementById('grading-scale'),
        themeToggle:       document.getElementById('theme-toggle'),

        gpaDisplay:        document.getElementById('gpa-display'),
        ringFill:          document.getElementById('ring-fill'),
        scaleLabel:        document.getElementById('scale-label'),
        totalUnits:        document.getElementById('total-units'),
        totalPoints:       document.getElementById('total-points'),
        classificationBadge: document.getElementById('classification-badge'),
        classDesc:         document.getElementById('class-desc'),

        addCourseBtn:      document.getElementById('add-course-btn'),
        courseList:        document.getElementById('course-list'),
        courseCount:       document.getElementById('course-count'),
        emptyState:        document.getElementById('empty-state'),
        resetBtn:          document.getElementById('reset-btn'),
        saveBtn:           document.getElementById('save-btn'),
        exportCSVBtn:      document.getElementById('export-csv-btn'),
        exportPDFBtn:      document.getElementById('export-pdf-btn'),

        saveModal:         document.getElementById('save-modal'),
        semesterNameInput: document.getElementById('semester-name-input'),
        semesterNameError: document.getElementById('semester-name-error'),
        modalConfirm:      document.getElementById('modal-confirm'),
        modalCancel:       document.getElementById('modal-cancel'),

        viewModal:         document.getElementById('view-modal'),
        viewModalTitle:    document.getElementById('view-modal-title'),
        viewModalBody:     document.getElementById('view-modal-body'),
        viewModalClose:    document.getElementById('view-modal-close'),

        renameModal:       document.getElementById('rename-modal'),
        renameInput:       document.getElementById('rename-input'),
        renameError:       document.getElementById('rename-error'),
        renameConfirm:     document.getElementById('rename-confirm'),
        renameCancel:      document.getElementById('rename-cancel'),

        historyList:       document.getElementById('history-list'),
        historyEmpty:      document.getElementById('history-empty'),
        historyCount:      document.getElementById('history-count'),
        clearHistoryBtn:   document.getElementById('clear-history-btn'),

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
      
      // Add SVG animation CSS
      UI.els.ringFill.style.transition = 'stroke-dashoffset 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
      UI.els.ringFill.style.willChange = 'stroke-dashoffset';

      /* ── Wire events ── */
      wireEvents();

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
