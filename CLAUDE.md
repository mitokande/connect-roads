# CLAUDE.md — Connect Tracks

Project context for Claude Code. Connect Tracks is a **Train Tracks** puzzle
(the newspaper logic puzzle, sometimes called Railroad Tracks) built with Expo
SDK 54 and React Native.

## What the game is

An _n×n_ grid. A single unbroken railway enters at one border **terminal** and
leaves at another, never branching and never re-using a square. Each row and
column carries a **count** — how many of its squares hold track, not which. Two
pieces are printed on the board from the start (the two terminals), plus one or
two more when the generator needs them to force a unique answer.

Every shipped board has exactly **one** solution, and `npm test` re-proves that
for all 120 of them from the clues alone.

A track piece joins exactly two of a square's four edges, so there are six of
them: two straights and four curves. Internally a piece is just a **2-bit mask**
of the directions it opens onto (`src/game/types.ts`), which makes "do these two
pieces meet" a bitwise test and makes the four half-laid **stubs** (single-bit
masks) fall out of the same representation for free.

## The two phases — this is the whole design

**Deduce.** Work out *which* squares carry track. Double tap claims a square
("track goes here"); a single tap or a swipe crosses one out. You never say what
*shape* the piece is — that isn't knowable yet, and the board draws a claimed
square as four rail ends pointing inward around a `?`.

**Connect.** The route's shape is still unknown, and the player drags from the
entry terminal through the claimed squares to lay the actual rails. The finished
route drives a train.

Splitting the solve in two is what makes this a *touch* game rather than a
newspaper puzzle with buttons: one half is tapping (deduction), the other is one
continuous gesture (the payoff). `deductionComplete` flips the phase and
`connectComplete` ends the board.

**The two overlap.** Rail can be laid from the first move, not only once every
square has been claimed — a half-deduced board usually has an obvious stretch of
rail in it already, and making the player hold that in their head until the end
is busywork. The phase flip therefore marks when the *last* rail becomes
drawable, not the first.

**Pushing the rail into an unknown square claims it** (`railStep` returns
`{kind: "claim"}` and the `RAIL` action commits it). That is the second half
folded into the first: the same finger that lays track also states where track
goes, so an obvious run can be drawn in one motion instead of double-tapping
four squares and then tracing them. It costs exactly what a double tap costs —
`refuse` is shared — and it has to, because a push that were merely *refused*
would be a free oracle for "is there track here", and the deduction is the game.

Two squares the rail will not push into, both free of charge: ones the player
crossed out (their note, respected) and ones the clues have already settled
(`isUnknown`). The second is the important one — since every ✓ is true, a
settled line genuinely has no track left in it, so an auto-crossed square is
*provably* empty and a push there would be a trap that always costs a heart.

Both gestures live on the same grid at the same time, so a touch has to belong
to one of them. `grabsRail` decides: a touch on the drawn rail — or on the entry,
before there is one — pays out track, and everything else marks a square. Since
a rail is only ever extended from its own end, no square is ever ambiguous. The
side effect is that a claim under the rail can't be un-claimed while the rail is
standing on it; drag the rail back off it first.

**A printed piece is immutable.** The two terminals and the uniqueness reveals
are facts the board hands over at the start, and the rail passing over one must
not restate it — a stub laid on a printed piece rubs out a shape the player is
mid-way through reasoning from. `routePieces` therefore yields the printed piece
for those cells whatever the route is doing, including under the moving end.
Nothing is lost: `connectStep` already refuses any step that disagrees with a
printed piece, so the mask the route implies there is the printed one anyway.
Where the rail's end has got to is said by the highlight instead.

**Only a drag winds the rail in.** Putting a finger down on a drawn cell takes
hold of the rail without moving it — the rewind happens as the finger drags back
along it, so while the touch is down the rail's end simply follows the finger.
Rewinding on the touch itself meant that a mis-tap on the rail silently swallowed
everything drawn past it, and rail cells are exactly the cells a player has most
reason to prod at.

Finishing the route implies the deduction is finished, so nothing extra polices
the win: a complete route is `path.length` distinct *claimed* cells, and claims
are true, so every track square must have been found to draw it.

### A claim is checked; a cross is not

