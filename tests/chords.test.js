'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./helpers/load');

const { FD } = load();
const C = FD.chords;
const mod12 = n => ((n % 12) + 12) % 12;

// Written out here rather than read from the app: id, intervals, tone names on C, and every alias.
// '#5' is left out of aug's aliases: see "Questions for Krish" on the run sheet, "C#5" reads as C♯ plus an unknown 5.
const QUALITIES = {
  maj:  { steps: [0, 4, 7],          onC: 'C E G',          aliases: ['', 'maj', 'M'] },
  min:  { steps: [0, 3, 7],          onC: 'C Eb G',         aliases: ['m', 'min', '-'] },
  dom7: { steps: [0, 4, 7, 10],      onC: 'C E G Bb',       aliases: ['7', 'dom7'] },
  maj7: { steps: [0, 4, 7, 11],      onC: 'C E G B',        aliases: ['maj7', 'M7', 'Δ', 'Δ7', 'ma7'] },
  min7: { steps: [0, 3, 7, 10],      onC: 'C Eb G Bb',      aliases: ['m7', 'min7', '-7'] },
  m7b5: { steps: [0, 3, 6, 10],      onC: 'C Eb Gb Bb',     aliases: ['m7b5', 'ø', 'ø7', 'min7b5', '-7b5'] },
  dim7: { steps: [0, 3, 6, 9],       onC: 'C Eb Gb Bbb',    aliases: ['dim7', '°7', 'o7'] },
  dim:  { steps: [0, 3, 6],          onC: 'C Eb Gb',        aliases: ['dim', '°', 'o'] },
  aug:  { steps: [0, 4, 8],          onC: 'C E G#',         aliases: ['aug', '+'] },
  sus2: { steps: [0, 2, 7],          onC: 'C D G',          aliases: ['sus2'] },
  sus4: { steps: [0, 5, 7],          onC: 'C F G',          aliases: ['sus4', 'sus'] },
  6:    { steps: [0, 4, 7, 9],       onC: 'C E G A',        aliases: ['6', 'maj6'] },
  m6:   { steps: [0, 3, 7, 9],       onC: 'C Eb G A',       aliases: ['m6', 'min6'] },
  9:    { steps: [0, 4, 7, 10, 14],  onC: 'C E G Bb D',     aliases: ['9', 'dom9'] },
  maj9: { steps: [0, 4, 7, 11, 14],  onC: 'C E G B D',      aliases: ['maj9', 'M9', 'Δ9'] },
  m9:   { steps: [0, 3, 7, 10, 14],  onC: 'C Eb G Bb D',    aliases: ['m9', 'min9', '-9'] },
};

const ROOTS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11, 'E#': 5, 'B#': 0, Fb: 4 };

test('there are 16 qualities and the test knows them all', () => {
  assert.equal(C.QUALITIES.length, 16);
  assert.deepEqual(plain(C.QUALITIES.map(q => q.id)).sort(), Object.keys(QUALITIES).sort());
});

test('every quality, under every alias, on every root, has the right tones', () => {
  for (const [id, q] of Object.entries(QUALITIES)) {
    for (const alias of q.aliases) {
      for (const [root, pc] of Object.entries(ROOTS)) {
        const sym = root + alias;
        const chord = C.parse(sym);
        assert.ok(chord, `${sym} should parse`);
        assert.equal(chord.quality, id, sym);
        assert.equal(chord.root, pc, sym);
        assert.deepEqual([...chord.tones].map(t => t.pc), q.steps.map(s => mod12(pc + s)), sym);
        assert.equal(chord.set.size, new Set(q.steps.map(s => mod12(s))).size, sym);
      }
    }
  }
});

