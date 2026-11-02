'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, plain } = require('./helpers/load');

const { FD } = load();
const T = FD.theory;
const mod12 = n => ((n % 12) + 12) % 12;
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pcOf = name => mod12(LETTER[name[0]] + [...name.slice(1)].reduce((a, c) => a + (c === '#' ? 1 : -1), 0));

// Written out here rather than read from the app, so a typo in the app's table shows up.
const SCALE_STEPS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  majorPent: [0, 2, 4, 7, 9],
  minorPent: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  triadMaj: [0, 4, 7],
  triadMin: [0, 3, 7],
  triadDim: [0, 3, 6],
  triadAug: [0, 4, 8],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  halfDim7: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
};
const SCALE_IDS = Object.keys(SCALE_STEPS);
const KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function eachInstrument(fn) {
  for (const id of ['guitar', 'bass']) {
    T.setInstrument(id);
    try { fn(id); } finally { T.setInstrument('guitar'); }
  }
}

test('the scale table has every scale the test knows about', () => {
  assert.deepEqual(Object.keys(T.SCALES).sort(), [...SCALE_IDS].sort());
});

test('every scale in every key has the right pitch classes', () => {
  for (const id of SCALE_IDS) {
    for (const root of KEYS) {
      const info = T.scaleInfo(root, id);
      assert.deepEqual(plain(info.pcs), SCALE_STEPS[id].map(s => mod12(root + s)), `${id} in ${root}`);
      assert.equal(info.set.size, SCALE_STEPS[id].length, `${id} in ${root}`);
    }
  }
});

