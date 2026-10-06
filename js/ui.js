// Small DOM helpers for option controls, plus the session scoreboard.
FD.ui = (() => {
  function field(parent, label) {
    const w = document.createElement('label');
    w.className = 'field';
    const s = document.createElement('span');
    s.textContent = label;
    w.appendChild(s);
    parent.appendChild(w);
    return w;
  }

  function select(parent, label, options, value, onChange) {
    const w = field(parent, label);
    const sel = document.createElement('select');
    const groups = new Map();
    for (const o of options) {
      const op = document.createElement('option');
      op.value = String(o.value);
      op.textContent = o.label;
      let target = sel;
      if (o.group) {
        target = groups.get(o.group);
        if (!target) {
          target = document.createElement('optgroup');
          target.label = o.group;
          groups.set(o.group, target);
          sel.appendChild(target);
        }
      }
      target.appendChild(op);
    }
    sel.value = String(value);
    if (sel.selectedIndex < 0) sel.selectedIndex = 0;
    sel.addEventListener('change', () => {
      const opt = options.find(o => String(o.value) === sel.value);
      sel.blur();
      onChange(opt ? opt.value : sel.value);
    });
    w.appendChild(sel);
    return sel;
  }

  function toggle(parent, label, checked, onChange) {
    const w = document.createElement('label');
    w.className = 'toggle';
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.checked = !!checked;
    i.addEventListener('change', () => { i.blur(); onChange(i.checked); });
    const knob = document.createElement('span');
    knob.className = 'switch';
    const txt = document.createElement('span');
    txt.textContent = label;
    w.append(i, knob, txt);
    parent.appendChild(w);
    return i;
  }

  function button(parent, label, onClick, cls = '') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + cls;
    b.textContent = label;
    b.addEventListener('click', () => { b.blur(); onClick(); });
    parent.appendChild(b);
    return b;
  }

  function textInput(parent, label, value, placeholder, onSubmit) {
    const w = field(parent, label);
    w.classList.add('grow');
    const row = document.createElement('div');
    row.className = 'inline';
    const i = document.createElement('input');
    i.type = 'text';
    i.value = value;
    i.placeholder = placeholder;
    i.spellcheck = false;
    const go = () => { i.blur(); onSubmit(i.value); };
    i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    row.appendChild(i);
    w.appendChild(row);
    button(row, 'Use', go, 'primary');
    return i;
  }

  const hud = {
    el: null,
    reset() { this.hits = 0; this.misses = 0; this.streak = 0; this.best = 0; this.times = []; this.render(); },
    hit(ms) {
      this.hits++; this.streak++;
      this.best = Math.max(this.best, this.streak);
      if (ms != null) { this.times.push(ms); if (this.times.length > 20) this.times.shift(); }
      this.render();
    },
    miss() { this.misses++; this.streak = 0; this.render(); },
    render() {
      if (!this.el) return;
      const tot = this.hits + this.misses;
      const acc = tot ? Math.round((100 * this.hits) / tot) + '%' : '–';
      const avg = this.times.length ? (this.times.reduce((a, b) => a + b, 0) / this.times.length / 1000).toFixed(1) + 's' : '–';
      const cell = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
      this.el.innerHTML = cell(this.hits, 'correct') + cell(this.misses, 'misses') + cell(acc, 'accuracy') +
        cell(`${this.streak}<small> / ${this.best}</small>`, 'streak / best') + cell(avg, 'avg time');
    },
  };

  return { select, toggle, button, textInput, hud };
})();
