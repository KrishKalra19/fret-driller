'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./helpers/load');

const { FD } = load();
const C = FD.chords;
const jam = FD.views.jam;

// The jam page with its options set, skipping mount (which needs a page).
function page(o) {
  const j = Object.create(jam);
  j.o = { track: 'custom', key: 0, custom: 'C D7 G7 C', barsPerChord: 1, cycle: 'off', cycleEvery: 1, saved: [], ...o };
  return j;
}

test('double flat and double sharp roots parse', () => {
  const names = sym => C.parse(sym).tones.map(t => t.name).join(' ');
  assert.equal(C.parse('Ebb7').root, 2);
  assert.equal(C.parse('Ebb7').symbol, 'E♭♭7');
  assert.equal(names('Ebb7'), 'Ebb Gb Bbb Dbb');
  assert.equal(C.parse('Bbb7').root, 9);
  assert.equal(names('Bbb7'), 'Bbb Db Fb Abb');
  assert.equal(C.parse('E♭♭7').root, 2);
  assert.equal(C.parse('F##m').root, 7);
  assert.equal(C.parse('Bbb').quality, 'maj', 'Bbb is B double flat');
  assert.equal(C.parse('Cbbb'), null, 'three flats is not a chord');
});

test('the Bossa track reads in every key, keeping the ♭II spelling', () => {
  const bossa = C.PRESETS.find(p => p.id === 'bossaprog');
  for (let key = 0; key < 12; key++) {
    const r = C.presetProgression(bossa, key);
    assert.equal(r.error, undefined, `key ${key}`);
    assert.equal(r.items.length, 8, `key ${key}`);
    assert.equal(r.items[5].chord.root, (key + 1) % 12, `key ${key}: ♭II is a half step up`);
  }
  assert.equal(C.presetProgression(bossa, 1).items[5].chord.symbol, 'E♭♭7');
  assert.equal(C.presetProgression(bossa, 8).items[5].chord.symbol, 'B♭♭7');
});

test('double flats survive toText and transposeText', () => {
  const bossa = C.PRESETS.find(p => p.id === 'bossaprog');
  const text = C.toText(C.presetProgression(bossa, 1).items);
  assert.match(text, /Ebb7/);
  const back = C.parseProgression(text);
  assert.equal(back.error, undefined);
  assert.equal(C.transposeText('Ebb7:2', 1), 'Eb7:2');
  assert.equal(C.transposeText('F##m', 1), 'Abm');
});

test('a preset that cannot be read reports an error instead of crashing the page', () => {
  const broken = { id: 'broken', roman: 'I Q7', key: 0 };
  C.PRESETS.push(broken);
  try {
    assert.match(C.presetProgression(broken, 0).error, /"Q7"/);
    const j = page({ track: 'p:broken' });
    assert.match(j.items(0).error, /"Q7"/);
    const tl = j.timeline(0, 4);
    assert.ok(tl.segs.length > 0, 'falls back to something playable');
    assert.deepEqual(plain(tl.segs.map(s => s.beats)), [4, 4, 4, 4]);
  } finally {
    C.PRESETS.pop();
  }
});

test('the page shows every preset in every key without a crash', () => {
  for (const p of C.PRESETS) {
    for (let key = 0; key < 12; key++) {
      const j = page({ track: 'p:' + p.id, key });
      assert.equal(j.items(0).error, undefined, `${p.id} in ${key}`);
      assert.ok(j.timeline(0, 4).segs.length > 0, `${p.id} in ${key}`);
    }
  }
});
