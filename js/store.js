// Persistent settings, per-drill options and practice stats (localStorage).
FD.store = (() => {
  const KEY = 'fretdriller.v1';
  const DEFAULT_SETTINGS = {
    spelling: 'sharp',
    leftHanded: false,
    sound: true,
    volume: 0.7,
    advance: 'normal',
  };
  // Fret range and strings depend on the instrument, so each instrument keeps its own.
  const PER_INSTRUMENT = ['minFret', 'maxFret', 'strings'];
  const instDefaults = () => ({ minFret: 0, maxFret: 12, strings: FD.theory.allStrings() });

  let data = {};
  try { data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { data = {}; }
  data.settings = data.settings || {};
  data.opts = data.opts || {};
  data.stats = data.stats || {};
  data.best = data.best || {};
  data.inst = data.inst || {};

  // Migrate pre-bass saves, where everything belonged to the guitar.
  if (data.stats.find || data.stats.name) data.stats = { guitar: data.stats };
  if (Object.keys(data.best).some(k => k.startsWith('scale|'))) data.best = { guitar: data.best };
  if (data.settings.strings) {
    data.inst.guitar = Object.assign({}, data.inst.guitar);
    for (const k of PER_INSTRUMENT) { if (k in data.settings) data.inst.guitar[k] = data.settings[k]; delete data.settings[k]; }
  }
  data.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
  data.instrument = data.instrument === 'bass' ? 'bass' : 'guitar';
  FD.theory.setInstrument(data.instrument);

  const id = () => data.instrument;
  const instSettings = () => {
    const cur = Object.assign(instDefaults(), data.inst[id()]);
    if (cur.strings.length !== FD.theory.count()) cur.strings = FD.theory.allStrings();
    return (data.inst[id()] = cur);
  };

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
    }, 150);
  }

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
