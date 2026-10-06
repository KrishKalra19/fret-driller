// Persistent settings, per-drill options and practice stats (localStorage).
FD.store = (() => {
  const KEY = 'fretdriller.v1';
  const DEFAULT_SETTINGS = {
    minFret: 0,
    maxFret: 12,
    strings: [true, true, true, true, true, true],
    spelling: 'sharp',
    leftHanded: false,
    sound: true,
    volume: 0.7,
    advance: 'normal',
  };

  let data = {};
  try { data = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { data = {}; }
  data.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
  data.opts = data.opts || {};
  data.stats = data.stats || {};
  data.best = data.best || {};

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
    }, 150);
  }

  function bucket(mode) {
    return data.stats[mode] || (data.stats[mode] = { cells: {}, notes: {} });
  }

  // n/ok/t/tn are halved once they pass 30 so recent practice counts most; `total` never decays.
  function bump(map, key, ok, ms) {
    const st = map[key] || (map[key] = { n: 0, ok: 0, t: 0, tn: 0, total: 0 });
    st.n++; st.total++;
    if (ok) { st.ok++; st.t += ms; st.tn++; }
    if (st.n > 30) { st.n /= 2; st.ok /= 2; st.t /= 2; st.tn /= 2; }
  }

  return {
    settings: () => data.settings,
    setSetting(k, v) { data.settings[k] = v; save(); },

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

    best: key => data.best[key],
    setBest(key, ms) { data.best[key] = ms; save(); },

    resetStats() { data.stats = {}; data.best = {}; save(); },
    advanceMs: () => ({ fast: 350, normal: 700, slow: 1300 })[data.settings.advance] || 700,
  };
})();
