# Fret Driller

A backing band in your browser for jamming, with fretboard drills on the side. It's plain HTML/CSS/JS with no build step, so it runs on GitHub Pages as-is.

## Jam

Jam is the home page. Pick one of 23 preset tracks (blues, jazz, rock & pop) in any key, or type your own chords, and a synthesized band plays it on a loop with drums, bass and chords. The current chord's tones light up on the fretboard.

- **Song forms**: split a typed track into sections, e.g. `[Verse] Am F C G | [Chorus] F G Am Am | [Chorus +2]`. Sections play in order, then the form loops. `+2` or `-1` moves a section by semitones from the chords as written. A tag with no chords repeats the last section with that name. Add `:2` to a chord for two beats.
- **Called key changes**: while the band plays, a key change waits for the next section, loop, bar or chord (your choice under *Key changes*). A banner shows the new key and a countdown. Calls made before it lands add up, and `Esc` cancels.
- **Big screen** (`V`): full screen with big chord names and the fretboard, for a TV.
- **Mutes**: `1` `2` `3` mute drums, bass or chords so someone can take over that part. The volume sliders keep their levels.

| Key | Does |
| --- | --- |
| `Space` | play / stop |
| `↑` `↓` | tempo ±5 |
| `W` | up a whole step (called) |
| `F` | up a fourth (called) |
| `R` | relative minor/major (called): the loop restarts on the new home chord |
| `]` `[` | up / down a half step (called while playing, immediate while stopped) |
| `Esc` / `Backspace` | cancel a called change that hasn't started |
| `1` `2` `3` | mute drums / bass / chords |
| `V` | big screen on/off |

## Practice (drills)

- **Find the note**: you're given a note (optionally on a specific string) and click where it is. "Every position" mode makes you find all of them in your fret range.
- **Name the note**: a fret lights up and you name it. Click a button or type it: `A`–`G`, with `Shift`+letter for sharps (or flats if you chose flats).
- **Sequences**: play a melody in order, e.g. `C C B A` → 8, 8, 7, 5 on the high E. Use random melodies in any key, or type your own (`C5 C5 B4 A4` to pin octaves). Two toggles control the checking:
  - *Right octave*: the exact pitch must match, not just the note name.
  - *Stay in position*: notes must be played inside a fret box (e.g. frets 5–8).
  - Turn both on for strict mode.
- **Scale patterns**: 12 scales and modes in every key, as 3-notes-per-string shapes (2 per string for pentatonics) or fret-box positions. You can play them up, down, or up & down, straight or in thirds or groups of 3 or 4. Views are Guided, Pattern shown, or From memory. Best clean-run times are saved.

- **Explore**: see any scale or arpeggio across the whole neck (frets 0–24). Labels can be note names or scale degrees. You can highlight one shape or fret box, overlay a second scale to compare (e.g. minor pentatonic vs blues shows the added ♭5), and click any fret to hear it and see its role.

The scale list also includes triad and 7th-chord arpeggios.

Every click plays a synthesized plucked-string tone. Stats track accuracy and speed for each fret and note (see the heatmap on the Stats tab), and the Find and Name drills bring up your weak spots more often. Settings cover fret range, strings, sharps/flats, left-handed mode and sound.

Settings and stats are stored in your browser's `localStorage`.

## Run locally

Open `index.html` directly, or serve the folder:

```bash
python -m http.server 8000
```

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo.
2. Go to **Settings → Pages → Build and deployment**, choose *Deploy from a branch*, then pick `main` and `/ (root)`.
3. The site goes live at `https://<user>.github.io/<repo>/`.
