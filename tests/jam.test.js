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
  assert.equal(C.transposeText('F##m', 1), 'G#m');
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

// ---------------------------------------------------------------- song forms
const J = FD.jamCalls;
const syms = items => plain(items.map(it => it.chord.symbol));
const formOf = str => {
  const f = C.parseForm(str);
  assert.equal(f.error, undefined, str);
  return plain(f.sections.map(s => `${s.name}${s.shift ? (s.shift > 0 ? '+' : '') + s.shift : ''}: ${syms(s.items).join(' ')}`));
};
const chordsOf = tl => plain(tl.segs.map(s => s.chord.symbol));

test('song form: sections play in order, and +n moves a section from the chords as written', () => {
  assert.deepEqual(formOf('[Verse] Am F C G | [Chorus] F G Am Am | [Chorus +2] F G Am Am'),
    ['Verse: Am F C G', 'Chorus: F G Am Am', 'Chorus+2: G A Bm Bm']);
  assert.deepEqual(formOf('[A] C:2 G7:2 [B -1] F'), ['A: C G7', 'B-1: E']);
  assert.deepEqual(plain(C.parseForm('[A] C:2 G7:2').sections[0].items.map(i => i.beats)), [2, 2]);
  assert.equal(C.parseForm('[Verse] C [Chorus] F').hasSections, true);
  assert.equal(C.parseForm('C D7 G7 C').hasSections, false);
  assert.deepEqual(formOf('C D7 G7 C'), [': C D7 G7 C']);
  assert.deepEqual(formOf('Am F [Out] E7'), [': Am F', 'Out: E7'], 'chords before the first tag are their own section');
  assert.deepEqual(formOf('[Big Finish + 3]C'), ['Big Finish+3: E♭'], 'spaces inside a tag are fine');
});

test('song form: a tag with no chords repeats the last section of that name, with its own shift', () => {
  assert.deepEqual(formOf('[Verse] Am F C G [Chorus] F G Am Am [Chorus +2]'),
    ['Verse: Am F C G', 'Chorus: F G Am Am', 'Chorus+2: G A Bm Bm']);
  assert.deepEqual(formOf('[Verse +5] C G [verse]'), ['Verse+5: F C', 'verse: C G'], 'measured from what was written, any case');
  assert.deepEqual(formOf('[A] C [A] D [A -2]'), ['A: C', 'A: D', 'A-2: C'], 'the latest A is the one repeated');
});

test('song form: mistakes get a message, not a crash', () => {
  assert.match(C.parseForm('[Bridge] [Verse] C').error, /\[Bridge\] has no chords/);
  assert.match(C.parseForm('[Verse] C [Chorus +2]').error, /no earlier \[Chorus\]/);
  assert.match(C.parseForm('[Verse C G').error, /closing \]/);
  assert.match(C.parseForm('[Up +12] C').error, /11 semitones/);
  assert.match(C.parseForm('[Verse] C Zz').error, /"Zz"/);
  assert.match(C.parseForm('').error, /at least one chord/);
  assert.match(C.parseForm('[+2]').error, /has no chords/);
});

test('transposing a song form moves the chords and leaves the tags and layout alone', () => {
  assert.equal(C.transposeText('[Verse] Am F | [Chorus +2] G:2, C', 2), '[Verse] Bm G | [Chorus +2] A:2, D');
  assert.equal(C.transposeText('[Chorus]', 5), '[Chorus]');
  const up = C.parseForm(C.transposeText('[V] Am F [C +2] F G [V]', 3));
  assert.deepEqual(plain(up.sections.map(s => syms(s.items).join(' '))), ['Cm A♭', 'B♭ C', 'Cm A♭']);
});