test('every scale tone is spelled as its own pitch, with at most a double accidental', () => {
  for (const id of SCALE_IDS) {
    for (const root of KEYS) {
      const info = T.scaleInfo(root, id);
      for (const p of info.pcs) {
        const nm = info.names.get(p);
        assert.equal(pcOf(nm), p, `${id} in ${root}: ${nm}`);
        assert.match(nm, /^[A-G](#{1,2}|b{1,2})?$/, `${id} in ${root}: ${nm}`);
      }
    }
  }
});

test('seven-note scales use each letter exactly once', () => {
  for (const id of SCALE_IDS.filter(s => SCALE_STEPS[s].length === 7)) {
    for (const root of KEYS) {
      const info = T.scaleInfo(root, id);
      const letters = info.pcs.map(p => info.names.get(p)[0]);
      assert.equal(new Set(letters).size, 7, `${id} in ${root}: ${letters.join(' ')}`);
    }
  }
});

test('well-known scales are spelled the way a musician writes them', () => {
  const spelled = (root, id) => { const i = T.scaleInfo(root, id); return i.pcs.map(p => i.names.get(p)).join(' '); };
  assert.equal(spelled(0, 'major'), 'C D E F G A B');
  assert.equal(spelled(6, 'major'), 'F# G# A# B C# D# E#');
  assert.equal(spelled(1, 'major'), 'Db Eb F Gb Ab Bb C');
  assert.equal(spelled(3, 'minor'), 'Eb F Gb Ab Bb Cb Db');
  assert.equal(spelled(8, 'harmonicMinor'), 'G# A# B C# D# E F##');
  assert.equal(spelled(9, 'blues'), 'A C D Eb E G');
  assert.equal(spelled(9, 'minorPent'), 'A C D E G');
  assert.equal(spelled(0, 'dim7'), 'C Eb Gb Bbb');
  assert.equal(spelled(0, 'triadAug'), 'C E G#');
});

test('scale degrees are labelled from the major scale', () => {
  const degs = (root, id) => { const i = T.scaleInfo(root, id); return i.pcs.map(p => i.degs.get(p)).join(' '); };
  assert.equal(degs(0, 'major'), 'R 2 3 4 5 6 7');
  assert.equal(degs(9, 'blues'), 'R ♭3 4 ♭5 5 ♭7');
  assert.equal(degs(0, 'locrian'), 'R ♭2 ♭3 4 ♭5 ♭6 ♭7');
  assert.equal(degs(0, 'dim7'), 'R ♭3 ♭5 ♭♭7');
  assert.equal(degs(0, 'lydian'), 'R 2 3 ♯4 5 6 7');
});

test('titles and root options', () => {
  assert.equal(T.scaleInfo(9, 'minorPent').title, 'A minor pentatonic');
  assert.equal(T.scaleInfo(0, 'major').title, 'C major');
  assert.equal(T.scaleInfo(0, 'triadMaj').title, 'C major triad');
  assert.equal(T.scaleInfo(3, 'min7').title, 'E♭m7 arpeggio');
  assert.deepEqual(plain(T.rootOptions('major')).map(o => o.label),
    ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']);
  assert.deepEqual(plain(T.rootOptions('minor')).map(o => o.label),
    ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B']);
});

test('tunings are standard for guitar and bass, highest string first', () => {
  T.setInstrument('guitar');
  assert.deepEqual(plain(T.TUNING), [64, 59, 55, 50, 45, 40]);
  assert.equal(T.count(), 6);
  assert.equal(T.low(), 5);
  assert.deepEqual(plain(T.STRING_NAMES), ['high E', 'B', 'G', 'D', 'A', 'low E']);
  assert.equal(T.midiAt(5, 5), 45, 'low E fret 5 is the open A string');
  T.setInstrument('bass');
  assert.deepEqual(plain(T.TUNING), [43, 38, 33, 28]);
  assert.equal(T.count(), 4);
  assert.equal(T.low(), 3);
  assert.deepEqual(plain(T.STRING_NAMES), ['G', 'D', 'A', 'E']);
  assert.equal(T.STRING_WIDTHS.length, 4);
  assert.deepEqual(plain(T.allStrings()), [true, true, true, true]);
  T.setInstrument('nonsense');
  assert.equal(T.instrument.id, 'guitar', 'an unknown instrument falls back to guitar');
});

test('notes-per-string shapes stay on the board and in the scale, on both instruments', () => {
  eachInstrument(inst => {
    for (const id of SCALE_IDS) {
      for (const root of KEYS) {
        for (const maxFret of [24, 12]) {
          const set = new Set(SCALE_STEPS[id].map(s => mod12(root + s)));
          const positions = T.npsPositions(root, id, maxFret);
          if (maxFret === 24) assert.ok(positions.length > 0, `${inst} ${id} in ${root} has no shapes`);
          for (const pos of positions) {
            const where = `${inst} ${id} in ${root} from fret ${pos.f0}`;
            assert.ok(pos.minF >= 0, where);
            assert.ok(pos.maxF <= maxFret, where);
            assert.equal(pos.pattern.length, T.count() * T.notesPerString(T.SCALES[id]), where);
            pos.pattern.forEach((c, i) => {
              assert.equal(c.midi, T.midiAt(c.s, c.f), where);
              assert.ok(c.f >= 0 && c.f <= maxFret, where);
              assert.ok(set.has(mod12(c.midi)), where);
              if (i) assert.ok(c.midi > pos.pattern[i - 1].midi, `${where}: not ascending`);
            });
          }
        }
      }
    }
  });
});

test('a shape that would need a fret below the nut is refused', () => {
  // Start on the open low E, then keep climbing: any string change below its open note must give null, not a negative fret.
  eachInstrument(() => {
    for (const id of SCALE_IDS) {
      for (const root of KEYS) {
        for (let f0 = 0; f0 < 12; f0++) {
          const p = T.npsPattern(root, id, f0);
          if (p) assert.ok(p.every(c => c.f >= 0), `${id} in ${root} from fret ${f0}`);
        }
      }
    }
  });
});

test('fret boxes stay inside the requested frets and hold no duplicate pitches', () => {
  eachInstrument(inst => {
    for (const id of SCALE_IDS) {
      for (const root of KEYS) {
        for (const [from, span] of [[0, 4], [5, 4], [12, 5], [19, 6], [21, 4], [24, 1], [7, 1]]) {
          const set = new Set(SCALE_STEPS[id].map(s => mod12(root + s)));
          const cells = T.boxPattern(root, id, from, span);
          const where = `${inst} ${id} in ${root}, box ${from}+${span}`;
          cells.forEach((c, i) => {
            assert.ok(c.f >= from && c.f < from + span && c.f <= 24, where);
            assert.ok(set.has(mod12(c.midi)), where);
            if (i) assert.ok(c.midi > cells[i - 1].midi, `${where}: not strictly ascending`);
          });
        }
      }
    }
  });
});

test('a pitch reachable on two strings in a box keeps the thicker string', () => {
  T.setInstrument('guitar');
  const cells = T.boxPattern(0, 'major', 0, 6); // Open B (string 1) is also low-G-string fret 4.
  const b = cells.find(c => c.midi === 59);
  assert.equal(b.s, 2);
  assert.equal(b.f, 4);
});

test('play order follows direction and shape', () => {
  const pattern = [1, 2, 3, 4, 5].map(midi => ({ s: 0, f: midi, midi }));
  const order = (dir, seq) => plain(T.orderSequence(pattern, dir, seq)).map(p => p.midi);
  assert.deepEqual(order('up', 'straight'), [1, 2, 3, 4, 5]);
  assert.deepEqual(order('down', 'straight'), [5, 4, 3, 2, 1]);
  assert.deepEqual(order('updown', 'straight'), [1, 2, 3, 4, 5, 4, 3, 2, 1], 'the top note is not played twice');
  assert.deepEqual(order('up', 'thirds'), [1, 3, 2, 4, 3, 5]);
  assert.deepEqual(order('up', 'groups3'), [1, 2, 3, 2, 3, 4, 3, 4, 5]);
  assert.deepEqual(order('up', 'groups4'), [1, 2, 3, 4, 2, 3, 4, 5]);
  assert.deepEqual(order('down', 'groups4'), [5, 4, 3, 2, 4, 3, 2, 1]);
});

test('note names and pretty printing', () => {
  assert.equal(T.name(1, 'sharp'), 'C#');
  assert.equal(T.name(1, 'flat'), 'Db');
  assert.equal(T.name(13, 'flat'), 'Db', 'pitch classes wrap');
  assert.equal(T.name(-1, 'sharp'), 'B');
  assert.equal(T.pretty('Bb'), 'B♭', 'the letter B is left alone');
  assert.equal(T.pretty('F##'), 'F♯♯');
  assert.equal(T.pretty('Bbb'), 'B♭♭');
  assert.equal(T.pretty(''), '');
  assert.ok(T.isNatural(60));
  assert.ok(!T.isNatural(61));
  assert.equal(T.promptSpelling('flat'), 'flat');
  assert.equal(T.promptSpelling('sharp'), 'sharp');
  assert.ok(['sharp', 'flat'].includes(T.promptSpelling('mixed')));
});

test('octave numbers follow the written note, not the sounding one', () => {
  assert.equal(T.octaveOf(60, 'C'), 4);
  assert.equal(T.octaveOf(60, 'B#'), 3);
  assert.equal(T.octaveOf(59, 'Cb'), 4);
  assert.equal(T.octaveOf(40, 'E'), 2);
});

test('parseNote reads names and octaves', () => {
  assert.deepEqual(plain(T.parseNote('C')), { pc: 0, midi: null, name: 'C' });
  assert.deepEqual(plain(T.parseNote('f#')), { pc: 6, midi: null, name: 'F#' });
  assert.deepEqual(plain(T.parseNote('B♭')), { pc: 10, midi: null, name: 'Bb' });
  assert.deepEqual(plain(T.parseNote('C4')), { pc: 0, midi: 60, name: 'C' });
  assert.deepEqual(plain(T.parseNote('Cb4')), { pc: 11, midi: 59, name: 'Cb' });
  assert.deepEqual(plain(T.parseNote('B#3')), { pc: 0, midi: 60, name: 'B#' });
  assert.equal(T.parseNote('H'), null);
  assert.equal(T.parseNote('C###'), null);
  assert.equal(T.parseNote(''), null);
});

test('parseSequence splits on spaces, commas, bars and dashes, and names the token it cannot read', () => {
  assert.deepEqual(plain(T.parseSequence('C, D | E-F  G').notes).map(n => n.name), ['C', 'D', 'E', 'F', 'G']);
  assert.deepEqual(plain(T.parseSequence('').notes), []);
  assert.deepEqual(plain(T.parseSequence(null).notes), []);
  assert.match(T.parseSequence('C H E').error, /"H"/);
});
