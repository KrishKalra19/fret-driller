// Plucked-string synth (Karplus-Strong), rendered once per pitch and cached.
FD.audio = (() => {
  let ctx = null;
  let master = null;
  const cache = new Map();

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.value = FD.store.settings().volume;
    return ctx;
  }

  function render(midi) {
    const sr = ctx.sampleRate;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    // The averaging filter adds half a sample of delay; playbackRate corrects the rest.
    const N = Math.max(2, Math.floor(sr / freq - 0.5));
    const len = Math.floor(sr * 2.4);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const ring = new Float32Array(N);

    let prev = 0, mean = 0;
    for (let i = 0; i < N; i++) {
      prev = prev * 0.45 + (Math.random() * 2 - 1) * 0.55;
      ring[i] = prev;
      mean += prev;
    }
    mean /= N;
    for (let i = 0; i < N; i++) ring[i] -= mean;

    const rho = Math.pow(0.5, 1 / (freq * 0.7));
    let idx = 0, peak = 0;
    for (let i = 0; i < len; i++) {
      const a = ring[idx];
      const b = ring[(idx + 1) % N];
      out[i] = a;
      ring[idx] = rho * 0.5 * (a + b);
      idx = (idx + 1) % N;
      if (Math.abs(a) > peak) peak = Math.abs(a);
    }
    const norm = peak > 0 ? 0.55 / peak : 1;
    const fade = Math.floor(sr * 0.3);
    for (let i = 0; i < len; i++) {
      out[i] *= norm * (i > len - fade ? (len - i) / fade : 1);
    }
    return { buf, rate: (freq * (N + 0.5)) / sr };
  }

  function pluck(midi, when = 0) {
    if (!FD.store.settings().sound || !ensure()) return;
    let v = cache.get(midi);
    if (!v) { v = render(midi); cache.set(midi, v); }
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = v.buf;
    src.playbackRate.value = v.rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(1, t);
    g.gain.setTargetAtTime(0, t + 1.4, 0.18);
    src.connect(g).connect(master);
    src.start(t);
    src.stop(t + 2.4);
  }

  // A soft low thump for wrong answers.
  function buzz() {
    if (!FD.store.settings().sound || !ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.15);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.2);
  }

  function sequence(midis, gap = 0.4) {
    midis.forEach((m, i) => pluck(m, i * gap));
  }

  return { pluck, buzz, sequence };
})();
