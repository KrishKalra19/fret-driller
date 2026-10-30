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

  // Root spellings for keys: flat keys for major-flavoured tracks, sharp-leaning for minor ones.
  const MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const MINOR_KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
  const MAJOR_IV = [0, 2, 4, 5, 7, 9, 11];
  const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const keyName = (pc, minor) => (minor ? MINOR_KEYS : MAJOR_KEYS)[T.mod12(pc)];

  function spell(letterIdx, pc) {
    const L = LETTERS[((letterIdx % 7) + 7) % 7];
    let d = T.mod12(pc - T.LETTER_PC[L]);
    if (d > 6) d -= 12;
    return L + (d > 0 ? '#'.repeat(d) : 'b'.repeat(-d));
  }

  // Roman numeral chord (I7, ii7, bVII, #iv°7) in a key. Lower case means minor unless the suffix says otherwise.
  function parseRoman(tok, keyPc, minor) {
    const t = tok.replace(/♭/g, 'b').replace(/♯/g, '#');
    const m = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/.exec(t);
    if (!m) return null;
    const idx = NUMERALS.indexOf(m[2].toUpperCase());
    const lower = m[2] !== m[2].toUpperCase();
    let q = m[3];
    if (lower && ['', '7', '9', '6'].includes(q)) q = 'm' + q;
    const kName = keyName(keyPc, minor);
    const pc = T.mod12(keyPc + MAJOR_IV[idx] + (m[1] === '#' ? 1 : m[1] === 'b' ? -1 : 0));
    return parse(spell(LETTERS.indexOf(kName[0]) + idx, pc) + q);
  }

  // "C D7:2 G7:2" -> [{ chord, beats }]. ":n" sets a chord's length in beats; otherwise it lasts the default.
  function parseProgression(str, roman) {
    const toks = String(str || '').trim().split(/[\s,|]+/).filter(Boolean);
    const items = [];
    for (const tok of toks) {
      const [sym, dur] = tok.split(':');
      const chord = roman ? parseRoman(sym, roman.key, roman.minor) : parse(sym);
      const beats = dur != null ? Math.max(1, Math.round(Number(dur))) : null;
      if (!chord || (dur != null && !beats)) return { error: `Can't read the chord "${tok}". Try names like C, Am, D7, Fmaj7, Bm7b5, or D7:2 for two beats.` };
      items.push({ chord, beats });
    }
    if (!items.length) return { error: 'Type at least one chord, e.g. C D7 G7 C' };
    return { items };
  }

  // Move every chord in a typed progression by some semitones, keeping each chord's suffix as written.
  function transposeText(str, semis) {
    return String(str || '').trim().split(/[\s,|]+/).filter(Boolean).map(tok => {
      const [sym, dur] = tok.split(':');
      const c = parse(sym);
      if (!c) return tok;
      const suffix = sym.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/^[A-Ga-g](#|b)?/, '');
      return MAJOR_KEYS[T.mod12(c.root + semis)] + suffix + (dur != null ? ':' + dur : '');
    }).join(' ');
  }

  // Plain chord symbols for parsed items (used to show a preset in the text box).
  const toText = items => items.map(it => it.chord.rootName + QUALITIES.find(q => q.id === it.chord.quality).names[0] + (it.beats ? ':' + it.beats : '')).join(' ');

  // A tone by role, falling back sensibly for sus chords and triads.
  function toneFor(chord, role) {
    const by = deg => chord.tones.find(t => t.deg === deg);
    if (role === '3') return (by(3) || by(4) || by(2) || by(1)).iv;
    if (role === '5') return (by(5) || by(1)).iv;
    if (role === '7') return by(7) ? by(7).iv : 10;
    if (role === '6') return 9;
    return 0;
  }

  // Built-in tracks, written in Roman numerals so they play in any key. key is the default tonic.
  const PRESETS = [
    { id: 'myloop', group: 'Favourites', label: 'My loop: I II7 V7 I', roman: 'I II7 V7 I', key: 0, groove: 'rock', bpm: 100 },

    { id: 'blues12', group: 'Blues', label: '12-bar blues', roman: 'I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', key: 9, groove: 'shuffle', bpm: 100 },
    { id: 'quick', group: 'Blues', label: 'Quick-change 12-bar', roman: 'I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', key: 4, groove: 'shuffle', bpm: 112 },
    { id: 'slowblues', group: 'Blues', label: 'Slow 12/8 blues', roman: 'I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', key: 0, groove: 'slow12', bpm: 58 },
    { id: 'minorblues', group: 'Blues', label: 'Minor blues', roman: 'i7 i7 i7 i7 iv7 iv7 i7 i7 bVI7 V7 i7 V7', key: 9, minor: true, groove: 'slow12', bpm: 62 },
    { id: 'blues8', group: 'Blues', label: '8-bar blues', roman: 'I7 V7 IV7 IV7 I7 V7 I7 V7', key: 7, groove: 'shuffle', bpm: 96 },
    { id: 'jazzblues', group: 'Blues', label: 'Jazz blues', roman: 'I7 IV7 I7 v7:2 I7:2 IV7 #iv°7 I7 VI7 ii7 V7 I7:2 VI7:2 ii7:2 V7:2', key: 5, groove: 'swing', bpm: 140 },

    { id: 'twofive', group: 'Jazz', label: 'ii–V–I', roman: 'ii7 V7 Imaj7 Imaj7', key: 0, groove: 'swing', bpm: 130 },
    { id: 'minortwofive', group: 'Jazz', label: 'Minor ii–V–i', roman: 'iiø7 V7 i7 i7', key: 9, minor: true, groove: 'bossa', bpm: 120 },
    { id: 'turnaround', group: 'Jazz', label: 'I–vi–ii–V turnaround', roman: 'Imaj7 VI7 ii7 V7', key: 5, groove: 'swing', bpm: 150 },
    { id: 'cycle', group: 'Jazz', label: 'Diatonic cycle (ii–V–I–IV–viiø–III–vi)', roman: 'ii7 V7 Imaj7 IVmaj7 viiø7 III7 vi7 vi7', key: 7, groove: 'swing', bpm: 120 },
    { id: 'rhythm', group: 'Jazz', label: 'Rhythm changes (A section)', roman: 'Imaj7:2 VI7:2 ii7:2 V7:2 iii7:2 VI7:2 ii7:2 V7:2 Imaj7:2 I7:2 IV:2 iv:2 iii7:2 VI7:2 ii7:2 V7:2', key: 10, groove: 'swing', bpm: 160 },
    { id: 'bossaprog', group: 'Jazz', label: 'Bossa: I–II7–ii–♭II7', roman: 'Imaj7 Imaj7 II7 II7 ii7 bII7 Imaj7 Imaj7', key: 5, groove: 'bossa', bpm: 130 },

    { id: 'axis', group: 'Rock & pop', label: 'I–V–vi–IV', roman: 'I V vi IV', key: 0, groove: 'rock', bpm: 104 },
    { id: 'doowop', group: 'Rock & pop', label: '50s doo-wop I–vi–IV–V', roman: 'I vi IV V', key: 7, groove: 'slow12', bpm: 70 },
    { id: 'andalusian', group: 'Rock & pop', label: 'Andalusian cadence', roman: 'i bVII bVI V7', key: 9, minor: true, groove: 'rock', bpm: 110 },
    { id: 'mixo', group: 'Rock & pop', label: 'Mixolydian I–♭VII–IV', roman: 'I bVII IV I', key: 2, groove: 'rock', bpm: 120 },
    { id: 'ballad', group: 'Rock & pop', label: 'Power ballad vi–IV–I–V', roman: 'vi IV I V', key: 0, groove: 'halftime', bpm: 72 },
    { id: 'punk', group: 'Rock & pop', label: 'Punk three-chord', roman: 'I IV V IV', key: 4, groove: 'punk', bpm: 180 },
    { id: 'reggae', group: 'Rock & pop', label: 'Reggae I–IV–I–V', roman: 'I IV I V', key: 7, groove: 'reggae', bpm: 76 },
    { id: 'country', group: 'Rock & pop', label: 'Country I–IV–V', roman: 'I I IV IV V V I I', key: 7, groove: 'country', bpm: 120 },
    { id: 'lofi', group: 'Rock & pop', label: 'Lo-fi ii–V–I–vi', roman: 'ii7 V7 Imaj7 vi7', key: 5, groove: 'hiphop', bpm: 80 },
    { id: 'waltz', group: 'Rock & pop', label: 'Waltz I–vi–ii–V', roman: 'I vi ii V', key: 2, groove: 'waltz', bpm: 132 },
  ];

  function presetItems(preset, keyPc) {
    return parseProgression(preset.roman, { key: keyPc, minor: !!preset.minor }).items;
  }

  return { QUALITIES, PRESETS, MAJOR_KEYS, MINOR_KEYS, keyName, parse, parseRoman, parseProgression, transposeText, toText, presetItems, toneFor };
})();
