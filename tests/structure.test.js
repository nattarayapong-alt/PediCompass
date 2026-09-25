/* Structural checks — same as the manual pipeline: tag balance, CSS braces, JS syntax. */
const vm = require('vm');
const { readIndex, extractMainScript } = require('./load-app');

module.exports = function(t){
  const html = readIndex();
  const opens = (html.match(/<div/g) || []).length;
  const closes = (html.match(/<\/div>/g) || []).length;
  t.check(opens === closes, `<div> balance: ${opens} opens vs ${closes} closes`);

  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('');
  const ob = (css.match(/\{/g) || []).length, cb = (css.match(/\}/g) || []).length;
  t.check(ob === cb, `CSS brace balance: ${ob} { vs ${cb} }`);

  try { new vm.Script(extractMainScript(html)); t.check(true, 'JS syntax'); }
  catch (e){ t.check(false, `JS syntax: ${e.message}`); }
};
