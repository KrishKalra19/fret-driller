// Stats and Settings pages.
(() => {
  const T = FD.theory, S = FD.store, UI = FD.ui;

  const heatColor = acc => `hsla(${Math.round(acc * 120)}, 62%, 42%, 0.85)`;

  const stats = {
    mode: 'find',

    mount(el) {
      el.innerHTML = `
        <div class="page-head">
          <h2>Your ${T.instrument.label.toLowerCase()} stats</h2>
          <div class="seg" id="stats-mode">
            <button data-mode="find">Find the note</button>
            <button data-mode="name">Name the note</button>
          </div>
          <span class="spacer"></span>
          <button class="btn danger" id="stats-reset">Reset ${T.instrument.label.toLowerCase()} stats</button>
        </div>
        <div class="cards" id="stats-cards"></div>
        <div class="board-wrap"><svg class="board" id="stats-board"></svg></div>
        <p class="legend"><span><span class="sw" style="background:${heatColor(0)}"></span> struggling</span>
          <span><span class="sw" style="background:${heatColor(0.5)}"></span> so-so</span>
          <span><span class="sw" style="background:${heatColor(1)}"></span> solid</span>
          <span>· numbers are your average seconds per fret. Weak spots come up more often in the drills.</span></p>
        <table class="notes-table" id="stats-table"></table>`;
      this.el = el;
      this.board = new FD.Fretboard(el.querySelector('#stats-board'));
      el.querySelectorAll('#stats-mode button').forEach(b => b.addEventListener('click', () => { this.mode = b.dataset.mode; this.render(); }));
      el.querySelector('#stats-reset').addEventListener('click', () => {
        if (confirm(`Reset all ${T.instrument.label.toLowerCase()} practice stats and best times? This cannot be undone.`)) { S.resetStats(); this.render(); }
      });
      this.render();
    },

    render() {
      const el = this.el, mode = this.mode, st = S.settings();
      el.querySelectorAll('#stats-mode button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      this.board.configure({ minFret: 0, maxFret: st.maxFret, leftHanded: st.leftHanded, strings: st.strings });
      this.board.setHeat((s, f) => {
        const c = S.cellStat(mode, s, f);
        if (!c || !c.n) return null;
        return { color: heatColor(c.ok / c.n), label: c.tn ? (c.t / c.tn / 1000).toFixed(1) : '✗' };
      });

      let total = 0, n = 0, ok = 0, t = 0, tn = 0;
      const rows = [];
      for (let p = 0; p < 12; p++) {
        const c = S.noteStat(mode, p);
        const name = T.pretty(T.name(p, st.spelling === 'flat' ? 'flat' : 'sharp'));
        if (c) { total += c.total; n += c.n; ok += c.ok; t += c.t; tn += c.tn; }
        rows.push({ p, name, c });
      }
      const weakest = rows.filter(r => r.c && r.c.n).sort((a, b) => S.weight(b.c) - S.weight(a.c)).slice(0, 3);
      const card = (v, l) => `<div class="card"><b>${v}</b><span>${l}</span></div>`;
      el.querySelector('#stats-cards').innerHTML =
        card(total, 'questions answered') +
        card(n ? Math.round((100 * ok) / n) + '%' : '–', 'recent accuracy') +
        card(tn ? (t / tn / 1000).toFixed(1) + 's' : '–', 'avg time') +
        card(weakest.length ? weakest.map(r => r.name).join(' · ') : '–', 'weakest notes');

      el.querySelector('#stats-table').innerHTML = '<tr><th>Note</th><th>Answered</th><th>Accuracy</th><th>Avg time</th></tr>' +
        rows.map(({ name, c }) => {
          if (!c || !c.n) return `<tr class="empty"><td>${name}</td><td>0</td><td>–</td><td>–</td></tr>`;
          const acc = c.ok / c.n;
          return `<tr><td>${name}</td><td>${c.total}</td>
            <td><div class="bar"><i style="width:${Math.round(acc * 100)}%;background:${heatColor(acc)}"></i></div>${Math.round(acc * 100)}%</td>
            <td>${c.tn ? (c.t / c.tn / 1000).toFixed(1) + 's' : '–'}</td></tr>`;
        }).join('');
    },
  };

  const settings = {
    mount(el) {
      el.innerHTML = `<div class="page-head"><h2>Settings</h2></div><div class="settings-grid" id="settings-body"></div>
        <p class="legend">Settings and stats are saved in this browser only.</p>`;
      const body = el.querySelector('#settings-body');
      const st = S.settings();
      const group = (title, desc) => {
        const g = document.createElement('div');
        g.className = 'set-group';
        g.innerHTML = `<h3>${title}</h3>${desc ? `<p>${desc}</p>` : ''}`;
        const row = document.createElement('div');
        row.className = 'options';
        g.appendChild(row);
        body.appendChild(g);
        return row;
      };

      const range = group(`Fret range (${T.instrument.label.toLowerCase()})`, 'Which frets the note drills use. Sequences pick positions inside this range.');
      const frets = Array.from({ length: 25 }, (_, i) => i);
      const minSel = UI.select(range, 'Lowest fret', frets.slice(0, 22).map(f => ({ value: f, label: f === 0 ? '0 (open)' : String(f) })), st.minFret, v => {
        S.setSetting('minFret', v);
        if (S.settings().maxFret < v + 3) { S.setSetting('maxFret', v + 3); maxSel.value = String(v + 3); }
      });
      const maxSel = UI.select(range, 'Highest fret', frets.slice(3).map(f => ({ value: f, label: String(f) })), st.maxFret, v => {
        S.setSetting('maxFret', v);
        if (S.settings().minFret > v - 3) { S.setSetting('minFret', v - 3); minSel.value = String(v - 3); }
      });

      const strings = group(`Strings (${T.instrument.label.toLowerCase()})`, 'Only drill the strings you switch on.');
      T.STRING_NAMES.forEach((nm, s) => UI.toggle(strings, nm, st.strings[s], v => {
        const arr = S.settings().strings.slice();
        arr[s] = v;
        S.setSetting('strings', arr);
      }));

      const names = group('Note names');
      UI.select(names, 'Accidentals', [
        { value: 'sharp', label: 'Sharps (C♯, F♯)' }, { value: 'flat', label: 'Flats (D♭, G♭)' }, { value: 'mixed', label: 'Both, at random' },
      ], st.spelling, v => S.setSetting('spelling', v));

      const feel = group('Feel');
      UI.toggle(feel, 'Left-handed fretboard', st.leftHanded, v => S.setSetting('leftHanded', v));
      UI.select(feel, 'After a correct answer', [
        { value: 'fast', label: 'Move on fast' }, { value: 'normal', label: 'Normal pause' }, { value: 'slow', label: 'Longer pause' },
      ], st.advance, v => S.setSetting('advance', v));

      const sound = group('Sound');
      UI.toggle(sound, 'Play notes', st.sound, v => S.setSetting('sound', v));
      const w = document.createElement('label');
      w.className = 'field';
      w.innerHTML = '<span>Volume</span>';
      const vol = document.createElement('input');
      vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.05; vol.value = st.volume;
      vol.addEventListener('change', () => { S.setSetting('volume', +vol.value); FD.audio.pluck(T.TUNING[1] + 2); });
      w.appendChild(vol);
      sound.appendChild(w);
      UI.button(sound, '▶ Test', () => FD.audio.sequence(T.TUNING.slice().reverse().map(m => m + 12), 0.12));
    },
  };

  FD.views = { stats, settings };
})();
