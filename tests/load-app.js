'use strict';
/* Loads js/app.js into an isolated VM with just enough browser stubs, and returns its
   top-level modules. app.js needs no changes: we append one line that publishes them. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadApp(opts = {}) {
  const file = process.env.GPA_APP_PATH || path.join(__dirname, '..', 'js', 'app.js');
  const src = fs.readFileSync(file, 'utf8');

  const store = opts.store || new Map();
  const noop = () => {};
  const sandbox = {
    console,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      clear: () => store.clear(),
    },
    window:   { addEventListener: noop },
    document: { addEventListener: noop },
  };
  vm.createContext(sandbox);

  const publish = `
;globalThis.__gpa = {
  GRADE_SCALES, CLASSIFICATIONS, State, Calculator, Storage, Import, CGPA,
  Planner: typeof Planner !== 'undefined' ? Planner : undefined,
  Scales:  typeof Scales  !== 'undefined' ? Scales  : undefined
};`;
  vm.runInContext(src + publish, sandbox, { filename: file });
  return { ...sandbox.__gpa, localStorage: sandbox.localStorage, store };
}

module.exports = { loadApp };
