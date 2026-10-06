// The four drill modes. Each drill gets a shared ctx (board, prompt, options panel, hud) from app.js.
(() => {
  const T = FD.theory, S = FD.store, A = FD.audio, UI = FD.ui;
  const now = () => performance.now();
  const rand = n => Math.floor(Math.random() * n);
  const pick = a => a[rand(a.length)];
  const secs = ms => (ms / 1000).toFixed(1) + 's';
  const key = (s, f) => s + ',' + f;

  function weightedPick(items, wf) {
    const ws = items.map(wf);
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }

  function rangeCells() {
    const st = S.settings();
    const out = [];
    for (let s = 0; s < 6; s++) {
      if (!st.strings[s]) continue;
      for (let f = st.minFret; f <= st.maxFret; f++) out.push({ s, f, midi: T.midiAt(s, f) });
    }
    return out;
  }

  const notLast = (items, isLast) => { const f = items.filter(x => !isLast(x)); return f.length ? f : items; };
  const plainName = p => T.pretty(T.name(p, S.settings().spelling === 'flat' ? 'flat' : 'sharp'));
  const scaleOptions = () => Object.entries(T.SCALES).map(([value, v]) => ({ value, label: v.label, group: v.group }));
  const fretRange = () => { const st = S.settings(); return `frets ${st.minFret}–${st.maxFret}`; };

  // ---------------------------------------------------------------- Find the note
  const Find = {
    defaults: { mode: 'string', naturals: false },

    mount(ctx) {
      this.ctx = ctx;
      this.o = S.opts('find', this.defaults);
      const box = ctx.options;
      UI.select(box, 'Where', [
        { value: 'string', label: 'On a given string' },
        { value: 'any', label: 'Anywhere' },
        { value: 'all', label: 'Every position' },
      ], this.o.mode, v => { this.o.mode = v; S.saveOpts(); this.next(); });
      UI.toggle(box, 'Natural notes only', this.o.naturals, v => { this.o.naturals = v; S.saveOpts(); this.next(); });
      UI.button(box, 'Skip', () => this.skip());
      ctx.hint('Click the fret where the note lives. <kbd>Space</kbd> shows the answer, press again to move on.');
      this.next();
    },

    unmount() { clearTimeout(this.timer); },

    next() {
      clearTimeout(this.timer);
      const { board } = this.ctx;
      board.clear();
      this.t = null;
      const cells = rangeCells().filter(c => !this.o.naturals || T.isNatural(c.midi));
      if (!cells.length) { this.ctx.prompt('No frets to drill', 'Turn on some strings or widen the fret range in Settings'); return; }
      const sp = T.promptSpelling(S.settings().spelling);
      this.missed = false; this.done = false;

      if (this.o.mode === 'string') {
        const c = weightedPick(notLast(cells, x => key(x.s, x.f) === this.lastKey), x => S.weight(S.cellStat('find', x.s, x.f)));
        this.lastKey = key(c.s, c.f);
        const p = T.pc(c.midi);
        this.t = { pc: p, s: c.s, cell: c, name: T.name(p, sp) };
        this.targets = cells.filter(x => x.s === c.s && T.pc(x.midi) === p);
        this.ctx.prompt(T.pretty(this.t.name), `on the ${T.STRING_NAMES[c.s]} string`);
      } else {
        const pcs = notLast([...new Set(cells.map(c => T.pc(c.midi)))], p => p === this.lastPc);
        const p = weightedPick(pcs, x => S.weight(S.noteStat('find', x)));
        this.lastPc = p;
        this.t = { pc: p, s: null, name: T.name(p, sp) };
        this.targets = cells.filter(x => T.pc(x.midi) === p);
        this.found = new Set();
        this.ctx.prompt(T.pretty(this.t.name), this.o.mode === 'all'
          ? `find all ${this.targets.length} in ${fretRange()}`
          : `anywhere in ${fretRange()}`);
      }
      this.t0 = now();
    },

    onCell(s, f) {
      if (!this.t || this.done) return;
      const midi = T.midiAt(s, f), p = T.pc(midi);
      const { board } = this.ctx;
      A.pluck(midi);
      const lbl = p === this.t.pc ? T.pretty(this.t.name) : plainName(p);

      if (p === this.t.pc && (this.t.s == null || s === this.t.s)) {
        if (this.o.mode === 'all') {
          if (!this.targets.some(c => c.s === s && c.f === f)) {
            board.flash(s, f, { cls: 'info', label: lbl });
            this.ctx.sub(`Right note, but that's outside ${fretRange()}`);
            return;
          }
          if (this.found.has(key(s, f))) return;
          this.found.add(key(s, f));
          board.mark(s, f, { cls: 'ok', label: lbl });
          if (this.found.size < this.targets.length) {
            this.ctx.sub(`${this.found.size} of ${this.targets.length} found`, 'ok');
            return;
          }
        } else {
          board.mark(s, f, { cls: 'ok', label: lbl });
        }
        this.finish(s, f);
        return;
      }

      board.flash(s, f, { cls: 'bad', label: lbl });
      A.buzz();
      const msg = p === this.t.pc ? `Right note, wrong string. Use the ${T.STRING_NAMES[this.t.s]} string` : `That's ${lbl}. Try again`;
      this.ctx.sub(msg, 'bad');
      if (!this.missed) { this.missed = true; this.ctx.hud.miss(); }
    },

    finish(s, f) {
      const ms = now() - this.t0;
      this.done = true;
      const ok = !this.missed;
      if (ok) this.ctx.hud.hit(ms);
      const cell = this.o.mode === 'string' && (f < S.settings().minFret || f > S.settings().maxFret) ? this.t.cell : { s, f };
      S.record('find', { s: cell.s, f: cell.f, pc: this.t.pc, ok, ms });
      this.ctx.prompt(T.pretty(this.t.name), ok ? `✓ ${secs(ms)}` : '✓ got it', 'ok');
      this.timer = setTimeout(() => this.next(), S.advanceMs() + (ok ? 0 : 400));
    },

    reveal() {
      if (!this.t || this.done) return;
      this.done = true;
      for (const c of this.targets) {
        if (!this.found || !this.found.has(key(c.s, c.f))) this.ctx.board.mark(c.s, c.f, { cls: 'answer', label: T.pretty(this.t.name) });
      }
      if (!this.missed) this.ctx.hud.miss();
      S.record('find', { s: this.t.s != null ? this.t.cell.s : null, f: this.t.s != null ? this.t.cell.f : null, pc: this.t.pc, ok: false, ms: 0 });
      this.ctx.sub('Here it is. Press Space for the next one');
    },

    skip() { if (this.done) this.next(); else { this.reveal(); this.timer = setTimeout(() => this.next(), 1400); } },

    onKey(e) {
      if (e.code !== 'Space') return false;
      if (this.done) this.next(); else this.reveal();
      return true;
    },
  };

  // ---------------------------------------------------------------- Name the note
  const Name = {
    defaults: { naturals: false, playOnShow: false },

    mount(ctx) {
      this.ctx = ctx;
      this.o = S.opts('name', this.defaults);
      const box = ctx.options;
      UI.toggle(box, 'Natural notes only', this.o.naturals, v => { this.o.naturals = v; S.saveOpts(); this.next(); });
      UI.toggle(box, 'Play the note when shown', this.o.playOnShow, v => { this.o.playOnShow = v; S.saveOpts(); });
      const acc = S.settings().spelling === 'flat' ? '♭' : '♯';
      ctx.hint(`Click a name or type it: <kbd>A</kbd>–<kbd>G</kbd>, <kbd>Shift</kbd>+letter for ${acc}. <kbd>Space</kbd> shows the answer.`);
      this.buildPad();
      this.next();
    },

    unmount() { clearTimeout(this.timer); },

    buildPad() {
      const pad = this.ctx.pad;
      pad.hidden = false;
      pad.textContent = '';
      const sp = S.settings().spelling;
      for (let p = 0; p < 12; p++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.pc = p;
        const natural = !T.SHARP[p].includes('#');
        b.textContent = natural ? T.SHARP[p] : sp === 'mixed' ? `${T.pretty(T.SHARP[p])}/${T.pretty(T.FLAT[p])}` : T.pretty(T.name(p, sp));
        if (!natural) b.classList.add('acc');
        b.addEventListener('click', () => { b.blur(); this.answer(p); });
        pad.appendChild(b);
      }
    },

    next() {
      clearTimeout(this.timer);
      const { board, pad } = this.ctx;
      board.clear();
      pad.querySelectorAll('button').forEach(b => b.classList.remove('ok', 'bad'));
      const cells = rangeCells().filter(c => !this.o.naturals || T.isNatural(c.midi));
      if (!cells.length) { this.t = null; this.ctx.prompt('No frets to drill', 'Turn on some strings or widen the fret range in Settings'); return; }
      const c = weightedPick(notLast(cells, x => key(x.s, x.f) === this.lastKey), x => S.weight(S.cellStat('name', x.s, x.f)));
      this.lastKey = key(c.s, c.f);
      this.t = { ...c, pc: T.pc(c.midi) };
      this.missed = false; this.done = false;
      board.mark(c.s, c.f, { cls: 'target', label: '?' });
      this.ctx.prompt('What note is this?', `${T.STRING_NAMES[c.s]} string · fret ${c.f}`);
      if (this.o.playOnShow) A.pluck(c.midi);
      this.t0 = now();
    },

    answer(p) {
      if (!this.t || this.done) return;
      const btn = this.ctx.pad.querySelector(`[data-pc="${p}"]`);
      const sp = T.promptSpelling(S.settings().spelling);
      if (p === this.t.pc) {
        const ms = now() - this.t0;
        this.done = true;
        const ok = !this.missed;
        if (ok) this.ctx.hud.hit(ms);
        S.record('name', { s: this.t.s, f: this.t.f, pc: p, ok, ms });
        const nm = T.pretty(T.name(p, sp));
        this.ctx.board.mark(this.t.s, this.t.f, { cls: 'ok', label: nm });
        btn.classList.add('ok');
        A.pluck(this.t.midi);
        this.ctx.prompt(nm, ok ? `✓ ${secs(ms)}` : '✓ got it', 'ok');
        this.timer = setTimeout(() => this.next(), S.advanceMs() + (ok ? 0 : 400));
      } else {
        btn.classList.add('bad');
        setTimeout(() => btn.classList.remove('bad'), 500);
        A.buzz();
        this.ctx.sub(`Not ${btn.textContent}. Try again`, 'bad');
        if (!this.missed) { this.missed = true; this.ctx.hud.miss(); }
      }
    },

    reveal() {
      if (!this.t || this.done) return;
      this.done = true;
      if (!this.missed) this.ctx.hud.miss();
      S.record('name', { s: this.t.s, f: this.t.f, pc: this.t.pc, ok: false, ms: 0 });
      const nm = T.pretty(T.name(this.t.pc, S.settings().spelling === 'flat' ? 'flat' : 'sharp'));
      this.ctx.board.mark(this.t.s, this.t.f, { cls: 'answer', label: nm });
      this.ctx.pad.querySelector(`[data-pc="${this.t.pc}"]`).classList.add('ok');
      A.pluck(this.t.midi);
      this.ctx.prompt(nm, 'Press Space for the next one');
    },

    onKey(e) {
      if (e.code === 'Space') { if (this.done) this.next(); else this.reveal(); return true; }
      const m = /^Key([A-G])$/.exec(e.code);
      if (!m) return false;
      let p = T.LETTER_PC[m[1]];
      if (e.shiftKey) p += S.settings().spelling === 'flat' ? -1 : 1;
      this.answer(T.mod12(p));
      return true;
    },
  };

  // ---------------------------------------------------------------- Note sequences
  const Sequence = {
    defaults: { source: 'random', root: 0, scale: 'major', length: 4, octave: false, position: true, boxStart: 'auto', boxSpan: 4, custom: 'C C B A' },

    mount(ctx) {
      this.ctx = ctx;
      this.o = S.opts('sequence', this.defaults);
      this.buildOptions();
      ctx.hint('Click each note in order. <kbd>Space</kbd> new sequence · <kbd>H</kbd> hear it. Your own notes can include octaves, e.g. <code>C5 C5 B4 A4</code>.');
      this.next();
    },

    unmount() { clearTimeout(this.timer); },

    set(k, v, rebuild) {
      this.o[k] = v;
      S.saveOpts();
      if (rebuild) this.buildOptions();
      this.next();
    },

    boxStarts() {
      const st = S.settings();
      const span = Math.min(this.o.boxSpan, st.maxFret - st.minFret + 1);
      const out = [];
      for (let f = st.minFret; f + span - 1 <= st.maxFret; f++) out.push(f);
      return { span, starts: out };
    },

    buildOptions() {
      const box = this.ctx.options, o = this.o;
      box.textContent = '';
      UI.select(box, 'Notes', [{ value: 'random', label: 'Random melody' }, { value: 'custom', label: 'My own notes' }],
        o.source, v => this.set('source', v, true));
      if (o.source === 'custom') {
        UI.textInput(box, 'Sequence', o.custom, 'e.g. C C B A', v => { o.custom = v; S.saveOpts(); this.next(); });
      } else {
        UI.select(box, 'Key', T.rootOptions(o.scale), o.root, v => this.set('root', v));
        UI.select(box, 'Scale', scaleOptions(), o.scale, v => this.set('scale', v, true));
        UI.select(box, 'Length', [3, 4, 5, 6, 7, 8, 10, 12].map(n => ({ value: n, label: n + ' notes' })), o.length, v => this.set('length', v));
      }
      UI.toggle(box, 'Right octave', o.octave, v => this.set('octave', v));
      UI.toggle(box, 'Stay in position', o.position, v => this.set('position', v, true));
      if (o.position) {
        const { span, starts } = this.boxStarts();
        if (o.boxStart !== 'auto' && !starts.includes(o.boxStart)) o.boxStart = 'auto';
        UI.select(box, 'Position', [{ value: 'auto', label: 'Random' }, ...starts.map(f => ({ value: f, label: `Frets ${f}–${f + span - 1}` }))],
          o.boxStart, v => this.set('boxStart', v));
        UI.select(box, 'Width', [4, 5, 6].map(n => ({ value: n, label: n + ' frets' })), o.boxSpan, v => this.set('boxSpan', v, true));
      }
      UI.button(box, '▶ Hear it', () => this.hear());
      UI.button(box, 'New', () => this.next());
    },

    fail(msg) {
      this.notes = null;
      this.ctx.strip(null);
      this.ctx.prompt('Hmm', msg);
    },

    fits(notes, box) {
      const cells = rangeCells().filter(c => c.f >= box.from && c.f <= box.to);
      return notes.every(n => cells.some(c => T.pc(c.midi) === n.pc && (!this.o.octave || n.midi == null || c.midi === n.midi)));
    },

    chooseBox(notes) {
      const { span, starts } = this.boxStarts();
      if (!starts.length) return null;
      const mk = f => ({ from: f, to: f + span - 1 });
      if (this.o.boxStart !== 'auto') return mk(starts.includes(this.o.boxStart) ? this.o.boxStart : starts[0]);
      if (!notes) return mk(pick(starts));
      const ok = starts.filter(f => this.fits(notes, mk(f)));
      return ok.length ? mk(pick(ok)) : null;
    },

    randomMelody() {
      const info = this.info;
      const cells = rangeCells().filter(c => info.set.has(T.pc(c.midi)) && (!this.box || (c.f >= this.box.from && c.f <= this.box.to)));
      let P = [...new Set(cells.map(c => c.midi))].sort((a, b) => a - b);
      if (!this.box && P.length > 15) { const st = rand(P.length - 14); P = P.slice(st, st + 15); }
      if (P.length < 3) return null;
      const roots = P.map((m, i) => (T.pc(m) === this.o.root ? i : -1)).filter(i => i >= 0);
      let idx = roots.length ? pick(roots) : rand(P.length);
      const out = [P[idx]];
      const moves = [-2, -1, -1, -1, 0, 1, 1, 1, 2, -3, 3];
      while (out.length < this.o.length) {
        let ni;
        do { ni = idx + pick(moves); } while (ni < 0 || ni >= P.length);
        idx = ni;
        out.push(P[idx]);
      }
      return out.map(m => ({ pc: T.pc(m), midi: m, name: info.names.get(T.pc(m)) }));
    },

    next() {
      clearTimeout(this.timer);
      const o = this.o;
      this.ctx.board.clear();
      this.done = false; this.i = 0; this.mistakes = 0; this.tStart = null; this.tl = now();
      this.info = o.source === 'random' ? T.scaleInfo(o.root, o.scale) : null;

      let notes = null;
      if (o.source === 'custom') {
        const parsed = T.parseSequence(o.custom);
        if (parsed.error) return this.fail(parsed.error);
        if (!parsed.notes.length) return this.fail('Type some notes, e.g. C C B A');
        notes = parsed.notes;
      }

      this.box = o.position ? this.chooseBox(notes) : null;
      this.ctx.board.setBox(this.box);
      if (o.position && !this.box) {
        return this.fail(notes ? "Those notes don't fit in one position with your settings. Try a wider box or turn off Stay in position" : 'Your fret range is narrower than the box width');
      }
      if (!notes) {
        notes = this.randomMelody();
        if (!notes) return this.fail('Not enough scale notes here. Try a wider box');
      }
      this.notes = notes;
      const rules = [o.octave ? 'right octave' : 'any octave', this.box ? `frets ${this.box.from}–${this.box.to}` : 'anywhere on the neck'];
      this.ctx.prompt('Play this', rules.join(' · '));
      this.renderStrip();
    },

    renderStrip() {
      this.ctx.strip(this.notes.map((n, k) => ({
        text: T.pretty(n.name),
        sub: this.o.octave && n.midi != null ? T.octaveOf(n.midi, n.name) : '',
        state: k < this.i ? 'done' : k === this.i ? 'cur' : 'todo',
      })));
    },

    nameFor(p) { return this.info && this.info.names.has(p) ? T.pretty(this.info.names.get(p)) : plainName(p); },

    onCell(s, f) {
      if (!this.notes || this.done) return;
      const t = this.notes[this.i];
      const midi = T.midiAt(s, f), p = T.pc(midi);
      const { board } = this.ctx;
      A.pluck(midi);
      if (this.tStart == null) this.tStart = now();

      let err = null;
      if (p !== t.pc) err = `That's ${this.nameFor(p)}, you need ${T.pretty(t.name)}`;
      else if (this.o.octave && t.midi != null && midi !== t.midi) err = midi < t.midi ? 'Right note, too low. Go up an octave' : 'Right note, too high. Go down an octave';
      else if (this.box && (f < this.box.from || f > this.box.to)) err = `Right note, but stay inside frets ${this.box.from}–${this.box.to}`;

      if (err) {
        board.flash(s, f, { cls: 'bad', label: this.nameFor(p) });
        A.buzz();
        this.ctx.sub(err, 'bad');
        this.mistakes++;
        this.ctx.hud.miss();
        return;
      }

      const prev = board.getMark(s, f);
      const label = prev && String(prev.label).length < 4 ? `${prev.label},${this.i + 1}` : String(this.i + 1);
      board.mark(s, f, { cls: 'ok', label });
      this.ctx.hud.hit(now() - this.tl);
      this.tl = now();
      this.i++;
      this.renderStrip();
      if (this.i < this.notes.length) { this.ctx.sub(`${this.i} of ${this.notes.length}`); return; }

      this.done = true;
      const ms = now() - this.tStart;
      this.ctx.prompt(this.mistakes ? 'Done' : 'Clean!', `${this.mistakes} mistake${this.mistakes === 1 ? '' : 's'} · ${secs(ms)}`, this.mistakes ? '' : 'ok');
      this.timer = setTimeout(() => this.next(), 1700);
    },

    hear() {
      if (!this.notes) return;
      let prev = 60;
      const midis = this.notes.map(n => {
        let m = n.midi;
        if (m == null) {
          let d = T.mod12(n.pc - T.pc(prev));
          if (d > 6) d -= 12;
          m = prev + d;
        }
        prev = m;
        return m;
      });
      A.sequence(midis, 0.42);
    },

    onKey(e) {
      if (e.code === 'Space') { this.next(); return true; }
      if (e.code === 'KeyH') { this.hear(); return true; }
      return false;
    },
  };

  // ---------------------------------------------------------------- Scale patterns
  const Scales = {
    defaults: { root: 9, scale: 'minorPent', shape: 'nps', posF0: null, boxStart: 5, boxSpan: 4, dir: 'updown', seq: 'straight', view: 'shown', labels: 'names' },

    mount(ctx) {
      this.ctx = ctx;
      this.o = S.opts('scales', this.defaults);
      ctx.hint('Play the pattern in order, root notes are gold. <kbd>Space</kbd> restart · <kbd>H</kbd> hear it. Try <b>From memory</b> once the shape sticks.');
      this.build();
    },

    unmount() { clearTimeout(this.timer); },

    set(k, v) { this.o[k] = v; S.saveOpts(); this.build(); },

    build() { this.compute(); this.buildOptions(); this.startPass(); },

    compute() {
      const o = this.o;
      this.info = T.scaleInfo(o.root, o.scale);
      if (o.shape === 'nps') {
        this.positions = T.npsPositions(o.root, o.scale, 24);
        let p = this.positions.find(x => x.f0 === o.posF0);
        if (!p) { p = this.positions.find(x => x.deg === 0) || this.positions[0]; o.posF0 = p.f0; }
        this.pattern = p.pattern;
      } else {
        o.boxStart = Math.min(Math.max(0, o.boxStart), 25 - o.boxSpan);
        this.pattern = T.boxPattern(o.root, o.scale, o.boxStart, o.boxSpan);
      }
      this.seq = T.orderSequence(this.pattern, o.dir, o.seq);
      const maxF = Math.max(0, ...this.pattern.map(p => p.f));
      const { board } = this.ctx;
      board.configure({ minFret: 0, strings: [true, true, true, true, true, true], maxFret: Math.min(24, Math.max(S.settings().maxFret, maxF + 1)) });
      board.setBox(o.shape === 'box' ? { from: o.boxStart, to: o.boxStart + o.boxSpan - 1 } : null);
    },

    buildOptions() {
      const box = this.ctx.options, o = this.o;
      box.textContent = '';
      UI.select(box, 'Key', T.rootOptions(o.scale), o.root, v => this.set('root', v));
      UI.select(box, 'Scale', scaleOptions(), o.scale, v => { o.posF0 = null; this.set('scale', v); });
      const n = T.notesPerString(T.SCALES[o.scale]);
      UI.select(box, 'Shape', [{ value: 'nps', label: `${n} notes per string` }, { value: 'box', label: 'Fret box' }], o.shape, v => this.set('shape', v));
      if (o.shape === 'nps') {
        UI.select(box, 'Position', this.positions.map((p, i) => ({
          value: p.f0,
          label: `${i + 1}: frets ${p.minF}–${p.maxF} (from ${T.pretty(this.info.names.get(T.pc(p.pattern[0].midi)))})`,
        })), o.posF0, v => this.set('posF0', v));
      } else {
        const starts = [];
        for (let f = 0; f <= 25 - o.boxSpan; f++) starts.push({ value: f, label: `Frets ${f}–${f + o.boxSpan - 1}` });
        UI.select(box, 'Position', starts, o.boxStart, v => this.set('boxStart', v));
        UI.select(box, 'Width', [4, 5, 6].map(w => ({ value: w, label: w + ' frets' })), o.boxSpan, v => this.set('boxSpan', v));
      }
      UI.select(box, 'Direction', [{ value: 'up', label: 'Up' }, { value: 'down', label: 'Down' }, { value: 'updown', label: 'Up & down' }], o.dir, v => this.set('dir', v));
      UI.select(box, 'Sequence', [
        { value: 'straight', label: 'Straight' }, { value: 'thirds', label: 'In thirds' },
        { value: 'groups3', label: 'Groups of 3' }, { value: 'groups4', label: 'Groups of 4' },
      ], o.seq, v => this.set('seq', v));
      UI.select(box, 'View', [
        { value: 'guided', label: 'Guided (next note lit)' }, { value: 'shown', label: 'Pattern shown' }, { value: 'memory', label: 'From memory' },
      ], o.view, v => this.set('view', v));
      UI.select(box, 'Labels', [{ value: 'names', label: 'Note names' }, { value: 'degrees', label: 'Scale degrees' }, { value: 'none', label: 'None' }], o.labels, v => this.set('labels', v));
      UI.button(box, '▶ Hear it', () => this.hear());
      UI.button(box, 'Restart', () => this.startPass());
    },

    label(p) {
      const c = T.pc(p.midi);
      if (this.o.labels === 'names') return T.pretty(this.info.names.get(c));
      if (this.o.labels === 'degrees') return this.info.degs.get(c);
      return '';
    },

    baseCls(p) { return T.pc(p.midi) === this.o.root ? 'root' : 'pattern'; },

    bestKey() {
      const o = this.o;
      return ['scale', o.root, o.scale, o.shape, o.shape === 'nps' ? o.posF0 : `${o.boxStart}-${o.boxSpan}`, o.dir, o.seq].join('|');
    },

    startPass() {
      clearTimeout(this.timer);
      const { board } = this.ctx;
      board.clear();
      this.i = 0; this.mistakes = 0; this.tStart = null; this.tl = now(); this.done = false; this.nextCell = null;
      if (!this.seq.length) { this.ctx.prompt('Hmm', 'No notes in this pattern'); return; }
      if (this.o.view !== 'memory') {
        for (const p of this.pattern) board.mark(p.s, p.f, { cls: this.baseCls(p), label: this.label(p), anim: false });
      }
      this.markNext();
      const first = this.seq[0];
      const best = S.best(this.bestKey());
      const shape = this.o.shape === 'nps' ? `${T.notesPerString(this.info.sc)} notes per string` : `frets ${this.o.boxStart}–${this.o.boxStart + this.o.boxSpan - 1}`;
      this.ctx.prompt(this.info.title, `${shape} · start on ${T.pretty(this.info.names.get(T.pc(first.midi)))}, ${T.STRING_NAMES[first.s]} string fret ${first.f}` + (best ? ` · best clean run ${secs(best)}` : ''));
      this.renderStrip();
    },

    markNext() {
      const { board } = this.ctx;
      const prev = this.nextCell;
      if (prev) {
        if (this.o.view === 'memory') board.unmark(prev.s, prev.f);
        else board.mark(prev.s, prev.f, { cls: this.baseCls(prev), label: this.label(prev), anim: false });
        if (this.o.view === 'memory' && this.found && this.found.has(key(prev.s, prev.f))) board.mark(prev.s, prev.f, { cls: 'found', label: this.label(prev), anim: false });
      }
      this.nextCell = null;
      if (this.i === 0) this.found = new Set();
      const t = this.seq[this.i];
      if (!t) return;
      if (this.o.view === 'guided' || (this.o.view === 'memory' && this.i === 0)) {
        board.mark(t.s, t.f, { cls: `${this.o.view === 'memory' ? 'pattern' : this.baseCls(t)} next`, label: this.label(t), anim: false });
        this.nextCell = t;
      }
    },

    renderStrip() {
      const from = Math.max(0, this.i - 3);
      const items = this.seq.slice(from, from + 14).map((p, k) => ({
        text: T.pretty(this.info.names.get(T.pc(p.midi))),
        state: from + k < this.i ? 'done' : from + k === this.i ? 'cur' : 'todo',
      }));
      if (from + 14 < this.seq.length) items.push({ text: `+${this.seq.length - from - 14}`, state: 'more' });
      if (from > 0) items.unshift({ text: `${from}…`, state: 'more' });
      this.ctx.strip(items);
    },

    onCell(s, f) {
      if (this.done || !this.seq.length) return;
      const t = this.seq[this.i];
      const midi = T.midiAt(s, f), p = T.pc(midi);
      const { board } = this.ctx;
      A.pluck(midi);
      if (this.tStart == null) this.tStart = now();

      if (s === t.s && f === t.f) {
        this.ctx.hud.hit(now() - this.tl);
        this.tl = now();
        if (this.o.view === 'memory') {
          this.found.add(key(s, f));
          board.mark(s, f, { cls: 'found', label: this.label(t) });
        } else {
          board.flash(s, f, { cls: 'hit', label: this.label(t) }, 380);
        }
        this.i++;
        this.markNext();
        this.renderStrip();
        if (this.i >= this.seq.length) this.finish();
        else this.ctx.sub(`${this.i} of ${this.seq.length}`);
        return;
      }

      const nm = this.info.names.has(p) ? T.pretty(this.info.names.get(p)) : plainName(p);
      const need = T.pretty(this.info.names.get(T.pc(t.midi)));
      let msg;
      if (midi === t.midi) msg = `Right note, but play it on the ${T.STRING_NAMES[t.s]} string to stay in the pattern`;
      else if (this.pattern.some(x => x.s === s && x.f === f)) msg = `${nm} is in the pattern, but the next note is ${need}`;
      else if (this.info.set.has(p)) msg = `${nm} is in the scale but outside this pattern. Next is ${need}`;
      else msg = `${nm} isn't in ${this.info.title}. Next is ${need}`;
      board.flash(s, f, { cls: 'bad', label: nm });
      A.buzz();
      this.ctx.sub(msg, 'bad');
      this.mistakes++;
      this.ctx.hud.miss();
    },

    finish() {
      this.done = true;
      const ms = now() - this.tStart;
      const k = this.bestKey();
      const best = S.best(k);
      let note = '';
      if (!this.mistakes) {
        if (!best || ms < best) { S.setBest(k, ms); note = best ? ` · new best (was ${secs(best)})` : ' · first clean run!'; }
        else note = ` · best ${secs(best)}`;
      }
      this.ctx.prompt(this.mistakes ? 'Pass complete' : 'Clean pass!',
        `${this.mistakes} mistake${this.mistakes === 1 ? '' : 's'} · ${secs(ms)}${note} · going again…`, this.mistakes ? '' : 'ok');
      this.timer = setTimeout(() => this.startPass(), 2200);
    },

    hear() { A.sequence(this.seq.map(p => p.midi), 0.26); },

    onKey(e) {
      if (e.code === 'Space') { this.startPass(); return true; }
      if (e.code === 'KeyH') { this.hear(); return true; }
      return false;
    },
  };

  FD.drills = { find: Find, name: Name, sequence: Sequence, scales: Scales };
  FD.scaleOptions = scaleOptions;
})();