test('the jam page plays a song form as one loop, labelling each section and its key', () => {
  const j = page({ custom: '[Verse] Am F C G [Chorus +2] F G Am Am' });
  const tl = j.timeline(0, 4);
  assert.deepEqual(chordsOf(tl), ['Am', 'F', 'C', 'G', 'G', 'A', 'Bm', 'Bm']);
  assert.deepEqual(plain(tl.segs.map(s => s.section.name)), ['Verse', 'Verse', 'Verse', 'Verse', 'Chorus', 'Chorus', 'Chorus', 'Chorus']);
  assert.equal(tl.segs[0].keyLabel, 'Key of A minor');
  assert.equal(tl.segs[4].keyLabel, 'Key of B minor');
  assert.deepEqual(chordsOf(j.timeline(3, 4)), chordsOf(tl), 'and loops');
});

test('a saved track keeps its song form text exactly', () => {
  const text = '[Verse] Am F C G | [Chorus] F G Am Am | [Chorus +2]';
  const j = page({ custom: text, groove: 'rock', bpm: 100, sound: 'keys' });
  j.changed = () => {};
  j.saveTrack('Gig opener');
  assert.equal(j.o.saved[0].prog, text);
  assert.equal(j.o.custom, text);
});

test('the up-a-whole-step key cycle moves 2 semitones each time', () => {
  const j = page({ track: 'p:axis', key: 0, cycle: 'whole', cycleEvery: 2 });
  const roots = [0, 1, 2, 3, 4, 12].map(l => j.timeline(l, 4).segs[0].chord.root);
  assert.deepEqual(plain(roots), [0, 0, 2, 2, 4, 0]);
  assert.equal(j.timeline(2, 4).keyLabel, 'Key of D');
});

// ---------------------------------------------------------------- called key changes: where they land
// A timeline as the engine holds it: segs with starts, and total beats.
const withStarts = tl => {
  let start = 0;
  const segs = tl.segs.map(s => { const x = { ...s, start }; start += s.beats; return x; });
  return { ...tl, segs, beats: start };
};

test('a call lands on the next section, loop, bar or chord, never before the band can change', () => {
  // Verse: Am F (4 beats each). Chorus: C:2 G:2 E7:8. Sections start at 0 and 8; chords at 0 4 8 10 12; 20 beats.
  const j = page({ custom: '[Verse] Am F [Chorus] C:2 G:2 E7:8' });
  const tl = withStarts(j.timeline(0, 4));
  assert.equal(tl.beats, 20);
  const at = (beat, mode) => plain(J.landing(tl, { loop: 3, beat }, mode, 4));
  assert.deepEqual(at(0, 'section'), { loop: 3, beat: 0 }, 'the top of a loop that has not started is fine');
  assert.deepEqual(at(1, 'section'), { loop: 3, beat: 8 });
  assert.deepEqual(at(9, 'section'), { loop: 4, beat: 0 });
  assert.deepEqual(at(1, 'loop'), { loop: 4, beat: 0 });
  assert.deepEqual(at(0, 'loop'), { loop: 3, beat: 0 });
  assert.deepEqual(at(5, 'bar'), { loop: 3, beat: 8 });
  assert.deepEqual(at(13, 'bar'), { loop: 3, beat: 16 }, 'bar lines inside a long chord count');
  assert.deepEqual(at(17, 'bar'), { loop: 4, beat: 0 });
  assert.deepEqual(at(9, 'chord'), { loop: 3, beat: 10 });
  assert.deepEqual(at(11, 'chord'), { loop: 3, beat: 12 });
  assert.deepEqual(at(13, 'chord'), { loop: 4, beat: 0 });
  // Without sections, "next section" is the next loop.
  const one = withStarts(page({ custom: 'C F G C' }).timeline(0, 4));
  assert.deepEqual(plain(J.landing(one, { loop: 0, beat: 5 }, 'section', 4)), { loop: 1, beat: 0 });
  assert.deepEqual(plain(J.landing(null, { loop: 2, beat: 3 }, 'bar', 4)), { loop: 3, beat: 0 });
});

