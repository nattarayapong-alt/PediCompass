/* DRUG_DB schema validator.
   Catches data that the calculator would silently ignore or mis-handle:
   unknown keys, caps in a unit the calculator doesn't read, bad ranges,
   broken regimenIdx references, orphan formulations. */
const { loadApp } = require('./load-app');

// Dose fields in the same precedence order calcRegimenDose() uses.
const DOSE_FIELDS = [
  ['fixedDoseMg','fixed'], ['fixedDoseRangeMg','fixed'], ['fixedDoseRangeGm','fixed'],
  ['fixedDoseUnits','fixed'], ['fixedDoseRangeUnits','fixed'], ['fixedDoseRangeMl','fixed'],
  ['fixedDailyRangeMg','fixedDaily'],
  ['mcgPerKgPerMin','rateMcgMin'], ['mcgPerKgPerHr','rateMcgHr'], ['mgPerKgPerHr','rateMgHr'],
  ['milliunitsPerKgPerMin','rateMu'], ['unitsPerKgPerHr','rateUnitsHr'],
  ['mgPerKgPerDay','mg'], ['mgPerKgPerDose','mg'], ['mcgPerKgPerDose','mcg'],
  ['gPerKgPerDose','g'], ['gPerKgPerDay','g'], ['mLPerKgPerDose','mL'],
  ['mEqPerKgPerDay','mEq'], ['mEqPerKgPerDose','mEq'],
  ['unitsPerKgPerDay','units'], ['unitsPerKgPerDose','units'],
  ['bsaMgPerM2PerDose','bsa']
];
// Cap keys each dose type ENFORCES in calcRegimenDose() (rate ceilings count as enforced:
// they are titration limits shown next to the starting range).
const ENFORCED_CAPS = {
  fixed: [], fixedDaily: ['maxDailyMg','maxDoseMg'],
  rateMcgMin: ['maxMcgPerKgPerMin'], rateMcgHr: ['maxMcgPerKgPerHr'], rateMgHr: [],
  rateMu: ['maxMilliunitsPerKgPerMin'], rateUnitsHr: [],
  mg: ['maxDoseMg','maxDailyMg'], mcg: ['maxDoseMcg','maxDoseMg'],
  g: ['maxDoseGm','maxDailyGm'], mL: ['maxDoseMl'], mEq: ['maxDoseMEq'],
  units: ['maxDoseUnits','maxDailyUnits'], bsa: ['maxDoseMg']
};
// Cap keys ddSpecText() prints in the reference card (shown, whether or not enforced).
const DISPLAYED_CAPS = ['maxDoseMg','maxDailyMg','maxDoseGm','maxDoseMEq','maxDoseMl','maxDoseUnits',
  'maxDailyUnits','maxDoseMcg','maxMcgPerKgPerMin','maxMcgPerKgPerHr','maxMilliunitsPerKgPerMin'];
const OTHER_REG_KEYS = new Set(['label','notes','freq','route','formTag','durationDays','weightMin','weightMax',
  'weightMinExclusive','weightMaxExclusive','multiPhase','phases','phaseLabel','infusionMix']);
const DOSE_KEYS = new Set(DOSE_FIELDS.map(d => d[0]));
const CAP_KEYS = new Set([].concat(...Object.values(ENFORCED_CAPS), DISPLAYED_CAPS));
const DRUG_KEYS = new Set(['id','name','aliases','category','route','regimens','formulations','notes',
  'neonatalGroups','warnings','renalGroups','unit','vialConc']);

const present = v => v !== undefined && v !== null;
const isBi = o => o && typeof o.th === 'string' && typeof o.en === 'string' && o.th.trim() && o.en.trim();

