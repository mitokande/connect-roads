# Connect Roads

A **Train Tracks** logic puzzle for iOS and Android, built with Expo SDK 57.

Lay a single unbroken road from the start line to the chequered flag. The numbers
down the side and across the top say how many squares of that row or column hold
road — not which ones. That's the whole puzzle.

## Playing

**Deduce** — work out *where* the road runs:

- **Double tap** a square to claim it carries road. A wrong claim is refused and
  costs a heart, so claim what you can prove.
- **Single tap** to cross a square out, or **swipe** to cross out a run of them.
  Crosses are free notes — never checked, never penalised. Every ✕ on the board
  is yours; the game never crosses anything out for you.
- A clue turns **green** when you've found all its road, and becomes a red
  **warning sign** if you've ruled out so much of a line that its count can't be
  met. A claimed square stays claimed — claims are checked, so they're always true.

**Connect** — **drag** from the entry arrow to lay the actual road. You can do
this at any time, not only once every square is found.

- Push the road into a square you haven't claimed yet and it **claims it for
  you** — the same bet as a double tap, so a wrong push costs a heart and
  crosses the square out.
- Squares you've crossed out yourself turn the road away for nothing. Once every
  road square is found, pushing costs nothing at all.
- Drag back along the road to rub it out. Finish the route and five cars drive
  it, the road lights up, and a little town grows on every square it missed.

Leave a board whenever you like — it's kept, hearts and all, and picks up where
you left off. Only **Start again** clears it (and refills the hearts).

Every day there's a **daily road** — the same board for everyone, small on Monday
and big by Sunday — with a streak for days in a row. It unlocks after level 10.

New tricks are taught as the ladder needs them — *Two ways out* before level 2,
*Try each way* before level 20, *What if?* before level 113 — each a one-minute
lesson on a tiny board, then replayable from the help.

Stuck? A **hint** shows the next thing you can reason out and says why, right on
the board — and if you've crossed out a square that's really road, it tells you
that first.

Three hearts per board, and the hearts you finish with become the level's stars.
Stars open new paint jobs for your convoy in the **garage** (tap the star count on
the home screen), and every region builds its own town round your roads — fields
in the meadows, rooftops in the city — which stays on the map as you clear it.
Run out and your marks stay on the board — the answer is never shown — so you can
read back where it went wrong before trying again.

150 levels across seven regions of a road trip — Meadow Lane (4×4) up to
Metropolis (8×8), then up into the mountains: **Mountain Pass**, where rocks,
pines and lakes are printed on the board and hold no road, and **Cloud Summit**,
where fog hides some of the numbers. Every board has exactly one solution.

## Running it

```bash
npm install
npm start          # then press a / i, or scan the QR code with Expo Go
```

| Command | What it does |
| --- | --- |
| `npm test` | Headless tests over the whole puzzle core and all 150 levels |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run levels:build` | Regenerate the baked level bank (~30s) |
| `npm run daily:build` | Regenerate the baked daily bank (~2 min) |
| `npm run sfx:build` | Re-synthesise the sound effects and music loop into `assets/sfx/` |
| `npm run art:build` | Re-draw the icon, adaptive icon, splash and favicon into `assets/images/` |
| `npm run android` / `npm run ios` / `npm run web` | Platform targets |

## How it's put together

The puzzle core (`src/game/`) is pure TypeScript with no React in it — a seeded
generator, an exhaustive solver that proves each board has a single solution, and
the rules of play. That's what lets `npm test` play thousands of boards to
completion in a couple of seconds without a renderer.

Every sound is synthesised rather than sourced: `scripts/buildSounds.ts` is a
small oscillator-and-envelope synth (wood blocks and marimba) that bakes the
effects and a seamless 20-second music loop, the same on every machine. The store
art is generated the same way, as SVG rasterised by `scripts/buildArt.ts`, and
the type is Fredoka (via `@expo-google-fonts/fredoka`, SIL Open Font Licence).

Levels are deterministic in a 32-bit seed derived from the level number, and are
baked into a bank at build time so opening a board is a string parse rather than
a search. Road is drawn as SVG from a single piece of geometry (a quarter circle
of radius half a cell), which is why neighbouring pieces always meet exactly.

See `CLAUDE.md` for the design decisions behind all of it.
