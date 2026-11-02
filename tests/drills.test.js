'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./helpers/load');

// A drill with a stand-in board and prompt, skipping mount (which builds option controls on the page).
function setup(name, { opts = {}, inst = {}, instrument = 'guitar', settings = {} } = {}) {
  const { FD } = load({ save: { instrument, settings, inst: { [instrument]: inst } } });
  const drill = Object.create(FD.drills[name]);
  const state = { main: '', sub: '', tone: '', strip: undefined, marks: new Map(), box: null, hits: 0, misses: 0 };
  const ctx = {
    board: {
      clear() { state.marks.clear(); },
      mark(s, f, m) { state.marks.set(s + ',' + f, m); },
      unmark(s, f) { state.marks.delete(s + ',' + f); },
      getMark: (s, f) => state.marks.get(s + ',' + f),
      flash() {},
      setBox(b) { state.box = b; },
      configure() {},
    },
    hud: { hit() { state.hits++; }, miss() { state.misses++; } },
    prompt(main, sub, tone) { state.main = main; state.sub = sub; state.tone = tone; },
    sub(text) { state.sub = text; },
    strip(items) { state.strip = items; },
    hint() {},
  };
  drill.ctx = ctx;
  drill.o = FD.store.opts(name, { ...FD.drills[name].defaults, ...opts });
  return { FD, T: FD.theory, drill, state };
}

const ALL_OFF_6 = [false, false, false, false, false, false];
const ONE_STRING_6 = [false, false, false, false, false, true];

// ---------------------------------------------------------------- Find
for (const mode of ['string', 'any', 'all']) {
  for (const naturals of [false, true]) {
    test(`Find (${mode}, naturals ${naturals}): always asks something answerable, then accepts it`, () => {
      for (const instrument of ['guitar', 'bass']) {
        for (const inst of [{ minFret: 5, maxFret: 5 }, { minFret: 0, maxFret: 0 }, { minFret: 24, maxFret: 24 }, { minFret: 0, maxFret: 12 }]) {
          const { drill, state } = setup('find', { opts: { mode, naturals }, inst, instrument });
          for (let i = 0; i < 30; i++) {
            drill.next();
            clearTimeout(drill.timer);
            if (!drill.t) {
              assert.equal(state.main, 'No frets to drill');
              assert.ok(naturals, 'only natural notes can run out on a one-fret range');
              break;
            }
            assert.ok(state.main, 'the prompt is not empty');
            assert.ok(drill.targets.length > 0);
            for (const c of drill.targets) drill.onCell(c.s, c.f);
            assert.equal(drill.done, true, `${instrument} ${JSON.stringify(inst)}`);
            clearTimeout(drill.timer);
          }
        }
      }
    });
  }
}

test('Find: one string selected only ever asks about that string', () => {
  const { drill } = setup('find', { inst: { strings: ONE_STRING_6 } });
  for (let i = 0; i < 40; i++) {
    drill.next();
    assert.equal(drill.t.s, 5);
  }
});

test('Find: no strings selected says so instead of asking', () => {
  for (const mode of ['string', 'any', 'all']) {
    const { drill, state } = setup('find', { opts: { mode }, inst: { strings: ALL_OFF_6 } });
    drill.next();
    assert.equal(drill.t, null);
    assert.equal(state.main, 'No frets to drill');
    drill.onCell(0, 3);
    drill.reveal();
    drill.skip();
    clearTimeout(drill.timer);
  }
});

test('Find: a wrong answer counts one miss however many times, and the note can still be found', () => {
  const { drill, state, T } = setup('find', { opts: { mode: 'any' } });
  drill.next();
  const wrong = [0, 1, 2, 3].map(f => [0, f]).find(([s, f]) => T.pc(T.midiAt(s, f)) !== drill.t.pc);
  drill.onCell(...wrong);
  drill.onCell(...wrong);
  assert.equal(state.misses, 1);
  assert.match(state.sub, /Try again/);
  const c = drill.targets[0];
  drill.onCell(c.s, c.f);
  assert.equal(drill.done, true);
  assert.equal(state.hits, 0, 'a missed question is not a hit');
  clearTimeout(drill.timer);
});

