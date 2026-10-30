// Jam page: a looping backing track with the current chord's tones lit up on the fretboard.
(() => {
  const T = FD.theory, S = FD.store, UI = FD.ui, A = FD.audio, C = FD.chords, B = FD.backing;
  const DEFAULTS = {
    track: 'p:myloop', key: 0, custom: 'C D7 G7 C', bpm: 100, barsPerChord: 1, groove: 'rock', sound: 'keys', countIn: true,
    cycle: 'off', cycleEvery: 1, labels: 'degrees', preview: true, lock: false, lockFrom: 2, lockTo: 6,
    vol: { drums: 0.8, bass: 0.8, chords: 0.6 }, totalSec: 0, saved: [],
  };
  const FAMILY_LABEL = { r: 'Root', 3: '3rd', 5: '5th', 7: '7th', x: 'Extension' };
  const CYCLES = [
    { value: 'off', label: 'Off' }, { value: 'fourths', label: 'Around the circle of 4ths' },
    { value: 'half', label: 'Up a half step' }, { value: 'random', label: 'Random key' },
  ];
  let sessionSec = 0;

  const fmt = sec => {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s).padStart(2, '0')}`;
  };

  FD.views.jam = {
    mount(el) {
      const o = (this.o = S.opts('jam', DEFAULTS));
      o.vol = Object.assign({}, DEFAULTS.vol, o.vol);
      if (o.prog != null) {
        // Saves from before presets had keys: keep a custom loop as custom.
        if (o.prog !== 'C D7 G7 C') { o.track = 'custom'; o.custom = o.prog; }
        delete o.prog;
        S.saveOpts();
      }
      this.el = el;
      el.innerHTML = `
        <div class="jam-top">
          <div class="jam-now">
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
          <div class="options" id="jam-feel"></div>
          <div class="options" id="jam-display"></div>
          <div class="options" id="jam-mix"></div>
          <div class="hint"><kbd>Space</kbd> play / stop · <kbd>↑</kbd> <kbd>↓</kbd> tempo ±5 · <kbd>[</kbd> <kbd>]</kbd> key down / up ·
            add <code>:2</code> to a chord for two beats (<code>Gm7:2 C7:2</code>) · click a chord above to preview it while stopped</div>
        </div>`;
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
      this.buildControls();
      this.render();
      this.loop();
    },

    unmount() {
      B.stop();
      cancelAnimationFrame(this.raf);
      S.saveOpts();
    },

    // ------------------------------------------------------------ progression + key
    preset() { return this.o.track.startsWith('p:') ? C.PRESETS.find(p => 'p:' + p.id === this.o.track) : null; },
    savedTrack() { return this.o.track.startsWith('s:') ? this.o.saved.find(t => 's:' + t.id === this.o.track) : null; },

    items(shift = 0) {
      const p = this.preset();
      if (p) return { items: C.presetItems(p, T.mod12(this.o.key + shift)) };
      return C.parseProgression(shift ? C.transposeText(this.o.custom, shift) : this.o.custom);
    },

    keyLabel(shift, items) {
      const p = this.preset();
      if (p) return `Key of ${T.pretty(C.keyName(this.o.key + shift, p.minor))}${p.minor ? ' minor' : ''}`;
      const first = items && items[0] && T.pretty(items[0].chord.rootName);
      return first ? `Starts on ${first}` : '';
    },

    cycleShift(loopIdx) {
      const o = this.o;
      if (o.cycle === 'off') return 0;
      const k = Math.floor(loopIdx / Math.max(1, o.cycleEvery));
      if (o.cycle === 'fourths') return T.mod12(5 * k);
      if (o.cycle === 'half') return T.mod12(k);
      const shifts = this.randomShifts || (this.randomShifts = [0]);
      while (shifts.length <= k) {
        let s;
        do { s = Math.floor(Math.random() * 12); } while (s === shifts[shifts.length - 1]);
        shifts.push(s);
      }
      return shifts[k];
    },

    timeline(loopIdx, bpb) {
      const shift = this.cycleShift(loopIdx);
      let r = this.items(shift);
      if (r.error) r = { items: this.lastGood || C.parseProgression(DEFAULTS.custom).items };
      else if (!shift) this.lastGood = r.items;
      return {
        segs: r.items.map(it => ({ chord: it.chord, beats: it.beats || this.o.barsPerChord * bpb })),
        keyLabel: this.keyLabel(shift, r.items),
      };
    },

    engineCfg() {
      const o = this.o;
      return {
        bpm: o.bpm, groove: o.groove, countIn: o.countIn, sound: o.sound, vol: o.vol,
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
      const tr = $('#jam-track'), feel = $('#jam-feel'), disp = $('#jam-display'), mix = $('#jam-mix');
      tr.textContent = feel.textContent = disp.textContent = mix.textContent = '';
      const preset = this.preset(), saved = this.savedTrack();
      this.error = this.items(0).error || '';

      this.playBtn = UI.button(tr, '▶ Play', () => this.toggle(), 'primary play-btn');
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
      UI.button(tp.lastChild, '♭', () => this.transpose(-1)).title = 'Down a half step ( [ )';
      UI.button(tp.lastChild, '♯', () => this.transpose(1)).title = 'Up a half step ( ] )';
      tr.appendChild(tp);
      const shown = preset ? C.toText(this.items(0).items || []) : o.custom;
      UI.textInput(tr, preset ? 'Chords (edit to make it custom)' : 'Chords', shown, 'C D7 G7 C', v => {
        o.custom = v.trim();
        o.track = 'custom';
        this.changed(true);
      });

      const saveRow = document.createElement('div');
      saveRow.className = 'options save-row';
      tr.appendChild(saveRow);
      UI.textInput(saveRow, 'Save to My tracks', '', saved ? `${saved.name} (copy)` : 'Name this track', v => this.saveTrack(v), 'Save');
      if (saved) UI.button(saveRow, 'Delete track', () => this.deleteTrack(), 'danger');

      this.bpm = this.range(feel, 'Tempo', 40, 240, 1, o.bpm, v => `${v} BPM`, v => this.set('bpm', v));
      UI.select(feel, 'Bars per chord', [1, 2, 4].map(n => ({ value: n, label: n === 1 ? '1 bar' : `${n} bars` })), o.barsPerChord, v => this.set('barsPerChord', v));
      UI.select(feel, 'Groove', Object.entries(B.GROOVES).map(([value, g]) => ({ value, label: g.label })), o.groove, v => this.set('groove', v));
      UI.select(feel, 'Chord sound', Object.entries(B.SOUNDS).map(([value, label]) => ({ value, label })), o.sound, v => this.set('sound', v));
      UI.select(feel, 'Key cycle', CYCLES, o.cycle, v => { this.randomShifts = null; this.set('cycle', v, true); });
      if (o.cycle !== 'off') {
        UI.select(feel, 'Change key every', [1, 2, 4].map(n => ({ value: n, label: n === 1 ? 'loop' : `${n} loops` })), o.cycleEvery, v => this.set('cycleEvery', v));
      }
      UI.toggle(feel, 'Count-in', o.countIn, v => this.set('countIn', v));

      UI.select(disp, 'Labels', [{ value: 'degrees', label: 'Chord degrees (R 3 5 7)' }, { value: 'names', label: 'Note names' }], o.labels, v => this.set('labels', v));
      UI.toggle(disp, 'Preview next chord', o.preview, v => this.set('preview', v));
      UI.toggle(disp, 'Position lock', o.lock, v => this.set('lock', v, true));
      if (o.lock) {
        const frets = Array.from({ length: 25 }, (_, f) => ({ value: f, label: String(f) }));
        UI.select(disp, 'From fret', frets.slice(0, 22), o.lockFrom, v => { o.lockFrom = v; if (o.lockTo < v + 2) o.lockTo = v + 3; this.changed(true); });
        UI.select(disp, 'To fret', frets.slice(2), o.lockTo, v => { o.lockTo = v; if (o.lockFrom > v - 2) o.lockFrom = Math.max(0, v - 3); this.changed(true); });
      }

      for (const [k, label] of [['drums', 'Drums'], ['bass', 'Bass'], ['chords', 'Chords']]) {
        this.range(mix, label, 0, 1, 0.05, o.vol[k], v => (v ? `${Math.round(v * 100)}%` : 'muted'), v => {
          o.vol[k] = v;
          S.saveOpts();
          B.configure({ vol: o.vol });
        });
      }
      this.syncPlayBtn();
    },

    toggle() {
      if (B.isPlaying()) {
        B.stop();
        this.view = null;
        this.counting = false;
        S.saveOpts();
      } else {
        if (this.error) return;
        this.cur = 0;
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
            if (this.view && ev.keyLabel !== this.view.keyLabel && this.o.cycle !== 'off' && FD.theme) FD.theme.toast('Key change', ev.keyLabel, '', 2000);
            this.counting = false;
            this.view = ev;
          }
          dirty = true;
        }
        const now = performance.now();
        if (!this.counting) {
          const dt = Math.min(1, (now - this.lastTick) / 1000);
          sessionSec += dt;
          this.o.totalSec = (this.o.totalSec || 0) + dt;
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
        keyLabel: tl.keyLabel, beatInChord: -1, chordBeats: tl.segs[si].beats, bpb, idle: true,
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
        : `${segs.length} chord${segs.length === 1 ? '' : 's'} · ${totalBars} bars · ${B.GROOVES[o.groove].label} · ${o.bpm} BPM`;

      const defaultBeats = o.barsPerChord * v.bpb;
      $('#jam-prog').innerHTML = segs.map((s, i) =>
        `<span class="chip ${i === v.si ? 'cur' : ''}" data-i="${i}">${s.chord.symbol}${s.beats !== defaultBeats ? `<sub>${s.beats}</sub>` : ''}</span>`).join('');

      // The next chord's tones fade in for the last couple of beats of the current one.
      const showNext = o.preview && !v.idle && segs.length > 1 && v.beatInChord >= Math.max(1, v.chordBeats - 2);
      this.drawBoard(chord, showNext ? next : null);

      $('#jam-legend').innerHTML = ['r', '3', '5', '7', 'x']
        .filter(fam => chord.tones.some(t => t.family === fam) || (showNext && next.tones.some(t => t.family === fam)))
        .map(fam => `<span><i class="sw ct-${fam}"></i>${FAMILY_LABEL[fam]}</span>`).join('') +
        (showNext ? `<span><i class="sw ct-next-sw"></i>Next: ${next.symbol}</span><span><i class="sw ct-common-sw"></i>Common tone</span>` : '');
      this.renderTime();
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
      if (e.code === 'BracketLeft' || e.code === 'BracketRight') { this.transpose(e.code === 'BracketRight' ? 1 : -1); return true; }
      return false;
    },
  };
})();
