// Jam page: a looping backing band with the current chord's tones lit up on the fretboard.
// Live key changes are "called": a hotkey queues one and it lands at the next section, loop, bar or chord
// (a setting), so whoever is playing along gets a warning. Each call is stored at the (loop, beat) where it
// lands, and every loop's timeline is built from the calls that apply to it.
(() => {
  const T = FD.theory, S = FD.store, UI = FD.ui, A = FD.audio, C = FD.chords, B = FD.backing;
  const DEFAULTS = {
    track: 'p:myloop', key: 0, custom: 'C D7 G7 C', bpm: 100, barsPerChord: 1, groove: 'rock', sound: 'keys', countIn: true,
    cycle: 'off', cycleEvery: 1, landOn: 'section', labels: 'degrees', preview: true, lock: false, lockFrom: 2, lockTo: 6,
    vol: { drums: 0.8, bass: 0.8, chords: 0.6 }, totalSec: 0, saved: [], folds: {},
  };
  const FAMILY_LABEL = { r: 'Root', 3: '3rd', 5: '5th', 7: '7th', x: 'Extension' };
  const CYCLES = [
    { value: 'off', label: 'Off' }, { value: 'fourths', label: 'Around the circle of 4ths' },
    { value: 'whole', label: 'Up a whole step' }, { value: 'half', label: 'Up a half step' }, { value: 'random', label: 'Random key' },
  ];
  const LANDINGS = [
    { value: 'section', label: 'Next section (or loop)' }, { value: 'loop', label: 'Next loop' },
    { value: 'bar', label: 'Next bar' }, { value: 'chord', label: 'Next chord' },
  ];
  const PARTS = [['drums', 'Drums'], ['bass', 'Bass'], ['chords', 'Chords']];
  const PART_KEYS = { Digit1: 'drums', Numpad1: 'drums', Digit2: 'bass', Numpad2: 'bass', Digit3: 'chords', Numpad3: 'chords' };
  // Called key changes: [semitones, switch to the relative key].
  const CALL_KEYS = { KeyW: [2, false], KeyF: [5, false], KeyR: [0, true], BracketRight: [1, false], BracketLeft: [-1, false] };
  const MINOR_Q = new Set(['min', 'min7', 'm6', 'm9', 'm7b5', 'dim', 'dim7']);
  let sessionSec = 0;

  // ---------------------------------------------------------------- call timing (no page needed)
  const cmp = (a, b) => a.loop - b.loop || a.beat - b.beat;
  const secId = s => (s.section ? s.section.i : -1);

  // Where a call made now should land. pos is the first beat the band hasn't scheduled yet; tl is that
  // loop's timeline ({ segs: [{ start, beats, section }], beats }). Never earlier than pos.
  function landing(tl, pos, mode, bpb) {
    const next = { loop: pos.loop + 1, beat: 0 };
    if (!tl) return pos.beat === 0 ? { loop: pos.loop, beat: 0 } : next;
    let starts;
    if (mode === 'loop') starts = [0];
    else if (mode === 'bar') { starts = []; for (let b = 0; b < tl.beats; b += bpb) starts.push(b); }
    else if (mode === 'chord') starts = tl.segs.map(s => s.start);
    else starts = tl.segs.filter((s, i) => i === 0 || secId(s) !== secId(tl.segs[i - 1])).map(s => s.start);
    const b = starts.find(x => x >= pos.beat);
    return b == null ? next : { loop: pos.loop, beat: b };
  }

  // Beats from the one being heard to a landing point. loopBeats(i) is loop i's length.
  function beatsUntil(heard, at, loopBeats) {
    if (cmp(at, heard) <= 0) return 0;
    let n = at.beat - heard.beat;
    for (let l = heard.loop; l < at.loop; l++) n += loopBeats(l);
    return n;
  }

  // Bars while it's more than a bar away, then a beat-by-beat count.
  const untilText = (n, bpb) => (n <= 0 ? 'now' : n > bpb ? `in ${Math.ceil(n / bpb)} bars` : `in ${n} beat${n === 1 ? '' : 's'}`);

  // Cut a timeline's segs to the beats [from, to).
  const clip = (segs, from, to) => segs
    .filter(s => s.start < to && s.start + s.beats > from)
    .map(s => ({ ...s, start: Math.max(s.start, from), beats: Math.min(s.start + s.beats, to) - Math.max(s.start, from) }));

  FD.jamCalls = { cmp, landing, beatsUntil, untilText, clip };

  const fmt = sec => {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s).padStart(2, '0')}`;
  };

  FD.views.jam = {
    mount(el) {
      const o = (this.o = S.opts('jam', DEFAULTS));
      if (o.prog != null) {
        // Saves from before presets had keys: keep a custom loop as custom.
        if (o.prog !== 'C D7 G7 C') { o.track = 'custom'; o.custom = o.prog; }
        delete o.prog;
        S.saveOpts();
      }
      this.clean(o);
      this.el = el;
      const fold = (id, title, body) => `<details class="fold" data-fold="${id}"${o.folds[id] ? ' open' : ''}><summary>${title}</summary>${body}</details>`;
      el.innerHTML = `
        <div class="jam-call" id="jam-call" hidden></div>
        <div class="jam-top">
          <div class="jam-now">
            <div class="jam-section" id="jam-section" hidden></div>
            <div class="jam-label"><span id="jam-state">Ready</span> · <span id="jam-key"></span></div>
            <div class="jam-chord display" id="jam-chord"></div>
            <div class="jam-tones" id="jam-tones"></div>
          </div>
          <div class="jam-side">
            <div class="jam-next">Next <b id="jam-next"></b></div>
            <div class="beats" id="jam-beats"></div>
            <div class="jam-bar" id="jam-bar"></div>
            <div class="jam-time" id="jam-time"></div>
          </div>
        </div>
        <div class="strip jam-prog" id="jam-prog"></div>
        <div class="prompt-sub" id="jam-msg"></div>
        <div class="board-wrap"><svg class="board" id="jam-board" aria-label="Chord tones on the fretboard"></svg></div>
        <div class="ct-legend" id="jam-legend"></div>
        <div class="panel jam-panel">
          <div class="options" id="jam-track"></div>
          <div class="options" id="jam-chords"></div>
          ${fold('keys', 'Key changes', '<div class="options" id="jam-keys"></div>')}
          ${fold('feel', 'Sound &amp; mix', '<div class="options" id="jam-feel"></div>')}
          ${fold('display', 'Fretboard', '<div class="options" id="jam-display"></div>')}
          ${fold('save', 'Save track', '<div class="options save-row" id="jam-save"></div>')}
          ${fold('help', 'Keys &amp; song forms', `<div class="hint">
            <p><kbd>Space</kbd> play / stop · <kbd>↑</kbd> <kbd>↓</kbd> tempo ±5 · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> mute drums / bass / chords · <kbd>V</kbd> big screen</p>
            <p>Called key changes land where <i>Key changes → Calls land on</i> says; press again to stack them:
              <kbd>W</kbd> up a whole step · <kbd>F</kbd> up a fourth · <kbd>R</kbd> relative minor / major ·
              <kbd>]</kbd> <kbd>[</kbd> up / down a half step · <kbd>Esc</kbd> or <kbd>Backspace</kbd> cancels.</p>
            <p>Song form: <code>[Verse] Am F C G [Chorus] F G Am Am [Chorus +2]</code>. Sections play in order, then loop.
              <code>+2</code> or <code>-1</code> moves a section by semitones, and a tag with no chords repeats that section.
              Add <code>:2</code> to a chord for two beats (<code>Gm7:2 C7:2</code>). Click a chord above to preview it while stopped.</p></div>`)}
        </div>`;
      el.querySelectorAll('details.fold').forEach(d => d.addEventListener('toggle', () => { o.folds[d.dataset.fold] = d.open; S.saveOpts(); }));
      this.board = new FD.Fretboard(el.querySelector('#jam-board'));
      this.board.onCell = (s, f) => A.pluck(T.midiAt(s, f));
      el.querySelector('#jam-prog').addEventListener('click', e => {
        const chip = e.target.closest('[data-i]');
        if (!chip || B.isPlaying()) return;
        this.cur = +chip.dataset.i;
        this.render();
      });
      this.cur = 0;
      this.view = null;
      this.calls = [];
      this.mute = { drums: false, bass: false, chords: false };
      this.stage = false;
      this.onFullscreen = () => { if (!document.fullscreenElement && this.stage) this.setStage(false); };
      document.addEventListener('fullscreenchange', this.onFullscreen);
      this.buildControls();
      this.render();
      this.loop();
    },

    unmount() {
      if (this.stage) this.setStage(false);
      if (this.onFullscreen) document.removeEventListener('fullscreenchange', this.onFullscreen);
      B.stop();
      this.counting = false;
      cancelAnimationFrame(this.raf);
      S.saveOpts();
    },

    // Replace anything in a save that would stop the page or the band, and leave the rest as it is.
    clean(o) {
      const isFret = f => Number.isInteger(f) && f >= 0 && f <= 24;
      const vol = o.vol && typeof o.vol === 'object' ? o.vol : {};
      o.vol = {};
      for (const k of Object.keys(DEFAULTS.vol)) o.vol[k] = Number.isFinite(vol[k]) ? Math.max(0, Math.min(1, vol[k])) : DEFAULTS.vol[k];
      if (!Number.isInteger(o.key)) o.key = DEFAULTS.key;
      o.key = T.mod12(o.key);
      if (typeof o.custom !== 'string') o.custom = DEFAULTS.custom;
      o.bpm = Number.isFinite(o.bpm) ? Math.max(40, Math.min(240, o.bpm)) : DEFAULTS.bpm;
      if (![1, 2, 4].includes(o.barsPerChord)) o.barsPerChord = DEFAULTS.barsPerChord;
      if (!B.GROOVES[o.groove]) o.groove = DEFAULTS.groove;
      if (!B.SOUNDS[o.sound]) o.sound = DEFAULTS.sound;
      if (!CYCLES.some(c => c.value === o.cycle)) o.cycle = DEFAULTS.cycle;
      if (![1, 2, 4].includes(o.cycleEvery)) o.cycleEvery = DEFAULTS.cycleEvery;
      if (!LANDINGS.some(l => l.value === o.landOn)) o.landOn = DEFAULTS.landOn;
      if (!o.folds || typeof o.folds !== 'object' || Array.isArray(o.folds)) o.folds = {};
      if (!isFret(o.lockFrom)) o.lockFrom = DEFAULTS.lockFrom;
      if (!isFret(o.lockTo)) o.lockTo = DEFAULTS.lockTo;
      if (!Number.isFinite(o.totalSec)) o.totalSec = 0;
      o.saved = (Array.isArray(o.saved) ? o.saved : []).filter(t => t && typeof t.prog === 'string');
      o.saved.forEach((t, i) => {
        if (t.id == null) t.id = `saved${i}`;
        if (typeof t.name !== 'string') t.name = `My track ${i + 1}`;
      });
      const track = String(o.track);
      if (track.startsWith('s:')) o.track = o.saved.some(t => 's:' + t.id === track) ? track : 'custom';
      else if (track !== 'custom' && !C.PRESETS.some(p => 'p:' + p.id === track)) o.track = DEFAULTS.track;
    },

    // ------------------------------------------------------------ progression + key
    preset() { return this.o.track.startsWith('p:') ? C.PRESETS.find(p => 'p:' + p.id === this.o.track) : null; },
    savedTrack() { return this.o.track.startsWith('s:') ? this.o.saved.find(t => 's:' + t.id === this.o.track) : null; },

    // The track's chords moved by `shift`: { items: [{ chord, beats, section }], hasSections } or { error }.
    items(shift = 0) {
      const p = this.preset();
      if (p) return C.presetProgression(p, T.mod12(this.o.key + shift));
      const f = C.parseForm(shift ? C.transposeText(this.o.custom, shift) : this.o.custom);
      if (f.error) return f;
      const items = [];
      f.sections.forEach((sec, i) => sec.items.forEach(it => items.push({ ...it, section: { i, name: sec.name, shift: sec.shift } })));
      return { items, hasSections: f.hasSections };
    },

    // The home key: a preset's key, or for a typed track a guess from its first chord (before any section
    // shift). relHome is the relative minor or major.
    home(shift, items) {
      const p = this.preset(), first = items[0];
      const home = p ? T.mod12(this.o.key + shift) : T.mod12(first.chord.root - ((first.section && first.section.shift) || 0));
      const minor = p ? !!p.minor : MINOR_Q.has(first.chord.quality);
      return { home, minor, relHome: T.mod12(home + (minor ? 3 : 9)) };
    },

    keyText: (pc, minor) => `Key of ${T.pretty(C.keyName(pc, minor))}${minor ? ' minor' : ''}`,

    cycleShift(loopIdx) {
      const o = this.o;
      if (o.cycle === 'off') return 0;
      const k = Math.floor(loopIdx / Math.max(1, o.cycleEvery));
      if (o.cycle === 'fourths') return T.mod12(5 * k);
      if (o.cycle === 'whole') return T.mod12(2 * k);
      if (o.cycle === 'half') return T.mod12(k);
      const shifts = this.randomShifts || (this.randomShifts = [0]);
      while (shifts.length <= k) {
        let s;
        do { s = Math.floor(Math.random() * 12); } while (s === shifts[shifts.length - 1]);
        shifts.push(s);
      }
      return shifts[k];
    },

    // The called changes in force at a point: total semitones and whether the relative key is home.
    stateAt(at) {
      const st = { shift: 0, rel: false };
      for (const c of this.calls || []) if (cmp(c.at, at) <= 0) { st.shift += c.shift; st.rel = st.rel !== c.rel; }
      st.shift = T.mod12(st.shift);
      return st;
    },

    // A whole loop's segs in one state. In the relative key the loop starts on the new home chord.
    segsFor(loopIdx, st, bpb) {
      const shift = T.mod12(this.cycleShift(loopIdx) + st.shift);
      let r = this.items(shift);
      if (r.error) r = { items: this.lastGood || C.parseProgression(DEFAULTS.custom).items };
      else if (!shift) this.lastGood = r.items;
      let items = r.items;
      const info = this.home(shift, items);
      const k = st.rel ? items.findIndex(it => it.chord.root === info.relHome) : -1;
      if (k >= 0) items = items.slice(k).concat(items.slice(0, k));
      const custom = !this.preset();
      let start = 0;
      return items.map(it => {
        const beats = it.beats || this.o.barsPerChord * bpb;
        const keyLabel = k >= 0 ? this.keyText(info.relHome, !info.minor)
          : this.keyText(T.mod12(info.home + (custom && it.section ? it.section.shift : 0)), info.minor);
        const seg = { chord: it.chord, beats, start, section: it.section, keyLabel };
        start += beats;
        return seg;
      });
    },

    // Loop i as the band plays it. A call landing partway through changes key from that beat on; a switch
    // to or from the relative key ends the loop there, so the next one starts on the new home chord.
    timeline(loopIdx, bpb) {
      let st = this.stateAt({ loop: loopIdx, beat: 0 });
      let segs = this.segsFor(loopIdx, st, bpb);
      let total = segs.reduce((a, s) => a + s.beats, 0);
      const inside = (this.calls || []).filter(c => c.at.loop === loopIdx && c.at.beat > 0 && c.at.beat < total);
      const out = [];
      let from = 0;
      for (const c of inside) {
        if (c.at.beat <= from) continue;
        out.push(...clip(segs, from, c.at.beat));
        from = c.at.beat;
        const next = this.stateAt(c.at);
        if (next.rel !== st.rel) { total = from; break; }
        st = next;
        segs = this.segsFor(loopIdx, st, bpb);
      }
      if (from < total) out.push(...clip(segs, from, total));
      return { segs: out.map(({ start, ...seg }) => seg), keyLabel: out[0].keyLabel };
    },

    engineCfg() {
      const o = this.o;
      return {
        bpm: o.bpm, groove: o.groove, countIn: o.countIn, sound: o.sound, vol: o.vol, mute: { ...(this.mute || {}) },
        loopTimeline: (i, bpb) => this.timeline(i, bpb),
      };
    },

    // Something about the music changed: re-check it, update the engine, redraw.
    changed(rebuild) {
      S.saveOpts();
      const r = this.items(0);
      this.error = r.error || '';
      if (B.isPlaying()) { B.configure(this.engineCfg()); B.refresh(); }
      else this.cur = 0;
      if (rebuild) this.buildControls();
      this.render();
    },

    set(k, v, rebuild) { this.o[k] = v; this.changed(rebuild); },

    selectTrack(v) {
      const o = this.o;
      if (v.startsWith('p:')) {
        const p = C.PRESETS.find(x => 'p:' + x.id === v);
        Object.assign(o, { track: v, key: p.key, groove: p.groove, bpm: p.bpm, barsPerChord: 1 });
      } else if (v.startsWith('s:')) {
        const t = o.saved.find(x => 's:' + x.id === v);
        Object.assign(o, { track: v, custom: t.prog, groove: t.groove, bpm: t.bpm, barsPerChord: t.barsPerChord, sound: t.sound || o.sound });
      } else {
        o.track = 'custom';
      }
      this.randomShifts = null;
      this.calls = [];
      this.changed(true);
    },

    transpose(semis) {
      const o = this.o;
      if (this.preset()) o.key = T.mod12(o.key + semis);
      else { o.custom = C.transposeText(o.custom, semis); o.track = 'custom'; }
      this.changed(true);
    },

    saveTrack(name) {
      const o = this.o;
      const r = this.items(0);
      if (r.error) return;
      const prog = this.preset() ? C.toText(r.items) : o.custom;
      const id = Date.now().toString(36);
      const label = name.trim() || `My track ${o.saved.length + 1}`;
      o.saved.push({ id, name: label, prog, groove: o.groove, bpm: o.bpm, barsPerChord: o.barsPerChord, sound: o.sound });
      o.track = 's:' + id;
      o.custom = prog;
      this.changed(true);
      if (FD.theme) FD.theme.toast('Track saved', label);
    },

    deleteTrack() {
      const t = this.savedTrack();
      if (!t || !confirm(`Delete "${t.name}" from My tracks?`)) return;
      this.o.saved = this.o.saved.filter(x => x !== t);
      this.o.track = 'custom';
      this.changed(true);
    },

    // ------------------------------------------------------------ controls
    range(parent, label, min, max, step, value, fmtV, onInput) {
      const w = document.createElement('label');
      w.className = 'field range-field';
      w.innerHTML = '<span></span><div class="inline"><input type="range"><output></output></div>';
      w.querySelector('span').textContent = label;
      const i = w.querySelector('input'), out = w.querySelector('output');
      Object.assign(i, { min, max, step, value });
      out.textContent = fmtV(value);
      i.addEventListener('input', () => { out.textContent = fmtV(+i.value); onInput(+i.value); });
      i.addEventListener('change', () => i.blur());
      parent.appendChild(w);
      return { input: i, out };
    },

    buildControls() {
      const o = this.o, $ = id => this.el.querySelector(id);
      const tr = $('#jam-track'), chords = $('#jam-chords'), keys = $('#jam-keys'), feel = $('#jam-feel'), disp = $('#jam-display'), save = $('#jam-save');
      for (const box of [tr, chords, keys, feel, disp, save]) box.textContent = '';
      const preset = this.preset(), saved = this.savedTrack();
      this.error = this.items(0).error || '';

      // Always in view: what you reach for mid-song.
      this.playBtn = UI.button(tr, '▶ Play', () => this.toggle(), 'primary play-btn');
      const mutes = document.createElement('div');
      mutes.className = 'field';
      mutes.innerHTML = '<span>Mute</span><div class="inline mutes"></div>';
      this.muteBtns = {};
      PARTS.forEach(([k, label], i) => {
        const b = UI.button(mutes.lastChild, label, () => this.toggleMute(k), 'mute-btn');
        b.title = `Mute ${label.toLowerCase()} (${i + 1})`;
        b.setAttribute('aria-pressed', 'false');
        this.muteBtns[k] = b;
      });
      tr.appendChild(mutes);
      UI.select(tr, 'Track', [
        ...C.PRESETS.map(p => ({ value: 'p:' + p.id, label: p.label, group: p.group })),
        ...o.saved.map(t => ({ value: 's:' + t.id, label: t.name, group: 'My tracks' })),
        { value: 'custom', label: 'Custom (type your own)', group: 'My tracks' },
      ], o.track, v => this.selectTrack(v));
      if (preset) {
        UI.select(tr, 'Key', (preset.minor ? C.MINOR_KEYS : C.MAJOR_KEYS).map((k, i) => ({ value: i, label: T.pretty(k) + (preset.minor ? 'm' : '') })),
          o.key, v => this.set('key', v, true));
      }
      const tp = document.createElement('div');
      tp.className = 'field';
      tp.innerHTML = '<span>Transpose</span><div class="inline"></div>';
      UI.button(tp.lastChild, '♭', () => this.call(-1, false)).title = 'Down a half step ( [ ). While playing, it lands like a called change.';
      UI.button(tp.lastChild, '♯', () => this.call(1, false)).title = 'Up a half step ( ] ). While playing, it lands like a called change.';
      tr.appendChild(tp);
      this.bpm = this.range(tr, 'Tempo', 40, 240, 1, o.bpm, v => `${v} BPM`, v => this.set('bpm', v));
      UI.select(tr, 'Groove', Object.entries(B.GROOVES).map(([value, g]) => ({ value, label: g.label })), o.groove, v => this.set('groove', v));
      this.stageBtn = UI.button(tr, '', () => this.setStage(!this.stage), 'stage-btn');
      this.stageBtn.title = 'Full screen with big chords, for a TV (V)';

      const shown = preset ? C.toText(this.items(0).items || []) : o.custom;
      UI.textInput(chords, preset ? 'Chords (edit to make it custom)' : 'Chords or song form', shown, '[Verse] Am F C G [Chorus] F G Am Am [Chorus +2]', v => {
        o.custom = v.trim();
        o.track = 'custom';
        this.changed(true);
      });

      UI.select(keys, 'Calls land on', LANDINGS, o.landOn, v => this.set('landOn', v));
      UI.select(keys, 'Key cycle', CYCLES, o.cycle, v => { this.randomShifts = null; this.set('cycle', v, true); });
      if (o.cycle !== 'off') {
        UI.select(keys, 'Change key every', [1, 2, 4].map(n => ({ value: n, label: n === 1 ? 'loop' : `${n} loops` })), o.cycleEvery, v => this.set('cycleEvery', v));
      }

      UI.select(feel, 'Bars per chord', [1, 2, 4].map(n => ({ value: n, label: n === 1 ? '1 bar' : `${n} bars` })), o.barsPerChord, v => this.set('barsPerChord', v));
      UI.select(feel, 'Chord sound', Object.entries(B.SOUNDS).map(([value, label]) => ({ value, label })), o.sound, v => this.set('sound', v));
      UI.toggle(feel, 'Count-in', o.countIn, v => this.set('countIn', v));
      for (const [k, label] of PARTS) {
        this.range(feel, `${label} volume`, 0, 1, 0.05, o.vol[k], v => (v ? `${Math.round(v * 100)}%` : 'off'), v => {
          o.vol[k] = v;
          S.saveOpts();
          B.configure({ vol: o.vol });
        });
      }

      UI.select(disp, 'Labels', [{ value: 'degrees', label: 'Chord degrees (R 3 5 7)' }, { value: 'names', label: 'Note names' }], o.labels, v => this.set('labels', v));
      UI.toggle(disp, 'Preview next chord', o.preview, v => this.set('preview', v));
      UI.toggle(disp, 'Position lock', o.lock, v => this.set('lock', v, true));
      if (o.lock) {
        const frets = Array.from({ length: 25 }, (_, f) => ({ value: f, label: String(f) }));
        UI.select(disp, 'From fret', frets.slice(0, 22), o.lockFrom, v => { o.lockFrom = v; if (o.lockTo < v + 2) o.lockTo = v + 3; this.changed(true); });
        UI.select(disp, 'To fret', frets.slice(2), o.lockTo, v => { o.lockTo = v; if (o.lockFrom > v - 2) o.lockFrom = Math.max(0, v - 3); this.changed(true); });
      }

      UI.textInput(save, 'Save to My tracks', '', saved ? `${saved.name} (copy)` : 'Name this track', v => this.saveTrack(v), 'Save');
      if (saved) UI.button(save, 'Delete track', () => this.deleteTrack(), 'danger');
      this.syncPlayBtn();
      this.syncMutes();
    },

    // ------------------------------------------------------------ live: calls, mutes, big screen
    bpb() { return (B.GROOVES[this.o.groove] || B.GROOVES.rock).beats; },

    toast(title, text, ms = 2200) { if (FD.theme) FD.theme.toast(title, text || '', '', ms); },

    // Queue a key change (semitones, and/or a switch to the relative key). Stopped, a plain transpose
    // happens at once. Playing, it lands at the next point the "Calls land on" setting allows; calls made
    // before it lands stack onto it.
    call(semis, rel) {
      if (!B.isPlaying()) {
        if (rel) this.toast('Relative key', 'R works while the band is playing.');
        else this.transpose(semis);
        return;
      }
      const pos = B.position();
      if (!pos) return;
      let c = this.calls.find(x => cmp(x.at, pos) >= 0);
      const at = c ? c.at : landing(B.timelineAt(pos.loop), pos, this.o.landOn, this.bpb());
      if (rel) {
        const r = this.items(0);
        if (r.error) return;
        if (r.hasSections) { this.toast('Relative key', 'R only works on a loop without [sections].', 3000); return; }
        const st = this.stateAt(at);
        if (!st.rel) {
          const shift = T.mod12(this.cycleShift(at.loop) + st.shift + semis);
          const items = this.items(shift).items;
          const info = this.home(shift, items);
          if (!items.some(it => it.chord.root === info.relHome)) {
            const name = T.pretty(C.keyName(info.relHome, !info.minor)) + (info.minor ? '' : 'm');
            this.toast('Relative key', `There's no ${name} chord in this track to make home.`, 3200);
            return;
          }
        }
      }
      if (!c) {
        c = { at, shift: 0, rel: false };
        this.calls.push(c);
        this.calls.sort((a, b) => cmp(a.at, b.at));
      }
      c.shift += semis;
      c.rel = c.rel !== rel;
      if (T.mod12(c.shift) === 0 && !c.rel) this.calls = this.calls.filter(x => x !== c);
      B.refresh();
      this.render();
    },

    // Drop every call the band hasn't started playing yet.
    cancelCalls() {
      if (!B.isPlaying() || !this.calls.length) return false;
      const pos = B.position();
      const keep = this.calls.filter(c => cmp(c.at, pos) < 0);
      if (keep.length === this.calls.length) return false;
      this.calls = keep;
      B.refresh();
      this.toast('Key change cancelled');
      this.render();
      return true;
    },

    toggleMute(k) {
      this.mute[k] = !this.mute[k];
      B.configure({ mute: { ...this.mute } });
      this.syncMutes();
    },

    syncMutes() {
      for (const [k, b] of Object.entries(this.muteBtns || {})) {
        b.classList.toggle('muted', !!this.mute[k]);
        b.setAttribute('aria-pressed', String(!!this.mute[k]));
      }
    },

    // Big screen: browser full screen with the controls hidden and the chords sized for across a room.
    // In full screen Chrome and Edge let the page keep Esc (hold Esc to leave), so Esc can still cancel a call.
    setStage(on) {
      this.stage = on;
      document.body.classList.toggle('stage', on);
      const root = document.documentElement;
      if (on && root.requestFullscreen && !document.fullscreenElement) {
        root.requestFullscreen().then(() => {
          if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']).catch(() => {});
        }).catch(() => {});
      } else if (!on && document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      this.syncPlayBtn();
      this.render();
    },

    toggle() {
      if (B.isPlaying()) {
        // Keep the key the band ended in. A switch to the relative key only lasts while playing.
        const heard = this.heardPos();
        const kept = heard ? this.calls.filter(c => cmp(c.at, heard) <= 0).reduce((a, c) => a + c.shift, 0) : 0;
        B.stop();
        this.view = null;
        this.counting = false;
        this.calls = [];
        S.saveOpts();
        if (T.mod12(kept)) { this.transpose(kept); return; }
      } else {
        if (this.error) return;
        this.cur = 0;
        this.calls = [];
        this.randomShifts = null;
        this.counting = this.o.countIn;
        this.countBeat = 0;
        this.view = null;
        B.start(this.engineCfg());
        this.lastTick = performance.now();
      }
      this.syncPlayBtn();
      this.render();
    },

    syncPlayBtn() {
      if (this.playBtn) this.playBtn.textContent = B.isPlaying() ? '■ Stop' : '▶ Play';
      if (this.stageBtn) this.stageBtn.textContent = this.stage ? '✕ Exit big screen' : '⛶ Big screen';
    },

    // The beat being heard: { loop, beat }. During the count-in, beats before loop 0 are negative.
    heardPos() {
      if (this.view) return { loop: this.view.loop, beat: this.view.beatInLoop };
      if (this.counting) return { loop: 0, beat: (this.countBeat || 1) - 1 - (this.countBpb || this.bpb()) };
      return null;
    },

    // Animation loop: apply audio-timed beat events and count practice time.
    loop() {
      const step = () => {
        this.raf = requestAnimationFrame(step);
        if (!B.isPlaying()) return;
        let dirty = false;
        for (const ev of B.drain()) {
          if (ev.kind === 'count') { this.counting = true; this.countBeat = ev.beat; this.countBpb = ev.bpb; }
          else {
            if (this.view && ev.keyLabel !== this.view.keyLabel) this.toast('Key change', ev.keyLabel, 2000);
            this.counting = false;
            this.view = ev;
          }
          dirty = true;
        }
        const now = performance.now();
        if (!this.counting) {
          const dt = Math.min(1, (now - this.lastTick) / 1000);
          sessionSec += dt;
          const before = this.o.totalSec || 0;
          this.o.totalSec = before + dt;
          // Keep the total safe if the page closes mid-jam.
          if (Math.floor(this.o.totalSec / 10) !== Math.floor(before / 10)) S.saveOpts();
        }
        this.lastTick = now;
        if (dirty) this.render();
        else this.renderTime();
      };
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(step);
    },

    renderTime() {
      const t = this.el.querySelector('#jam-time');
      const txt = `Jammed ${fmt(sessionSec)} this session · ${fmt(this.o.totalSec || 0)} total`;
      if (t.textContent !== txt) t.textContent = txt;
    },

    // What to show: the live beat while playing, otherwise the first loop with the previewed chord.
    currentView() {
      if (this.view) return this.view;
      const bpb = (B.GROOVES[this.o.groove] || B.GROOVES.rock).beats;
      const tl = this.timeline(0, bpb);
      const si = Math.min(this.cur, tl.segs.length - 1);
      return {
        segs: tl.segs, si, chord: tl.segs[si].chord, next: tl.segs[(si + 1) % tl.segs.length].chord,
        keyLabel: tl.segs[si].keyLabel, section: tl.segs[si].section, beatInChord: -1, chordBeats: tl.segs[si].beats, bpb, idle: true,
      };
    },

    render() {
      const o = this.o, $ = id => this.el.querySelector(id);
      const v = this.currentView();
      const playing = B.isPlaying();
      const { chord, next, segs } = v;

      $('#jam-msg').textContent = this.error;
      $('#jam-msg').className = 'prompt-sub' + (this.error ? ' bad' : '');
      $('#jam-state').textContent = this.counting ? `Count-in ${this.countBeat || ''}` : playing ? 'Now playing' : 'Ready';
      $('#jam-key').textContent = v.keyLabel;
      const secName = v.section && v.section.name;
      $('#jam-section').hidden = !secName;
      $('#jam-section').textContent = secName || '';
      $('#jam-chord').textContent = chord.symbol;
      $('#jam-tones').innerHTML = chord.tones.map(t => `<span class="ct-chip ct-${t.family}"><b>${T.pretty(t.name)}</b><small>${t.label}</small></span>`).join('');
      $('#jam-next').textContent = next.symbol;

      const bpb = this.counting ? this.countBpb || v.bpb : v.bpb;
      const beatsEl = $('#jam-beats');
      if (beatsEl.children.length !== bpb) beatsEl.innerHTML = '<i></i>'.repeat(bpb);
      const active = this.counting ? (this.countBeat || 1) - 1 : v.idle ? -1 : v.beatInLoop % bpb;
      [...beatsEl.children].forEach((d, i) => { d.className = (i === active ? 'on' : '') + (this.counting ? ' count' : ''); });

      const totalBars = Math.round(segs.reduce((a, s) => a + s.beats, 0) / v.bpb);
      $('#jam-bar').textContent = playing && !this.counting && !v.idle
        ? `Bar ${Math.floor(v.beatInLoop / v.bpb) + 1} of ${totalBars} · ${B.GROOVES[o.groove].label} · ${o.bpm} BPM`
        : `${segs.length} chord${segs.length === 1 ? '' : 's'} · ${totalBars} bar${totalBars === 1 ? '' : 's'} · ${B.GROOVES[o.groove].label} · ${o.bpm} BPM`;

      const defaultBeats = o.barsPerChord * v.bpb;
      const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
      $('#jam-prog').innerHTML = segs.map((s, i) => {
        const sec = s.section && s.section.name && (i === 0 || secId(segs[i - 1]) !== secId(s))
          ? `<span class="sec-tag">${esc(s.section.name)}${s.section.shift ? ` ${s.section.shift > 0 ? '+' : ''}${s.section.shift}` : ''}</span>` : '';
        return `${sec}<span class="chip ${i === v.si ? 'cur' : ''}" data-i="${i}">${s.chord.symbol}${s.beats !== defaultBeats ? `<sub>${s.beats}</sub>` : ''}</span>`;
      }).join('');
      this.renderCall();

      // The next chord's tones fade in for the last couple of beats of the current one.
      const showNext = o.preview && !v.idle && segs.length > 1 && v.beatInChord >= Math.max(1, v.chordBeats - 2);
      this.drawBoard(chord, showNext ? next : null);

      $('#jam-legend').innerHTML = ['r', '3', '5', '7', 'x']
        .filter(fam => chord.tones.some(t => t.family === fam) || (showNext && next.tones.some(t => t.family === fam)))
        .map(fam => `<span><i class="sw ct-${fam}"></i>${FAMILY_LABEL[fam]}</span>`).join('') +
        (showNext ? `<span><i class="sw ct-next-sw"></i>Next: ${next.symbol}</span><span><i class="sw ct-common-sw"></i>Common tone</span>` : '');
      this.renderTime();
    },

    // The banner for a called change that hasn't landed: the new key and a countdown.
    renderCall() {
      const el = this.el.querySelector('#jam-call');
      const heard = B.isPlaying() ? this.heardPos() : null;
      const pend = heard ? this.calls.filter(c => cmp(c.at, heard) > 0) : [];
      if (!pend.length) { el.hidden = true; return; }
      const first = pend[0], last = pend[pend.length - 1];
      let tl = B.timelineAt(last.at.loop), beat = last.at.beat;
      if (tl && beat >= tl.beats) { tl = B.timelineAt(last.at.loop + 1); beat = 0; }
      const seg = tl && tl.segs.find(s => beat >= s.start && beat < s.start + s.beats);
      const label = ((seg && seg.keyLabel) || '').replace(/^Key of /, '');
      const n = beatsUntil(heard, first.at, i => (B.timelineAt(i) || { beats: 0 }).beats);
      const bpb = this.view ? this.view.bpb : this.bpb();
      el.hidden = false;
      el.innerHTML = `<b>→ ${label}</b><span>${untilText(n, bpb)}</span><small>Esc cancels</small>`;
    },

    drawBoard(chord, next) {
      const o = this.o, st = S.settings(), board = this.board;
      const maxFret = Math.max(12, st.maxFret, o.lock ? o.lockTo : 0);
      board.box = o.lock ? { from: o.lockFrom, to: o.lockTo } : null;
      board.marks.clear();
      board.configure({ minFret: 0, maxFret, leftHanded: st.leftHanded, strings: T.allStrings() });
      const label = t => (o.labels === 'names' ? T.pretty(t.name) : t.label);
      for (let s = 0; s < T.count(); s++) {
        for (let f = 0; f <= maxFret; f++) {
          if (o.lock && (f < o.lockFrom || f > o.lockTo)) continue;
          const p = T.pc(T.midiAt(s, f));
          const cur = chord.byPc.get(p);
          const nx = next && next.byPc.get(p);
          if (cur) board.mark(s, f, { cls: `ct ct-${cur.family}${nx ? ' common' : ''}`, label: label(cur), anim: false });
          else if (nx) board.mark(s, f, { cls: `ct-next ct-${nx.family}`, label: label(nx), anim: false });
        }
      }
    },

    onKey(e) {
      if (e.code === 'Space') { this.toggle(); return true; }
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        const v = Math.max(40, Math.min(240, this.o.bpm + (e.code === 'ArrowUp' ? 5 : -5)));
        this.bpm.input.value = v;
        this.bpm.out.textContent = `${v} BPM`;
        this.set('bpm', v);
        return true;
      }
      if (CALL_KEYS[e.code] && !e.shiftKey) { this.call(...CALL_KEYS[e.code]); return true; }
      if (PART_KEYS[e.code]) { this.toggleMute(PART_KEYS[e.code]); return true; }
      if (e.code === 'Escape' || e.code === 'Backspace') {
        if (this.cancelCalls()) return true;
        if (e.code === 'Escape' && this.stage) { this.setStage(false); return true; }
        return false;
      }
      if (e.code === 'KeyV') { this.setStage(!this.stage); return true; }
      return false;
    },
  };
})();