test('the countdown counts beats to the landing point, across the loop boundary and from the count-in', () => {
  const lens = () => 16;
  assert.equal(J.beatsUntil({ loop: 2, beat: 4 }, { loop: 2, beat: 8 }, lens), 4);
  assert.equal(J.beatsUntil({ loop: 2, beat: 12 }, { loop: 3, beat: 0 }, lens), 4);
  assert.equal(J.beatsUntil({ loop: 2, beat: 15 }, { loop: 4, beat: 2 }, lens), 19);
  assert.equal(J.beatsUntil({ loop: 2, beat: 8 }, { loop: 2, beat: 8 }, lens), 0);
  assert.equal(J.beatsUntil({ loop: 0, beat: -4 }, { loop: 0, beat: 0 }, lens), 4, 'from the first count-in beat');
  assert.equal(J.untilText(8, 4), 'in 2 bars');
  assert.equal(J.untilText(5, 4), 'in 2 bars');
  assert.equal(J.untilText(4, 4), 'in 4 beats');
  assert.equal(J.untilText(1, 4), 'in 1 beat');
  assert.equal(J.untilText(0, 4), 'now');
});

// ---------------------------------------------------------------- called key changes: what the band plays
test('a call at the top of a loop moves that loop and the ones after, not the one before', () => {
  const j = page({ track: 'p:axis', key: 0 });
  j.calls = [{ at: { loop: 1, beat: 0 }, shift: 2, rel: false }];
  assert.deepEqual(chordsOf(j.timeline(0, 4)), ['C', 'G', 'Am', 'F']);
  assert.deepEqual(chordsOf(j.timeline(1, 4)), ['D', 'A', 'Bm', 'G']);
  assert.deepEqual(chordsOf(j.timeline(5, 4)), ['D', 'A', 'Bm', 'G']);
  assert.equal(j.timeline(1, 4).keyLabel, 'Key of D');
});

test('a call landing mid-loop changes key from that beat, splitting a long chord at the bar line', () => {
  const j = page({ custom: 'C:8 F G' });
  j.calls = [{ at: { loop: 0, beat: 4 }, shift: 5, rel: false }];
  const tl = j.timeline(0, 4);
  assert.deepEqual(plain(tl.segs.map(s => [s.chord.symbol, s.beats])), [['C', 4], ['F', 4], ['B♭', 4], ['C', 4]]);
  assert.deepEqual(plain(tl.segs.map(s => s.keyLabel)), ['Key of C', 'Key of F', 'Key of F', 'Key of F']);
  assert.equal(tl.segs.reduce((a, s) => a + s.beats, 0), 16, 'the loop keeps its length');
});

test('calls stack on top of a key cycle', () => {
  const j = page({ track: 'p:axis', key: 0, cycle: 'half' });
  j.calls = [{ at: { loop: 1, beat: 0 }, shift: 2 + 5, rel: false }];
  assert.equal(j.timeline(1, 4).segs[0].chord.root, (1 + 7) % 12);
  assert.equal(j.timeline(2, 4).segs[0].chord.root, (2 + 7) % 12);
});

test('R switches to the relative key by starting the loop on the new home chord, and back', () => {
  const j = page({ track: 'p:axis', key: 0 });
  j.calls = [{ at: { loop: 1, beat: 0 }, shift: 0, rel: true }];
  assert.deepEqual(chordsOf(j.timeline(1, 4)), ['Am', 'F', 'C', 'G']);
  assert.equal(j.timeline(1, 4).keyLabel, 'Key of A minor');
  j.calls.push({ at: { loop: 2, beat: 0 }, shift: 0, rel: true });
  assert.deepEqual(chordsOf(j.timeline(2, 4)), ['C', 'G', 'Am', 'F']);
  assert.equal(j.timeline(2, 4).keyLabel, 'Key of C');
});

test('R goes from minor to the relative major, on typed-in loops too', () => {
  const typed = page({ custom: 'Am Dm G C' });
  assert.equal(typed.timeline(0, 4).keyLabel, 'Key of A minor');
  typed.calls = [{ at: { loop: 1, beat: 0 }, shift: 0, rel: true }];
  assert.deepEqual(chordsOf(typed.timeline(1, 4)), ['C', 'Am', 'Dm', 'G']);
  assert.equal(typed.timeline(1, 4).keyLabel, 'Key of C');
  // With a whole step stacked on: up to D, home on D.
  typed.calls[0].shift = 2;
  assert.deepEqual(chordsOf(typed.timeline(1, 4)), ['D', 'Bm', 'Em', 'A']);
});

