'use strict';
/* Guards the repo's documentation (Jira #13 and #14). */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const exists = f => fs.existsSync(path.join(root, f));

describe('LICENSE', () => {
  it('exists and is the MIT license', () => {
    assert.ok(exists('LICENSE'), 'LICENSE file is missing');
    const text = read('LICENSE');
    assert.match(text, /^MIT License/);
    assert.match(text, /Permission is hereby granted, free of charge/);
  });

  it('names a real copyright holder and year (replace the placeholder!)', () => {
    const line = read('LICENSE').split('\n').find(l => l.startsWith('Copyright'));
    assert.ok(line, 'no Copyright line');
    assert.match(line, /^Copyright \(c\) \d{4} \S+/, 'copyright line is malformed');
    assert.doesNotMatch(line, /[<>]|YOUR FULL NAME/i, 'LICENSE still contains the name placeholder');
  });
});

describe('README', () => {
  const readme = read('README.md');

  it('links only to files that exist', () => {
    const links = [...readme.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1].split('#')[0])
      .filter(l => l && !/^(https?:|mailto:)/.test(l));
    assert.ok(links.length > 0);
    for (const l of links) assert.ok(exists(l), `README links to missing file: ${l}`);
  });

  it('does not mention the old missing docs', () => {
    for (const name of ['IMPLEMENTATION-COMPLETE', 'IMPLEMENTATION-GUIDE', 'GPA-CALCULATOR-REVIEW', '00-START-HERE']) {
      assert.ok(!readme.includes(name), `README still references ${name}`);
    }
  });

  it('documents the npm scripts that package.json really defines', () => {
    const scripts = JSON.parse(read('package.json')).scripts;
    for (const s of [...readme.matchAll(/npm run (\w+)/g)].map(m => m[1])) {
      assert.ok(scripts[s], `README mentions "npm run ${s}" but package.json has no such script`);
    }
  });

  it('every folder or file in the structure tree exists', () => {
    const tree = readme.match(/```\ngpa-calculator-web\/\n([\s\S]*?)```/)[1];
    for (const line of tree.split('\n')) {
      const m = line.match(/[├└]── ([\w./-]+)/);
      if (m && line.indexOf('──') < 4) {                      // top-level entries only
        assert.ok(exists(m[1].replace(/\/$/, '')), `structure lists missing entry: ${m[1]}`);
      }
    }
  });
});
