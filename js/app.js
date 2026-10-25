// Wires tabs, the shared drill context and keyboard handling together.
(() => {
  const S = FD.store, UI = FD.ui;
  const $ = id => document.getElementById(id);
  const board = new FD.Fretboard($('board'));
  const PAGES = ['explore', 'jam', 'stats', 'settings'];
  let current = null;
  let currentPage = null;
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
      el.innerHTML = items.map(it => `<span class="chip ${it.state}"${it.i != null ? ` data-i="${it.i}" title="Jump here"` : ''}>${it.text}${it.sub !== '' && it.sub != null ? `<sub>${it.sub}</sub>` : ''}</span>`).join('');
    },
    hint(html) { $('hint').innerHTML = html; },
  };
  UI.hud.el = $('hud');

  function show(tab) {
    if (!FD.drills[tab] && !PAGES.includes(tab)) tab = 'explore';
    currentTab = tab;
    document.querySelectorAll('#inst button').forEach(b => b.classList.toggle('active', b.dataset.inst === S.instrument()));
    if (current && current.unmount) current.unmount();
    if (currentPage && currentPage.unmount) currentPage.unmount();
    current = null;
    currentPage = null;
    board.onCell = null;
    document.querySelectorAll('button[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    FD.theme.renderRank();
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
      currentPage = FD.views[tab];
      currentPage.mount($(tab + '-view'));
    }
    history.replaceState(null, '', '#' + tab);
  }

  document.querySelectorAll('button[data-tab]').forEach(b => b.addEventListener('click', () => { b.blur(); show(b.dataset.tab); }));
  document.querySelectorAll('#inst button').forEach(b => b.addEventListener('click', () => {
    b.blur();
    if (b.dataset.inst === S.instrument()) return;
    S.setInstrument(b.dataset.inst);
    show(currentTab);
  }));
  $('strip').addEventListener('click', e => {
    const chip = e.target.closest('[data-i]');
    if (chip && current && current.onStrip) current.onStrip(+chip.dataset.i);
  });
  $('hud-reset').addEventListener('click', e => { e.currentTarget.blur(); UI.hud.reset(); });

  document.addEventListener('keydown', e => {
    const handler = current || currentPage;
    if (!handler || !handler.onKey) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (handler.onKey(e)) e.preventDefault();
  });

  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1));
})();
