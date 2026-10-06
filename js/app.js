// Wires tabs, the shared drill context and keyboard handling together.
(() => {
  const S = FD.store, UI = FD.ui;
  const $ = id => document.getElementById(id);
  const board = new FD.Fretboard($('board'));
  const PAGES = ['explore', 'stats', 'settings'];
  let current = null;
  let currentTab = null;

  const ctx = {
    board,
    options: $('options'),
    pad: $('pad'),
    hud: UI.hud,
    prompt(main, sub, tone) {
      const m = $('prompt-main');
      m.textContent = main || '';
      m.className = 'prompt-main' + (tone ? ' ' + tone : '');
      this.sub(sub);
    },
    sub(text, tone) {
      const e = $('prompt-sub');
      e.textContent = text || '';
      e.className = 'prompt-sub' + (tone ? ' ' + tone : '');
    },
    strip(items) {
      const el = $('strip');
      el.hidden = !items;
      if (!items) return;
      el.innerHTML = items.map(it => `<span class="chip ${it.state}">${it.text}${it.sub !== '' && it.sub != null ? `<sub>${it.sub}</sub>` : ''}</span>`).join('');
    },
    hint(html) { $('hint').innerHTML = html; },
  };
  UI.hud.el = $('hud');

  function show(tab) {
    if (!FD.drills[tab] && !PAGES.includes(tab)) tab = 'find';
    currentTab = tab;
    document.querySelectorAll('#inst button').forEach(b => b.classList.toggle('active', b.dataset.inst === S.instrument()));
    if (current && current.unmount) current.unmount();
    current = null;
    board.onCell = null;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const drill = FD.drills[tab];
    $('drill-view').hidden = !drill;
    PAGES.forEach(p => { $(p + '-view').hidden = tab !== p; });

    if (drill) {
      const st = S.settings();
      ctx.options.textContent = '';
      ctx.pad.textContent = '';
      ctx.pad.hidden = true;
      ctx.strip(null);
      ctx.hint('');
      ctx.prompt('', '');
      board.heat = null;
      board.box = null;
      board.marks.clear();
      board.configure({ minFret: st.minFret, maxFret: st.maxFret, leftHanded: st.leftHanded, strings: st.strings });
      UI.hud.reset();
      current = drill;
      board.onCell = (s, f) => current && current.onCell(s, f);
      drill.mount(ctx);
    } else {
      FD.views[tab].mount($(tab + '-view'));
    }
    history.replaceState(null, '', '#' + tab);
  }

  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { b.blur(); show(b.dataset.tab); }));
  document.querySelectorAll('#inst button').forEach(b => b.addEventListener('click', () => {
    b.blur();
    if (b.dataset.inst === S.instrument()) return;
    S.setInstrument(b.dataset.inst);
    show(currentTab);
  }));
  $('hud-reset').addEventListener('click', e => { e.currentTarget.blur(); UI.hud.reset(); });

  document.addEventListener('keydown', e => {
    if (!current || !current.onKey) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (current.onKey(e)) e.preventDefault();
  });

  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1));
})();
