'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, plain, fakeStorage, KEY } = require('./helpers/load');

const wait = ms => new Promise(r => setTimeout(r, ms));

// The whole app should still work on whatever a save loaded: answer, read back, draw stats.
function exercise(FD, where) {
  const S = FD.store, T = FD.theory;
  const st = S.settings();
  assert.equal(st.strings.length, T.count(), where);
  assert.ok(Number.isInteger(st.minFret) && Number.isInteger(st.maxFret) && st.minFret <= st.maxFret, where);
  assert.ok(st.minFret >= 0 && st.maxFret <= 24, where);
  assert.ok(Number.isFinite(st.volume), where);
  S.record('find', { s: 1, f: 2, pc: 3, ok: true, ms: 900 });
  S.record('name', { s: 0, f: 0, pc: 4, ok: false, ms: 0 });
  assert.equal(S.cellStat('find', 1, 2).ok >= 1, true, where);
  assert.ok(S.weight(S.noteStat('find', 3)) > 0, where);
  assert.ok(Number.isFinite(S.addXp()), where);
  S.setBest('scale|x', 1000);
  assert.equal(S.best('scale|x'), 1000, where);
  S.setSetting('minFret', 1);
  S.setInstrument('bass');
  assert.equal(S.settings().strings.length, 4, where);
  S.setInstrument('guitar');
  S.resetStats();
  S.opts('jam', {}).x = 1;
  S.saveOpts();
}

const BAD_SAVES = {
  'corrupt JSON': '{"settings": {"spel',
  'empty string': '',
  'a number': '5',
  'a string': '"hello"',
  'true': 'true',
  'null': 'null',
  'an array': '[1,2,3]',
  'every section the wrong type': JSON.stringify({ settings: 5, opts: 'x', stats: [], best: 7, inst: 'y', xp: true, instrument: 9 }),
  'every section null': JSON.stringify({ settings: null, opts: null, stats: null, best: null, inst: null, xp: null, instrument: null }),
  'strings is null': JSON.stringify({ inst: { guitar: { strings: null } } }),
  'strings is a number': JSON.stringify({ inst: { guitar: { strings: 3 } } }),
  'strings too short': JSON.stringify({ inst: { guitar: { strings: [true, false] } } }),
  'strings too long': JSON.stringify({ inst: { guitar: { strings: [1, 1, 1, 1, 1, 1, 1, 1] } } }),
  'an instrument is not an object': JSON.stringify({ inst: { guitar: 5, bass: null } }),
  'frets are not numbers': JSON.stringify({ inst: { guitar: { minFret: 'x', maxFret: null } } }),
  'frets are backwards': JSON.stringify({ inst: { guitar: { minFret: 9, maxFret: 2 } } }),
  'frets are off the neck': JSON.stringify({ inst: { guitar: { minFret: -4, maxFret: 99 } } }),
  'volume is not a number': JSON.stringify({ settings: { volume: 'loud' } }),
  'stats for an instrument are null': JSON.stringify({ stats: { guitar: null, bass: 3 } }),
  'a stats mode is null': JSON.stringify({ stats: { guitar: { find: null, name: 4 } } }),
  'a stats mode has no maps': JSON.stringify({ stats: { guitar: { find: {}, name: { cells: 3, notes: null } } } }),
  'a stat is missing its fields': JSON.stringify({ stats: { guitar: { find: { cells: { '1,2': {} }, notes: { 3: { n: 2 } } } } } }),
  'a stat is not an object': JSON.stringify({ stats: { guitar: { find: { cells: { '1,2': 5 }, notes: { 3: null } } } } }),
  'best times are not an object': JSON.stringify({ best: { guitar: 5, bass: null } }),
  'xp is not a number': JSON.stringify({ xp: { guitar: 'lots', bass: null } }),
  'pre-bass stats with a null mode': JSON.stringify({ stats: { find: null, name: { cells: null, notes: null } } }),
};
for (const [label, save] of Object.entries(BAD_SAVES)) {
  test(`a bad save loads and the app still works: ${label}`, () => {
    const { FD } = load({ save });
    exercise(FD, label);
  });
}

test('a save that cannot be read starts from the defaults', () => {
  const { FD } = load({ save: '{oops' });
  const st = FD.store.settings();
  assert.equal(st.spelling, 'sharp');
  assert.equal(st.minFret, 0);
  assert.equal(st.maxFret, 12);
  assert.equal(FD.store.instrument(), 'guitar');
});

