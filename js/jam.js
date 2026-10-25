// Jam page: a looping backing track with the current chord's tones lit up on the fretboard.
(() => {
  const T = FD.theory, S = FD.store, UI = FD.ui, A = FD.audio, C = FD.chords, B = FD.backing;
  const DEFAULTS = {
    prog: 'C D7 G7 C', bpm: 100, barsPerChord: 1, groove: 'rock', countIn: true,
    labels: 'degrees', preview: true, lock: false, lockFrom: 2, lockTo: 6,
    vol: { drums: 0.8, bass: 0.8, chords: 0.6 }, totalSec: 0,
  };
  const FAMILY_LABEL = { r: 'Root', 3: '3rd', 5: '5th', 7: '7th', x: 'Extension' };
  let sessionSec = 0;

  const fmt = sec => {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(s).padStart(2, '0')}`;
  };

  FD.views.jam = {
    mount(el) {
      this.o = S.opts('jam', DEFAULTS);
      this.o.vol = Object.assign({}, DEFAULTS.vol, this.o.vol);
      this.el = el;
      el.innerHTML = `
        <div class="jam-top">
          <div class="jam-now">
            <div class="jam-label" id="jam-state">Ready</div>
            <div class="jam-chord display" id="jam-chord"></div>
            <div class="jam-tones" id="jam-tones"></div>
          </div>
          <div class="jam-side">
            <div class="jam-next">Next <b id="jam-next"></b></div>
            <div class="beats" id="jam-beats"><i></i><i></i><i></i><i></i></div>
            <div class="jam-bar" id="jam-bar"></div>
            <div class="jam-time" id="jam-time"></div>
          </div>
        </div>
        <div class="strip jam-prog" id="jam-prog"></div>
        <div class="prompt-sub" id="jam-msg"></div>
        <div class="board-wrap"><svg class="board" id="jam-board" aria-label="Chord tones on the fretboard"></svg></div>
        <div class="ct-legend" id="jam-legend"></div>
        <div class="panel jam-panel">
          <div class="options" id="jam-transport"></div>
          <div class="options" id="jam-display"></div>
          <div class="options" id="jam-mix"></div>
          <div class="hint"><kbd>Space</kbd> play / stop · <kbd>↑</kbd> <kbd>↓</kbd> tempo ±5 · click a chord above to preview it while stopped · click any fret to hear it</div>
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
      this.beat = -1;
      this.parse();
      this.buildControls();
      this.render();
      this.loop();
    },

    unmount() {
      B.stop();
      cancelAnimationFrame(this.raf);
      this.saveTime();
    },

    parse() {
      const r = C.parseProgression(this.o.prog);
      this.error = r.error || '';
      if (r.chords) this.chords = r.chords;
      if (!this.chords) this.chords = C.parseProgression(DEFAULTS.prog).chords;
      if (this.cur >= this.chords.length) this.cur = 0;
    },

    set(k, v) {
      this.o[k] = v;
      S.saveOpts();
      if (B.isPlaying()) B.configure(this.engineCfg());
      this.render();
    },

    engineCfg() {
      const o = this.o;
      return { bpm: o.bpm, barsPerChord: o.barsPerChord, chords: this.chords, groove: o.groove, countIn: o.countIn, vol: o.vol };
    },

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
      const tr = $('#jam-transport'), disp = $('#jam-display'), mix = $('#jam-mix');
      tr.textContent = disp.textContent = mix.textContent = '';

      this.playBtn = UI.button(tr, '▶ Play', () => this.toggle(), 'primary play-btn');
      const presetIdx = C.PRESETS.findIndex(p => p.prog === o.prog);
      UI.select(tr, 'Preset', [{ value: -1, label: 'Custom' }, ...C.PRESETS.map((p, i) => ({ value: i, label: p.label }))], presetIdx, v => {
        if (v < 0) return;
        this.applyProg(C.PRESETS[v].prog);
        this.buildControls();
      });
      this.progInput = UI.textInput(tr, 'Progression', o.prog, 'C D7 G7 C', v => { this.applyProg(v); this.buildControls(); });
      this.bpm = this.range(tr, 'Tempo', 40, 220, 1, o.bpm, v => `${v} BPM`, v => this.set('bpm', v));
      UI.select(tr, 'Bars per chord', [1, 2, 4].map(n => ({ value: n, label: n === 1 ? '1 bar' : `${n} bars` })), o.barsPerChord, v => this.set('barsPerChord', v));
      UI.select(tr, 'Groove', Object.entries(B.GROOVES).map(([value, g]) => ({ value, label: g.label })), o.groove, v => this.set('groove', v));
      UI.toggle(tr, 'Count-in', o.countIn, v => this.set('countIn', v));

      UI.select(disp, 'Labels', [{ value: 'degrees', label: 'Chord degrees (R 3 5 7)' }, { value: 'names', label: 'Note names' }], o.labels, v => this.set('labels', v));
      UI.toggle(disp, 'Preview next chord', o.preview, v => this.set('preview', v));
      UI.toggle(disp, 'Position lock', o.lock, v => { this.set('lock', v); this.buildControls(); });
      if (o.lock) {
        const frets = Array.from({ length: 25 }, (_, f) => ({ value: f, label: String(f) }));
        UI.select(disp, 'From fret', frets.slice(0, 22), o.lockFrom, v => { this.set('lockFrom', v); if (o.lockTo < v + 2) { o.lockTo = v + 3; this.buildControls(); this.render(); } });
        UI.select(disp, 'To fret', frets.slice(2), o.lockTo, v => { this.set('lockTo', v); if (o.lockFrom > v - 2) { o.lockFrom = Math.max(0, v - 3); this.buildControls(); this.render(); } });
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

    applyProg(v) {
      this.o.prog = v.trim();
      S.saveOpts();
      this.parse();
      if (!this.error && B.isPlaying()) B.configure(this.engineCfg());
      this.render();
    },

    toggle() {
      if (B.isPlaying()) {
        B.stop();
        this.counting = false;
        this.beat = -1;
        this.saveTime();
      } else {
        if (this.error) return;
        this.cur = 0;
        this.counting = this.o.countIn;
        B.start(this.engineCfg());
        this.lastTick = performance.now();
      }
      this.syncPlayBtn();
      this.render();
    },

    syncPlayBtn() {
      if (this.playBtn) this.playBtn.textContent = B.isPlaying() ? '■ Stop' : '▶ Play';
    },

    saveTime() { S.saveOpts(); },

    // Animation loop: apply audio-timed beat events and count practice time.
    loop() {
      const step = () => {
        this.raf = requestAnimationFrame(step);
        if (!B.isPlaying()) return;
        let dirty = false;
        for (const ev of B.drain()) {
          if (ev.kind === 'count') { this.counting = true; this.countBeat = ev.beat; }
          else { this.counting = false; this.cur = ev.chordIdx; this.beat = ev.beat; this.barInSpan = ev.barInSpan; }
          dirty = true;
        }
        const now = performance.now();
        if (!this.counting) {
          const dt = Math.min(1, (now - this.lastTick) / 1000);
          sessionSec += dt;
          this.o.totalSec = (this.o.totalSec || 0) + dt;
          if (Math.floor(sessionSec) % 10 === 0 && dt > 0) S.saveOpts();
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

    render() {
      const o = this.o, $ = id => this.el.querySelector(id);
      const chords = this.chords, n = chords.length;
      const chord = chords[this.cur], next = chords[(this.cur + 1) % n];
      const playing = B.isPlaying();

      $('#jam-msg').textContent = this.error;
      $('#jam-msg').className = 'prompt-sub' + (this.error ? ' bad' : '');
      $('#jam-state').textContent = this.counting ? `Count-in ${this.countBeat || ''}` : playing ? 'Now playing' : 'Ready';
      $('#jam-chord').textContent = chord.symbol;
      $('#jam-tones').innerHTML = chord.tones.map(t => `<span class="ct-chip ct-${t.family}"><b>${T.pretty(t.name)}</b><small>${t.label}</small></span>`).join('');
      $('#jam-next').textContent = next.symbol;

      const beats = $('#jam-beats').children;
      const activeBeat = this.counting ? (this.countBeat || 1) - 1 : playing ? this.beat : -1;
      for (let i = 0; i < 4; i++) beats[i].className = (i === activeBeat ? 'on' : '') + (this.counting ? ' count' : '');
      $('#jam-bar').textContent = o.barsPerChord > 1 && playing && !this.counting
        ? `Bar ${this.barInSpan + 1} of ${o.barsPerChord} on ${chord.symbol}`
        : `${n} chord${n === 1 ? '' : 's'} · ${o.bpm} BPM · ${B.GROOVES[o.groove].label}`;

      $('#jam-prog').innerHTML = chords.map((c, i) => `<span class="chip ${i === this.cur ? 'cur' : ''}" data-i="${i}" title="${playing ? '' : 'Preview this chord'}">${c.symbol}</span>`).join('');

      const lastBar = playing && !this.counting && this.barInSpan === o.barsPerChord - 1;
      // The next chord fades in for the last two beats of the current one.
      const showNext = o.preview && n > 1 && lastBar && this.beat >= 2;
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
        const v = Math.max(40, Math.min(220, this.o.bpm + (e.code === 'ArrowUp' ? 5 : -5)));
        this.bpm.input.value = v;
        this.bpm.out.textContent = `${v} BPM`;
        this.set('bpm', v);
        return true;
      }
      return false;
    },
  };
})();