module.exports = function(t){
  const app = loadApp();
  const DB = app.get('DRUG_DB');
  const FORMS = app.get('DRUG_FORMULATIONS');
  const TABS = app.get('DRUG_TABLETS');
  const ids = new Set();

  for (const d of DB){
    const where = `drug "${d.id}"`;
    t.check(!ids.has(d.id), `${where}: duplicate id`); ids.add(d.id);
    for (const k of Object.keys(d)) t.check(DRUG_KEYS.has(k), `${where}: unknown drug key "${k}"`);
    t.check(isBi(d.name), `${where}: name needs non-empty th and en`);
    t.check(typeof d.route === 'string' && d.route.trim(), `${where}: missing route`);
    t.check(Array.isArray(d.regimens) && d.regimens.length, `${where}: no regimens`);
    const n = (d.regimens || []).length;

    // regimenIdx references from Newborn / renal modes
    const refs = [];
    (d.neonatalGroups || []).forEach(g => (g.brackets || []).forEach(b => refs.push(b.regimenIdx)));
    (d.renalGroups || []).forEach(g => {
      (g.crclBrackets || []).forEach(b => refs.push(b.regimenIdx));
      (g.dialysisOptions || []).forEach(o => refs.push(o.regimenIdx));
    });
    refs.forEach(i => t.check(Number.isInteger(i) && i >= 0 && i < n, `${where}: regimenIdx ${i} out of range (0–${n-1})`));
    const referenced = new Set(refs);

    (d.regimens || []).forEach((r, idx) => {
      const rw = `${where} regimen #${idx} "${r.label && r.label.en}"`;
      t.check(isBi(r.label), `${rw}: label needs non-empty th and en`);
      if (r.multiPhase || r.phases){
        t.check(r.multiPhase && Array.isArray(r.phases) && r.phases.length, `${rw}: multiPhase and phases must come together`);
        (r.phases || []).forEach((p, j) => {
          t.check(isBi(p.phaseLabel), `${rw} phase #${j}: phaseLabel needs th and en`);
          checkDose(t, p, `${rw} phase #${j}`, false);
        });
      } else {
        // Renal/neonatal note-only entries may legitimately carry no dose fields
        checkDose(t, r, rw, referenced.has(idx));
      }
      if (present(r.weightMin) && present(r.weightMax))
        t.check(r.weightMin < r.weightMax, `${rw}: weightMin must be < weightMax`);
      if (r.formTag){
        const forms = [].concat(FORMS[d.id] || [], TABS[d.id] || []);
        t.check(!forms.length || forms.some(f => f.tag === r.formTag), `${rw}: no formulation/tablet has tag "${r.formTag}"`);
      }
    });
  }

  for (const [label, table, key] of [['DRUG_FORMULATIONS', FORMS, 'concMgPerMl'], ['DRUG_TABLETS', TABS, 'mgPerTab']]){
    for (const [id, list] of Object.entries(table)){
      t.check(ids.has(id), `${label}: "${id}" has no matching drug in DRUG_DB`);
      list.forEach((f, i) => {
        t.check(isBi(f.form), `${label}.${id}[${i}]: form needs th and en`);
        t.check(typeof f[key] === 'number' && f[key] > 0, `${label}.${id}[${i}]: ${key} must be a positive number`);
      });
    }
  }
};

function checkDose(t, r, rw, noteOnlyAllowed){
  for (const k of Object.keys(r))
    t.check(OTHER_REG_KEYS.has(k) || DOSE_KEYS.has(k) || CAP_KEYS.has(k), `${rw}: unknown key "${k}" (calculator ignores it)`);

  const active = DOSE_FIELDS.filter(([k]) => present(r[k]));
  if (!active.length){
    t.check(noteOnlyAllowed && r.notes, `${rw}: no dose field — calculator will show "unsupported"`);
    return;
  }
  t.check(active.length === 1, `${rw}: several dose fields (${active.map(a => a[0]).join(', ')}) — only "${active[0][0]}" is used`);
  const [field, type] = active[0];
  const v = r[field];

  if (Array.isArray(v)){
    t.check(v.length === 2 && v.every(x => typeof x === 'number' && isFinite(x) && x > 0), `${rw}: ${field} must be [lo, hi] positive numbers`);
    t.check(v[0] <= v[1], `${rw}: ${field} lo > hi`);
  } else {
    t.check(typeof v === 'number' && isFinite(v) && v > 0, `${rw}: ${field} must be a positive number`);
  }

  for (const k of Object.keys(r)){
    if (!CAP_KEYS.has(k) || !present(r[k]) || ENFORCED_CAPS[type].includes(k)) continue;
    if (!DISPLAYED_CAPS.includes(k)) t.check(false, `${rw}: "${k}" is neither enforced nor displayed for ${field}`);
    else if (type !== 'fixed') t.warn(`${rw}: "${k}" is shown in the reference card but not enforced for ${field}`);
  }

  if (present(r.freq)){
    const f = r.freq;
    const ok = (typeof f === 'number' && f > 0) ||
      (typeof f === 'string' && /^\d+(\.\d+)?-\d+(\.\d+)?$/.test(f) && f.split('-').map(Number).every(x => x > 0));
    t.check(ok, `${rw}: freq must be a positive number or "a-b" (got ${JSON.stringify(f)})`);
  }
  if (/PerDay$/.test(field) && !present(r.freq))
    t.warn(`${rw}: ${field} without freq — whole daily amount shown as one dose`);
}