test('tones are spelled on the right letters', () => {
  for (const [id, q] of Object.entries(QUALITIES)) {
    assert.equal(C.parse('C' + q.aliases[0]).tones.map(t => t.name).join(' '), q.onC, id);
  }
  const names = sym => C.parse(sym).tones.map(t => t.name).join(' ');
  assert.equal(names('F#m7'), 'F# A C# E');
  assert.equal(names('Bbmaj7'), 'Bb D F A');
  assert.equal(names('Ebm7b5'), 'Eb Gb Bbb Db');
  assert.equal(names('G#dim7'), 'G# B D F');
  assert.equal(names('Cb'), 'Cb Eb Gb');
});

test('tone labels name the degree and its alteration', () => {
  const labels = sym => C.parse(sym).tones.map(t => t.label).join(' ');
  assert.equal(labels('C7'), 'R 3 5 ♭7');
  assert.equal(labels('Cmaj7'), 'R 3 5 7');
  assert.equal(labels('Cm7b5'), 'R ♭3 ♭5 ♭7');
  assert.equal(labels('Cdim7'), 'R ♭3 ♭5 ♭♭7');
  assert.equal(labels('C+'), 'R 3 ♯5');
  assert.equal(labels('Csus4'), 'R 4 5');
  assert.equal(labels('C9'), 'R 3 5 ♭7 9');
});

test('symbols, flats, sharps and lower-case roots', () => {
  assert.equal(C.parse('F#m7').symbol, 'F♯m7');
  assert.equal(C.parse('Bb7').symbol, 'B♭7');
  assert.equal(C.parse('B♭7').symbol, 'B♭7');
  assert.equal(C.parse('F♯').symbol, 'F♯');
  assert.equal(C.parse('am').symbol, 'Am');
  assert.equal(C.parse('bb').symbol, 'B♭', 'lower-case bb is B flat');
  assert.equal(C.parse('Bm7b5').symbol, 'Bm7♭5');
  assert.equal(C.parse('  C  ').symbol, 'C');
});

test('things that are not chords give null', () => {
  for (const bad of ['', '   ', null, undefined, 'H', 'H7', '7', 'Cxyz', 'C13', 'C7#9x', '#', 'C/E']) {
    assert.equal(C.parse(bad), null, String(bad));
  }
});

test('toneFor falls back sensibly on triads and sus chords', () => {
  const iv = (sym, role) => C.toneFor(C.parse(sym), role);
  assert.equal(iv('C', '3'), 4);
  assert.equal(iv('Cm', '3'), 3);
  assert.equal(iv('Csus4', '3'), 5);
  assert.equal(iv('Csus2', '3'), 2);
  assert.equal(iv('Cdim', '5'), 6);
  assert.equal(iv('C7', '7'), 10);
  assert.equal(iv('Cmaj7', '7'), 11);
  assert.equal(iv('C', '7'), 10);
  assert.equal(iv('C', '6'), 9);
  assert.equal(iv('C', 'R'), 0);
});

test('Roman numerals in major keys', () => {
  const sym = (tok, key) => C.parseRoman(tok, key, false).symbol;
  assert.equal(sym('I', 0), 'C');
  assert.equal(sym('ii7', 0), 'Dm7');
  assert.equal(sym('iii', 0), 'Em');
  assert.equal(sym('IV', 0), 'F');
  assert.equal(sym('V7', 0), 'G7');
  assert.equal(sym('vi', 0), 'Am');
  assert.equal(sym('viiø7', 0), 'Bm7♭5');
  assert.equal(sym('Imaj7', 5), 'Fmaj7');
  assert.equal(sym('bVII', 0), 'B♭');
  assert.equal(sym('♭VII', 0), 'B♭');
  assert.equal(sym('bII7', 5), 'G♭7');
  assert.equal(sym('#iv°7', 0), 'F♯°7');
  assert.equal(sym('V7', 1), 'A♭7');
  assert.equal(sym('III7', 6), 'A♯7');
});

test('lower-case numerals mean minor unless the suffix says otherwise', () => {
  const q = tok => C.parseRoman(tok, 0, false).quality;
  assert.equal(q('ii'), 'min');
  assert.equal(q('ii7'), 'min7');
  assert.equal(q('ii9'), 'm9');
  assert.equal(q('ii6'), 'm6');
  assert.equal(q('iiø7'), 'm7b5');
  assert.equal(q('vii°7'), 'dim7');
  assert.equal(q('II'), 'maj');
  assert.equal(q('II7'), 'dom7');
});

