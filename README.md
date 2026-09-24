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
- A clue turns **green** when you've found all its road, and **red** if you've
  ruled out so much of a line that its count can't be met.

**Connect** — **drag** from the entry arrow to lay the actual road. You can do
this at any time, not only once every square is found.

- Push the road into a square you haven't claimed yet and it **claims it for
  you** — the same bet as a double tap, so a wrong push costs a heart and
  crosses the square out.
- Squares you've crossed out yourself turn the road away for nothing. Once every
  road square is found, pushing costs nothing at all.
- Drag back along the road to rub it out. Finish the route and five cars drive
  it, the road lights up, and a little town grows on every square it missed.

Three hearts per board, and the hearts you finish with become the level's stars.
Run out and your marks stay on the board — the answer is never shown — so you can
read back where it went wrong before trying again.

120 levels across five regions of a road trip — Meadow Lane (4×4) up to
Metropolis (8×8). Every board has exactly one solution.

## Running it

```bash
npm install
npm start          # then press a / i, or scan the QR code with Expo Go
```

| Command | What it does |
| --- | --- |
| `npm test` | Headless tests over the whole puzzle core and all 120 levels |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run levels:build` | Regenerate the baked level bank (~30s) |
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