test('Find: revealing marks every answer, even after an earlier round of "every position"', () => {
  // One string and one fret, so the same fret is the answer both times.
  const { drill, state } = setup('find', { opts: { mode: 'all' }, inst: { minFret: 5, maxFret: 5, strings: ONE_STRING_6 } });
  drill.next();
  drill.onCell(5, 5);
  clearTimeout(drill.timer);
  drill.o.mode = 'string';
  drill.next();
  drill.reveal();
  assert.equal(state.marks.size, 1);
  clearTimeout(drill.timer);
});

test('Find uses the chosen spelling', () => {
  for (const [spelling, re] of [['flat', /^[A-G]♭?$/], ['sharp', /^[A-G]♯?$/]]) {
    const { drill, state } = setup('find', { settings: { spelling } });
    for (let i = 0; i < 40; i++) { drill.next(); assert.match(state.main, re); }
  }
});

// ---------------------------------------------------------------- Name
test('Name: asks about a real fret, and right and wrong answers behave', () => {
  for (const instrument of ['guitar', 'bass']) {
    const { drill, state, T } = setup('name', { instrument });
    const btn = { classList: { add() {}, remove() {} }, textContent: 'X' };
    drill.ctx.pad = { querySelector: () => btn, querySelectorAll: () => [] };
    for (let i = 0; i < 20; i++) {
      drill.next();
      assert.equal(state.main, 'What note is this?');
      assert.equal(drill.t.pc, T.pc(T.midiAt(drill.t.s, drill.t.f)));
      drill.answer((drill.t.pc + 1) % 12);
      assert.equal(drill.done, false);
      drill.answer(drill.t.pc);
      assert.equal(drill.done, true);
      clearTimeout(drill.timer);
    }
    assert.equal(state.hits, 0);
    assert.equal(state.misses, 20);
  }
});

test('Name: no frets to ask about says so, and answers do nothing', () => {
  const { drill, state } = setup('name', { inst: { strings: ALL_OFF_6 } });
  drill.ctx.pad = { querySelector: () => null, querySelectorAll: () => [] };
  drill.next();
  assert.equal(state.main, 'No frets to drill');
  drill.answer(3);
  drill.reveal();
});

// ---------------------------------------------------------------- Sequences
function playable(drill, T, n) {
  // Every note must have a fret on the drawn board that the drill would accept.
  const st = drill.settingsForTest;
  for (let s = 0; s < T.count(); s++) {
    for (let f = st.minFret; f <= st.maxFret; f++) {
      const midi = T.midiAt(s, f);
      if (T.pc(midi) !== n.pc) continue;
      if (drill.o.octave && n.midi != null && midi !== n.midi) continue;
      if (drill.box && (f < drill.box.from || f > drill.box.to)) continue;
      return { s, f };
    }
  }
  return null;
}

test('Sequences: random melodies can always be played, across instruments, ranges, boxes and scales', () => {
  for (const instrument of ['guitar', 'bass']) {
    for (const inst of [{ minFret: 0, maxFret: 12 }, { minFret: 5, maxFret: 8 }, { minFret: 5, maxFret: 5 }, { minFret: 21, maxFret: 24 }]) {
      for (const position of [true, false]) {
        for (const octave of [true, false]) {
          for (const scale of ['major', 'minorPent', 'triadMaj', 'dim7']) {
            const { drill, state, T, FD } = setup('sequence', { instrument, inst, opts: { position, octave, scale, root: 4 } });
            drill.settingsForTest = FD.store.settings();
            for (let i = 0; i < 5; i++) {
              drill.next();
              if (!drill.notes) {
                assert.ok(state.main === 'Hmm' && state.sub, 'a failed melody explains itself');
                continue;
              }
              assert.equal(drill.notes.length, drill.o.length);
              for (const n of drill.notes) {
                assert.ok(n.name, 'every note has a name');
                const at = playable(drill, T, n);
                assert.ok(at, `${instrument} ${JSON.stringify(inst)} ${scale}: no fret for ${n.name}`);
                drill.onCell(at.s, at.f);
              }
              assert.equal(drill.done, true);
              assert.equal(state.main, 'Clean!');
              clearTimeout(drill.timer);
            }
          }
        }
      }
    }
  }
});

