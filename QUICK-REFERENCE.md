# GPA Calculator Pro — Quick Reference Guide

## 📥 How to Import Courses

### CSV Format
```csv
title,code,unit,grade
Mathematics 101,MAT101,3,A
English 101,ENG201,2,B
Physics 101,PHY101,3,C
```

**Column names are flexible:**
- `title` or `course` or `course title`
- `code` or `course code`
- `unit` or `units` or `credit` or `credits`
- `grade`

### JSON Format (Array)
```json
[
  { "title": "Math 101", "code": "MAT101", "unit": 3, "grade": "A" },
  { "title": "English 201", "code": "ENG201", "unit": 2, "grade": "B" }
]
```

### JSON Format (Object with courses array)
```json
{
  "courses": [
    { "title": "Math 101", "code": "MAT101", "unit": 3, "grade": "A" },
    { "title": "English 201", "code": "ENG201", "unit": 2, "grade": "B" }
  ]
}
```

## 🎯 Input Validation Rules

### Course Title
- ✅ Required
- ✅ 2–100 characters
- ❌ Cannot be empty

### Credit Units
- ✅ Required (if adding a course)
- ✅ 0.5–50 range
- ❌ Cannot be negative
- ❌ Cannot be 0
- ❌ Cannot exceed 50

### Course Code
- ✅ Optional
- ✅ Letters, numbers, hyphens, slashes only
- ✅ Max 20 characters
- ❌ Special characters not allowed

### Grade
- ✅ Required (if adding a course)
- ✅ Must select from dropdown

## 📊 Dashboard Cards Explained

### Current GPA
- Your GPA for the current semester (active courses)
- Updates in real-time as you add/edit courses
- Ring animates when you change grades

### Cumulative GPA (CGPA)
- Your overall GPA across all saved semesters
- Shows trend: 📈 improving, 📉 declining, ➡️ stable
- "Save semesters to see CGPA" until you save 2+ semesters

### Classification
- Academic standing (First Class, Second Class Upper, etc.)
- Based on GPA thresholds for your selected scale
- Shows description of what it means

### Total Units & Grade Points
- Sum of all credit units for current semester
- Sum of all (units × grade point) for current semester

## 🔧 Troubleshooting Quick Fixes

| Problem | Solution |
|---------|----------|
| Import not working | Check file is .csv or .json, not .txt or .xlsx |
| Can't undo | Undo only works for major actions (add, remove, import) |
| Keyboard shortcut doesn't work | Close any open modal, don't type in an input field |
| CGPA shows "No Data" | Save at least 2 semesters with complete courses |
| PDF export fails | Falls back to print mode (Ctrl+P) automatically |
| Old data disappeared | Data is in localStorage; try refreshing page |

## 📝 Example Workflow

### Scenario: You have 15 courses from last semester's transcript

**Fastest approach:**
1. Copy course data into Excel/Sheets
2. Save as `.csv` file
3. Click **Import** button in GPA Calculator
4. Select your CSV file
5. ✨ All 15 courses appear instantly
6. Review and edit as needed
7. Click **Save Semester**

**Time saved:** ~10 minutes (vs manual entry)

## 🎓 Academic Classifications

### 5.0 Scale (Nigerian System)
- **First Class**: 4.50–5.00 (Outstanding)
- **Second Class Upper**: 3.50–4.49 (Excellent)
- **Second Class Lower**: 2.40–3.49 (Good)
- **Third Class**: 1.50–2.39 (Satisfactory)
- **Pass**: 1.00–1.49 (Minimum passing)
- **Fail**: 0.00–0.99 (Below passing)

### 4.0 Scale (US System)
- **First Class**: 3.60–4.00 (Outstanding)
- **Second Class Upper**: 3.00–3.59 (Excellent)
- **Second Class Lower**: 2.00–2.99 (Good)
- **Third Class**: 1.00–1.99 (Satisfactory)
- **Pass**: 0.50–0.99 (Minimum passing)
- **Fail**: 0.00–0.49 (Below passing)

## 💾 Data Storage

### What's Saved
- ✅ Your current courses
- ✅ All saved semesters
- ✅ Your theme preference (dark/light)
- ✅ Your grading scale preference (5.0/4.0)

### Where It's Saved
- **Location:** Browser's localStorage
- **Capacity:** 5–10 MB per domain
- **Persistence:** Survives browser close, page reload
- **Cleared when:** You clear browser cache/data

### Backup Your Data
```javascript
// To backup (copy this in browser console):
localStorage.getItem('gpapro_semesters')

// You'll get a JSON string - save it in a text file
// To restore: paste the output of above, then:
localStorage.setItem('gpapro_semesters', '[paste_json_here]')
```

## 🎨 Theme & Display

