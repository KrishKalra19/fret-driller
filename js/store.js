// Persistent settings, per-drill options and practice stats (localStorage).
FD.store = (() => {
  const KEY = 'fretdriller.v1';
  const DEFAULT_SETTINGS = {
    spelling: 'sharp',
    leftHanded: false,
    sound: true,
    volume: 0.7,
    advance: 'normal',
    side: 'jedi',
  };
  // Fret range and strings depend on the instrument, so each instrument keeps its own.
  const PER_INSTRUMENT = ['minFret', 'maxFret', 'strings'];
  const instDefaults = () => ({ minFret: 0, maxFret: 12, strings: FD.theory.allStrings() });

  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const isFret = f => Number.isInteger(f) && f >= 0 && f <= 24;

  let data = {};
  try { data = obj(JSON.parse(localStorage.getItem(KEY))); } catch (e) { data = {}; }
  data.settings = obj(data.settings);
  data.opts = obj(data.opts);
  data.stats = obj(data.stats);
  data.best = obj(data.best);
  data.inst = obj(data.inst);
  data.xp = obj(data.xp);

  // Migrate pre-bass saves, where everything belonged to the guitar.
  if ('find' in data.stats || 'name' in data.stats) data.stats = { guitar: data.stats };
  if (Object.keys(data.best).some(k => k.startsWith('scale|'))) data.best = { guitar: data.best };
  if (PER_INSTRUMENT.some(k => k in data.settings)) {
    data.inst.guitar = Object.assign({}, data.inst.guitar);
    for (const k of PER_INSTRUMENT) { if (k in data.settings) data.inst.guitar[k] = data.settings[k]; delete data.settings[k]; }
  }
  data.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
  if (!Number.isFinite(data.settings.volume)) data.settings.volume = DEFAULT_SETTINGS.volume;
  data.instrument = data.instrument === 'bass' ? 'bass' : 'guitar';
  FD.theory.setInstrument(data.instrument);

  const id = () => data.instrument;

  // Damaged stats are repaired where they stand, so the good entries around them survive.
  function cleanStatMap(map) {
    for (const k of Object.keys(map)) {
      if (!map[k] || typeof map[k] !== 'object') { delete map[k]; continue; }
      for (const f of ['n', 'ok', 't', 'tn', 'total']) if (!Number.isFinite(map[k][f])) map[k][f] = 0;
    }
    return map;
  }
  for (const inst of ['guitar', 'bass']) {
    if (!(inst in data.stats)) continue;
    const modes = (data.stats[inst] = obj(data.stats[inst]));
    for (const m of Object.keys(modes)) {
      modes[m] = obj(modes[m]);
      modes[m].cells = cleanStatMap(obj(modes[m].cells));
      modes[m].notes = cleanStatMap(obj(modes[m].notes));
    }
  }
  for (const inst of ['guitar', 'bass']) if (inst in data.best) data.best[inst] = obj(data.best[inst]);

  // Lifetime correct answers per instrument drive the rank. Older saves get a head start from their stats.
  for (const inst of ['guitar', 'bass']) {
    if (Number.isFinite(data.xp[inst])) continue;
    let est = 0;
    for (const mode of Object.values(data.stats[inst] || {})) {
      for (const st of Object.values(mode.notes || {})) est += Math.round(st.total * (st.n ? st.ok / st.n : 0));
    }
    data.xp[inst] = est;
  }
  const instSettings = () => {
    const cur = Object.assign(instDefaults(), obj(data.inst[id()]));
    if (!Array.isArray(cur.strings) || cur.strings.length !== FD.theory.count()) cur.strings = FD.theory.allStrings();
    if (!isFret(cur.minFret) || !isFret(cur.maxFret) || cur.minFret > cur.maxFret) { cur.minFret = 0; cur.maxFret = 12; }
    return (data.inst[id()] = cur);
  };

  let saveTimer = null;
  function write() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(write, 150);
  }
  // A save still waiting when the page closes would otherwise be lost.
  window.addEventListener('pagehide', () => { if (saveTimer) write(); });

  function bucket(mode) {
    const mine = data.stats[id()] || (data.stats[id()] = {});
    return mine[mode] || (mine[mode] = { cells: {}, notes: {} });
  }

  // n/ok/t/tn are halved once they pass 30 so recent practice counts most; `total` never decays.
  function bump(map, key, ok, ms) {
    const st = map[key] || (map[key] = { n: 0, ok: 0, t: 0, tn: 0, total: 0 });
    st.n++; st.total++;
    if (ok) { st.ok++; st.t += ms; st.tn++; }
    if (st.n > 30) { st.n /= 2; st.ok /= 2; st.t /= 2; st.tn /= 2; }
  }

  return {
    settings: () => Object.assign({}, data.settings, instSettings()),
    setSetting(k, v) {
      if (PER_INSTRUMENT.includes(k)) instSettings()[k] = v; else data.settings[k] = v;
      save();
    },

    instrument: id,
    xp: () => data.xp[id()] || 0,
    addXp() { data.xp[id()] = (data.xp[id()] || 0) + 1; save(); return data.xp[id()]; },
    setInstrument(v) { data.instrument = v; FD.theory.setInstrument(v); save(); },

    opts(id, defaults) {
      data.opts[id] = Object.assign({}, defaults, data.opts[id]);
      return data.opts[id];
    },
    saveOpts: save,

    record(mode, { s, f, pc, ok, ms }) {
      const b = bucket(mode);
      if (s != null) bump(b.cells, s + ',' + f, ok, ms);
      bump(b.notes, pc, ok, ms);
      save();
    },
    cellStat: (mode, s, f) => bucket(mode).cells[s + ',' + f],
    noteStat: (mode, p) => bucket(mode).notes[p],

    // How often something should come up: unseen and weak/slow spots come up more.
    weight(st) {
      if (!st || !st.n) return 3;
      const acc = (st.ok + 1) / (st.n + 2);
      const avg = st.tn ? st.t / st.tn : 5000;
      return 1 + 6 * (1 - acc) + Math.min(3, avg / 2000);
    },

    best: key => (data.best[id()] || {})[key],
    setBest(key, ms) { (data.best[id()] || (data.best[id()] = {}))[key] = ms; save(); },

    resetStats() { data.stats[id()] = {}; data.best[id()] = {}; save(); },
    advanceMs: () => ({ fast: 350, normal: 700, slow: 1300 })[data.settings.advance] || 700,
  };
})();