Double-tapping a square with no track is **refused and costs a heart** — the
square is crossed out instead (it *is* now known to be empty, and charging a
heart for nothing would be worse than the mistake; it also can't be re-claimed
for a second heart). Crossing out is **free and never checked**: it is
note-taking. Sweeping a settled row is the game's most common deduction and the
first thing the tutorial teaches — charging for it would make the core move feel
like a gamble.

The consequence worth protecting: because claims are verified, **a ✓ on the
board is always true**, so the rail can trust the claimed set completely and
`connectStep` only has to police adjacency and the printed pieces. That is also
what makes drawing rail mid-deduction sound rather than a way to cheat.

Three hearts. Losing the last one sets `failed`, which locks input and shows the
solution *dimmed underneath the player's own marks* (`ghosts` in `useGame`)
rather than clearing the board — at that moment the only interesting question is
"where did I go wrong", and a wiped grid answers it with nothing.

### Crosses have two authorships

`markAuto` (pale) is the board crossing out what the clues have already settled;
`mark` (slate) is the player's own. Same glyph, different weight. A player
scanning the grid needs to know which crosses are theirs before trusting them.
Auto-crosses are **derived, never stored** (`isAutoBlocked`), so they can't drift
out of step with the marks and un-claiming a square takes its knock-on crosses
with it.

`lineOverCrossed` turns a clue red when the player has ruled out so much of a
line that its count can no longer be met. Nothing is enforced — the notes stay
wrong until the player says otherwise — but it catches a bad assumption before
ten more moves get built on it.

## Layout

```
App.tsx                     screens + overlays, no game logic
src/game/                   pure, headless, no React — the whole rulebook
  types.ts                  directions, pieces as bitmasks, Puzzle
  solver.ts                 exhaustive path search; the uniqueness referee
  generator.ts              seeded generate-and-test
  codec.ts                  compact puzzle serialisation
  levelData.ts              GENERATED — the baked level bank
  levels.ts                 the ladder: level → size, seed, puzzle
  board.ts                  rules of play (marks, auto-crosses, route legality)
  runTests.ts               npm test
src/state/useGame.ts        board reducer + AsyncStorage progress
src/components/             Board, Cell, TrackPiece, TrainRide, screens, overlays
src/theme.ts                palette; colour is assigned by function
scripts/buildLevels.ts      npm run levels:build
```

`src/game` never imports React. That is what lets `runTests.ts` play thousands
of boards to completion in a couple of seconds with no renderer.

## Generation, and why the bank is baked

`generatePuzzle(seed, opts)` is generate-and-test:

1. Two terminals on **different** sides (same-side terminals read as a dead end).
2. A self-avoiding random walk between them, **refusing to enter the exit until
   the walk is long enough**. That refusal is what makes routes wind — a walk
   allowed to finish as soon as it can produces a boring L, and length is the
   puzzle's whole texture.
3. Read the clues off the finished path.
4. Ask the solver for a second solution. If there is one, reveal a piece and ask
   again; if two reveals don't settle it, throw the walk away and start over.

**Reveals are aimed, not random.** The solver returns the rival solutions it
found, and the generator reveals a cell where the rival *disagrees* with the
intended path — so that rival cannot survive the next pass. Revealing a random
path cell usually changes nothing and costs a full re-solve; switching to aimed
reveals took worst-case 8×8 generation from 5.8s to 1.9s.

**Density is both fun and speed** (`defaultFill`). Bigger boards are held to a
higher fill floor than small ones: a sparse 8×8 leaves the clues so slack that
proving uniqueness means exploring an enormous space, and the resulting puzzle
is mush to solve for exactly the same reason.

The solver (`solve`) is a DFS over "which edge do I leave by", carried by four
prunes: the clue floor (never enter a line with 0 left), the clue ceiling (a line
owing _k_ needs _k_ unused cells), **reach + parity** (grid paths change length
only in steps of two, so `remaining − manhattan − 1` must be non-negative *and
even* — the parity half alone kills about half the branches), and printed pieces
(which collapse a 3-way branch to 1). `exhausted: false` means the node budget
ran out, and the generator throws such candidates away rather than shipping a
board it can't vouch for.

**The bank.** Generation is deterministic in the seed, so the app *could* call
the generator directly. It doesn't: proving an 8×8 unique takes 0.5–2s on a
laptop, which is several frozen seconds on a phone. `npm run levels:build` bakes
all 120 into `src/game/levelData.ts` as one line each, and `puzzleForLevel`
parses instead of searching. Levels past the bank still generate on the spot, so
a longer ladder degrades rather than crashes.

