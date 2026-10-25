// Chord symbols: parsing ("F#m7", "Bb7", "Cmaj7"), spelling chord tones, and progressions.
FD.chords = (() => {
  const T = FD.theory;
  const LETTERS = 'CDEFGAB';

  // Each tone: semitones above the root and its degree number (3 = third, 9 = ninth...).
  const QUALITIES = [
    { id: 'maj',   sym: '',     names: ['', 'maj', 'M'],                       tones: [[0, 1], [4, 3], [7, 5]] },
    { id: 'min',   sym: 'm',    names: ['m', 'min', '-'],                      tones: [[0, 1], [3, 3], [7, 5]] },
    { id: 'dom7',  sym: '7',    names: ['7', 'dom7'],                          tones: [[0, 1], [4, 3], [7, 5], [10, 7]] },
    { id: 'maj7',  sym: 'maj7', names: ['maj7', 'M7', 'Δ', 'Δ7', 'ma7'],         tones: [[0, 1], [4, 3], [7, 5], [11, 7]] },
    { id: 'min7',  sym: 'm7',   names: ['m7', 'min7', '-7'],                   tones: [[0, 1], [3, 3], [7, 5], [10, 7]] },
    { id: 'm7b5',  sym: 'm7♭5', names: ['m7b5', 'ø', 'ø7', 'min7b5', '-7b5'],  tones: [[0, 1], [3, 3], [6, 5], [10, 7]] },
    { id: 'dim7',  sym: '°7',   names: ['dim7', '°7', 'o7'],                   tones: [[0, 1], [3, 3], [6, 5], [9, 7]] },
    { id: 'dim',   sym: '°',    names: ['dim', '°', 'o'],                      tones: [[0, 1], [3, 3], [6, 5]] },
    { id: 'aug',   sym: '+',    names: ['aug', '+', '#5'],                     tones: [[0, 1], [4, 3], [8, 5]] },
    { id: 'sus2',  sym: 'sus2', names: ['sus2'],                               tones: [[0, 1], [2, 2], [7, 5]] },
    { id: 'sus4',  sym: 'sus4', names: ['sus4', 'sus'],                        tones: [[0, 1], [5, 4], [7, 5]] },
    { id: '6',     sym: '6',    names: ['6', 'maj6'],                          tones: [[0, 1], [4, 3], [7, 5], [9, 6]] },
    { id: 'm6',    sym: 'm6',   names: ['m6', 'min6'],                         tones: [[0, 1], [3, 3], [7, 5], [9, 6]] },
    { id: '9',     sym: '9',    names: ['9', 'dom9'],                          tones: [[0, 1], [4, 3], [7, 5], [10, 7], [14, 9]] },
    { id: 'maj9',  sym: 'maj9', names: ['maj9', 'M9', 'Δ9'],                   tones: [[0, 1], [4, 3], [7, 5], [11, 7], [14, 9]] },
    { id: 'm9',    sym: 'm9',   names: ['m9', 'min9', '-9'],                   tones: [[0, 1], [3, 3], [7, 5], [10, 7], [14, 9]] },
  ];
  const BY_NAME = new Map();
  for (const q of QUALITIES) for (const n of q.names) BY_NAME.set(n, q);

  // Semitones of each degree in a major scale, used to name the alteration (♭3, ♭5, ♭♭7...).
  const MAJOR_DEG = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 9: 14 };

  // Colour family for each tone, so the fretboard can colour R / 3 / 5 / 7 / extensions.
  const family = deg => (deg === 1 ? 'r' : deg === 3 ? '3' : deg === 5 ? '5' : deg === 7 ? '7' : 'x');

  function parse(sym) {
    const raw = String(sym || '').trim().replace(/♯/g, '#').replace(/♭/g, 'b');
    const m = /^([A-Ga-g])(#|b)?(.*)$/.exec(raw);
    if (!m) return null;
    const letter = m[1].toUpperCase();
    const acc = m[2] || '';
    const q = BY_NAME.get(m[3]);
    if (!q) return null;
    const rootName = letter + acc;
    const root = T.mod12(T.LETTER_PC[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0));
    const li = LETTERS.indexOf(letter);
    const tones = q.tones.map(([iv, deg]) => {
      const p = T.mod12(root + iv);
      const L = LETTERS[(li + deg - 1) % 7];
      let d = T.mod12(p - T.LETTER_PC[L]);
      if (d > 6) d -= 12;
      const alt = iv - MAJOR_DEG[deg];
      return {
        pc: p, iv, deg,
        name: L + (d > 0 ? '#'.repeat(d) : 'b'.repeat(-d)),
        label: deg === 1 ? 'R' : (alt > 0 ? '♯'.repeat(alt) : '♭'.repeat(-alt)) + deg,
        family: family(deg),
      };
    });
    const byPc = new Map(tones.map(t => [t.pc, t]));
    return { symbol: T.pretty(rootName) + q.sym, root, rootName, quality: q.id, tones, byPc, set: new Set(byPc.keys()) };
  }

  function parseProgression(str) {
    const toks = String(str || '').trim().split(/[\s,|]+/).filter(Boolean);
    const chords = [];
    for (const tok of toks) {
      const c = parse(tok);
      if (!c) return { error: `Can't read the chord "${tok}". Try names like C, Am, D7, Fmaj7, Bm7b5.` };
      chords.push(c);
    }
    if (!chords.length) return { error: 'Type at least one chord, e.g. C D7 G7 C' };
    return { chords };
  }

  // A tone by role, falling back sensibly for sus chords and triads.
  function toneFor(chord, role) {
    const by = deg => chord.tones.find(t => t.deg === deg);
    if (role === '3') return (by(3) || by(4) || by(2) || by(1)).iv;
    if (role === '5') return (by(5) || by(1)).iv;
    if (role === '7') return by(7) ? by(7).iv : 10;
    if (role === '6') return 9;
    return 0;
  }

  const PRESETS = [
    { label: 'My loop: C D7 G7 C', prog: 'C D7 G7 C' },
    { label: '12-bar blues in A', prog: 'A7 A7 A7 A7 D7 D7 A7 A7 E7 D7 A7 E7' },
    { label: 'Jazz blues in F', prog: 'F7 Bb7 F7 F7 Bb7 Bb7 F7 D7 Gm7 C7 F7 C7' },
    { label: 'ii–V–I in C', prog: 'Dm7 G7 Cmaj7 Cmaj7' },
    { label: 'Minor ii–V–i in A', prog: 'Bm7b5 E7 Am7 Am7' },
    { label: 'I–vi–IV–V in G', prog: 'G Em C D' },
    { label: 'I–V–vi–IV in C', prog: 'C G Am F' },
    { label: 'Minor vamp: Am7 D7', prog: 'Am7 D7' },
  ];

  return { QUALITIES, PRESETS, parse, parseProgression, toneFor };
})();
