// Loads the app's plain scripts into a vm context, in index.html order, with a stubbed window and localStorage.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const KEY = 'fretdriller.v1';

// These three touch the page as soon as they load, so a logic test leaves them out.
const NEEDS_PAGE = ['theme', 'app', 'quotes'];

function scriptOrder() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script src="js\/([\w-]+)\.js\?v=\d+"><\/script>/g)].map(m => m[1]);
}

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
  };
}

// opts.save: the saved object (or raw string) under fretdriller.v1. opts.storage: replaces localStorage.
// opts.globals: extra globals, such as a document.
function load(opts = {}) {
  const initial = opts.save === undefined ? {} : { [KEY]: typeof opts.save === 'string' ? opts.save : JSON.stringify(opts.save) };
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, performance,
    localStorage: opts.storage || fakeStorage(initial),
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    confirm: () => true,
    ...opts.globals,
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  for (const name of scriptOrder().filter(n => !NEEDS_PAGE.includes(n))) {
    const file = path.join(ROOT, 'js', name + '.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  return { FD: sandbox.FD, window: sandbox, localStorage: sandbox.localStorage };
}

// Values made inside the vm have their own Array and Object, which deepStrictEqual rejects. Copy them out first.
const plain = x => JSON.parse(JSON.stringify(x));

module.exports = { load, plain, scriptOrder, fakeStorage, ROOT, KEY };
