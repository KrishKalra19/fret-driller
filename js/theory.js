// Music theory helpers: note names, tuning, scales and scale-pattern generation.
window.FD = window.FD || {};

FD.theory = (() => {
  const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const LETTERS = 'CDEFGAB';
  const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const MAJOR_IV = [0, 2, 4, 5, 7, 9, 11];

  // String 0 is the highest string (drawn on top, like tab). MIDI numbers, standard tuning.
  const INSTRUMENTS = {
    guitar: {
      id: 'guitar', label: 'Guitar',
      tuning: [64, 59, 55, 50, 45, 40],
      names: ['high E', 'B', 'G', 'D', 'A', 'low E'],
      short: ['e', 'B', 'G', 'D', 'A', 'E'],
      widths: [1.1, 1.4, 1.8, 2.3, 2.8, 3.3],
    },
    bass: {
      id: 'bass', label: 'Bass',
      tuning: [43, 38, 33, 28],
      names: ['G', 'D', 'A', 'E'],
      short: ['G', 'D', 'A', 'E'],
      widths: [2.4, 3.0, 3.7, 4.4],
    },
  };
  let inst = INSTRUMENTS.guitar;
  let TUNING = inst.tuning;
  const setInstrument = id => { inst = INSTRUMENTS[id] || INSTRUMENTS.guitar; TUNING = inst.tuning; };
  const count = () => TUNING.length;
  const low = () => TUNING.length - 1;
  const allStrings = () => TUNING.map(() => true);

  // Root spellings used for key names, depending on whether the scale is major- or minor-flavoured.
  const MAJOR_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const MINOR_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

  const SEVEN = [0, 1, 2, 3, 4, 5, 6];
  const TRIAD = [0, 2, 4];
  const SEVENTH = [0, 2, 4, 6];
  // `letters` = which letter (0 = root letter) each scale tone is spelled on.
  const SCALES = {
    major:         { label: 'Major (Ionian)',          iv: [0, 2, 4, 5, 7, 9, 11],  letters: SEVEN, minor: false },
    minor:         { label: 'Natural minor (Aeolian)', iv: [0, 2, 3, 5, 7, 8, 10],  letters: SEVEN, minor: true },
    majorPent:     { label: 'Major pentatonic',        iv: [0, 2, 4, 7, 9],         letters: [0, 1, 2, 4, 5], minor: false },
    minorPent:     { label: 'Minor pentatonic',        iv: [0, 3, 5, 7, 10],        letters: [0, 2, 3, 4, 6], minor: true },
    blues:         { label: 'Blues',                   iv: [0, 3, 5, 6, 7, 10],     letters: [0, 2, 3, 4, 4, 6], minor: true },
    harmonicMinor: { label: 'Harmonic minor',          iv: [0, 2, 3, 5, 7, 8, 11],  letters: SEVEN, minor: true },
    melodicMinor:  { label: 'Melodic minor',           iv: [0, 2, 3, 5, 7, 9, 11],  letters: SEVEN, minor: true },
    dorian:        { label: 'Dorian',                  iv: [0, 2, 3, 5, 7, 9, 10],  letters: SEVEN, minor: true },
    phrygian:      { label: 'Phrygian',                iv: [0, 1, 3, 5, 7, 8, 10],  letters: SEVEN, minor: true },
    lydian:        { label: 'Lydian',                  iv: [0, 2, 4, 6, 7, 9, 11],  letters: SEVEN, minor: false },
    mixolydian:    { label: 'Mixolydian',              iv: [0, 2, 4, 5, 7, 9, 10],  letters: SEVEN, minor: false },
    locrian:       { label: 'Locrian',                 iv: [0, 1, 3, 5, 6, 8, 10],  letters: SEVEN, minor: true },

    triadMaj:  { label: 'Major triad',             iv: [0, 4, 7],      letters: TRIAD, minor: false, arp: ' major triad' },
    triadMin:  { label: 'Minor triad',             iv: [0, 3, 7],      letters: TRIAD, minor: true,  arp: ' minor triad' },
    triadDim:  { label: 'Diminished triad',        iv: [0, 3, 6],      letters: TRIAD, minor: true,  arp: ' diminished triad' },
    triadAug:  { label: 'Augmented triad',         iv: [0, 4, 8],      letters: TRIAD, minor: false, arp: ' augmented triad' },
    maj7:      { label: 'Major 7 (maj7)',          iv: [0, 4, 7, 11],  letters: SEVENTH, minor: false, arp: 'maj7' },
    min7:      { label: 'Minor 7 (m7)',            iv: [0, 3, 7, 10],  letters: SEVENTH, minor: true,  arp: 'm7' },
    dom7:      { label: 'Dominant 7 (7)',          iv: [0, 4, 7, 10],  letters: SEVENTH, minor: false, arp: '7' },
    halfDim7:  { label: 'Half-diminished (m7♭5)',  iv: [0, 3, 6, 10],  letters: SEVENTH, minor: true,  arp: 'm7♭5' },
    dim7:      { label: 'Diminished 7 (°7)',       iv: [0, 3, 6, 9],   letters: SEVENTH, minor: true,  arp: '°7' },
  };
  for (const sc of Object.values(SCALES)) sc.group = sc.arp ? 'Arpeggios' : 'Scales';

  // Interval names for any chromatic note relative to a root.
  const INTERVALS = ['R', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];

  const mod12 = n => ((n % 12) + 12) % 12;
  const pc = midi => mod12(midi);
  const midiAt = (s, f) => TUNING[s] + f;
  const isNatural = midi => !SHARP[pc(midi)].includes('#');

  function name(p, spelling) {
    return (spelling === 'flat' ? FLAT : SHARP)[mod12(p)];
  }

  // For prompts in "mixed" mode, pick a spelling at random each question.
  function promptSpelling(setting) {
    if (setting === 'mixed') return Math.random() < 0.5 ? 'sharp' : 'flat';
    return setting === 'flat' ? 'flat' : 'sharp';
  }

  function pretty(n) {
    if (!n) return '';
    return n[0] + n.slice(1).replace(/#/g, '♯').replace(/b/g, '♭');
  }

  function accidentalOffset(n) {
    let d = 0;
    for (const ch of n.slice(1)) d += ch === '#' ? 1 : ch === 'b' ? -1 : 0;
    return d;
  }

  // Scientific octave number for a spelled note (B#3 is MIDI 60, Cb4 is MIDI 59).
  function octaveOf(midi, n) {
    return Math.floor((midi - accidentalOffset(n)) / 12) - 1;
  }

  function parseNote(tok) {
    const t = tok.replace(/♯/g, '#').replace(/♭/g, 'b');
    const m = /^([A-Ga-g])(#{1,2}|b{1,2})?(-?\d)?$/.exec(t);
    if (!m) return null;
    const letter = m[1].toUpperCase();
    const acc = m[2] || '';
    const nm = letter + acc;
    const p = mod12(LETTER_PC[letter] + accidentalOffset(nm));
    const midi = m[3] != null ? (Number(m[3]) + 1) * 12 + LETTER_PC[letter] + accidentalOffset(nm) : null;
    return { pc: p, midi, name: nm };
  }

  function parseSequence(str) {
    const toks = String(str || '').trim().split(/[\s,|-]+/).filter(Boolean);
    const notes = [];
    for (const tok of toks) {
      const n = parseNote(tok);
      if (!n) return { error: `Can't read "${tok}". Use names like C, F#, Bb or C5.` };
      notes.push(n);
    }
    return { notes };
  }

  function rootOptions(scaleId) {
    const roots = SCALES[scaleId].minor ? MINOR_ROOTS : MAJOR_ROOTS;
    return roots.map((r, i) => ({ value: i, label: pretty(r) }));
  }

  // Spell every tone of a scale on consecutive letters, plus degree labels (R, 2, b3...).
  function scaleInfo(root, scaleId) {
    const sc = SCALES[scaleId];
    const rootName = (sc.minor ? MINOR_ROOTS : MAJOR_ROOTS)[root];
    const li = LETTERS.indexOf(rootName[0]);
    const pcs = [];
    const names = new Map();
    const degs = new Map();
    sc.iv.forEach((iv, i) => {
      const p = mod12(root + iv);
      const L = LETTERS[(li + sc.letters[i]) % 7];
      let d = mod12(p - LETTER_PC[L]);
      if (d > 6) d -= 12;
      names.set(p, L + (d > 0 ? '#'.repeat(d) : 'b'.repeat(-d)));
      const dn = sc.letters[i];
      const dd = iv - MAJOR_IV[dn];
      degs.set(p, i === 0 ? 'R' : (dd > 0 ? '♯'.repeat(dd) : '♭'.repeat(-dd)) + (dn + 1));
      pcs.push(p);
    });
    const title = sc.arp
      ? pretty(rootName) + sc.arp + (sc.arp.startsWith(' ') ? '' : ' arpeggio')
      : `${pretty(rootName)} ${sc.label.replace(/ \(.*\)/, '').toLowerCase()}`;
    return { sc, pcs, set: new Set(pcs), names, degs, rootName, title };
  }

  const notesPerString = sc => (sc.iv.length <= 6 ? 2 : 3);

  // N-notes-per-string pattern starting on the low E string at fret f0.
  function npsPattern(root, scaleId, f0) {
    const sc = SCALES[scaleId];
    const set = new Set(sc.iv.map(i => mod12(root + i)));
    const n = notesPerString(sc);
    let midi = TUNING[low()] + f0;
    const out = [];
    for (let s = low(); s >= 0; s--) {
      for (let k = 0; k < n; k++) {
        if (out.length) { do { midi++; } while (!set.has(mod12(midi))); }
        const f = midi - TUNING[s];
        if (f < 0) return null;
        out.push({ s, f, midi });
      }
    }
    return out;
  }

  function npsPositions(root, scaleId, maxFret) {
    const sc = SCALES[scaleId];
    const out = [];
    sc.iv.forEach((iv, deg) => {
      const base = mod12(root + iv - TUNING[low()]);
      for (const f0 of [base, base + 12]) {
        const pattern = npsPattern(root, scaleId, f0);
        if (!pattern) continue;
        const frets = pattern.map(p => p.f);
        const maxF = Math.max(...frets);
        if (maxF > maxFret) continue;
        out.push({ deg, f0, pattern, minF: Math.min(...frets), maxF });
      }
    });
    return out.sort((a, b) => a.f0 - b.f0);
  }

  // Every scale tone inside a fret window, ascending; duplicate pitches keep the thicker string.
  function boxPattern(root, scaleId, from, span) {
    const set = new Set(SCALES[scaleId].iv.map(i => mod12(root + i)));
    const cells = [];
    for (let s = 0; s < count(); s++) {
      for (let f = from; f < from + span && f <= 24; f++) {
        const midi = midiAt(s, f);
        if (set.has(pc(midi))) cells.push({ s, f, midi });
      }
    }
    cells.sort((a, b) => a.midi - b.midi || b.s - a.s);
    return cells.filter((c, i) => i === 0 || c.midi !== cells[i - 1].midi);
  }

  function shapeIndices(n, seq) {
    const out = [];
    if (seq === 'thirds') {
      for (let i = 0; i + 2 < n; i++) out.push(i, i + 2);
    } else if (seq === 'groups3' || seq === 'groups4') {
      const k = seq === 'groups3' ? 3 : 4;
      for (let i = 0; i + k <= n; i++) for (let j = 0; j < k; j++) out.push(i + j);
    } else {
      for (let i = 0; i < n; i++) out.push(i);
    }
    return out;
  }

  // Turn an ascending pattern into the order you actually play it.
  function orderSequence(pattern, dir, seq) {
    const up = shapeIndices(pattern.length, seq).map(i => pattern[i]);
    const rev = pattern.slice().reverse();
    const down = shapeIndices(rev.length, seq).map(i => rev[i]);
    if (dir === 'up') return up;
    if (dir === 'down') return down;
    const joined = up.slice();
    down.forEach((p, i) => {
      if (i === 0 && joined.length && joined[joined.length - 1] === p) return;
      joined.push(p);
    });
    return joined;
  }

  return {
    SHARP, FLAT, SCALES, LETTER_PC, INTERVALS, INSTRUMENTS,
    get TUNING() { return TUNING; },
    get STRING_NAMES() { return inst.names; },
    get STRING_SHORT() { return inst.short; },
    get STRING_WIDTHS() { return inst.widths; },
    get instrument() { return inst; },
    setInstrument, count, low, allStrings,
    mod12, pc, midiAt, isNatural, name, promptSpelling, pretty, octaveOf,
    parseNote, parseSequence, rootOptions, scaleInfo, notesPerString,
    npsPattern, npsPositions, boxPattern, orderSequence,
  };
})();
