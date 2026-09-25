/* Loads the main <script> of index.html into a Node VM with a stubbed DOM,
   so data constants and pure calculation functions can be tested directly. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX = path.join(__dirname, '..', 'index.html');

function readIndex(){ return fs.readFileSync(INDEX, 'utf8'); }

function extractMainScript(html){
  const blocks = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  return blocks.reduce((a, b) => (b.length > a.length ? b : a), '');
}

// Deep no-op proxy: any property access / call / construct returns another stub.
function stub(name){
  const f = function(){};
  return new Proxy(f, {
    get(t, k){
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.iterator) return function*(){};
      if (k === 'then') return undefined;
      if (k === 'length') return 0;
      return stub(name + '.' + String(k));
    },
    set(){ return true; },
    apply(){ return stub(name + '()'); },
    construct(){ return stub('new ' + name); }
  });
}

function loadApp(){
  const html = readIndex();
  const js = extractMainScript(html);
  const store = { getItem(){ return null; }, setItem(){}, removeItem(){} };
  const ctx = {
    console, Math, JSON, Date, Number, String, Array, Object, Set, Map, Promise, RegExp, Error,
    isNaN, isFinite, parseFloat, parseInt, encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    requestAnimationFrame: () => 0, scrollTo(){}, addEventListener(){}, removeEventListener(){},
    document: stub('document'), history: stub('history'), supabase: stub('supabase'),
    localStorage: store, sessionStorage: store,
    navigator: { userAgent: 'node', language: 'th' },
    location: { hash: '', search: '', href: '', pathname: '/' },
    fetch: () => new Promise(() => {}),
    matchMedia: () => ({ matches: false, addEventListener(){}, addListener(){} }),
    getComputedStyle: () => stub('style'),
    IntersectionObserver: function(){ return stub('io'); },
    MutationObserver: function(){ return stub('mo'); },
    ResizeObserver: function(){ return stub('ro'); },
    Image: function(){}, performance: { now: () => 0 }, innerWidth: 400, innerHeight: 800
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(js, ctx, { filename: 'index.html<script>' });
  return {
    html, js, ctx,
    get: expr => vm.runInContext(expr, ctx),
    setLang: lang => vm.runInContext(`LANG = ${JSON.stringify(lang)}`, ctx)
  };
}

module.exports = { loadApp, readIndex, extractMainScript, INDEX };
