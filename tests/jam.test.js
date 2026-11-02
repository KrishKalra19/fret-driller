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

// ---------------------------------------------------------------- every preset in every key
const mod12 = n => ((n % 12) + 12) % 12;
const BARS = {
  myloop: 4, blues12: 12, quick: 12, slowblues: 12, minorblues: 12, blues8: 8, jazzblues: 12,
  twofive: 4, minortwofive: 4, turnaround: 4, cycle: 8, rhythm: 8, bossaprog: 8,
  axis: 4, doowop: 4, andalusian: 4, mixo: 4, ballad: 4, punk: 4, reggae: 4, country: 8, lofi: 4, waltz: 4,
};
const DEGREE = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };

// What a numeral should sound like, worked out without the app's parser: root above the key, chord steps, beats.
function expected(tok) {
  const m = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)([^:]*)(?::(\d+))?$/.exec(tok);
  assert.ok(m, tok);
  const lower = m[2] === m[2].toLowerCase();
  const steps = {
    '': lower ? [0, 3, 7] : [0, 4, 7],
    7: lower ? [0, 3, 7, 10] : [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    'ø7': [0, 3, 6, 10],
    '°7': [0, 3, 6, 9],
  }[m[3]];
  assert.ok(steps, `the test has no steps for "${m[3]}" in ${tok}`);
  const shift = m[1] === '#' ? 1 : m[1] === 'b' ? -1 : 0;
  return { root: DEGREE[m[2].toUpperCase()] + shift, steps, beats: m[4] ? Number(m[4]) : null };
}

function eachPresetKey(fn) {
  for (const p of C.PRESETS) for (let key = 0; key < 12; key++) fn(p, key);
}

test('there are 23 presets and each has a known length and a real groove', () => {
  assert.equal(C.PRESETS.length, 23);
  for (const p of C.PRESETS) {
    assert.ok(BARS[p.id], p.id);
    assert.ok(FD.backing.GROOVES[p.groove], `${p.id}: groove ${p.groove}`);
  }
});

test('every preset in every key: each chord has the tones its numeral calls for', () => {
  eachPresetKey((p, key) => {
    const toks = p.roman.split(' ');
    const { items, error } = C.presetProgression(p, key);
    assert.equal(error, undefined, `${p.id} in ${key}`);
    assert.equal(items.length, toks.length, `${p.id} in ${key}`);
    toks.forEach((tok, i) => {
      const want = expected(tok);
      const where = `${p.id} in ${key}: ${tok} = ${items[i].chord.symbol}`;
      assert.equal(items[i].chord.root, mod12(key + want.root), where);
      assert.deepEqual([...items[i].chord.tones].map(t => t.pc), want.steps.map(s => mod12(key + want.root + s)), where);
      assert.equal(items[i].beats, want.beats, where);
    });
  });
});

