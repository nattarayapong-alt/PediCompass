/* Snapshot of every computed dose. Any change in a number shows up as a diff —
   review it, then accept intended changes with:  node tests/run.js --update-snapshot */
const fs = require('fs');
const path = require('path');
const { loadApp } = require('./load-app');

const SNAP = path.join(__dirname, 'dose-snapshot.txt');
const WEIGHTS = [3, 10, 25, 70];
const strip = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function build(){
  const app = loadApp();
  app.setLang('en');
  const DB = app.get('DRUG_DB'), FORMS = app.get('DRUG_FORMULATIONS'), TABS = app.get('DRUG_TABLETS');
  const calc = app.get('calcRegimenDose'), calcBsa = app.get('calcBsaDose'), fmt = app.get('ddFormatResult');
  const ml = app.get('attachMlToResult'), tabs = app.get('attachTabsToResult');
  const lines = [];

  for (const d of DB){
    d.regimens.forEach((r, idx) => {
      const route = r.route || d.route;
      const forms = [];
      if (/\bPO\b/.test(route)){
        const tag = f => !r.formTag || f.tag === r.formTag;
        (FORMS[d.id] || []).filter(tag).forEach(f => forms.push(['ml', f]));
        (TABS[d.id] || []).filter(tag).forEach(f => forms.push(['tab', f]));
      }
      for (const p of (r.multiPhase && r.phases) ? r.phases : [r]){
        const key = `${d.id} #${idx} ${r.label.en}${p !== r ? ' / ' + p.phaseLabel.en : ''}`;
        for (const w of WEIGHTS){
          const res = p.bsaMgPerM2PerDose ? calcBsa(p, w, 100) : calc(p, w);
          if (res.kind === 'unknown') continue;
          lines.push(`${key} @${w}kg: ${strip(fmt(res, p, route))}`);
          for (const f of forms){
            const r2 = f[0] === 'ml' ? ml(res, f[1]) : tabs(res, f[1], d.category === 'antituberculosis' ? { reg: p, weightKg: w } : undefined);
            const extra = r2.tabsFit
              ? `${r2.tabsFit.lo}-${r2.tabsFit.hi} ${r2.tabsFit.capsule ? 'cap' : 'tab'}${r2.tabsFit.outOfRange ? ' OUT-OF-RANGE' : ''}`
              : f[0] === 'ml'
              ? (r2.mlValue !== undefined ? r2.mlValue : `${r2.mlLo}-${r2.mlHi}`) + ' mL'
              : (r2.tabsValue !== undefined ? r2.tabsValue : `${r2.tabsLo}-${r2.tabsHi}`) + ' tab';
            lines.push(`${key} @${w}kg [${f[1].form.en}]: ${extra}`);
          }
        }
      }
    });
  }

  // Weight-based helpers in Anaphylaxis (an*) and Acute asthma (as*) modules
  const helpers = Object.getOwnPropertyNames(app.ctx)
    .filter(n => /^(an|as)[A-Z]\w*(Dose|Text)$/.test(n) && typeof app.ctx[n] === 'function' && app.ctx[n].length === 1)
    .sort();
  for (const n of helpers){
    for (const w of [3, 10, 25, 40, 70, 120]){
      try { const o = app.ctx[n]({ wt: w }); if (o && o.en) lines.push(`${n} @${w}kg: ${o.en}`); }
      catch (e){ /* helper needs more than weight — not snapshotted */ }
    }
  }
  return lines.join('\n') + '\n';
}

module.exports = function(t){
  const now = build();
  if (process.argv.includes('--update-snapshot') || !fs.existsSync(SNAP)){
    fs.writeFileSync(SNAP, now);
    t.warn(`snapshot written (${now.split('\n').length - 1} lines) — commit tests/dose-snapshot.txt`);
    return;
  }
  const old = fs.readFileSync(SNAP, 'utf8').split('\n');
  const cur = now.split('\n');
  const oldSet = new Set(old), curSet = new Set(cur);
  const removed = old.filter(l => l && !curSet.has(l));
  const added = cur.filter(l => l && !oldSet.has(l));
  removed.forEach(l => t.check(false, `changed/removed: ${l}`));
  added.forEach(l => t.check(false, `new/changed:     ${l}`));
  if (!removed.length && !added.length) t.check(true, 'doses unchanged');
};