test('Roman numerals in minor keys count from the minor tonic, with sharp-leaning names', () => {
  const sym = (tok, key) => C.parseRoman(tok, key, true).symbol;
  assert.equal(sym('i7', 9), 'Am7');
  assert.equal(sym('iv7', 9), 'Dm7');
  assert.equal(sym('V7', 9), 'E7');
  assert.equal(sym('bVI7', 9), 'F7');
  assert.equal(sym('bVII', 9), 'G');
  assert.equal(sym('iiø7', 9), 'Bm7♭5');
  assert.equal(sym('i', 1), 'C♯m');
  assert.equal(sym('i', 8), 'G♯m');
});

test('a Roman numeral that is not one gives null', () => {
  for (const bad of ['X', 'IIII', 'C7', 'Ixyz', '']) assert.equal(C.parseRoman(bad, 0, false), null, bad);
});

test('key names use the right spelling for major and minor', () => {
  assert.equal(C.keyName(1, false), 'Db');
  assert.equal(C.keyName(1, true), 'C#');
  assert.equal(C.keyName(8, false), 'Ab');
  assert.equal(C.keyName(8, true), 'G#');
  assert.equal(C.keyName(13, false), 'Db', 'keys wrap');
  assert.equal(C.MAJOR_KEYS.length, 12);
  assert.equal(C.MINOR_KEYS.length, 12);
});

test('progressions: separators and durations', () => {
  const r = C.parseProgression('C, D7:2 | G7:3  C');
  assert.equal(r.error, undefined);
  assert.deepEqual(plain(r.items.map(it => it.chord.symbol)), ['C', 'D7', 'G7', 'C']);
  assert.deepEqual(plain(r.items.map(it => it.beats)), [null, 2, 3, null]);
  assert.equal(C.parseProgression('C:1.6').items[0].beats, 2, 'durations round to whole beats');
  assert.equal(C.parseProgression('C:0').items[0].beats, 1, 'a chord lasts at least a beat');
});

test('progression error messages say what went wrong', () => {
  assert.match(C.parseProgression('').error, /at least one chord/);
  assert.match(C.parseProgression(null).error, /at least one chord/);
  assert.match(C.parseProgression('   ').error, /at least one chord/);
  assert.match(C.parseProgression('C H7 G').error, /"H7"/);
  assert.match(C.parseProgression('C D7:x').error, /"D7:x"/);
  assert.equal(C.parseProgression('C H7').items, undefined);
});

test('progressions in Roman numerals', () => {
  const r = C.parseProgression('ii7 V7:2 Imaj7', { key: 0, minor: false });
  assert.deepEqual(plain(r.items.map(it => it.chord.symbol)), ['Dm7', 'G7', 'Cmaj7']);
  assert.deepEqual(plain(r.items.map(it => it.beats)), [null, 2, null]);
  assert.match(C.parseProgression('ii7 Q', { key: 0, minor: false }).error, /"Q"/);
});

test('toText writes symbols that read back', () => {
  const text = 'C D7:2 Am7 Bbmaj7 F#m7b5 Gdim7 Csus4 E9';
  assert.equal(C.toText(C.parseProgression(text).items), text);
});

test('transposeText moves chords and keeps suffixes, durations and unreadable tokens', () => {
  assert.equal(C.transposeText('C D7:2 Am7', 2), 'D E7:2 Bm7');
  assert.equal(C.transposeText('Bb7', 2), 'C7');
  assert.equal(C.transposeText('C', -1), 'B');
  assert.equal(C.transposeText('F#m7b5', 1), 'Gm7b5');
  assert.equal(C.transposeText('C♯m', 1), 'Dm');
  assert.equal(C.transposeText('C H7', 1), 'Db H7');
  assert.equal(C.transposeText('', 3), '');
});