test('R landing mid-loop ends that loop there, so the next starts on the new home chord', () => {
  const j = page({ track: 'p:axis', key: 0 });
  j.calls = [{ at: { loop: 0, beat: 8 }, shift: 0, rel: true }];
  assert.deepEqual(chordsOf(j.timeline(0, 4)), ['C', 'G']);
  assert.deepEqual(chordsOf(j.timeline(1, 4)), ['Am', 'F', 'C', 'G']);
});

// The page's call() with the band faked as playing at a given position.
function playing(j, pos, run) {
  const B = FD.backing;
  const saved = { isPlaying: B.isPlaying, position: B.position, timelineAt: B.timelineAt, refresh: B.refresh, stop: B.stop };
  B.isPlaying = () => true;
  B.position = () => pos;
  B.timelineAt = i => withStarts(j.timeline(i, 4));
  B.refresh = () => {};
  j.render = () => {};
  j.calls = j.calls || [];
  try { run(); } finally { Object.assign(B, saved); }
}

test('call(): presses before the landing stack onto one change, and cancelling clears it', () => {
  const j = page({ track: 'p:axis', key: 0, landOn: 'loop' });
  playing(j, { loop: 0, beat: 5 }, () => {
    j.call(2, false);
    j.call(2, false);
    assert.deepEqual(plain(j.calls), [{ at: { loop: 1, beat: 0 }, shift: 4, rel: false }]);
    j.call(-4, false);
    assert.deepEqual(plain(j.calls), [], 'calls that add up to nothing disappear');
    j.call(5, false);
    assert.equal(j.cancelCalls(), true);
    assert.deepEqual(plain(j.calls), []);
    assert.equal(j.cancelCalls(), false, 'nothing left to cancel');
  });
});

test('call(): the landing follows the setting, and a call already playing cannot be cancelled', () => {
  const j = page({ custom: '[A] C F [B] G Am', landOn: 'section' });
  playing(j, { loop: 0, beat: 1 }, () => j.call(2, false));
  assert.deepEqual(plain(j.calls[0].at), { loop: 0, beat: 8 });
  j.o.landOn = 'chord';
  playing(j, { loop: 0, beat: 9 }, () => {
    j.call(5, false);
    assert.deepEqual(plain(j.calls.map(c => c.at)), [{ loop: 0, beat: 8 }, { loop: 0, beat: 12 }]);
    j.cancelCalls();
    assert.deepEqual(plain(j.calls.map(c => c.at)), [{ loop: 0, beat: 8 }], 'the one already sounding stays');
  });
});

test('call(): R is refused on a song form and on a track with no relative chord', () => {
  const form = page({ custom: '[A] C G Am F [B] F G' });
  playing(form, { loop: 0, beat: 1 }, () => form.call(0, true));
  assert.deepEqual(plain(form.calls), []);
  const noRel = page({ custom: 'C F G C' });
  playing(noRel, { loop: 0, beat: 1 }, () => noRel.call(0, true));
  assert.deepEqual(plain(noRel.calls), []);
  const ok = page({ custom: 'C G Am F' });
  playing(ok, { loop: 0, beat: 1 }, () => ok.call(0, true));
  assert.equal(ok.calls.length, 1);
});

test('stopping keeps the key the band ended in and drops calls still waiting', () => {
  const j = page({ track: 'p:axis', key: 0 });
  playing(j, { loop: 2, beat: 4 }, () => {
    j.calls = [{ at: { loop: 1, beat: 0 }, shift: 2, rel: false }, { at: { loop: 3, beat: 0 }, shift: 5, rel: false }];
    j.view = { loop: 2, beatInLoop: 3 };
    j.changed = () => {};
    j.syncPlayBtn = () => {};
    FD.backing.stop = () => {};
    j.toggle();
  });
  assert.equal(j.o.key, 2, 'the whole step that landed stays');
  assert.deepEqual(plain(j.calls), []);
});
