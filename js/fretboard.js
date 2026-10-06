// SVG fretboard: draws the neck, handles clicks, and shows marks / heatmaps / position boxes.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
  const DOUBLE = [12, 24];
  const STRING_W = [1.1, 1.4, 1.8, 2.3, 2.8, 3.3];
  let uid = 0;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  class Fretboard {
    constructor(svg) {
      this.svg = svg;
      this.id = ++uid;
      this.cfg = { minFret: 0, maxFret: 12, leftHanded: false, strings: [true, true, true, true, true, true] };
      this.marks = new Map();
      this.markEls = new Map();
      this.box = null;
      this.heat = null;
      this.onCell = null;
      svg.addEventListener('pointerdown', e => {
        if (e.button) return;
        const c = e.target.closest('.cell');
        if (!c || !this.onCell) return;
        e.preventDefault();
        this.onCell(+c.dataset.s, +c.dataset.f);
      });
      this.render();
    }

    configure(cfg) { Object.assign(this.cfg, cfg); this.render(); }
    setBox(box) { this.box = box; this.render(); }
    setHeat(fn) { this.heat = fn; this.render(); }

    render() {
      const { maxFret, minFret, leftHanded, strings } = this.cfg;
      const W = 1200, H = 236, padL = 34, openW = 52, padR = 14, top = 26, bottom = 40;
      const nutX = padL + openW;
      const r = 0.971;
      let sum = 0;
      for (let f = 1; f <= maxFret; f++) sum += Math.pow(r, f - 1);
      const k = (W - nutX - padR) / sum;
      const fx = [nutX];
      for (let f = 1; f <= maxFret; f++) fx[f] = fx[f - 1] + k * Math.pow(r, f - 1);
      const gap = (H - top - bottom) / 5;
      const sy = s => top + s * gap;
      const X = x => (leftHanded ? W - x : x);
      this.geo = { fx, sy, X, gap, padL, nutX };

      const svg = this.svg;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.textContent = '';

      const defs = el('defs', {}, svg);
      const grad = el('linearGradient', { id: `wood${this.id}`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
      el('stop', { offset: '0%', 'stop-color': '#4b3424' }, grad);
      el('stop', { offset: '50%', 'stop-color': '#3c2a1d' }, grad);
      el('stop', { offset: '100%', 'stop-color': '#47311f' }, grad);

      const yTop = sy(0) - gap * 0.5, yBot = sy(5) + gap * 0.5;
      el('rect', { ...this.span(nutX, fx[maxFret]), y: yTop, height: yBot - yTop, fill: `url(#wood${this.id})`, rx: 3 }, svg);

      for (let f = 1; f <= maxFret; f++) {
        const cx = X((fx[f - 1] + fx[f]) / 2);
        if (INLAYS.includes(f)) el('circle', { class: 'fb-inlay', cx, cy: (sy(2) + sy(3)) / 2, r: 6.5 }, svg);
        if (DOUBLE.includes(f)) {
          el('circle', { class: 'fb-inlay', cx, cy: (sy(1) + sy(2)) / 2, r: 6.5 }, svg);
          el('circle', { class: 'fb-inlay', cx, cy: (sy(3) + sy(4)) / 2, r: 6.5 }, svg);
        }
      }

      if (minFret > 0) {
        el('rect', { class: 'fb-oor', ...this.span(padL, fx[minFret - 1]), y: yTop, height: yBot - yTop }, svg);
      }

      const heatLayer = el('g', { class: 'heat' }, svg);

      if (this.box) {
        const [a] = this.bounds(this.box.from);
        const [, b] = this.bounds(Math.min(this.box.to, maxFret));
        el('rect', { class: 'fb-box', ...this.span(a + 2, b - 2), y: yTop - 6, height: yBot - yTop + 12, rx: 8 }, svg);
      }

      for (let f = 1; f <= maxFret; f++) {
        el('line', { class: 'fb-fret', x1: X(fx[f]), x2: X(fx[f]), y1: yTop, y2: yBot }, svg);
      }
      el('line', { class: 'fb-nut', x1: X(nutX), x2: X(nutX), y1: yTop - 1, y2: yBot + 1 }, svg);

      for (let s = 0; s < 6; s++) {
        el('line', {
          class: 'fb-str' + (strings[s] ? '' : ' off'),
          x1: X(padL + 6), x2: X(fx[maxFret]), y1: sy(s), y2: sy(s), 'stroke-width': STRING_W[s],
        }, svg);
        const t = el('text', { class: 'fb-label' + (strings[s] ? '' : ' off'), x: X(padL - 14), y: sy(s) }, svg);
        t.textContent = FD.theory.STRING_SHORT[s];
      }

      for (let f = 0; f <= maxFret; f++) {
        const [cx] = this.center(0, f);
        const t = el('text', { class: 'fb-num' + (INLAYS.includes(f) || DOUBLE.includes(f) ? ' dot' : ''), x: cx, y: H - 12 }, svg);
        t.textContent = f;
      }

      if (this.heat) {
        for (let s = 0; s < 6; s++) {
          for (let f = 0; f <= maxFret; f++) {
            const h = this.heat(s, f);
            if (!h) continue;
            const [a, b] = this.bounds(f);
            el('rect', { ...this.span(a + 2, b - 2), y: sy(s) - gap / 2 + 2, height: gap - 4, rx: 6, fill: h.color }, heatLayer);
            const [cx, cy] = this.center(s, f);
            const t = el('text', { x: cx, y: cy }, heatLayer);
            t.textContent = h.label;
          }
        }
      }

      this.layers = {
        marks: el('g', { class: 'marks' }, svg),
        temp: el('g', { class: 'temp' }, svg),
        cells: el('g', { class: 'cells' }, svg),
      };
      for (let s = 0; s < 6; s++) {
        for (let f = 0; f <= maxFret; f++) {
          const [a, b] = this.bounds(f);
          el('rect', { class: 'cell', 'data-s': s, 'data-f': f, ...this.span(a, b), y: sy(s) - gap / 2, height: gap }, this.layers.cells);
        }
      }

      this.markEls.clear();
      for (const [key, m] of this.marks) {
        const e = this.drawMark(this.layers.marks, m, false);
        if (e) this.markEls.set(key, e);
      }
    }

    span(xa, xb) {
      const a = this.geo.X(xa), b = this.geo.X(xb);
      return { x: Math.min(a, b), width: Math.abs(b - a) };
    }

    bounds(f) {
      const g = this.geo;
      return f === 0 ? [g.padL, g.nutX] : [g.fx[f - 1], g.fx[f]];
    }

    center(s, f) {
      const g = this.geo;
      const x = f === 0 ? (g.padL + g.nutX) / 2 : (g.fx[f - 1] + g.fx[f]) / 2;
      return [g.X(x), g.sy(s)];
    }

    drawMark(layer, m, anim) {
      if (m.f > this.cfg.maxFret) return null;
      const [x, y] = this.center(m.s, m.f);
      const g = el('g', { class: `mk ${m.cls || ''}${anim ? ' pop' : ''}`, transform: `translate(${x} ${y})` }, layer);
      el('circle', { r: 13 }, g);
      if (m.label != null && m.label !== '') {
        const label = String(m.label);
        const t = el('text', { 'font-size': label.length > 3 ? 8.5 : label.length > 2 ? 10 : 12 }, g);
        t.textContent = label;
      }
      return g;
    }

    mark(s, f, opts = {}) {
      const key = s + ',' + f;
      const old = this.markEls.get(key);
      if (old) old.remove();
      const m = { s, f, ...opts };
      this.marks.set(key, m);
      const e = this.drawMark(this.layers.marks, m, opts.anim !== false);
      if (e) this.markEls.set(key, e); else this.markEls.delete(key);
    }

    getMark(s, f) { return this.marks.get(s + ',' + f); }

    unmark(s, f) {
      const key = s + ',' + f;
      const old = this.markEls.get(key);
      if (old) old.remove();
      this.marks.delete(key);
      this.markEls.delete(key);
    }

    clear() {
      this.marks.clear();
      this.markEls.clear();
      this.layers.marks.textContent = '';
      this.layers.temp.textContent = '';
    }

    flash(s, f, opts = {}, ms = 650) {
      const e = this.drawMark(this.layers.temp, { s, f, ...opts }, true);
      if (e) setTimeout(() => e.remove(), ms);
    }
  }

  FD.Fretboard = Fretboard;
})();