test('fixing one bad part keeps the good parts next to it', () => {
  const stat = { n: 4, ok: 3, t: 3000, tn: 3, total: 40 };
  const { FD } = load({
    save: {
      settings: { spelling: 'flat', volume: 'loud', leftHanded: true },
      inst: { guitar: { minFret: 3, maxFret: 9, strings: [true] } },
      stats: { guitar: { find: { cells: { '1,2': stat, '1,3': null }, notes: { 3: stat } } } },
      best: { guitar: { 'scale|a': 5000 } },
      xp: { guitar: 77, bass: 'x' },
      opts: { jam: { saved: [{ id: 'a', name: 'Keep me', prog: 'C G' }] } },
    },
  });
  const S = FD.store;
  const st = S.settings();
  assert.equal(st.spelling, 'flat');
  assert.equal(st.leftHanded, true);
  assert.equal(st.volume, 0.7, 'only the bad volume is replaced');
  assert.equal(st.minFret, 3, 'a bad strings list does not cost the fret range');
  assert.equal(st.maxFret, 9);
  assert.equal(st.strings.length, 6);
  assert.deepEqual(plain(S.cellStat('find', 1, 2)), stat);
  assert.deepEqual(plain(S.noteStat('find', 3)), stat);
  assert.equal(S.cellStat('find', 1, 3), undefined);
  assert.equal(S.best('scale|a'), 5000);
  assert.equal(S.xp(), 77);
  assert.equal(plain(S.opts('jam', {}).saved)[0].name, 'Keep me');
});

test('a stat missing some fields keeps the ones it has', () => {
  const { FD } = load({ save: { stats: { guitar: { find: { cells: {}, notes: { 3: { n: 2, total: 9 } } } } } } });
  assert.deepEqual(plain(FD.store.noteStat('find', 3)), { n: 2, total: 9, ok: 0, t: 0, tn: 0 });
});

test('a pre-bass save moves to the guitar with nothing lost', () => {
  const stat = { n: 10, ok: 5, t: 5000, tn: 5, total: 20 };
  const { FD } = load({
    save: {
      settings: { spelling: 'flat', minFret: 2, maxFret: 15, strings: [true, true, true, false, false, false], volume: 0.4 },
      stats: { find: { cells: { '0,3': stat }, notes: { 7: stat } }, name: { cells: {}, notes: {} } },
      best: { 'scale|9|minorPent|nps|5|up|straight': 12345 },
    },
  });
  const S = FD.store;
  assert.equal(S.instrument(), 'guitar');
  const st = S.settings();
  assert.equal(st.minFret, 2);
  assert.equal(st.maxFret, 15);
  assert.deepEqual(plain(st.strings), [true, true, true, false, false, false]);
  assert.equal(st.spelling, 'flat');
  assert.equal(st.volume, 0.4);
  assert.deepEqual(plain(S.cellStat('find', 0, 3)), stat);
  assert.deepEqual(plain(S.noteStat('find', 7)), stat);
  assert.equal(S.best('scale|9|minorPent|nps|5|up|straight'), 12345);
  assert.equal(S.xp(), 10, 'xp starts from correct answers: 20 × 5/10');
  S.setInstrument('bass');
  assert.equal(S.xp(), 0);
  assert.equal(S.settings().strings.length, 4, 'the bass keeps its own settings');
  assert.equal(S.cellStat('find', 0, 3), undefined, 'and its own stats');
});

test('a pre-bass save with a fret range but no strings list keeps the range', () => {
  const { FD } = load({ save: { settings: { minFret: 4, maxFret: 11 } } });
  const st = FD.store.settings();
  assert.equal(st.minFret, 4);
  assert.equal(st.maxFret, 11);
});

test('a save in the current shape loads and saves back unchanged', async () => {
  const save = {
    settings: { spelling: 'mixed', leftHanded: true, sound: false, volume: 0.35, advance: 'slow', side: 'sith' },
    opts: {
      jam: {
        track: 's:abc', key: 7, custom: 'Am7:2 D7:2 Ebb7', bpm: 133, barsPerChord: 2, groove: 'funk', sound: 'organ', countIn: false,
        cycle: 'fourths', cycleEvery: 2, labels: 'names', preview: false, lock: true, lockFrom: 3, lockTo: 7,
        vol: { drums: 0.1, bass: 0.2, chords: 0 }, totalSec: 1234.5,
        saved: [{ id: 'abc', name: 'My song', prog: 'Am7:2 D7:2 Ebb7', groove: 'funk', bpm: 133, barsPerChord: 2, sound: 'organ' }],
      },
      scales: { root: 2, scale: 'dorian', shape: 'box', posF0: null, boxStart: 7, boxSpan: 5, dir: 'up', seq: 'thirds', view: 'memory', labels: 'degrees' },
    },
    stats: {
      guitar: { find: { cells: { '2,5': { n: 15.5, ok: 12.25, t: 9000, tn: 12, total: 88 } }, notes: { 0: { n: 3, ok: 3, t: 2000, tn: 3, total: 3 } } } },
      bass: { name: { cells: {}, notes: {} } },
    },
    best: { guitar: { 'scale|x': 5000 }, bass: {} },
    inst: {
      guitar: { minFret: 1, maxFret: 17, strings: [true, false, true, false, true, false] },
      bass: { minFret: 0, maxFret: 9, strings: [true, true, false, false] },
    },
    xp: { guitar: 512, bass: 40 },
    instrument: 'bass',
  };
  const { FD, localStorage } = load({ save });
  const S = FD.store;
  assert.equal(S.instrument(), 'bass');
  assert.deepEqual(plain(S.settings().strings), [true, true, false, false]);
  assert.equal(S.xp(), 40);
  S.saveOpts();
  await wait(200);
  assert.deepEqual(JSON.parse(localStorage.getItem(KEY)), save);
});

