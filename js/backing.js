// Backing band: synthesized drums, bass and chords on a lookahead Web Audio scheduler.
// A loop is a timeline of chords measured in beats; the jam page supplies one per pass (so the key
// can change between passes). Beat events carry their audio timestamp and the page drains them
// against ctx.currentTime, so the screen changes exactly when you hear the downbeat.
FD.backing = (() => {
  const C = FD.chords;

  // A groove is `beats` per bar split into `sub` steps per beat. Drum hits are [step, velocity];
  // bass is [step, role]; comp is [step, length in steps]. Steps count from the top of the bar.
  // Bass roles: R root, 3/5/6/7 chord tones, 8 octave, W walking line (root, chord tones, then a
  // half-step approach into the next chord on its last beat).
  const eighths = v => [0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => [s, i % 2 ? v * 0.6 : v]);
  const GROOVES = {
    rock: {
      label: 'Rock',
      kick: [[0, 1], [8, 1], [10, 0.7]], snare: [[4, 1], [12, 1]], hat: eighths(0.8),
      bass: [[0, 'R'], [4, 'R'], [8, 'R'], [10, 'R'], [12, '5'], [14, 'R']],
      comp: [[0, 7], [8, 7]],
    },
    swing: {
      label: 'Swing', swing: 0.67,
      kick: [[0, 0.3], [4, 0.25], [8, 0.3], [12, 0.25]], snare: [[12, 0.25]], hat: [[4, 0.5], [12, 0.5]],
      ride: [[0, 0.9], [4, 0.8], [6, 0.55], [8, 0.9], [12, 0.8], [14, 0.55]],
      bass: [[0, 'W'], [4, 'W'], [8, 'W'], [12, 'W']],
      comp: [[0, 2], [6, 3]],
    },
    shuffle: {
      label: 'Shuffle', swing: 0.67,
      kick: [[0, 1], [8, 1]], snare: [[4, 1], [12, 1]], hat: eighths(0.75),
      bass: [[0, 'R'], [2, '3'], [4, '5'], [6, '6'], [8, '7'], [10, '6'], [12, '5'], [14, '3']],
      comp: [[4, 2], [12, 2]],
    },
    slow12: {
      label: 'Slow blues (12/8)', sub: 3,
      kick: [[0, 1], [6, 0.8], [11, 0.35]], snare: [[3, 1], [9, 1]],
      hat: Array.from({ length: 12 }, (_, s) => [s, s % 3 ? 0.4 : 0.75]),
      bass: [[0, 'R'], [3, '3'], [6, '5'], [9, '6']],
      comp: [[0, 3], [3, 3], [6, 3], [9, 3]],
    },
    funk: {
      label: 'Funk',
      kick: [[0, 1], [6, 0.8], [10, 0.9]], snare: [[4, 1], [12, 1], [7, 0.22], [15, 0.22]],
      hat: Array.from({ length: 16 }, (_, s) => [s, s % 2 ? 0.35 : s % 4 ? 0.6 : 0.8]),
      bass: [[0, 'R'], [3, '8'], [6, 'R'], [8, '7'], [10, 'R'], [11, '8'], [14, '5']],
      comp: [[2, 1], [6, 1], [10, 1], [13, 1]], compOnChange: false,
    },
    bossa: {
      label: 'Bossa nova',
      kick: [[0, 0.6], [6, 0.45], [8, 0.6], [14, 0.45]], rim: [[0, 0.7], [3, 0.7], [6, 0.7], [10, 0.7], [12, 0.7]],
      hat: eighths(0.4),
      bass: [[0, 'R'], [6, '5'], [8, 'R'], [14, '5']],
      comp: [[0, 3], [6, 2], [10, 3], [13, 2]],
    },
    reggae: {
      label: 'Reggae one-drop',
      kick: [[8, 1]], rim: [[8, 0.9]], hat: eighths(0.4),
      bass: [[0, 'R'], [3, 'R'], [6, '5'], [10, '3'], [12, 'R'], [14, '5']],
      comp: [[2, 1], [6, 1], [10, 1], [14, 1]], compOnChange: false,
    },
    country: {
      label: 'Country train beat',
      kick: [[0, 1], [8, 1]],
      snare: Array.from({ length: 16 }, (_, s) => [s, s === 4 || s === 12 ? 1 : 0.16]),
      bass: [[0, 'R'], [4, '5'], [8, 'R'], [12, '5']],
      comp: [[2, 1], [6, 1], [10, 1], [14, 1]], compOnChange: false,
    },
    hiphop: {
      label: 'Hip-hop / lo-fi', swing16: 0.6,
      kick: [[0, 1], [7, 0.7], [10, 0.9]], snare: [[4, 1], [12, 1]], hat: [...eighths(0.4), [13, 0.25]],
      bass: [[0, 'R'], [7, 'R'], [10, '5']],
      comp: [[0, 16]],
    },
    halftime: {
      label: 'Half-time ballad',
      kick: [[0, 1], [10, 0.6]], snare: [[8, 1]], hat: eighths(0.45),
      bass: [[0, 'R'], [8, '5'], [14, 'R']],
      comp: [[0, 8], [8, 8]],
    },
    punk: {
      label: 'Punk / metal',
      kick: eighths(1), snare: [[4, 1], [12, 1]], hat: eighths(0.9),
      bass: [0, 2, 4, 6, 8, 10, 12, 14].map(s => [s, 'R']),
      comp: [0, 2, 4, 6, 8, 10, 12, 14].map(s => [s, 2]),
    },
    waltz: {
      label: 'Waltz (3/4)', beats: 3,
      kick: [[0, 0.9]], snare: [[4, 0.22], [8, 0.22]], hat: [[4, 0.5], [8, 0.5]],
      bass: [[0, 'R']],
      comp: [[4, 3], [8, 3]],
    },
  };
  for (const g of Object.values(GROOVES)) { g.beats = g.beats || 4; g.sub = g.sub || 4; }

  const SOUNDS = { keys: 'Keys', epiano: 'Electric piano', organ: 'Organ', guitar: 'Strummed guitar', pad: 'Synth pad' };

  let ac = null, master = null, bus = null, parts = null, noise = null;
  let timer = null, playing = false;
  let cfg = { bpm: 100, groove: 'rock', countIn: true, sound: 'keys', vol: { drums: 0.8, bass: 0.8, chords: 0.6 }, loopTimeline: null };
  let nextTime = 0, sub = 0, beatInLoop = 0, loopIdx = 0, counting = false, countBeat = 0;
  const loops = new Map();
  const queue = [];

  const groove = () => GROOVES[cfg.groove] || GROOVES.rock;
  const beatDur = () => 60 / cfg.bpm;

  // Timeline for loop i: { segs: [{ chord, beats, start }], beats, keyLabel }.
  function loop(i) {
    if (!loops.has(i)) {
      const d = cfg.loopTimeline(i, groove().beats);
      let start = 0;
      d.segs = d.segs.map(s => { const seg = { ...s, start }; start += s.beats; return seg; });
      d.beats = start;
      loops.set(i, d);
    }
    return loops.get(i);
  }

  // ---------------------------------------------------------------- instruments
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

  function bassNote(t, midi, dur) {
    const o = ac.createOscillator(), sub = ac.createOscillator();
    o.type = 'sawtooth'; sub.type = 'sine';
    o.frequency.value = sub.frequency.value = mtof(midi);
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(380, t + 0.18);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.18, t + Math.min(dur, 0.25));
    g.gain.setTargetAtTime(0.0001, t + dur, 0.03);
    const sg = ac.createGain();
    sg.gain.value = 0.7;
    o.connect(f); sub.connect(sg).connect(f);
    f.connect(g).connect(parts.bass);
    o.start(t); sub.start(t);
    o.stop(t + dur + 0.2); sub.stop(t + dur + 0.2);
  }

  // One oscillator voice with an attack/decay/release envelope.
  function voice(t, freq, { type, det = 0, lvl, attack = 0.012, sustain = 0.55, decay = 0.35, dur, release = 0.06, out }) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = det;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(lvl, t + attack);
    if (sustain < 1) g.gain.exponentialRampToValueAtTime(lvl * sustain, t + Math.max(attack + 0.01, Math.min(dur, decay)));
    g.gain.setTargetAtTime(0.0001, t + Math.max(dur, attack), release);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + Math.max(dur, attack) + release * 6);
  }

  function lowpass(freq) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq;
    f.connect(parts.chords);
    return f;
  }

  function comp(t, midis, dur) {
    const sound = cfg.sound;
    if (sound === 'guitar') {
      midis.forEach((m, i) => {
        const p = FD.audio.pluckBuffer(m + 12);
        if (!p) return;
        const at = t + i * 0.014;
        const src = ac.createBufferSource();
        src.buffer = p.buf;
        src.playbackRate.value = p.rate;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.26, at);
        g.gain.setTargetAtTime(0.0001, at + Math.max(dur, 0.12), 0.08);
        src.connect(g).connect(parts.chords);
        src.start(at);
        src.stop(at + Math.max(dur, 0.12) + 0.6);
      });
      return;
    }
    if (sound === 'organ') {
      const out = lowpass(3800);
      for (const m of midis) {
        [[1, 0.06], [2, 0.045], [3, 0.025], [4, 0.02], [6, 0.01]].forEach(([h, lvl]) =>
          voice(t, mtof(m) * h, { type: 'sine', lvl, attack: 0.008, sustain: 1, dur, release: 0.03, out }));
      }
      return;
    }
    if (sound === 'pad') {
      const out = lowpass(1500);
      for (const m of midis) {
        for (const det of [-9, 9]) voice(t, mtof(m), { type: 'sawtooth', det, lvl: 0.03, attack: Math.min(0.25, dur / 3), sustain: 0.85, decay: 0.6, dur, release: 0.35, out });
      }
      return;
    }
    if (sound === 'epiano') {
      const out = lowpass(4200);
      for (const m of midis) {
        voice(t, mtof(m), { type: 'sine', lvl: 0.12, attack: 0.006, sustain: 0.4, decay: 0.9, dur, release: 0.12, out });
        voice(t, mtof(m) * 2, { type: 'sine', lvl: 0.025, attack: 0.004, sustain: 0.2, decay: 0.25, dur, release: 0.08, out });
        voice(t, mtof(m) * 7, { type: 'sine', lvl: 0.012, attack: 0.002, sustain: 0.05, decay: 0.08, dur: Math.min(dur, 0.1), release: 0.04, out });
      }
      return;
    }
    const out = lowpass(2400);
    for (const m of midis) {
      voice(t, mtof(m), { type: 'triangle', lvl: 0.11, dur, out });
      voice(t, mtof(m), { type: 'sawtooth', det: 5, lvl: 0.025, dur, out });
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

  function approach(chord, next) {
    const r = bassRoot(chord.root), target = bassRoot(next.root);
    const pick = Math.abs(target - 1 - (r + 7)) <= Math.abs(target + 1 - (r + 7)) ? target - 1 : target + 1;
    return pick < r - 2 ? pick + 12 : pick;
  }

  function bassMidi(chord, next, role, beatInChord, chordBeats) {
    const r = bassRoot(chord.root);
    if (role === 'W') {
      if (beatInChord === 0) return r;
      if (beatInChord === chordBeats - 1) return approach(chord, next);
      return r + C.toneFor(chord, ['3', '5', '6'][Math.min(beatInChord - 1, 2)]);
    }
    if (role === '8') return r + 12;
    if (role === 'R') return r;
    return r + C.toneFor(chord, role);
  }

  // ---------------------------------------------------------------- scheduler
  function scheduleStep(t) {
    const g = groove();
    if (sub >= g.sub) sub = 0;
    const bd = beatDur(), sd = bd / g.sub;

    if (counting) {
      if (sub === 0) { click(t, countBeat === 0); queue.push({ t, kind: 'count', beat: countBeat + 1, bpb: g.beats }); }
      return;
    }

    let d = loop(loopIdx);
    if (beatInLoop >= d.beats) { beatInLoop = 0; loopIdx++; d = loop(loopIdx); }
    const si = d.segs.findIndex(s => beatInLoop >= s.start && beatInLoop < s.start + s.beats);
    const seg = d.segs[si];
    const chord = seg.chord;
    const next = si + 1 < d.segs.length ? d.segs[si + 1].chord : loop(loopIdx + 1).segs[0].chord;
    const beatInChord = beatInLoop - seg.start;
    const barStep = (beatInLoop % g.beats) * g.sub + sub;

    if (sub === 0) {
      queue.push({
        t, kind: 'beat', loop: loopIdx, si, chord, next, beatInChord, chordBeats: seg.beats,
        beatInLoop, loopBeats: d.beats, bpb: g.beats, keyLabel: d.keyLabel, segs: d.segs,
      });
    }

    let tt = t;
    if (g.sub === 4 && g.swing && barStep % 4 === 2) tt += (g.swing - 0.5) * bd;
    if (g.sub === 4 && g.swing16 && barStep % 2 === 1) tt += (g.swing16 - 0.5) * bd / 2;
    const hitAt = list => (list || []).find(x => x[0] === barStep);
    let h;
    if ((h = hitAt(g.kick))) kick(tt, h[1]);
    if ((h = hitAt(g.snare))) snare(tt, h[1]);
    if ((h = hitAt(g.rim))) rim(tt, h[1]);
    if ((h = hitAt(g.hat))) hat(tt, h[1]);
    if ((h = hitAt(g.ride))) ride(tt, h[1]);

    const bi = g.bass.findIndex(x => x[0] === barStep);
    if (bi >= 0) {
      const barSteps = g.beats * g.sub;
      const nextStep = bi + 1 < g.bass.length ? g.bass[bi + 1][0] : barSteps + g.bass[0][0];
      bassNote(tt, bassMidi(chord, next, g.bass[bi][1], beatInChord, seg.beats), (nextStep - barStep) * sd * 0.92);
    }

    // Comp on the groove's hits, and also on a chord change that falls between them.
    h = hitAt(g.comp);
    if (h) comp(tt, voicing(chord), h[1] * sd * 0.95);
    else if (sub === 0 && beatInChord === 0 && g.compOnChange !== false) comp(tt, voicing(chord), Math.min(seg.beats, 2) * bd * 0.9);
  }

  function advance() {
    const g = groove();
    nextTime += beatDur() / g.sub;
    if (++sub < g.sub) return;
    sub = 0;
    if (counting) {
      if (++countBeat >= g.beats) counting = false;
      return;
    }
    beatInLoop++;
    if (beatInLoop >= loop(loopIdx).beats) {
      beatInLoop = 0;
      loops.delete(loopIdx - 1);
      loopIdx++;
    }
  }

  function tick() {
    while (nextTime < ac.currentTime + 0.15) {
      scheduleStep(nextTime);
      advance();
    }
  }

  function applyVolumes() {
    if (!parts) return;
    for (const k of ['drums', 'bass', 'chords']) parts[k].gain.value = cfg.vol[k];
  }

  function configure(next) {
    const regroove = next.groove && next.groove !== cfg.groove;
    cfg = { ...cfg, ...next, vol: { ...cfg.vol, ...(next.vol || {}) } };
    applyVolumes();
    if (regroove) loops.clear();
  }

  // Forget cached timelines (after the progression, key or bars-per-chord changes).
  function refresh() { loops.clear(); }

  function start(next) {
    configure(next || {});
    const a = FD.audio.context();
    if (!a || !cfg.loopTimeline) return false;
    stop();
    ({ ctx: ac, master } = a);
    if (!noise) noise = noiseBuffer();
    bus = ac.createGain();
    bus.gain.value = 0.9;
    bus.connect(master);
    parts = {};
    for (const k of ['drums', 'bass', 'chords']) { parts[k] = ac.createGain(); parts[k].connect(bus); }
    applyVolumes();
    loops.clear();
    queue.length = 0;
    sub = 0; beatInLoop = 0; loopIdx = 0; countBeat = 0;
    counting = !!cfg.countIn;
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

  return { GROOVES, SOUNDS, start, stop, configure, refresh, drain, isPlaying: () => playing };
})();
