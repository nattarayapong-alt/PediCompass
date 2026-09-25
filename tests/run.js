#!/usr/bin/env node
/* Zero-dependency test runner:  node tests/run.js  [--update-snapshot] */
const suites = ['structure', 'drug-schema', 'drug-sweep', 'dose-snapshot'];
let failed = 0, passed = 0, warned = 0;

for (const name of suites){
  const errors = [], warnings = [];
  const t = {
    check(ok, msg){ if (ok) passed++; else { errors.push(msg); failed++; } },
    warn(msg){ warnings.push(msg); warned++; }
  };
  try { require(`./${name}.test.js`)(t); }
  catch (e){ errors.push(`suite crashed: ${e.stack}`); failed++; }
  console.log(`${errors.length ? '✗' : '✓'} ${name}${errors.length ? ` — ${errors.length} problem(s)` : ''}`);
  errors.slice(0, 50).forEach(m => console.log('    ✗ ' + m));
  if (errors.length > 50) console.log(`    … and ${errors.length - 50} more`);
  warnings.forEach(m => console.log('    ! ' + m));
}
console.log(`\n${passed} checks passed, ${failed} failed, ${warned} warning(s)`);
process.exit(failed ? 1 : 0);
