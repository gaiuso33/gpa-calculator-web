# #19 — Grading scales, plus/minus and repeat rules: how to apply

Do the steps in order and run `npm test` after step 3 (the engine). Tests for the screens are manual (checklist at the bottom).

## Step 1 — Files
- Replace `tests/load-app.js` and add `tests/scales.test.js`.

## Step 2 — Paste into `js/app.js`
1. Paste the whole of **`scales-module.js`** right after the Planner module.
2. Open **`engine-edits.js`** and apply its five numbered blocks (it says where each goes).
3. In **Storage**, delete your old `buildBackup`, `parseBackup`, `mergeSemesters`, `restoreBackup` and paste **`storage-backup-patch.js`** in their place.

## Step 3 — Pass the rule to the calculator (small edits)
Find every call that calculates the CURRENT semester and add `State.repeatRule`:
```js
Calculator.calculate(State.courses, State.scale, State.repeatRule)
```
Places: `UI.updateDashboard`, `confirmSave`, the CSV and PDF export click handlers, and the Ctrl+E shortcut.
In the planner click handler: `Planner.standing(Storage.loadSemesters(), State.scale, State.repeatRule)`.

Run `npm test`. Expect 115 passing.

## Step 4 — index.html
Header, inside `.header-controls`, after the `.scale-pill` div:
```html
<button class="theme-toggle" id="scale-manage" aria-label="Create or edit grading scales" title="Create or edit grading scales">⚙</button>
```
Calculator section, inside the header's right-hand `div` (next to Import), before the Import button:
```html
<label class="scale-pill" style="padding:3px 10px">
  <span class="scale-label" style="display:inline">Retakes</span>
  <select id="repeat-rule" class="scale-select" aria-label="How to count repeated courses">
    <option value="all">Count all</option>
    <option value="latest">Latest only</option>
    <option value="best">Best only</option>
  </select>
</label>
```
Just under the course list (after the empty-state block):
```html
<p id="repeat-note" class="planner-note"></p>
```
Next to the other modals:
```html
<div class="modal-overlay" id="scale-modal" role="dialog" aria-modal="true" aria-labelledby="scale-modal-title" hidden>
  <div class="modal modal-wide">
    <h3 class="modal-title" id="scale-modal-title">⚙ Grading Scale</h3>
    <p class="modal-desc" id="scale-modal-desc"></p>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <input id="scale-name" class="modal-input" style="flex:2 1 180px" maxlength="24" placeholder="Scale name, e.g. My University" aria-label="Scale name" />
      <select id="scale-preset" class="modal-input" style="flex:1 1 140px" aria-label="Start from"></select>
    </div>
    <div id="scale-rows" class="scale-rows"></div>
    <button class="btn btn-outline btn-sm" id="scale-add-row" type="button">＋ Add grade</button>
    <span class="field-error" id="scale-error" role="alert"></span>
    <div class="modal-actions">
      <button class="btn btn-danger-ghost" id="scale-delete" hidden>Delete</button>
      <button class="btn btn-ghost" id="scale-duplicate" hidden>Duplicate</button>
      <button class="btn btn-ghost" id="scale-cancel">Cancel</button>
      <button class="btn btn-primary" id="scale-save">Save scale</button>
    </div>
  </div>
</div>
```
The service worker needs no change (no new files), so don't bump the cache version unless you edit cached files — you will, so bump `CACHE_VERSION` to `gpapro-v4`.

## Step 5 — style.css (above the stray rules at the bottom)
```css
.scale-rows { max-height: 40vh; overflow: auto; margin: 12px 0 8px; }
.scale-row { display: grid; grid-template-columns: 1fr 1fr 36px; gap: 8px; margin-bottom: 8px; align-items: center; }
.scale-row .modal-input { width: 100%; margin: 0; }
```

## Step 6 — app.js UI code
**A. In the `UI` object:**
```js
populateScaleSelect() {
  const sel = this.els.gradingScale;
  sel.innerHTML = Object.entries(GRADE_SCALES).map(([id, s]) =>
    `<option value="${this._escape(id)}">${this._escape(s.custom ? s.label : s.label + ' Scale')}</option>`).join('');
  sel.value = GRADE_SCALES[State.scale] ? State.scale : '5.0';
},
```
**B. Top-level functions (near `addCourse`):**
```js
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
      if (r.mapped)  notes.push(`${r.mapped} grade${r.mapped !== 1 ? 's' : ''} converted`);
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
    this.els = { modal: $('scale-modal'), name: $('scale-name'), preset: $('scale-preset'), rows: $('scale-rows'),
                 err: $('scale-error'), add: $('scale-add-row'), save: $('scale-save'), cancel: $('scale-cancel'),
                 del: $('scale-delete'), dup: $('scale-duplicate'), open: $('scale-manage'), desc: $('scale-modal-desc') };
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
```
**C. In `wireEvents()`:** replace the whole `els.gradingScale.addEventListener('change', …)` block with:
```js
els.gradingScale.addEventListener('change', () => applyScale(els.gradingScale.value));

const repeatSel = document.getElementById('repeat-rule');
repeatSel.value = State.repeatRule;
repeatSel.addEventListener('change', () => {
  State.repeatRule = repeatSel.value;
  Storage.saveRepeatRule(State.repeatRule);
  UI.updateDashboard();
  UI.toast({ all: 'Counting every attempt', latest: 'Retakes: latest attempt only', best: 'Retakes: best attempt only' }[State.repeatRule], 'info');
});
```
In the restore-confirm handler (backup), after `closeRestore();` add `UI.populateScaleSelect();`.

**D. In `UI.updateDashboard`, before `CGPA.updateDisplay();`:**
```js
const note = document.getElementById('repeat-note');
if (note) {
  const n = Calculator.repeatsIgnored(State.courses, State.scale, State.repeatRule);
  note.textContent = n ? `${n} repeated attempt${n !== 1 ? 's' : ''} not counted (retake rule: ${State.repeatRule === 'best' ? 'best only' : 'latest only'}).` : '';
}
```
**E. `UI.renderHistory`:** change `${sem.scale} scale` to `${this._escape(GRADE_SCALES[sem.scale]?.label ?? 'unknown')} scale`.
**F. `UI.openViewModal`:** replace `const scaleLabel = GRADE_SCALES[sem.scale].label;` with
`if (!GRADE_SCALES[sem.scale]) { this.toast('This semester uses a scale that is not installed', 'error'); return; }` placed before it, then keep the line.

**G. `App.init` — replace the "Restore preferences" block** with:
```js
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
```
and right after `wireEvents();` add `ScaleEditor.init();`.

## Manual checklist
1. Header scale dropdown now lists 5.0, 4.0, 4.0 ± and any custom scales.
2. Enter A-/B+ on "4.0 ±": GP cells and GPA update. Switch to "4.0": A- becomes A, B+ becomes B, and the toast says so.
3. ⚙ → create "10-point" (A=10, B=8, C=6, F=0) → Save. It is selected, the ring max shows /10, classification works.
4. Reload the page: the custom scale and your selection are still there.
5. Save a semester on it. ⚙ → points are locked, rename works, Delete is refused with a clear message.
6. Enter the same course code twice (F then A), set Retakes to "Latest only": GPA changes and the note under the list says one attempt was not counted.
7. Backup, clear browser data, restore: the semester is back with its custom scale.