### Dark Mode (Default)
- Easy on the eyes in low light
- Professional dark theme
- Better battery life on OLED screens

### Light Mode
- Better in bright environments
- High contrast for accessibility
- Better for printing

**Toggle:** Click moon/sun icon in header

## 📱 Mobile Usage

### Recommended
- ✅ Portrait mode (vertical)
- ✅ Tablets (landscape mode)
- ✅ Recent iPhones and Android phones
- ✅ Screen sizes 320px and above

### Tips
- Swipe to scroll through semesters
- Tap buttons instead of Ctrl+key (keyboard shortcuts don't work on mobile)
- Import works on mobile (file picker opens)

## 🌐 Online/Offline

### Works Online
- ✅ PDF export (via CDN library)
- ✅ Everything else

### Works Offline
- ✅ Add/edit/delete courses
- ✅ Calculate GPA
- ✅ Export CSV
- ✅ View saved semesters
- ✅ Theme/scale preferences
- ✅ All keyboard shortcuts

### First Load
- Requires internet to load fonts and PDF library from CDN
- After first load, everything cached and works offline

## 🔐 Privacy & Security

- ✅ All data stays in your browser
- ✅ No server uploads
- ✅ No account login needed
- ✅ No tracking or analytics
- ✅ No cookies (just localStorage)

---

## 📚 File Guide

After installation, your project contains:

```
gpa-calculator/
├── index.html           ← ENHANCED (new import button, CGPA card)
├── css/
│   └── style.css        ← No changes needed
└── js/
    └── app.js           ← ENHANCED (all improvements integrated)
```

### What's in the Enhanced Files

**index.html additions:**
- CGPA dashboard card
- Import button
- SVG animation CSS
- Keyboard shortcuts help

**app.js additions:**
- Import module (CSV/JSON parsing)
- UndoManager module (undo/redo)
- CGPA module (cumulative calculation)
- Global error handlers
- Keyboard shortcut system
- Enhanced validation
- Error handling on all operations

---

## 🚀 Pro Tips

1. **Use Import for large course lists** - Way faster than manual entry
2. **Use Ctrl+Z liberally** - Undo works for add/remove/import
3. **Save semesters regularly** - Build your history as you progress
4. **Export CSV for records** - Good backup of your data
5. **Share CGPA with advisor** - Show academic trend over time
6. **Use dark mode at night** - Less eye strain
7. **Keyboard shortcuts are fastest** - Ctrl+N, Ctrl+S, Ctrl+Z

---

## ❓ FAQ

**Q: Can I use this on mobile?**
A: Yes! Works great on phones and tablets. Keyboard shortcuts work via Cmd key on iOS.

**Q: Is my data backed up?**
A: Data is saved in your browser's localStorage. Export CSV to create manual backups.

**Q: Can I export my entire history?**
A: Currently exports active semester only. Consider copying localStorage JSON (see "Backup Your Data" section).

**Q: Does this work offline?**
A: Yes, except PDF export needs initial CDN load. After first load, fully offline.

**Q: Can I import from my transcript PDF?**
A: No direct PDF support, but you can copy data into Excel then export as CSV.

**Q: What if I switch browsers?**
A: Data doesn't transfer. Export CSV before switching, then import in new browser.

**Q: Can I delete a specific course?**
A: Yes, click the ✕ button on any course row (Undo with Ctrl+Z if you change your mind).

**Q: What's the maximum courses I can add?**
A: Unlimited technically, but practical UI limit ~50 courses (becomes unwieldy).

---

## 🎯 Common Use Cases

### Use Case 1: Track First Semester
1. Add 6 courses manually or import from file
2. Update grades as you get them
3. Click **Save Semester** → Name it "100L First Semester"
4. Done! Your GPA is preserved

### Use Case 2: Plan Next Semester
1. Click **Reset** to clear current courses
2. Add next semester's courses (without grades yet)
3. Use this to preview your potential GPA
4. Don't save (or save as "Plan" to keep current GPA)

### Use Case 3: Track Progress Across Years
1. Save each semester after you get final grades
2. Watch CGPA climb (or fall) as you add semesters
3. See trend: are you improving? 📈
4. Export CGPA to share with advisor

### Use Case 4: Bulk Import from Transcript
1. Open transcript (PDF or email)
2. Copy course data into Excel
3. Save as CSV
4. Import into GPA Calculator
5. Add missing grades
6. Save semester

---

## 🎓 Study Tips Using GPA Calculator

- **Track by semester** - Saves you from calculating manually
- **Undo experiments** - Test "what if I get a C?" then undo
- **Share progress** - Show advisor your CGPA trend
- **Set goals** - Plan what grades you need to reach target GPA
- **Celebrate wins** - Watch CGPA improve as you progress

---