test('every preset in every key: tone names are the pitches they claim to be, with at most a double accidental', () => {
  const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  eachPresetKey((p, key) => {
    for (const { chord } of C.presetProgression(p, key).items) {
      for (const t of chord.tones) {
        const where = `${p.id} in ${key}: ${chord.symbol} has ${t.name}`;
        assert.match(t.name, /^[A-G](#{1,2}|b{1,2})?$/, where);
        const off = [...t.name.slice(1)].reduce((a, c) => a + (c === '#' ? 1 : -1), 0);
        assert.equal(mod12(LETTER[t.name[0]] + off), t.pc, where);
      }
    }
  });
});

test('every preset in every key: the beats add up to the bars the track intends', () => {
  eachPresetKey((p, key) => {
    const bpb = FD.backing.GROOVES[p.groove].beats;
    const j = page({ track: 'p:' + p.id, key, groove: p.groove });
    const segs = j.timeline(0, bpb).segs;
    const total = segs.reduce((a, s) => a + s.beats, 0);
    assert.equal(total, BARS[p.id] * bpb, `${p.id} in ${key}`);
    let at = 0;
    for (const s of segs) {
      assert.ok(s.beats > 0, p.id);
      if (s.beats % bpb === 0) assert.equal(at % bpb, 0, `${p.id}: a whole-bar chord starts mid-bar at beat ${at}`);
      at += s.beats;
    }
  });
});

const sameChords = (a, b, where) => {
  assert.equal(a.length, b.length, where);
  a.forEach((it, i) => {
    assert.equal(b[i].chord.root, it.chord.root, where);
    assert.equal(b[i].chord.quality, it.chord.quality, where);
    assert.equal(b[i].beats, it.beats, where);
  });
};

test('every preset in every key: toText then parseProgression gives the same chords', () => {
  eachPresetKey((p, key) => {
    const { items } = C.presetProgression(p, key);
    const text = C.toText(items);
    const back = C.parseProgression(text);
    assert.equal(back.error, undefined, `${p.id} in ${key}: ${text}`);
    sameChords(items, back.items, `${p.id} in ${key}: ${text}`);
    assert.equal(back.items.map(it => it.chord.symbol).join(), items.map(it => it.chord.symbol).join(), `${p.id} in ${key}: spelling`);
  });
});

test('every preset in every key: transposeText up then down returns to the same pitches', () => {
  eachPresetKey((p, key) => {
    const { items } = C.presetProgression(p, key);
    const text = C.toText(items);
    for (const semis of [1, 2, 5, 7, 11]) {
      const up = C.transposeText(text, semis);
      const upParsed = C.parseProgression(up);
      assert.equal(upParsed.error, undefined, `${p.id} in ${key} +${semis}: ${up}`);
      upParsed.items.forEach((it, i) => assert.equal(it.chord.root, mod12(items[i].chord.root + semis), `${p.id} in ${key} +${semis}`));
      const down = C.parseProgression(C.transposeText(up, -semis));
      assert.equal(down.error, undefined, `${p.id} in ${key} ±${semis}`);
      sameChords(items, down.items, `${p.id} in ${key} ±${semis}`);
    }
  });
});

// ---------------------------------------------------------------- key cycling
test('key cycles move every preset by the right amount, loop after loop', () => {
  const steps = { fourths: 5, half: 1 };
  for (const cycle of ['fourths', 'half']) {
    for (const cycleEvery of [1, 2, 4]) {
      for (const p of C.PRESETS) {
        for (let key = 0; key < 12; key++) {
          const j = page({ track: 'p:' + p.id, key, cycle, cycleEvery });
          const first = C.presetProgression(p, key).items;
          for (let loop = 0; loop < 30; loop++) {
            const shift = mod12(steps[cycle] * Math.floor(loop / cycleEvery));
            const where = `${p.id} in ${key}, ${cycle} every ${cycleEvery}, loop ${loop}`;
            const tl = j.timeline(loop, 4);
            assert.equal(tl.segs.length, first.length, where);
            tl.segs.forEach((s, i) => assert.equal(s.chord.root, mod12(first[i].chord.root + shift), where));
            assert.equal(tl.keyLabel, `Key of ${FD.theory.pretty(C.keyName(key + shift, p.minor))}${p.minor ? ' minor' : ''}`, where);
          }
        }
      }
    }
  }
});

test('the random key cycle stays valid, never repeats a key twice running, and is stable for a stretch', () => {
  for (const p of C.PRESETS) {
    for (const cycleEvery of [1, 2]) {
      const j = page({ track: 'p:' + p.id, key: 3, cycle: 'random', cycleEvery });
      const first = C.presetProgression(p, 3).items;
      let last = null;
      for (let k = 0; k < 40; k++) {
        const loop = k * cycleEvery;
        const shift = j.cycleShift(loop);
        assert.ok(Number.isInteger(shift) && shift >= 0 && shift < 12, `${p.id}: shift ${shift}`);
        assert.notEqual(shift, last, `${p.id}: same key twice at ${k}`);
        last = shift;
        assert.equal(j.cycleShift(loop), shift, 'asking again gives the same key');
        assert.equal(j.cycleShift(loop + cycleEvery - 1), shift, 'the key holds for the whole stretch');
        j.timeline(loop, 4).segs.forEach((s, i) => assert.equal(s.chord.root, mod12(first[i].chord.root + shift), `${p.id}, loop ${loop}`));
      }
      assert.equal(j.cycleShift(0), 0, 'the first stretch stays in the chosen key');
    }
  }
});

test('key cycles work on typed-in tracks too, keeping durations', () => {
  const j = page({ track: 'custom', custom: 'Am7:2 Ebb7:2 F#m7b5', cycle: 'fourths' });
  const roots = loop => plain(j.timeline(loop, 4).segs.map(s => s.chord.root));
  assert.deepEqual(roots(0), [9, 2, 6]);
  assert.deepEqual(roots(1), [2, 7, 11]);
  assert.deepEqual(roots(12), [9, 2, 6]);
  assert.deepEqual(plain(j.timeline(1, 4).segs.map(s => s.beats)), [2, 2, 4]);
});

test('leaving the page mid count-in does not leave it counting', () => {
  const j = page({});
  j.raf = 0;
  j.counting = true;
  j.countBeat = 2;
  j.unmount();
  assert.equal(j.counting, false);
});

test('a chord length of infinity is an error, not an endless chord', () => {
  assert.match(C.parseProgression('C:1e999').error, /"C:1e999"/);
  assert.match(C.parseProgression('C:Infinity').error, /"C:Infinity"/);
  assert.equal(C.parseProgression('C:8').items[0].beats, 8);
});

test('a typed-in track that stops parsing falls back to the last good one', () => {
  const j = page({ track: 'custom', custom: 'Am F' });
  assert.deepEqual(plain(j.timeline(0, 4).segs.map(s => s.chord.symbol)), ['Am', 'F']);
  j.o.custom = 'Am Zz';
  assert.match(j.items(0).error, /"Zz"/);
  assert.deepEqual(plain(j.timeline(0, 4).segs.map(s => s.chord.symbol)), ['Am', 'F']);
  const fresh = page({ track: 'custom', custom: 'Zz' });
  assert.deepEqual(plain(fresh.timeline(0, 4).segs.map(s => s.chord.symbol)), ['C', 'D7', 'G7', 'C']);
});
