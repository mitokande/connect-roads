# Connect Tracks

A **Train Tracks** logic puzzle for iOS and Android, built with Expo SDK 54.

Lay a single unbroken railway from one border arrow to the other. The numbers
down the side and across the top say how many squares of that row or column hold
track — not which ones. That's the whole puzzle.

## Playing

**Deduce** — work out *where* the track runs:

- **Double tap** a square to claim it carries track. A wrong claim is refused and
  costs a heart, so claim what you can prove.
- **Single tap** to cross a square out, or **swipe** to cross out a run of them.
  Crosses are free notes — never checked, never penalised. Squares in a settled
  row are crossed out for you in a paler grey.
- A clue turns **green** when you've found all its track, and **red** if you've
  ruled out so much of a line that its count can't be met.

**Connect** — **drag** from the entry arrow to lay the actual rails. You can do
this at any time, not only once every square is found.

- Push the rail into a square you haven't claimed yet and it **claims it for
  you** — the same bet as a double tap, so a wrong push costs a heart and
  crosses the square out.
- Squares you've ruled out, and squares the clues have already settled, turn the
  rail away for nothing.
- Drag back along the rail to rub it out. Finish the route and a train runs it.

Three hearts per board. Run out and the solution is shown dimmed under your own
marks, so you can see where it went wrong before trying again.

120 levels, 4×4 up to 8×8. Every board has exactly one solution.

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
| `npm run android` / `npm run ios` / `npm run web` | Platform targets |

## How it's put together

The puzzle core (`src/game/`) is pure TypeScript with no React in it — a seeded
generator, an exhaustive solver that proves each board has a single solution, and
the rules of play. That's what lets `npm test` play thousands of boards to
completion in a couple of seconds without a renderer.

Levels are deterministic in a 32-bit seed derived from the level number, and are
baked into a bank at build time so opening a board is a string parse rather than
a search. Track is drawn as SVG from a single piece of geometry (a quarter circle
of radius half a cell), which is why neighbouring pieces always meet exactly.

See `CLAUDE.md` for the design decisions behind all of it.