test('Sequences: junk typed in gets a message, not a prompt to play', () => {
  for (const custom of ['H', 'C H', 'C###', 'C10', '!!!', '<b>', 'C5 ?']) {
    const { drill, state } = setup('sequence', { opts: { source: 'custom', custom } });
    drill.next();
    assert.equal(drill.notes, null, custom);
    assert.equal(state.main, 'Hmm', custom);
    assert.match(state.sub, /Can't read/, custom);
    drill.onCell(0, 0);
    drill.hear();
  }
  const { drill, state } = setup('sequence', { opts: { source: 'custom', custom: '   ' } });
  drill.next();
  assert.match(state.sub, /Type some notes/);
});

test('a flat sign on its own is not the note or chord B', () => {
  const { FD, T } = setup('sequence');
  for (const bad of ['♭', '♯', '♭4', '♭b']) assert.equal(T.parseNote(bad), null, bad);
  for (const bad of ['♭', '♯', '♭7', '♭m', '♯m7']) assert.equal(FD.chords.parse(bad), null, bad);
  assert.equal(T.parseNote('B♭').name, 'Bb');
  assert.equal(FD.chords.parse('E♭♭7').root, 2);
});

test('Sequences: typed notes are played in order, with octaves when asked', () => {
  const { drill, state, T } = setup('sequence', { opts: { source: 'custom', custom: 'C5 C5 B4 A4', position: false, octave: true } });
  drill.next();
  assert.equal(state.main, 'Play this');
  drill.onCell(0, 7); // The high E is E4, so fret 7 is B4 and fret 8 is C5.
  assert.match(state.sub, /you need C/);
  for (const [s, f] of [[0, 8], [0, 8], [0, 7], [0, 5]]) drill.onCell(s, f);
  assert.equal(drill.done, true);
  assert.equal(T.midiAt(0, 8), 72);
  clearTimeout(drill.timer);
});

test('Sequences: wrong octave and out-of-box answers explain themselves', () => {
  const { drill, state } = setup('sequence', { opts: { source: 'custom', custom: 'E4', position: false, octave: true } });
  drill.next();
  drill.onCell(5, 0);
  assert.match(state.sub, /too low/);
  const boxed = setup('sequence', { opts: { source: 'custom', custom: 'C', position: true, boxStart: 5 } });
  boxed.drill.next();
  assert.deepEqual(plain(boxed.drill.box), { from: 5, to: 8 });
  boxed.drill.onCell(1, 1);
  assert.match(boxed.state.sub, /stay inside frets 5–8/);
});

test('Sequences: a fixed position that cannot hold the typed notes says so', () => {
  // Frets 0–3 on one string: the low E holds E F F# G, so C is not there.
  const { drill, state } = setup('sequence', { opts: { source: 'custom', custom: 'C', position: true, boxStart: 0 }, inst: { strings: ONE_STRING_6 } });
  drill.next();
  assert.equal(drill.notes, null);
  assert.equal(state.main, 'Hmm');
  assert.match(state.sub, /don't fit/);
});

test('Sequences: a typed octave that is off the board says so', () => {
  for (const custom of ['C8', 'C0', 'E9', 'C4 C8']) {
    const { drill, state } = setup('sequence', { opts: { source: 'custom', custom, position: false, octave: true } });
    drill.next();
    assert.equal(drill.notes, null, custom);
    assert.equal(state.main, 'Hmm', custom);
  }
  // Without "right octave" the same notes are fine, and C5 is on the board at fret 8.
  for (const [custom, octave] of [['C8', false], ['C5', true]]) {
    const { drill, state } = setup('sequence', { opts: { source: 'custom', custom, position: false, octave } });
    drill.next();
    assert.equal(state.main, 'Play this', custom);
  }
});

test('Sequences: no strings selected says to turn some on', () => {
  for (const source of ['random', 'custom']) {
    for (const position of [true, false]) {
      const { drill, state } = setup('sequence', { opts: { source, position }, inst: { strings: ALL_OFF_6 } });
      drill.next();
      assert.equal(drill.notes, null);
      assert.equal(state.main, 'Hmm');
      assert.match(state.sub, /strings/, `${source}, position ${position}: ${state.sub}`);
    }
  }
});

test('Sequences: a failed prompt does not leave the last position drawn', () => {
  const { drill, state } = setup('sequence', { opts: { source: 'random', position: true } });
  drill.next();
  assert.ok(state.box);
  drill.o.source = 'custom';
  drill.o.custom = 'H';
  drill.next();
  assert.equal(state.box, null);
});

// ---------------------------------------------------------------- Scale patterns
test('Scale patterns: every scale, key and shape gives notes that can be played through', () => {
  const { T } = setup('scales');
  const scales = Object.keys(T.SCALES);
  for (const instrument of ['guitar', 'bass']) {
    const { drill, state, T: TT } = setup('scales', { instrument });
    for (const scale of scales) {
      for (let root = 0; root < 12; root++) {
        for (const shape of ['nps', 'box']) {
          Object.assign(drill.o, { scale, root, shape, posF0: null, dir: 'updown', seq: 'straight', view: 'guided' });
          drill.compute();
          drill.startPass();
          const where = `${instrument} ${scale} in ${root} ${shape}`;
          assert.ok(drill.seq.length > 0, where);
          assert.ok(state.main && state.main !== 'Hmm', where);
          for (const p of drill.seq) {
            assert.ok(drill.info.names.has(TT.pc(p.midi)), where);
            assert.ok(p.f >= 0 && p.f <= 24, where);
          }
          if (root === 0) {
            for (const p of drill.seq) drill.onCell(p.s, p.f);
            assert.equal(drill.done, true, where);
            clearTimeout(drill.timer);
          }
        }
      }
    }
  }
});

test('Scale patterns: when a box and order leave no notes, the old strip goes away and the prompt says why', () => {
  // A triad in the narrowest box has few notes; groups of 4 needs at least four.
  const { drill, state } = setup('scales', { instrument: 'bass' });
  let found = null;
  for (const scale of ['triadMaj', 'triadMin', 'triadDim', 'triadAug']) {
    for (let root = 0; root < 12 && !found; root++) {
      for (let boxStart = 0; boxStart <= 21 && !found; boxStart++) {
        Object.assign(drill.o, { scale, root, shape: 'box', boxStart, boxSpan: 4, seq: 'groups4' });
        drill.compute();
        if (!drill.seq.length) found = { scale, root, boxStart };
      }
    }
  }
  assert.ok(found, 'such a box exists on the bass');
  state.strip = [{ text: 'old' }];
  drill.startPass();
  assert.equal(state.main, 'Hmm');
  assert.equal(state.strip, null);
  drill.onCell(0, 0);
  drill.onStrip(0);
});

test('Scale patterns: a wrong note is a mistake, and clicking the strip jumps there', () => {
  const { drill, state } = setup('scales', { opts: { root: 9, scale: 'minorPent', shape: 'nps', dir: 'up', seq: 'straight' } });
  drill.compute();
  drill.startPass();
  const t = drill.seq[0];
  drill.onCell(t.s, (t.f + 1) % 25);
  assert.equal(drill.mistakes, 1);
  assert.equal(drill.i, 0);
  drill.onStrip(3);
  assert.equal(drill.i, 3);
  assert.equal(drill.jumped, true);
  assert.deepEqual(plain(state.strip.find(c => c.state === 'cur')).i, 3);
  drill.onStrip(999);
  assert.equal(drill.i, 3);
});

test('Scale patterns: a clean run saves a best time, and a jumped or missed run does not', () => {
  const { drill, FD } = setup('scales', { opts: { dir: 'up', seq: 'straight' } });
  drill.compute();
  const run = () => { drill.startPass(); for (const p of drill.seq) drill.onCell(p.s, p.f); clearTimeout(drill.timer); };
  drill.startPass();
  drill.onStrip(1);
  for (const p of drill.seq.slice(1)) drill.onCell(p.s, p.f);
  clearTimeout(drill.timer);
  assert.equal(FD.store.best(drill.bestKey()), undefined);
  run();
  assert.ok(FD.store.best(drill.bestKey()) != null);
});
