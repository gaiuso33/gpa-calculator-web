# GPA Calculator Pro

Calculate your GPA, track it across semesters, and plan the grades you need to reach a target. Runs entirely in the browser, works offline, and can be installed like an app. No account, no server, no tracking.

## Features

**Calculate**
- Live GPA and degree classification as you type
- Built-in **5.0**, **4.0** and **4.0 ±** (plus/minus) scales, plus your own **custom scales** with any grade labels and point values
- Credit-unit weighting, fractional units, and per-course grade points
- **Retake rules:** count every attempt, the latest only, or the best only (courses are matched by course code)

**Track**
- Save semesters, then view, rename or delete them
- Cumulative GPA (CGPA) with an improving / stable / declining trend
- Undo for course edits

**Plan**
- **Target planner:** pick a class of degree or a GPA and see the average you need across your planned courses, with example grade combinations. It tells you plainly when a target cannot be reached.

**Move your data**
- Import courses from **CSV** or **JSON**
- Export a semester to **CSV** or **PDF**
- **Backup and restore** your whole history as one JSON file (merge or replace)

**App experience**
- Light and dark themes
- Installable (PWA) and fully offline once loaded
- Keyboard shortcuts

## Quick start

You need [Node.js](https://nodejs.org/) 20 or newer.

```bash
git clone https://github.com/gaiuso33/gpa-calculator-web
cd gpa-calculator-web

npm run dev        # serve the app at http://localhost:5173
npm test           # run the automated tests
npm run build      # copy the files that ship into dist/
npm run preview    # serve dist/ at http://localhost:4173
```

There are no runtime dependencies and no build step beyond copying files. `npm run dev` and `npm run preview` download a small static file server (`http-server`) through `npx` the first time, so they need an internet connection once.

You can also open the folder with any static server, for example the VS Code **Live Server** extension. Opening `index.html` straight from disk (`file://`) works for the calculator, but service workers (offline mode and install) only run on `http://localhost` or `https://`.

## Using the app

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + N` | Add a course |
| `Ctrl/Cmd + S` | Save the semester |
| `Ctrl/Cmd + E` | Export CSV |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + R` | Reset the semester |
| `Esc` | Close any dialog |

Shortcuts are ignored while you are typing in a field. Some browsers reserve a few of these combinations (for example `Ctrl+N`), so every action is also available as a button.

### Grading scales and classification

| Scale | Grades |
|---|---|
| 5.0 | A 5, B 4, C 3, D 2, E 1, F 0 |
| 4.0 | A 4, B 3, C 2, D 1, F 0 |
| 4.0 ± | A 4.0, A− 3.7, B+ 3.3, B 3.0, B− 2.7, C+ 2.3, C 2.0, C− 1.7, D+ 1.3, D 1.0, F 0 |

Classification bands (GPA is rounded to 2 decimal places first):

| Class | 5.0 scale | 4.0 and 4.0 ± |
|---|---|---|
| First Class | 4.50 – 5.00 | 3.60 – 4.00 |
| Second Class Upper | 3.50 – 4.49 | 3.00 – 3.59 |
| Second Class Lower | 2.40 – 3.49 | 2.00 – 2.99 |
| Third Class | 1.50 – 2.39 | 1.00 – 1.99 |
| Pass | 1.00 – 1.49 | 0.50 – 0.99 |
| Fail | 0.00 – 0.99 | 0.00 – 0.49 |

**Custom scales** (the ⚙ button next to the scale selector): give each grade a label (up to 4 characters, such as `A`, `B+`, `C-`) and its points. Class bands are derived from the scale's maximum using the same proportions as the 5.0 scale. Once a saved semester uses a custom scale, its grades and points are locked so old results never change meaning; you can still rename it, or duplicate it to experiment.

### Importing courses

Choose **Import** and pick a `.csv` or `.json` file. Grades must exist on the scale currently selected; rows with a problem are skipped and reported by row number.

CSV needs a header row. Accepted column names (any order, case-insensitive):

| Data | Accepted headers |
|---|---|
| Title | `title`, `course`, `course title` |
| Code | `code`, `course code` |
| Units | `unit`, `units`, `credit`, `credits` |
| Grade | `grade` |

```csv
Course Title,Code,Units,Grade
Calculus I,MTH101,3,A
"Intro to Physics, Part 1",PHY101,2,B
```

A blank line ends the course table, so CSV files exported by the app (which add a summary below the courses) import cleanly.

JSON can be an array of courses, or `{ "courses": [...] }`:

```json
[{ "title": "Calculus I", "code": "MTH101", "unit": 3, "grade": "A" }]
```

### Backup and restore

**Backup** downloads all saved semesters (and any custom scales they use) as `gpapro-backup-YYYY-MM-DD.json`. **Restore** reads that file and lets you **merge** (keep what you have, add what is missing) or **replace** everything. Restored data is validated and totals are recalculated rather than trusted from the file.

## Your data and privacy

- Everything is stored in your browser's `localStorage` on your device. Nothing is sent anywhere.
- There are no accounts, analytics or third-party requests. The PDF library and fonts are bundled with the app.
- Data does not sync between devices or browsers. Clearing site data erases it, so use **Backup** regularly.

## Project structure

```
gpa-calculator-web/
├── index.html              App markup
├── manifest.webmanifest    PWA manifest (name, icons, colours)
├── sw.js                   Service worker: precaches the app for offline use
├── css/
│   ├── style.css           Styles and light/dark themes
│   └── fonts.css           Self-hosted @font-face rules
├── js/
│   ├── app.js              All application logic (modules described below)
│   └── pwa.js              Service worker registration and install button
├── assets/
│   ├── vendor/             jsPDF and jsPDF-AutoTable (with licences)
│   └── fonts/              Sora and Plus Jakarta Sans, latin subset (with licences)
├── icons/                  App icons (including a maskable icon)
├── scripts/build.js        Copies shippable files into dist/
├── tests/                  Automated tests (Node's built-in test runner)
└── LICENSE
```

### How `js/app.js` is organised

| Module | Responsibility |
|---|---|
| `GRADE_SCALES`, `CLASSIFICATIONS` | Scale definitions and class bands |
| `State` | In-memory app state |
| `Calculator` | GPA maths, classification, retake rules |
| `Storage` | `localStorage` access, semesters, backup and restore |
| `Export` / `Import` | CSV and PDF export; CSV and JSON import |
| `UndoManager` | Undo for course edits |
| `CGPA` | Cumulative GPA and trend |
| `Planner` | Target planner |
| `Scales` | Plus/minus and custom scale management |
| `UI` and the event wiring | Rendering, modals, shortcuts |

## Testing

```bash
npm test
```

Tests use Node's built-in runner, with no dependencies. `tests/load-app.js` runs `js/app.js` in an isolated sandbox with a stubbed browser, so the real file is tested without changes. They cover the grade maths, classification boundaries, imports, backup and restore, the planner, custom scales, retake rules, and the offline/PWA setup (including a check that every file `index.html` loads is in the service worker's cache list). The same tests run on every push and pull request through GitHub Actions (`.github/workflows/test.yml`).

## Deploying

The app is a static site. Upload the contents of `dist/` (after `npm run build`) to any static host, such as GitHub Pages, Netlify or Cloudflare Pages. Serve it over **HTTPS** so the install prompt and offline mode work. All paths are relative, so it also works from a sub-path.

When you change any shipped file, bump `CACHE_VERSION` in `sw.js` so returning visitors get the update.

## Roadmap

Planned work is tracked in `gpapro-jira-backlog.csv`: shareable result cards, trend charts and what-if simulation, then accounts and cloud sync.

## Credits

- [jsPDF](https://github.com/parallax/jsPDF) and [jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable) (MIT)
- [Sora](https://github.com/sora-xor/sora-font) and [Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans) (SIL Open Font License 1.1)

Licence texts are kept next to the files in `assets/`.

## License

[MIT](LICENSE)
