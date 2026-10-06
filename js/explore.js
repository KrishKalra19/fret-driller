// Explore page: the whole neck with a scale highlighted, optional position highlight and scale comparison.
(() => {
  const T = FD.theory, S = FD.store, UI = FD.ui, A = FD.audio;
  const DEFAULTS = { root: 9, scale: 'minorPent', others: false, labels: 'names', hl: 'none', posF0: null, boxStart: 5, boxSpan: 4, cmp: 'none', cmpRoot: 'same' };
  const key = (s, f) => s + ',' + f;
  const plainName = p => T.pretty(T.name(p, S.settings().spelling === 'flat' ? 'flat' : 'sharp'));
  const chips = (info, p, cls = '') => `<span class="chip ${cls}">${T.pretty(info.names.get(p))}<sub>${info.degs.get(p)}</sub></span>`;

  FD.views.explore = {
    mount(el) {
      this.o = S.opts('explore', DEFAULTS);
      el.innerHTML = `
        <div class="prompt-row"><div class="prompt">
          <div class="prompt-main ex-title" id="ex-title"></div>
          <div class="prompt-sub" id="ex-info"></div>
        </div></div>
        <div class="strip" id="ex-notes"></div>
        <div class="ex-legend" id="ex-legend"></div>
        <div class="board-wrap"><svg class="board" id="ex-board" aria-label="Fretboard explorer"></svg></div>
        <div class="panel"><div class="options" id="ex-options"></div>
          <div class="hint">Click any fret to hear it and see its role in the scale. Gold dots are the root.</div></div>`;
      this.el = el;
      this.board = new FD.Fretboard(el.querySelector('#ex-board'));
      this.board.onCell = (s, f) => this.clickCell(s, f);
      this.update();
    },

    set(k, v) { this.o[k] = v; S.saveOpts(); this.update(); },

    update() { this.compute(); this.buildOptions(); this.draw(); },

    compute() {
      const o = this.o;
      this.info = T.scaleInfo(o.root, o.scale);
      this.cmp = o.cmp !== 'none' ? T.scaleInfo(o.cmpRoot === 'same' ? o.root : o.cmpRoot, o.cmp) : null;
      this.pattern = null;
      this.box = null;
      if (o.hl === 'nps') {
        this.positions = T.npsPositions(o.root, o.scale, 24);
        let p = this.positions.find(x => x.f0 === o.posF0);
        if (!p) { p = this.positions.find(x => x.deg === 0) || this.positions[0]; o.posF0 = p.f0; }
        this.pattern = p.pattern;
        this.patternKeys = new Set(p.pattern.map(c => key(c.s, c.f)));
      } else if (o.hl === 'box') {
        o.boxStart = Math.min(Math.max(0, o.boxStart), 25 - o.boxSpan);
        this.box = { from: o.boxStart, to: o.boxStart + o.boxSpan - 1 };
      }
    },

    buildOptions() {
      const box = this.el.querySelector('#ex-options'), o = this.o;
      box.textContent = '';
      UI.select(box, 'Key', T.rootOptions(o.scale), o.root, v => this.set('root', v));
      UI.select(box, 'Scale', FD.scaleOptions(), o.scale, v => { o.posF0 = null; this.set('scale', v); });
      UI.select(box, 'Labels', [{ value: 'names', label: 'Note names' }, { value: 'degrees', label: 'Scale degrees' }, { value: 'none', label: 'None' }], o.labels, v => this.set('labels', v));
      const n = T.notesPerString(this.info.sc);
      UI.select(box, 'Highlight', [
        { value: 'none', label: 'Whole neck' }, { value: 'nps', label: `${n}-notes-per-string shape` }, { value: 'box', label: 'Fret box' },
      ], o.hl, v => this.set('hl', v));
      if (o.hl === 'nps') {
        UI.select(box, 'Position', this.positions.map((p, i) => ({
          value: p.f0, label: `${i + 1}: frets ${p.minF}–${p.maxF} (from ${T.pretty(this.info.names.get(T.pc(p.pattern[0].midi)))})`,
        })), o.posF0, v => this.set('posF0', v));
      } else if (o.hl === 'box') {
        const starts = [];
        for (let f = 0; f <= 25 - o.boxSpan; f++) starts.push({ value: f, label: `Frets ${f}–${f + o.boxSpan - 1}` });
        UI.select(box, 'Position', starts, o.boxStart, v => this.set('boxStart', v));
        UI.select(box, 'Width', [4, 5, 6].map(w => ({ value: w, label: w + ' frets' })), o.boxSpan, v => this.set('boxSpan', v));
      }
      UI.select(box, 'Compare with', [{ value: 'none', label: 'Nothing' }, ...FD.scaleOptions()], o.cmp, v => this.set('cmp', v));
      if (o.cmp !== 'none') {
        UI.select(box, 'Its key', [{ value: 'same', label: 'Same key' }, ...T.rootOptions(o.cmp)], o.cmpRoot, v => this.set('cmpRoot', v));
      }
      UI.toggle(box, 'Show all other notes', o.others, v => this.set('others', v));
      UI.button(box, '▶ Play scale', () => this.play());
    },

    label(info, p) {
      if (this.o.labels === 'names') return T.pretty(info.names.get(p));
      if (this.o.labels === 'degrees') return info.degs.get(p);
      return '';
    },

    inHighlight(s, f) {
      if (this.pattern) return this.patternKeys.has(key(s, f));
      if (this.box) return f >= this.box.from && f <= this.box.to;
      return true;
    },

    draw() {
      const o = this.o, st = S.settings(), { info, cmp, board } = this;
      board.box = this.box;
      board.marks.clear();
      board.configure({ minFret: 0, maxFret: 24, leftHanded: st.leftHanded, strings: T.allStrings() });

      for (let s = 0; s < T.count(); s++) {
        for (let f = 0; f <= 24; f++) {
          const p = T.pc(T.midiAt(s, f));
          const inA = info.set.has(p), inB = cmp && cmp.set.has(p);
          let cls, label;
          if (inA) { cls = p === o.root ? 'root' : cmp && !inB ? 'only-a' : 'pattern'; label = this.label(info, p); }
          else if (inB) { cls = 'only-b'; label = this.label(cmp, p); }
          else if (o.others) { cls = 'other'; label = o.labels === 'degrees' ? T.INTERVALS[T.mod12(p - o.root)] : o.labels === 'names' ? plainName(p) : ''; }
          else continue;
          if (!this.inHighlight(s, f)) cls += ' dim';
          board.mark(s, f, { cls, label, anim: false });
        }
      }

      this.el.querySelector('#ex-title').textContent = cmp ? `${info.title} vs ${cmp.title}` : info.title;
      this.el.querySelector('#ex-info').textContent = 'Click any fret to hear it';
      this.el.querySelector('#ex-info').className = 'prompt-sub';
      this.el.querySelector('#ex-notes').innerHTML = info.pcs.map(p => chips(info, p, cmp && !cmp.set.has(p) ? 'only-a' : '')).join('');

      const legend = this.el.querySelector('#ex-legend');
      if (!cmp) { legend.hidden = true; return; }
      legend.hidden = false;
      const shared = info.pcs.filter(p => cmp.set.has(p));
      const onlyA = info.pcs.filter(p => !cmp.set.has(p));
      const onlyB = cmp.pcs.filter(p => !info.set.has(p));
      const list = (inf, ps) => (ps.length ? ps.map(p => T.pretty(inf.names.get(p))).join(' ') : 'none');
      legend.innerHTML = `
        <span><i class="sw pattern"></i>In both: <b>${list(info, shared)}</b></span>
        <span><i class="sw only-a"></i>Only in ${info.title}: <b>${list(info, onlyA)}</b></span>
        <span><i class="sw only-b"></i>Only in ${cmp.title}: <b>${list(cmp, onlyB)}</b></span>`;
    },

    clickCell(s, f) {
      const midi = T.midiAt(s, f), p = T.pc(midi), { info, cmp } = this;
      A.pluck(midi);
      const src = info.set.has(p) ? info : cmp && cmp.set.has(p) ? cmp : null;
      const nm = src ? src.names.get(p) : T.name(p, S.settings().spelling === 'flat' ? 'flat' : 'sharp');
      const role = src
        ? `${src.degs.get(p) === 'R' ? 'the root' : 'the ' + src.degs.get(p)} of ${src.title}` + (src === info && cmp && !cmp.set.has(p) ? ` (not in ${cmp.title})` : '')
        : `not in ${info.title} (${T.INTERVALS[T.mod12(p - this.o.root)]} from the root)`;
      const e = this.el.querySelector('#ex-info');
      e.textContent = `${T.STRING_NAMES[s]} string, fret ${f}: ${T.pretty(nm)}${T.octaveOf(midi, nm)} is ${role}`;
      e.className = 'prompt-sub' + (src === info ? ' ok' : '');
      this.board.flash(s, f, { cls: 'hit', label: this.o.labels === 'none' ? '' : T.pretty(nm) }, 350);
    },

    play() {
      const o = this.o;
      let up;
      if (this.pattern) up = this.pattern.map(c => c.midi);
      else if (this.box) up = T.boxPattern(o.root, o.scale, this.box.from, o.boxSpan).map(c => c.midi);
      else {
        let m = T.TUNING[T.low()];
        while (T.pc(m) !== o.root) m++;
        up = [];
        for (let x = m; x <= m + 12; x++) if (this.info.set.has(T.pc(x))) up.push(x);
      }
      A.sequence(up.concat(up.slice(0, -1).reverse()), 0.22);
    },
  };
})();
