// The Star Wars-flavoured layer: Jedi/Sith side, starfield, ranks, streak toasts and the opening crawl.
(() => {
  const S = FD.store;
  const $ = id => document.getElementById(id);
  const pick = a => a[Math.floor(Math.random() * a.length)];

  const SIDES = {
    jedi: {
      ranks: [
        { at: 0, name: 'Youngling' }, { at: 100, name: 'Padawan' }, { at: 500, name: 'Jedi Knight' },
        { at: 1500, name: 'Jedi Master' }, { at: 5000, name: 'Grand Master' },
      ],
      praise: [
        'Your training is paying off.', 'The Force is strong with this one.', 'A true Jedi in the making.',
        'The Council takes notice.', 'You and the fretboard are one.', 'Not bad for a Youngling. Not bad at all.',
      ],
      miss: [
        'Do or do not. There is no try.', 'Patience, young Padawan.', 'Feel the notes. Don’t think.',
        'Even Masters miss. Breathe, then go again.', 'Your focus determines your reality.',
      ],
      rankUp: 'The Council grants you a new rank.',
    },
    sith: {
      ranks: [
        { at: 0, name: 'Acolyte' }, { at: 100, name: 'Apprentice' }, { at: 500, name: 'Sith Lord' },
        { at: 1500, name: 'Darth' }, { at: 5000, name: 'Dark Lord of the Frets' },
      ],
      praise: [
        'Good. Your power grows.', 'Impressive. Most impressive.', 'Everything proceeds as I have foreseen.',
        'The fretboard bends to your will.', 'Unlimited power!', 'None can stand against you.',
      ],
      miss: [
        'I find your lack of accuracy disturbing.', 'Your hesitation betrays you.', 'Weak. Again.',
        'You have failed me. Do not fail me twice.', 'Anger at a wrong note is a start. Channel it.',
      ],
      rankUp: 'Your power over the fretboard grows.',
    },
  };
  const MILESTONES = [5, 10, 20, 35, 50, 75, 100, 150, 200];

  const side = () => (S.settings().side === 'sith' ? 'sith' : 'jedi');

  function rankFor(xp) {
    const ranks = SIDES[side()].ranks;
    let i = 0;
    while (i + 1 < ranks.length && xp >= ranks[i + 1].at) i++;
    return { ...ranks[i], next: ranks[i + 1] || null, index: i };
  }

  function renderRank() {
    const el = $('rank');
    if (!el) return;
    const xp = S.xp();
    const r = rankFor(xp);
    const pct = r.next ? Math.round((100 * (xp - r.at)) / (r.next.at - r.at)) : 100;
    el.innerHTML = `<b></b><div class="meter"><i style="width:${pct}%"></i></div><small></small>`;
    el.querySelector('b').textContent = r.name;
    el.querySelector('small').textContent = r.next ? `${xp} / ${r.next.at} to ${r.next.name}` : `${xp} correct, top rank`;
    el.title = `${FD.theory.instrument.label} rank, from lifetime correct answers`;
  }

  function toast(title, text, cls = '', ms = 2600) {
    const box = $('toasts');
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast ' + cls;
    t.innerHTML = '<b></b><span></span>';
    t.querySelector('b').textContent = title;
    t.querySelector('span').textContent = text;
    box.appendChild(t);
    while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  }

  function onHit(streak) {
    const before = rankFor(S.xp());
    const after = rankFor(S.addXp());
    renderRank();
    if (after.index > before.index) {
      toast(`Rank up: ${after.name}`, SIDES[side()].rankUp, '', 3600);
    } else if (MILESTONES.includes(streak)) {
      toast(`${streak} in a row`, pick(SIDES[side()].praise));
    }
  }

  function onMiss(lostStreak) {
    if (lostStreak >= 5) toast(`Streak of ${lostStreak} broken`, pick(SIDES[side()].miss), 'miss');
  }

  function setSide(v) {
    S.setSetting('side', v);
    document.documentElement.dataset.side = v;
    document.querySelectorAll('#side button').forEach(b => b.classList.toggle('active', b.dataset.side === v));
    stars.recolor();
    renderRank();
  }

  // ---------------------------------------------------------------- starfield
  const stars = (() => {
    const canvas = $('stars');
    const ctx = canvas && canvas.getContext('2d');
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let pts = [], rgb = '200, 225, 255', w = 0, h = 0, last = 0;

    function resize() {
      if (!ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = innerWidth; h = innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round((w * h) / 5200);
      pts = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() < 0.08 ? 1.4 + Math.random() : 0.4 + Math.random() * 0.8,
        a: 0.25 + Math.random() * 0.7, p: Math.random() * Math.PI * 2, s: 0.4 + Math.random() * 1.6,
      }));
      draw(0);
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      for (const s of pts) {
        const tw = reduced ? 1 : 0.65 + 0.35 * Math.sin(s.p + t * 0.001 * s.s);
        ctx.fillStyle = `rgba(${rgb}, ${(s.a * tw).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function loop(t) {
      if (t - last > 66) { draw(t); last = t; }
      requestAnimationFrame(loop);
    }

    function recolor() {
      rgb = getComputedStyle(document.documentElement).getPropertyValue('--star').trim() || rgb;
      if (ctx) draw(performance.now());
    }

    if (ctx) {
      recolor();
      resize();
      addEventListener('resize', resize);
      if (!reduced) requestAnimationFrame(loop);
    }
    return { recolor };
  })();

  // ---------------------------------------------------------------- opening crawl
  const CRAWL_KEY = 'fretdriller.crawlSeen';

  function crawlText() {
    const sith = side() === 'sith';
    return `
      <p class="ep">Episode I</p>
      <h1>The Fretboard Menace</h1>
      <p>It is a period of musical unrest. Across the galaxy, young guitarists can strum a dozen songs from memory, yet cannot name a single note above the fifth fret.</p>
      <p>${sith
        ? 'Lurking in a darkened practice room, an ambitious student seeks UNLIMITED POWER over the neck: every note, on every string, in every key, bent utterly to their will.'
        : 'Striking from a hidden practice room, a lone student has vowed to master the neck: every note, on every string, in every key.'}</p>
      <p>Hunted by sinister wrong notes and the dreaded temptation to play the same pentatonic box forever, the student opens FRET DRILLER, ${sith
        ? 'the instrument of their inevitable rise....'
        : 'the last hope for restoring harmony to the galaxy....'}</p>`;
  }

  function playCrawl() {
    try { localStorage.setItem(CRAWL_KEY, '1'); } catch (e) { /* storage unavailable */ }
    const el = document.createElement('div');
    el.className = 'crawl';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Opening crawl');
    el.innerHTML = `
      <div class="crawl-intro">A long time ago, in a practice room far, far away....</div>
      <div class="crawl-title">Fret<br>Driller</div>
      <div class="crawl-stage"><div class="crawl-text">${crawlText()}</div></div>
      <button class="crawl-skip" type="button">Skip intro</button>`;
    document.body.appendChild(el);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      removeEventListener('keydown', onKey, true);
      el.classList.add('fade');
      setTimeout(() => el.remove(), 600);
    };
    const onKey = e => { e.stopImmediatePropagation(); e.preventDefault(); if (['Escape', 'Enter', ' '].includes(e.key)) close(); };
    addEventListener('keydown', onKey, true);
    el.addEventListener('click', close);
    el.querySelector('.crawl-text').addEventListener('animationend', close);
    el.querySelector('.crawl-skip').focus();
  }

  // ---------------------------------------------------------------- wiring
  document.querySelectorAll('#side button').forEach(b => b.addEventListener('click', () => { b.blur(); setSide(b.dataset.side); }));
  setSide(side());

  let seen = false;
  try { seen = !!localStorage.getItem(CRAWL_KEY); } catch (e) { seen = true; }
  if (!seen) setTimeout(playCrawl, 300);

  FD.theme = { onHit, onMiss, renderRank, setSide, side, playCrawl, toast };
})();