test('the save key has not changed', async () => {
  const { FD, localStorage } = load();
  assert.equal(KEY, 'fretdriller.v1');
  FD.store.setSetting('spelling', 'flat');
  await wait(200);
  assert.equal(JSON.parse(localStorage.getItem('fretdriller.v1')).settings.spelling, 'flat');
});

test('localStorage that throws on every call: the app works, without saving', async () => {
  const storage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const { FD } = load({ storage });
  exercise(FD, 'throwing storage');
  await wait(200);
});

test('localStorage that is full: reading works and a failed write is ignored', async () => {
  const storage = fakeStorage({ [KEY]: JSON.stringify({ xp: { guitar: 9 } }) });
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  const { FD } = load({ storage });
  assert.equal(FD.store.xp(), 9);
  exercise(FD, 'full storage');
  await wait(200);
});

test('a localStorage that cannot even be touched: the app works', () => {
  const { FD } = load({ storageGetterThrows: true });
  exercise(FD, 'getter throws');
});

test('closing the page writes a save that was still waiting', () => {
  const { FD, localStorage, fire } = load();
  FD.store.setSetting('spelling', 'flat');
  assert.equal(localStorage.getItem(KEY), null, 'saves wait a moment');
  fire('pagehide');
  assert.equal(JSON.parse(localStorage.getItem(KEY)).settings.spelling, 'flat');
});

test('just opening and closing the page does not overwrite a save', () => {
  const raw = '{"settings": {"spel';
  const { localStorage, fire } = load({ save: raw });
  fire('pagehide');
  assert.equal(localStorage.getItem(KEY), raw);
});

// ---------------------------------------------------------------- what the pages read out of a save
test('Jam options: bad values are replaced, good ones kept', () => {
  const { FD } = load();
  const jam = FD.views.jam;
  const clean = o => { jam.clean(o); return plain(o); };
  const good = {
    track: 's:a', key: 7, custom: 'C G', bpm: 133, barsPerChord: 4, groove: 'funk', sound: 'organ', cycle: 'half', cycleEvery: 2,
    landOn: 'bar', folds: { keys: true }, lockFrom: 3, lockTo: 7, vol: { drums: 0.1, bass: 0, chords: 1 }, totalSec: 5,
    saved: [{ id: 'a', name: 'Mine', prog: 'C G', groove: 'funk', bpm: 100, barsPerChord: 1, sound: 'keys' }],
  };
  assert.deepEqual(clean(JSON.parse(JSON.stringify(good))), good);

  const bad = clean({
    track: 5, key: 'x', custom: null, bpm: 'fast', barsPerChord: 0, groove: 'polka', sound: 'kazoo', cycle: 'spiral', cycleEvery: 0,
    landOn: 'whenever', folds: [1], lockFrom: 'a', lockTo: null, vol: { drums: 'x', bass: null, chords: 9 }, totalSec: 'y', saved: 'none',
  });
  assert.equal(bad.track, 'p:myloop');
  assert.equal(bad.key, 0);
  assert.equal(bad.custom, 'C D7 G7 C');
  assert.equal(bad.bpm, 100);
  assert.equal(bad.landOn, 'section');
  assert.deepEqual(bad.folds, {});
  assert.equal(bad.barsPerChord, 1);
  assert.equal(bad.groove, 'rock');
  assert.equal(bad.sound, 'keys');
  assert.equal(bad.cycle, 'off');
  assert.equal(bad.cycleEvery, 1);
  assert.deepEqual(bad.vol, { drums: 0.8, bass: 0.8, chords: 1 });
  assert.equal(bad.totalSec, 0);
  assert.deepEqual(bad.saved, []);
  assert.equal(bad.lockFrom, 2);
  assert.equal(bad.lockTo, 6);
});

test('Jam options: a tempo outside the slider comes back inside it', () => {
  const { FD } = load();
  const o = { bpm: 9000 };
  FD.views.jam.clean(o);
  assert.equal(o.bpm, 240);
  o.bpm = 1;
  FD.views.jam.clean(o);
  assert.equal(o.bpm, 40);
});

test('Jam options: a broken saved track is dropped, its neighbours kept', () => {
  const { FD } = load();
  const o = { track: 's:gone', saved: [null, 5, { id: 'b' }, { id: 'c', name: 'Good', prog: 'C' }, { prog: 'D' }] };
  FD.views.jam.clean(o);
  assert.deepEqual(plain(o.saved).map(t => t.prog), ['C', 'D']);
  assert.equal(o.saved[1].name, 'My track 2', 'a track with no name gets one');
  assert.ok(o.saved[1].id, 'and an id');
  assert.equal(o.track, 'custom', 'a saved track that is gone falls back to the typed box');
});

test('Jam options: a preset that no longer exists falls back to the default track', () => {
  const { FD } = load();
  const o = { track: 'p:gone' };
  FD.views.jam.clean(o);
  assert.equal(o.track, 'p:myloop');
});
