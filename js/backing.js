// Backing band: synthesized drums, bass and keys on a lookahead Web Audio scheduler.
// The scheduler queues "beat" events with their audio timestamps; the jam page drains them
// against ctx.currentTime so the screen changes exactly when you hear the downbeat.
FD.backing = (() => {
  const C = FD.chords;

  // 16 steps per 4/4 bar. Drum hits are [step, velocity]; bass is [step, role]; comp is [step, length in steps].
  // Roles: R root, 3 third, 5 fifth, 6 sixth, 7 seventh, 8 octave, A approach (a half step into the next chord's root).
  const eighths = v => [0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => [s, i % 2 ? v * 0.6 : v]);
  const GROOVES = {
    rock: {
      label: 'Rock', swing: 0,
      kick: [[0, 1], [8, 1], [10, 0.7]], snare: [[4, 1], [12, 1]], hat: eighths(0.8),
      bass: [[0, 'R'], [4, 'R'], [8, 'R'], [10, 'R'], [12, '5'], [14, 'R']],
      comp: [[0, 7], [8, 7]],
    },
    swing: {
      label: 'Swing', swing: 0.67,
      kick: [[0, 0.3], [4, 0.25], [8, 0.3], [12, 0.25]], snare: [[12, 0.25]], hat: [[4, 0.5], [12, 0.5]],
      ride: [[0, 0.9], [4, 0.8], [6, 0.55], [8, 0.9], [12, 0.8], [14, 0.55]],
      bass: [[0, 'R'], [4, '3'], [8, '5'], [12, 'A']],
      comp: [[0, 2], [6, 3]],
    },
    shuffle: {
      label: 'Shuffle', swing: 0.67,
      kick: [[0, 1], [8, 1]], snare: [[4, 1], [12, 1]], hat: eighths(0.75),
      bass: [[0, 'R'], [2, '3'], [4, '5'], [6, '6'], [8, '7'], [10, '6'], [12, '5'], [14, '3']],
      comp: [[4, 2], [12, 2]],
    },
    funk: {
      label: 'Funk', swing: 0,
      kick: [[0, 1], [6, 0.8], [10, 0.9]], snare: [[4, 1], [12, 1], [7, 0.22], [15, 0.22]],
      hat: Array.from({ length: 16 }, (_, s) => [s, s % 2 ? 0.35 : s % 4 ? 0.6 : 0.8]),
      bass: [[0, 'R'], [3, '8'], [6, 'R'], [8, '7'], [10, 'R'], [11, '8'], [14, '5']],
      comp: [[2, 1], [6, 1], [10, 1], [13, 1]],
    },
    bossa: {
      label: 'Bossa nova', swing: 0,
      kick: [[0, 0.6], [6, 0.45], [8, 0.6], [14, 0.45]], rim: [[0, 0.7], [3, 0.7], [6, 0.7], [10, 0.7], [12, 0.7]],
      hat: eighths(0.4),
      bass: [[0, 'R'], [6, '5'], [8, 'R'], [14, '5']],
      comp: [[0, 3], [6, 2], [10, 3], [13, 2]],
    },
  };

  let ac = null, master = null, bus = null, parts = null, noise = null;
  let timer = null, playing = false;
  let cfg = { bpm: 100, barsPerChord: 1, chords: [], groove: 'rock', countIn: true, vol: { drums: 0.8, bass: 0.8, chords: 0.6 } };
  let nextTime = 0, step = 0, bar = 0;
  const queue = [];

  const beatDur = () => 60 / cfg.bpm;

  function noiseBuffer() {
    const len = ac.sampleRate;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function env(g, t, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  }

  function noiseHit(t, v, { hp = 0, bp = 0, decay = 0.1, out }) {
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    let node = src;
    if (hp) { const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    if (bp) { const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = 0.8; node.connect(f); node = f; }
    const g = ac.createGain();
    env(g, t, v, decay);
    node.connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.02);
  }

  function tone(t, { type = 'sine', f0, f1, v, decay, out }) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + decay * 0.4);
    const g = ac.createGain();
    env(g, t, v, decay);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + decay + 0.02);
  }

  const kick = (t, v) => tone(t, { f0: 140, f1: 45, v: 0.95 * v, decay: 0.32, out: parts.drums });
  const snare = (t, v) => {
    noiseHit(t, 0.45 * v, { hp: 1400, decay: 0.16, out: parts.drums });
    tone(t, { type: 'triangle', f0: 200, f1: 150, v: 0.3 * v, decay: 0.08, out: parts.drums });
  };
  const rim = (t, v) => tone(t, { type: 'square', f0: 1700, v: 0.08 * v, decay: 0.03, out: parts.drums });
  const hat = (t, v) => noiseHit(t, 0.18 * v, { hp: 7500, decay: 0.045, out: parts.drums });
  const ride = (t, v) => noiseHit(t, 0.1 * v, { hp: 4500, bp: 7000, decay: 0.32, out: parts.drums });
  const click = (t, accent) => tone(t, { type: 'sine', f0: accent ? 1700 : 1150, v: 0.35, decay: 0.05, out: bus });

  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function bassNote(t, midi, dur, v = 1) {
    const o = ac.createOscillator(), sub = ac.createOscillator();
    o.type = 'sawtooth'; sub.type = 'sine';
    o.frequency.value = sub.frequency.value = mtof(midi);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(380, t + 0.18);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.18 * v, t + Math.min(dur, 0.25));
    g.gain.setTargetAtTime(0.0001, t + dur, 0.03);
    const sg = ac.createGain();
    sg.gain.value = 0.7;
    o.connect(f); sub.connect(sg).connect(f);
    f.connect(g).connect(parts.bass);
    o.start(t); sub.start(t);
    o.stop(t + dur + 0.2); sub.stop(t + dur + 0.2);
  }

  function keys(t, midis, dur) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 2400;
    f.connect(parts.chords);
    for (const m of midis) {
      for (const [type, det, lvl] of [['triangle', 0, 0.11], ['sawtooth', 5, 0.025]]) {
        const o = ac.createOscillator();
        o.type = type;
        o.frequency.value = mtof(m);
        o.detune.value = det;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(lvl, t + 0.012);
        g.gain.exponentialRampToValueAtTime(lvl * 0.55, t + Math.min(dur, 0.35));
        g.gain.setTargetAtTime(0.0001, t + dur, 0.06);
        o.connect(g).connect(f);
        o.start(t);
        o.stop(t + dur + 0.4);
      }
    }
  }

  // Close voicing around middle C; the 5th is dropped from five-note chords.
  function voicing(chord) {
    let tones = chord.tones;
    if (tones.length > 4) tones = tones.filter(x => x.deg !== 5);
    const base = 48 + chord.root;
    return tones.map(x => { let m = base + x.iv; while (m > 67) m -= 12; return m; }).sort((a, b) => a - b);
  }

  const bassRoot = pc => 36 + pc;

  function bassMidi(chord, next, role, lastBar) {
    const r = bassRoot(chord.root);
    if (role === 'A') {
      if (!lastBar) return r + 9;
      const target = bassRoot(next.root);
      const below = target - 1, above = target + 1;
      const pick = Math.abs(below - (r + 7)) <= Math.abs(above - (r + 7)) ? below : above;
      return pick < r - 2 ? pick + 12 : pick;
    }
    if (role === '8') return r + 12;
    if (role === 'R') return r;
    return r + C.toneFor(chord, role);
  }

  function scheduleStep(t, b, s) {
    if (b < 0) {
      if (s % 4 === 0) { click(t, s === 0); queue.push({ t, kind: 'count', beat: s / 4 + 1 }); }
      return;
    }
    const n = cfg.chords.length;
    const span = Math.floor(b / cfg.barsPerChord);
    const chordIdx = span % n;
    const chord = cfg.chords[chordIdx];
    const next = cfg.chords[(span + 1) % n];
    const barInSpan = b % cfg.barsPerChord;
    const lastBar = barInSpan === cfg.barsPerChord - 1;
    if (s % 4 === 0) queue.push({ t, kind: 'beat', bar: b, beat: s / 4, chordIdx, barInSpan });

    const g = GROOVES[cfg.groove] || GROOVES.rock;
    const bd = beatDur(), sd = bd / 4;
    const tt = g.swing && s % 4 === 2 ? t + (g.swing - 0.5) * bd : t;
    const hitAt = list => list.find(x => x[0] === s);
    let h;
    if ((h = hitAt(g.kick || []))) kick(tt, h[1]);
    if ((h = hitAt(g.snare || []))) snare(tt, h[1]);
    if ((h = hitAt(g.rim || []))) rim(tt, h[1]);
    if ((h = hitAt(g.hat || []))) hat(tt, h[1]);
    if ((h = hitAt(g.ride || []))) ride(tt, h[1]);

    const bi = g.bass.findIndex(x => x[0] === s);
    if (bi >= 0) {
      const nextStep = bi + 1 < g.bass.length ? g.bass[bi + 1][0] : 16;
      bassNote(tt, bassMidi(chord, next, g.bass[bi][1], lastBar), (nextStep - s) * sd * 0.92);
    }
    if ((h = hitAt(g.comp))) keys(tt, voicing(chord), h[1] * sd * 0.95);
  }

  function tick() {
    while (nextTime < ac.currentTime + 0.15) {
      scheduleStep(nextTime, bar, step);
      nextTime += beatDur() / 4;
      if (++step === 16) { step = 0; bar++; }
    }
  }

  function applyVolumes() {
    if (!parts) return;
    for (const k of ['drums', 'bass', 'chords']) parts[k].gain.value = cfg.vol[k];
  }

  function configure(next) {
    cfg = { ...cfg, ...next, vol: { ...cfg.vol, ...(next.vol || {}) } };
    applyVolumes();
  }

  function start(next) {
    configure(next || {});
    const a = FD.audio.context();
    if (!a || !cfg.chords.length) return false;
    stop();
    ({ ctx: ac, master } = a);
    if (!noise) noise = noiseBuffer();
    bus = ac.createGain();
    bus.gain.value = 0.9;
    bus.connect(master);
    parts = {};
    for (const k of ['drums', 'bass', 'chords']) { parts[k] = ac.createGain(); parts[k].connect(bus); }
    applyVolumes();
    queue.length = 0;
    step = 0;
    bar = cfg.countIn ? -1 : 0;
    nextTime = ac.currentTime + 0.08;
    playing = true;
    timer = setInterval(tick, 25);
    tick();
    return true;
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    playing = false;
    queue.length = 0;
    if (bus && ac) {
      const old = bus;
      old.gain.setTargetAtTime(0, ac.currentTime, 0.02);
      setTimeout(() => old.disconnect(), 300);
    }
    bus = null;
    parts = null;
  }

  // Events whose time has come, in order.
  function drain() {
    if (!ac) return [];
    const out = [];
    while (queue.length && queue[0].t <= ac.currentTime) out.push(queue.shift());
    return out;
  }

  return { GROOVES, start, stop, configure, drain, isPlaying: () => playing };
})();