Only the irreducible facts are stored — size, terminals, route, which cells start
revealed. The piece grid and the clues are *recomputed* on decode, which keeps
the bank small and makes it impossible for a stored clue to contradict a stored
solution.

**Re-running `levels:build` after touching the generator changes existing
levels.** Fine before release, not after — the tests pin the bank, not the
generator.

## Rendering

`TrackPiece.tsx` derives all ten drawings (6 pieces + 4 stubs) from one geometry:
a curve is a quarter circle centred on the corner with **radius half a cell**, so
its ends land exactly on the edge midpoints and therefore exactly on the
neighbouring piece's ends. Rails are the centreline offset by ±`RAIL_GAP`, which
on a curve means two concentric arcs — outer longer than inner, as real track is.
The SVG sweep flag is the sign of a cross product, not a lookup table. Sleepers
go under the rails, perpendicular to travel: rotated to the polar angle on a
curve, axis-aligned on a straight.

`TrainRide.tsx` flattens the finished route into a polyline (curves sampled
around their arc), measures it, and uses **cumulative distance** as the
interpolation input — constant speed through corners, which is the thing the eye
notices. Carriages are the same interpolation with the input range slid forward
by a fixed *distance*, so the train bends through a curve together instead of
concertina-ing. Headings are unwrapped so a crossing of ±180° never spins the
long way round. Both terminals are extended off the board so the train arrives
out of one tunnel mouth and leaves by the other; the grid's clipping does the
rest. Everything is native-driver (translate and rotate only).

## Input

One `PanResponder` on the grid, not per-cell pressables — three of the four
gestures are *strokes* (painting crosses, drawing the route) and a stroke can't
be assembled out of independent button presses. Cells are `pointerEvents="none"`
so the container always owns the touch. The grant records the grid's page-space
origin as `pageX − locationX`, so later move events resolve to a cell with no
`measure` call and no dependence on where the board sits on screen.

Because rail and marks share the grid throughout, the grant routes the touch
before it does anything with it: `grabsRail` first (rail gesture), deduction
otherwise. The entry cell is lit from the first frame — the glow means "the next
rail goes here" everywhere else in the game, and here it is also the only
advertisement that the drag is available yet.

**Double tap is optimistic**: the first tap applies its cross immediately and
the second *replaces* it with a claim. Waiting out the double-tap window before
drawing anything would put ~250ms of lag on the most repeated action in the game;
taking a cross back is invisible by comparison.

**A fast drag lands diagonally**, so `railStep` pays the route out one legal
step at a time along an L. Every step still goes through `connectStep`, so
nothing illegal can be drawn however fast the finger moves.

That walk lives in the reducer (the `RAIL` action) rather than in the responder,
because a step may now *claim* — and a claim reads the solution and spends a
heart, which is state the component has no business deciding. The responder says
only "the finger is over this cell"; the reducer decides how far the rail gets
and what it costs. A push that costs a heart also ends the stroke: the rail can
claim as it goes, and one careless flick should not be able to spend all three.

Props reach the responder through a `live` ref refreshed each render — the
responder is created once and would otherwise capture the first render's props.

## The ladder

120 levels: 4×4 (1–10), 5×5 (11–25), 6×6 (26–45), 7×7 (46–75), 8×8 (76–120).
The first three levels of each new size get one bonus revealed piece — that is
difficulty, not correctness, since uniqueness already holds by then.

A level is nothing but a number: its size and seed both derive from it, so
progress persists as a single integer. Clearing the newest level unlocks the
next and pays one hint (capped at 9, starting stock 5). Replaying pays nothing.

Hints spend from persisted stock: during deduction one claims a track square
(preferring the line closest to settled, so it lands where the reasoning was
going); during connect it extends the route by one correct step.

## Commands

```
npm test              headless core tests — run this before trusting anything
npm run typecheck     tsc --noEmit
npm start             expo start
npm run levels:build  regenerate the level bank (~30s, changes existing levels)
npx expo export --platform android   bundle check
```

`npm test` asserts, for every one of the 120 shipped boards: clues match the
path, the path is a genuine self-avoiding walk, pieces face their neighbours,
only the terminals leave the grid, the solver finds **exactly one** solution and
it is the intended one, the bank still matches what the generator makes today,
and the play rules accept the solution's own moves while refusing jumps, restarts
and unclaimed squares. ~30k checks, a couple of seconds.
