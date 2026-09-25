/* Runs every regimen (and phase) of every drug through calcRegimenDose + ddFormatResult
   at a spread of weights in both languages, with every applicable liquid/tablet form.
   Fails on thrown errors, NaN/Infinity, "undefined" or "[object Object]" in output. */
const { loadApp } = require('./load-app');
const WEIGHTS = [0.8, 3, 10, 25, 50, 70, 120];
const BAD = /NaN|undefined|Infinity|\[object Object\]/;

module.exports = function(t){
  const app = loadApp();
  const DB = app.get('DRUG_DB'), FORMS = app.get('DRUG_FORMULATIONS'), TABS = app.get('DRUG_TABLETS');
  const calc = app.get('calcRegimenDose'), calcBsa = app.get('calcBsaDose'), fmt = app.get('ddFormatResult');
  const spec = app.get('ddSpecText'), ml = app.get('attachMlToResult'), tabs = app.get('attachTabsToResult');

  for (const lang of ['th', 'en']){
    app.setLang(lang);
    for (const d of DB){
      const referenced = new Set();
      (d.neonatalGroups || []).forEach(g => (g.brackets || []).forEach(b => referenced.add(b.regimenIdx)));
      (d.renalGroups || []).forEach(g => {
        (g.crclBrackets || []).forEach(b => referenced.add(b.regimenIdx));
        (g.dialysisOptions || []).forEach(o => referenced.add(o.regimenIdx));
      });
      d.regimens.forEach((r, idx) => {
        const route = r.route || d.route;
        const forms = [null];
        if (/\bPO\b/.test(route)){
          const tag = f => !r.formTag || f.tag === r.formTag;
          (FORMS[d.id] || []).filter(tag).forEach(f => forms.push(['ml', f]));
          (TABS[d.id] || []).filter(tag).forEach(f => forms.push(['tab', f]));
        }
        for (const p of (r.multiPhase && r.phases) ? r.phases : [r]){
          const where = `[${lang}] ${d.id} #${idx} "${r.label.en}"${p !== r ? ` / ${p.phaseLabel && p.phaseLabel.en}` : ''}`;
          try {
            const s = spec(p, route);
            t.check(!BAD.test(s), `${where}: reference spec contains ${(s.match(BAD) || [])[0]}`);
          } catch (e){ t.check(false, `${where}: ddSpecText threw ${e.message}`); }

          for (const w of WEIGHTS){
            let res;
            try { res = p.bsaMgPerM2PerDose ? calcBsa(p, w, 100) : calc(p, w); }
            catch (e){ t.check(false, `${where} @${w}kg: calc threw ${e.message}`); continue; }
            if (res.kind === 'unknown'){
              t.check(referenced.has(idx), `${where}: kind "unknown" in the main regimen list`);
              continue;
            }
            for (const [k, v] of Object.entries(res))
              if (typeof v === 'number') t.check(isFinite(v), `${where} @${w}kg: result.${k} = ${v}`);
            for (const f of forms){
              const r2 = !f ? res : (f[0] === 'ml' ? ml(res, f[1]) : tabs(res, f[1], d.category === 'antituberculosis' ? { reg: p, weightKg: w } : undefined));
              let html;
              try { html = fmt(r2, p, route); }
              catch (e){ t.check(false, `${where} @${w}kg: ddFormatResult threw ${e.message}`); continue; }
              t.check(!BAD.test(html), `${where} @${w}kg${f ? ' (' + f[1].form.en + ')' : ''}: output contains ${(html.match(BAD) || [])[0]}`);
            }
          }
        }
      });
    }
  }
};
