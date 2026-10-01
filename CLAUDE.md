# CLAUDE.md — Connect Roads

Project context for Claude Code. Connect Roads is a **Train Tracks** puzzle
(the newspaper logic puzzle, sometimes called Railroad Tracks) built with Expo
SDK 57 and React Native.

## What the game is

An _n×n_ grid. A single unbroken road enters at one border **terminal** and
leaves at another, never branching and never re-using a square. Each row and
column carries a **count** — how many of its squares hold road, not which. Two
pieces are printed on the board from the start (the two terminals), plus one or
two more when the generator needs them to force a unique answer.

Every shipped board has exactly **one** solution, and `npm test` re-proves that
for all 600 of them from the clues alone.

A road piece joins exactly two of a square's four edges, so there are six of
them: two straights and four curves. Internally a piece is just a **2-bit mask**
of the directions it opens onto (`src/game/types.ts`), which makes "do these two
pieces meet" a bitwise test and makes the four half-laid **stubs** (single-bit
masks) fall out of the same representation for free.

## The two phases — this is the whole design

**Deduce.** Work out *which* squares carry road. Double tap claims a square
("road goes here"); a single tap or a swipe crosses one out. You never say what
*shape* the piece is — that isn't knowable yet, and the board draws a claimed
square as road works — fresh tarmac, taped off in yellow and black, reaching out
to its neighbours: road passes through here, its shape still to come.

**Connect.** The route's shape is still unknown, and the player drags from the
entry terminal through the claimed squares to lay the actual road. The finished
route drives a car.

Splitting the solve in two is what makes this a *touch* game rather than a
newspaper puzzle with buttons: one half is tapping (deduction), the other is one
continuous gesture (the payoff). `deductionComplete` flips the phase and
`connectComplete` ends the board.

**The two overlap.** Road can be laid from the first move, not only once every
square has been claimed — a half-deduced board usually has an obvious stretch of
road in it already, and making the player hold that in their head until the end
is busywork. The phase flip therefore marks when the *last* road becomes
drawable, not the first.

**Pushing the road into an unknown square claims it** (`paveStep` returns
`{kind: "claim"}` and the `PAVE` action commits it). That is the second half
folded into the first: the same finger that lays road also states where road
goes, so an obvious run can be drawn in one motion instead of double-tapping
four squares and then tracing them. It costs exactly what a double tap costs —
`refuse` is shared — and it has to, because a push that were merely *refused*
would be a free oracle for "is there road here", and the deduction is the game.

**Only a ✕ turns the road away for free** (`isUnknown`) — the player's own,
their note respected, or a full line's, which the board writes (see "A full line
crosses itself out"). Neither tells them anything the grid isn't already showing.
The clues themselves get no say: `isUnknown` reads the marks and nothing else.
The board once exempted squares in a line whose count was accounted for *with no
✕ drawn there*, which was three things at once — inconsistent with the double
tap, which charges for the same false belief; silent, since nothing on the grid
explained the refusal, so a miscount got corrected without being reported; and a
hole in the oracle rule, because an exemption the player can't see is itself a
free probe (refused means empty, at no cost). A full line's ✕ answers the last
two by being drawn.

**A push stops being a claim once the deduction is done.** With every road
square claimed there is nothing left to bet on — an unmarked square is empty by
exhaustion and the player knows it — so `paveStep` offers no claim at all past
`deductionComplete`. What remains is one long shaping gesture, and a fast drag
clipping a blank square on its way round a corner is a slip of the finger, not a
mistaken deduction; charging a deduction heart in the phase the game has just
announced is *not* about deduction reads as the board turning on the player at
the finish. Note where that draws the line: not "which squares are provably
empty" (the clue-based exemption above, rejected) but "is there any road left to
find" — the game's own phase flip.

Both gestures live on the same grid at the same time, so a touch has to belong
to one of them. `grabsRoad` decides: a touch on the drawn road — or on the entry,
before there is one — pays out road, and everything else marks a square. Since
a road is only ever extended from its own end, no square is ever ambiguous.

**A printed piece is immutable.** The two terminals and the uniqueness reveals
are facts the board hands over at the start, and the road passing over one must
not restate it — a stub laid on a printed piece rubs out a shape the player is
mid-way through reasoning from. `routePieces` therefore yields the printed piece
for those cells whatever the route is doing, including under the moving end.
Nothing is lost: `connectStep` already refuses any step that disagrees with a
printed piece, so the mask the route implies there is the printed one anyway.
Where the road's end has got to is said by the highlight instead.

**Only a drag winds the road in.** Putting a finger down on a drawn cell takes
hold of the road without moving it — the rewind happens as the finger drags back
along it, so while the touch is down the road's end simply follows the finger.
Rewinding on the touch itself meant that a mis-tap on the road silently swallowed
everything drawn past it, and road cells are exactly the cells a player has most
reason to prod at.

Finishing the route implies the deduction is finished, so nothing extra polices
the win: a complete route is `path.length` distinct *claimed* cells, and claims
are true, so every road square must have been found to draw it.

### A claim is checked; a cross is not

Double-tapping a square with no road is **refused and costs a heart** — the
square is crossed out instead (it *is* now known to be empty, and charging a
heart for nothing would be worse than the mistake; it also can't be re-claimed
for a second heart). Crossing out is **free and never checked**: it is
note-taking, and charging for it would make the core move feel like a gamble.
The commonest cross of all — the rest of a full line — the board writes itself.

The consequence worth protecting: because claims are verified, **a ✓ on the
board is always true**, so the road can trust the claimed set completely and
`connectStep` only has to police adjacency and the printed pieces. That is also
what makes drawing road mid-deduction sound rather than a way to cheat.

**And a claim is permanent.** A tap on a ✓ does nothing (`TAP` in `useGame`). It
used to take the claim back, which could only ever lose something — a square
already proved, and the road standing on it, cut off at that cell. A tap is the
most careless touch there is, and a claimed square is exactly where a player
prods while reading the road through it. Claims therefore only ever accumulate,
which is why `settle` no longer trims the road: nothing can vanish from under it.

Three hearts. Losing the last one sets `failed`, which locks input and leaves the
board exactly as the player built it rather than clearing it — at that moment the
only interesting question is "where did I go wrong", and a wiped grid answers it
with nothing.

**A loss never shows the answer.** It used to: the solution was drawn dimmed
underneath the player's own marks (`ghosts` in `useGame`). That was the puzzle
giving away the one thing it exists to withhold, and it made losing *profitable* —
the cheapest route through a hard board was to spend three hearts on purpose, read
the route off the grid, and press **Try again**. Nothing else in the game reveals a
square the player hasn't earned: a refused claim reports that one square and no
more, and a hint costs stock. The board can't be the exception. What is left on
screen is the player's own reasoning, which is the actual evidence of the mistake.

### Leaving never costs the board

An 8×8 is ten minutes of work and a phone interrupts. Opening a level used to
deal a fresh board every time, so the map button, the back gesture, a phone call
or the app being swept away each threw the whole board away. Now every
unfinished board is kept per level (`tracks.boards.v1`, apart from progress) and
opening the level again picks it up. `src/game/save.ts` says what a save is;
`useGame` says when.

- **The hearts go with it.** A save that restored the marks but not the hearts
  would make leaving a free refill — three more guesses on a board already
  carrying the first three's answers. The one way back to three hearts is still
  *Try again*, which still costs everything on the board.
- **A heart is written at once.** Marks wait out a short delay so a swipe is one
  write, but a lost heart can't: killing the app inside the delay would bring
  the board back with the heart *and* the answer to the claim that cost it.
- **Only a board in play is kept.** A lost board isn't (its *Try again* is fresh
  anyway), nor a won one, nor one with nothing on it.
- **A save is not trusted.** `restoreBoard` refuses a save naming a different
  puzzle — the bank changes between builds — or asserting a ✓ on a square with no
  road, since nothing may put an unchecked ✓ on the board. The road is drawn
  again through `connectStep` (`replayRoute`) rather than copied in.

Because leaving is now free, **the restart button asks first** (`RestartConfirm`)
whenever there is anything on the board to lose. It is the one button left that
destroys work, and it sits under the thumb next to the hint; the safe answer,
*Keep going*, is the big one.

### Hints say why

A hint used to be an answer — one road square claimed, no reason given. That
unsticks a board and teaches nothing, and the boards that stick people are the
ones asking for a rule they were never shown: the tutorial covers counting, and
most of the ladder needs more. Now a hint is **the next step a person could take**,
found by the engine that grades the boards and said in one line in the banner:
what follows, and from what (`src/game/hint.ts`).

- **The engine is asked, not paraphrased.** `propagate` takes a `probe`: it then
  reasons one round *without changing anything*, and records every application of
  the cheapest rule that bites as a `Step` — which squares, and why (this line's
  count, this square's ways out, every placement of this line agreeing…). Each
  step is read against the board as it stands, so a reason never leans on a
  square only another step settled out of sight. `nextSteps` is the entry point;
  the probe is free when off, and all 600 grade readings are byte-identical with it.
- **Mistakes first.** A ✕ on a road square is the one mistake the board lets
  stand, and every step built on it is built on a false fact, so the first hint
  on such a board points at it and claims the square instead.
- **A green line counts as swept.** Its leftovers are empty and the board has
  already crossed them out; nobody should pay a hint to be told that.
- **Road is claimed, empties are pointed at.** A hint may claim, as it always
  could. It may not cross anything out — the only ✕ the board writes are a full
  line's, and an empty square a hint has *reasoned* out is the player's to write
  — so it rings the empty squares and the tip stays up until the player has
  crossed them (`followTip`); anything else they do takes it down.
- **Of equally easy steps, the nearest the road's end wins**, so the hint lands
  where the reasoning was going.
- **While connecting**, a hint lays the next square of road — and first winds a
  wrong turn back to where it went wrong, the connect phase's only way to be stuck.
- A hint is charged only when there is one to give (`useHint` asks the pure
  reducer first).

The rings are orange — the palette's "next thing to do" — and never the head's
white: half the squares a hint rings are empty, and "a hint is about this square"
must never read as "the road goes here". The banner's box is tall enough for its
usual two lines, so a one-line hint coming and going never jogs the board.

### A full line crosses itself out

When a row or column holds as many claims as its count, the rest of its squares
are crossed out on the spot (`sweepSettled` in `board.ts`). The reducer's
`settle` runs it on every change, so no route to a claim — double tap, push,
hint — can miss it, and `boardFor` runs it as a board opens, so a line a terminal
already fills opens swept.

This reverses an earlier rule, twice over. The board first drew such leftovers
as paler, derived crosses, then drew none at all, on the grounds that sweeping a
full line is the game's central counting move and a grid that does it has done
the deduction for the player. What changed the answer is that the chore outweighed
the lesson: *noticing* a line is full is the deduction, and the green sign already
rewards it; tapping out its leftovers one by one afterwards is bookkeeping, and on
an 8×8 it is most of the taps in a board. What made the old versions wrong is
designed out rather than accepted:

- **One ✕, one weight.** A sweep writes an ordinary `MARK_BLOCKED`, drawn in the
  same `mark` as the player's, so there is no second glyph to learn or sort. It
  needs no sorting anyway: a sweep can only be true — the claims are checked and
  the count is printed — and it always sits under a green sign.
- **Drawn, so no oracle.** Those squares turn the road away for free only because
  a ✕ is drawn there, derived from what the player can see.
- **It can't be rubbed out.** A tap takes a full line's ✕ off and the sweep puts it
  straight back, like a tap on a ✓: a mark that can only be true has nothing to
  gain from coming off.
- **Fog and scenery are left alone.** A fogged line is never swept — that would
  give its hidden count away — and no mark lands on scenery.

The knock-ons: the tutorial's third lesson now *shows* the sweep rather than
asking for it (a claim fills a column and the square under it crosses itself
out), so the first ✕ a player is asked to write by hand is the dead end in the
two-ways-out course, the first place a hand-written ✕ is actually needed; and
`worthKeeping` compares a board against `openingMarks`, so one whose terminal
fills a line isn't mistaken for one with work on it.

The last frame of a won board still gets `crossOutRest`: finishing the route
means every road square is claimed, so every square still unmarked is empty *and
the player has already proved it* — usually the sweep has written them all by
then anyway. The board then draws every off-route square as a bit of town (see
Rendering), and the finished grid states the whole answer.

`lineOverCrossed` turns a clue into a red **warning sign** when the player has
ruled out so much of a line that its count can no longer be met. Nothing is
enforced — the notes stay wrong until the player says otherwise — but it catches
a bad assumption before ten more moves get built on it. It is a *shape*, not just
a colour: settled and over-crossed used to be a green disc and a red disc, the one
pair the commonest colour blindness can't separate, so the warning is the road's
own red-rimmed triangle (`WarningSign` in `Board.tsx`).

## Layout

```
App.tsx                     screens + overlays, no game logic
src/game/                   pure, headless, no React — the whole rulebook
  types.ts                  directions, pieces as bitmasks, Puzzle
  solver.ts                 exhaustive path search; the *shape* uniqueness referee
  deduce.ts                 the five human rules; the *solvability* gate + grader
  hint.ts                   hints that say why: the engine's next step, in one line
  generator.ts              seeded generate-and-test, gated on both
  codec.ts                  compact puzzle serialisation
  levelData.ts              GENERATED — the baked level bank
  daily.ts                  the daily road: day numbering, the week's recipes, the streak
  dailyData.ts              GENERATED — the baked daily bank (52 weeks)
  levels.ts                 the ladder: level → size, seed, puzzle
  tutorial.ts               the tutorial's lessons, and the technique courses
  board.ts                  rules of play (marks, clue tallies, route legality)
  garage.ts                 the convoy's paint jobs and the stars that open them
  save.ts                   a board in progress: what is kept, and what is refused
  runTests.ts               npm test
src/state/useGame.ts        board reducer + AsyncStorage progress and unfinished boards
src/state/useGameSounds.ts  what the board sounds like, derived from what changed
src/components/             Board, Cell, RoadPiece, CarRide, screens, overlays
  Scenery.tsx               sky, sun or moon, weather, the region's skyline, hills — every backdrop
  Diorama.tsx               the home screen's looping mini-board with traffic
  Town.tsx                  the town that grows round the road, region by region
  GarageOverlay.tsx         the paint jobs, opened from the home screen's star count
  TutorialScreen.tsx        the hand-guided tutorial and courses, gated through the real reducer
  GuideHand.tsx             the animated finger that demonstrates each gesture
  Logo.tsx / Display.tsx    the wordmark, and outlined display type
src/haptics.ts              vibration, one switch
src/ads.ts                  rewarded video (revive, hint); skipped with the reward paid in Expo Go and on the web
src/sound.ts                sound effects and the music loop, one switch each
src/theme.ts                palette, fonts, regions and their looks; colour is assigned by function
assets/sfx/                 GENERATED — the baked sounds and music
assets/images/              GENERATED — icon, adaptive icon, splash, favicon
scripts/buildLevels.ts      npm run levels:build
scripts/buildDaily.ts       npm run daily:build
scripts/buildSounds.ts      npm run sfx:build
scripts/buildArt.ts         npm run art:build
```

`src/game` never imports React. That is what lets `runTests.ts` play thousands
of boards to completion in a couple of seconds with no renderer.

## Generation, and why the bank is baked

`generateGraded(seed, opts)` is generate-and-test, and **the order of its two
gates is the design**:

1. Two terminals on **different** sides (same-side terminals read as a dead end).
2. A self-avoiding random walk between them, **refusing to enter the exit until
   the walk is long enough**. That refusal is what makes routes wind — a walk
   allowed to finish as soon as it can produces a boring L, and length is the
   puzzle's whole texture.
3. Read the clues off the finished path, and bin the walk unless its shape is
   worth playing (`shapeIsPlayable`: **no empty row or column**, enough extreme
   clues to give the deduction a way in, enough corners, not too much road lying
   alongside itself).
4. **Is it deducible with only the two terminals showing?** Ask `deduce.ts`, and
   bin the walk if a person could not reason it out.
5. **Reveal pieces until the route's shape is unique** — aimed, so each reveal
   kills the rival the solver just found.

**Uniqueness was never solvability, and only the solver was being asked.** Step 4
did not exist, and the bank paid for it: measured with a human rule engine, **80 of
120 shipped levels could not be deduced at all**. On an 8×8 a player reasoned out
43% of the grid and then hit a wall with ~37 squares unresolved and three hearts —
the late ladder was a coin flip wearing a puzzle's clothes. It is 120 of 120 now.

Which leaves the two jobs split, neither doing the other's work:

> the clues, alone, settle **where** the road goes;
> the printed pieces settle **what shape** it is.

The second is a real job rather than a crutch. Most boards whose road *cells* are
fully deducible still admit more than one way to route through them — 8 of 8
sampled 8×8s — because knowing which squares carry road says nothing about how
they turn. That is what reveals are spent on, and because step 4 has already
passed without them, **no reveal can be standing in for a deduction**. Aimed
reveals also matter for speed: revealing a random path cell usually changes
nothing and costs a full re-solve.

**Reveals are graded by two readings, and the difference bites.** A printed piece
can drop a board that needs assume-and-refute down to plain counting, so the tier
the *clues* demand (`gate`) and the tier the *played board* demands (`grade`) come
apart. Anything policing "this level may not require rule X" must read `gate`;
ranking on `grade` put a clues-need-T5 board at level 90, where the tests refused
it. `ladderScore` therefore leads with the clue tier, which keeps clue difficulty
monotonic across a band for free and so keeps the hard-rule boards in the only
slots allowed to hold them.

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

**The bank, and why it is *sorted*.** `npm run levels:build` bakes every level into
`src/game/levelData.ts` as one line each (~8 min for all 600; one band is seconds to
a few minutes), and `puzzleForLevel` parses
instead of searching — building an 8×8 that is both deducible and single-shaped
takes around half a second, which is a frozen screen on a phone.

But the builder also does something the app could not: it **grades and orders**.
Difficulty used to be whatever the seed produced, so levels 76 and 120 were
statistically the same 8×8 board and the only thing that grew across the ladder
was the grid. Now each slot generates `TRIES_PER_SLOT` candidates and keeps the
**hardest**, then the band ships sorted by `ladderScore`.

Keeping the hardest is a counterweight, not greed: deducible boards are rare and
the easy ones are far commoner, so taking the first acceptable candidate fills the
whole ladder with T1/T2 boards. A first cut of this script did exactly that — every
band came out T1/T2 with nothing above it.

**The grace levels are sorted with their bonus piece on.** The first three of a
band ship with an extra printed piece, and a piece lowers the played grade by
however much it happens to give away — so two boards in the right order without it
can swap with it, which the ramp test reads as a dip (it bit Lantern Town and
Blossom Valley on their first bake). The builder scores every arrangement of the
grace boards with the pieces each would really ship with and keeps the first that
climbs; failing that it re-draws the bonus piece itself, which is free to choose
because it is baked into the line. The unchanged order with the old piece is tried
first, so a band that already climbed bakes exactly as it did.

**No clue is ever 0** (`touchesEveryLine`). The road reaches every row and every
column, so there is no line the player crosses off in one sweep without reading
anything else. A 0 is the one clue that resolves a whole strip of grid for free,
and on the big boards two or three of them turned a quarter of the puzzle into
filling in blanks before the deduction proper began — the grid the player is
given and the grid they actually have to work out were not the same grid. Now
every clue is a number to place. It costs surprisingly little: the walks already
run at a 52–72% fill, and one that misses a line entirely is usually the sort of
short cornered-off route the shape tests were binning anyway.

The knock-on is that **1 joins the footholds and 0 leaves them** (`isExtreme`).
The list is what it always was — the clues at the ends of the range, where
counting bites — but the bottom end is now a line owing exactly one square
rather than none.

**The difficulty dial is the foothold floor**, and it is adaptive. Extreme clues
(1, _n−1_, _n_) are where counting bites, so *withholding* them is what forces the
harder rules; a band opens generous and tightens. It has to adapt because extreme
clues get rarer as boards grow — 4.0 of 8 lines on a 4×4 but 2.4 of 16 on an 8×8 —
so one fixed fraction is either trivial small or impossible large. Asking 35% of an
8×8's lines starved the band outright. Each slot now asks for what it wants and
settles for what the size can supply.

Only the irreducible facts are stored — size, terminals, route, which cells start
revealed. The piece grid and the clues are *recomputed* on decode, which keeps
the bank small and makes it impossible for a stored clue to contradict a stored
solution. Grades are **not** stored: the engine recomputes them, so they can't go
stale against the board they describe.

**Re-running `levels:build` changes existing levels** — the pool is graded and
sorted, so it is not even stable under an unchanged generator. Fine before release,
not after. The tests pin the bank's *properties* (deducible, single-shaped, ordered)
rather than its bytes, which is what the old "matches the generator" check was only
ever a proxy for.

## Rendering

**The look is a toy-town diorama.** The board is a patch of mown lawn in a
wooden tray, set in a landscape of sky and hills (`Scenery`), and everything
drawn on it is something you could build in that tray. The lawn is one SVG layer
under the cells (`Lawn` in `Board.tsx`): two greens in a checker, so the grid
reads without a single grid line, plus a scatter of *shapeless* darker clumps. Grass
blades were tried and removed twice — on a board of ticks, crosses and chevrons a
V read as a tick and a three-bladed tuft as an arrow. Type is Fredoka throughout
(`font` in `theme.ts`, loaded behind the native splash); custom fonts carry their
weight in the family name, so nothing sets `fontWeight`.

`RoadPiece.tsx` derives all ten drawings (6 pieces + 4 stubs) from one geometry:
a curve is a quarter circle centred on the corner with **radius half a cell**, so
its ends land exactly on the edge midpoints and therefore exactly on the
neighbouring piece's ends. Everything else is that centreline offset sideways —
kerb stones as a wider stroke under the tarmac, the white edge lines at
±`EDGE_OFF`, shrubs at ±`BUSH_OFF`, the yellow dashes as the centreline itself.
On a curve an offset is a concentric arc (wider outside the bend, tighter inside)
whose ends **slide along their edge** by `k = 1 − 2r/s`, which is what makes two
neighbouring pieces meet line-to-line and kerb-to-kerb with no seam. The SVG sweep
flag is the sign of a cross product, not a lookup table. Caps are butt, never
round: a rounded end bulges past the cell edge and prints a lip where two pieces
meet.

Shrubs are planted only above `BUSH_MIN_PX`. On an 8×8 the cells are small
enough that shrubbery turns into smudges, and the road is the thing the player is
trying to read.

A claimed square is **road works**: a square of fresh tarmac inset from the cell,
taped off in yellow and black, with a neck of the same works reaching out of each
side it could be joined from (`ClaimGlyph` in `Cell.tsx`); a ✕ is chalk-white with
a shadow so it stands off the lawn. It is the road's own build-up with the finish
still to come — tarmac on the road's dark hairline, but no kerb stones yet, only
the tape where they will go, and none of the road's paint: the white edge lines
and the yellow dashes are what say which way a road goes, and that is the one
thing a claim doesn't know. The tarmac is a shade paler than the finished road's
(`asphaltFresh`), with its stones still showing. So laying the real piece reads as
the works being finished — the tape comes down, the kerbs go in, the lines are
painted — and the finished road stays the darkest, cleanest thing on the board.
Yellow and black appear nowhere else in the palette, so the tape can't be taken
for a hint (orange), a mistake (red) or a settled clue (green). The stripes repeat
a whole number of times across a cell (`TAPE_STRIPES`), so where two claims' necks
meet the tape runs on unbroken.

**The necks say it will connect.** A claim is a square the road passes
*through*, and a bare tile said nothing about that — a row of them read as a row
of tiles. A neck runs to the cell's edge, so two claims side by side meet neck to
neck and a printed piece turned their way plugs straight in. They are narrower
than the road (`NECK_W`): at full width four of them are a crossroads, and a
board of claims fuses into one car park. And a neck is only drawn where the road
could really go (`claimWays` in `Board.tsx`): not out through the frame, not onto
scenery, not into a square a full line has crossed out, not into the side of a
whole piece of road that turns away — each of those would draw a road that can't
exist. Any other ✕ is **not** consulted: outside a full line a ✕ is the player's
unchecked note, and necks that withdrew from those would draw "two ways out" for
the player the moment the second-last neighbour was crossed.

What it replaced, and why: a road-works sign carrying a `?` on a plot of earth,
with four stubs of road poking in from every edge regardless. A claim is the one
checked mark on the board, so a question mark on it reads as doubt about the one
thing that isn't in doubt; and a plot of earth, tried without the sign, read as a
building site rather than as road. Also tried and dropped: a traffic cone on the
square (it drew the eye away from the road, and a cone is what *closes* a road), a
tarmac disc with the yellow dashes wound into a ring (a manhole cover at 8×8),
plain grey gravel (the mountains' rocks are grey, and those are printed
*empties*), a stub of the centreline's paint on each side (a crossroads), a plain
kerb with no tape (tidy, but it read as finished road, not works), red-and-white
barrier tape (red is the hearts' and the mistakes'), and a dug-earth edge (too
quiet to read as works at 8×8).

The square where the next road goes is tinted and ringed by `HeadRing`, which
breathes — the only thing on an untouched board that moves, so the eye goes there
first. Clues
are round signs above and beside the tray: paper, green when settled — and a
red-rimmed warning triangle when over-crossed, sized to take back exactly the
gutter the disc leaves spare, so nothing shifts when a clue flips.

The two terminals are simply where the road runs **out through the wooden
frame** (`Terminal`), with a chevron painted on it pointing the way the car
travels. Nothing sits over the cell, so the printed piece — one of the few facts
the board gives away — is never covered.

`CarRide.tsx` flattens the finished route into a polyline (curves sampled around
their arc), measures it, and uses **cumulative distance** as the interpolation
input — constant speed through corners, which is the thing the eye notices.
Headings are unwrapped so a crossing of ±180° never spins the long way round.
Both ends are extended off the board so the cars arrive from off-screen and leave
the same way; the grid's clipping does the rest. Everything is native-driver
(translate and rotate only). The home screen's `Diorama` is the same trick on a
closed loop: two laps laid end to end, each car reading them from its own offset,
one native loop moving them all.

**Five cars, not one.** The four behind the leader are that same interpolation
with the input range slid forward by a fixed *distance*, so they trail by a
constant gap rather than a constant time and the convoy bends through a corner in
file instead of concertina-ing. The drive runs past 1 to `end = 1 + gap·(CARS−1)`
so the last car reaches the end of the line; the ones already finished clamp at
the departure point, which is off the board and clipped away. The duration is
scaled by `end` too — the extra stretch is time the tail spends leaving, not the
leader driving faster to cover it. They are painted from `theme.fleet`: five of
one colour reads as a copy-paste, five colours read as traffic.

The two ends say what they are with no instruction: a chequered **start line**
painted across the tarmac where the road enters, and the **chequered flag** on
the square where it leaves. The line is flat on the road, so the printed piece
under it stays readable; it takes its width from `ROAD_W` so it can't drift from
the lane it is painted on, and it goes once the car is away.

**The win is built around the board, not over it.** The finished route is *lit*,
and lit **to the road's own shape**: `LitRoad` traces `roadRun` — the very
centreline the tarmac, kerbs, lines and dashes are all offsets of — in two passes
a little wider than `ROAD_SPAN`, so the glow bends through every corner exactly as
the road does and never mentions the square it runs through. Filling whole cells
was the first try and it lit the *grid*: a staircase of blocks with the road
somewhere inside it, which is the one reading the board spends the whole game
teaching the player to stop making.

**And it grows, entry to exit**, because the road is a journey and a journey has
a direction — the same one the convoy is about to take. That is one dash as long
as the whole road with its offset wound from full to nothing, which is why the
route is *one* path rather than one per cell: a dash pattern restarts at every
subpath and every element, so `roadRun` hands back **relative** commands and
`Geometry.step` exists to build them. A dash offset is neither a transform nor an
opacity, so that one runs on the JS thread; the pulse that takes over once the
light has arrived is native, and so is the confetti.

**The town grows round the road.** Every off-route square of a won board is
proved empty by then (`crossOutRest` has already written it in), and instead of a
sheet of ✕ it is built on, chosen by a hash of the square and the puzzle's seed so
the same board always builds the same town, springing up in a stagger that spreads
diagonally across the tray. The grid still states the whole answer — road where
the road is, town everywhere else — it just says it the way the game would like to
be remembered.

**Each region builds its own town** (`TOWNS` in `Town.tsx`). The regions used to
be a name and a colour on the map, and every won board grew the same four things,
so "Metropolis" looked exactly like "Meadow Lane" at the one moment it mattered.
Now the meadows are fields, barns, hay and sheep; the village cottages, gardens
and a well; the market town shops under striped awnings and market stalls; the
riverside terraces and canals with boats; the city rooftops, helipads and
fountains — the band says which. The second road trip's nine build theirs: beach
huts, a lighthouse and boats in Harbour Bay; orchards, pumpkins and beehives in
Orchard Hills; adobe houses, cacti and mesas in Sunset Canyon; palms, tiki huts and
lagoons on the Palm Isles; chalets, snowmen and an ice rink in Frost Valley;
lantern-strung houses and lamplit squares in Lantern Town; stone houses, lava rocks
and hot springs on Ember Ridge; cherry trees, teahouses and koi in Blossom Valley;
turrets, a keep and a hedge maze on Castle Hill. Every piece is a toy seen from above in
the tray's own hand (offset shadow, a lit and a shaded half, outlines at a third
of the ink), so a barn and a tower sit on the same lawn without either looking
pasted in. A market stall drawn as a pitched canopy in four triangles read as a
bow tie at board size, and is a striped awning instead. A few are side-on for the
same reason — from above a lighthouse is a dartboard and a mesa a cushion — and
nothing is dark grey with a pale ridge, which at 8×8 reads as tarmac. Printed
scenery follows the region too (`sceneryKind`): cacti and mesas in the canyon,
palms and lagoons on the isles, snowy pines and ice in the frost. Only wild things,
never a building, and the mountains draw exactly as they did.

**Each region brings its own world** (`LOOKS` in `theme.ts`, drawn by `Scenery`).
A region used to change nothing on screen but the header plate, so from level 1 to
the last the board sat under the same sky. Now a region sets the sky's two colours,
a sun or a moon, the three hills (or a sea on the horizon), a skyline on the far
ridge — windmills, a church spire, market gables, a many-arched bridge, towers,
snowy peaks, a sea of cloud, a lighthouse, orchard rows, mesas, islands, lanterns
strung between poles, a volcano, a pagoda, a castle — and the weather: clouds,
snow, falling leaves, petals, rising embers or stars. The skyline is side-on and in
the haze, because it is far away; the board is the one thing close and seen from
above.

The parts are picked for where they show. On a phone the board fills the width and
hides most of the ridge, so what the eye meets in play is the sky above the board,
the hills under the tools — and the tray and lawn, which a region sets as well
(`Look.wood`, `Look.lawn`; on the board, the map's fields and the home screen's
diorama): a blue-painted tray at the harbour, birch in the snow, red lacquer under
the lanterns, charred wood on the volcano, stone at the castle. **The lawn only
moves along the greens** — drier in the canyon, cooler in the frost, lusher on the
isles — because it is the ground the ✕ and its green shadow, the road and the works
tape were all tuned against; sand and snow go in the hills instead, and `npm test`
holds every lawn to green-before-red-or-blue. The home screen wears the region the
player has got to, which is where the trip shows; the map, the splash and the
tutorial keep the classic sky, because their titles sit straight on it.

Weather is flat views on native-driver loops — a dozen falling rounded rectangles,
not SVG — and `Scenery` is memoised on its props, since the game screen re-renders
on every step of road and the sky has no reason to go with it.

**The hearts become the stars.** The three heart slots in the HUD are the score:
on a win the hearts still standing turn into stars one at a time, each with its
own note a step higher (`sound.star`). Stars are recorded per level as a best
(`progress.stars`) and shown on the map; they are a record, not a rule —
nothing in play reads them. What they do open is **the garage**
(`src/game/garage.ts`, reached by tapping the star count on the home screen):
paint jobs for the convoy at star thresholds, from the free rainbow to a gold
convoy at 360 — the first road trip's crown — and on to a royal procession at
1480 of the ladder's 1800. Stars are never spent; a threshold opens a
fleet for good, and a win that crosses one says so under its title. A number
with nowhere to go is a number players stop reading — this gives replaying a
board for a cleaner win something to show for it, on the thing they watch after
every board. The rest of the celebration is dropped into
slots `GameScreen` already has (`WinCelebration.tsx`): the congratulation replaces
the instruction banner, and the buttons replace the tools — one big **Level
_n+1_** between a replay and the map. The title is absolutely positioned inside
the banner's box and allowed to overflow it, because laid out in flow it would
re-centre the stage and jog the board at the exact moment the player is looking
at it. Only the confetti is an overlay; it loops, since a single burst ends in a
bare screen and reads as the celebration breaking rather than finishing.

**The level list is a road trip** (`LevelsScreen`): each band is a region with its
own name, colour, lawn and tray (`REGIONS`, `LOOKS` in `theme.ts`), and the levels
are stops along one serpentine road through it, opening scrolled to wherever the
car is. Six hundred stops are too many to draw at once, so the map is a `FlatList`
of regions that draws only those near the screen; a region's height is a sum of
fixed parts (the sign has a fixed height for exactly this), so the list can open on
the car's region without drawing everything above it.

**The map keeps the towns the player built.** Each cleared stop puts a piece of
its region's town on the lawn — beside the road on the way to the next stop, or
inside the bend where the road turns a row — and a three-star clear puts a second
under the stop, beneath its stars. Every spot sits *below* the road it belongs to:
the first version used both sides, and a row's pieces below and the next row's
above reached for the same patch of lawn between them. A region starts as bare
lawn and fills in as it is played, so the map shows how far the player has come
and how well, without another number on it.

**Store art is generated too.** `npm run art:build` draws the icon, the Android
adaptive icon, the splash mark and the favicon as SVG in `scripts/buildArt.ts`
— using the board's own road numbers — and rasterises them with resvg.

## Input

One `PanResponder` on the grid, not per-cell pressables — three of the four
gestures are *strokes* (painting crosses, drawing the route) and a stroke can't
be assembled out of independent button presses. Cells are `pointerEvents="none"`
so the container always owns the touch. The grant records the grid's page-space
origin as `pageX − locationX`, so later move events resolve to a cell with no
`measure` call and no dependence on where the board sits on screen.

Because road and marks share the grid throughout, the grant routes the touch
before it does anything with it: `grabsRoad` first (road gesture), deduction
otherwise. The entry cell is lit from the first frame — the glow means "the next
road goes here" everywhere else in the game, and here it is also the only
advertisement that the drag is available yet.

**Double tap is optimistic**: the first tap applies its cross immediately and
the second *replaces* it with a claim. Waiting out the double-tap window before
drawing anything would put ~250ms of lag on the most repeated action in the game;
taking a cross back is invisible by comparison.

**A fast drag lands diagonally**, so `paveStep` pays the route out one legal
step at a time along an L. Every step still goes through `connectStep`, so
nothing illegal can be drawn however fast the finger moves.

That walk lives in the reducer (the `PAVE` action) rather than in the responder,
because a step may now *claim* — and a claim reads the solution and spends a
heart, which is state the component has no business deciding. The responder says
only "the finger is over this cell"; the reducer decides how far the road gets
and what it costs. A push that costs a heart also ends the stroke: the road can
claim as it goes, and one careless flick should not be able to spend all three.

Props reach the responder through a `live` ref refreshed each render — the
responder is created once and would otherwise capture the first render's props.

## Onboarding

**Shown, not told.** A first-time player who presses Play (`tutorialSeen` false,
still on level 1) gets `TutorialScreen` before any real board: four 3×3 lessons,
**one short line** at a time, and a finger (`GuideHand`) that performs the exact
gesture on the exact square it wants — double tap, drag, or pointing at a clue
(and, in the technique courses, tap and pointing at a square) — looping until the
player copies it. It steps out of the way while the
player moves and comes back when they pause. The order is the order the ideas are
needed: the goal (drag start → flag, and the car ride as the payoff), what a number
counts plus double tap, a full line crossing itself out and the forced claim it
leaves, a your-turn square, and road that claims as it's pushed. A four-row recap
card ends it; Settings and Help both replay it.

The lessons are **data** (`src/game/tutorial.ts`): each step is one line and one
**goal** the board can check (claim these, cross those, solve, drive). The screen
runs them through the game's own `reduce` — exported from `useGame` for exactly
this — so the tutorial can't teach a rule the game doesn't have, and it **gates**
input to the goal: an off-script move is ignored and answered by the hand
replaying. Two rules are softened there and only there: a wrong claim is refused
(flash, shake, sound) but keeps the heart, with the line saying what it *would*
have cost — which is how hearts get taught without taking one; and a road square
can't be crossed out, which is also what lets a lone tap on a square that wants a
double tap be answered with "twice, quickly". `npm test` plays every lesson by its
own script and fails if one ever asks to claim an empty square, cross a road
square, or drag a road that doesn't reach the flag.

### Techniques are taught when they're needed

The basics are counting, and counting carries a player exactly one level: level 2
already needs "two ways out", level 20 the line-by-line trial the engine calls
intersection, and level 113 a what-if. Nothing used to show any of it — most of
the ladder asked for reasoning the game had never mentioned, and the only help
for a stuck player was an answer.

So each harder rule is a `Technique` (`TECHNIQUES` in `tutorial.ts`): a short
course of one or two lessons, run by the same screen and the same reducer as the
basics, shown **once, just before the first level that needs it** (`techniqueDue`,
checked by `App`'s `open` on every way into a level — the map, Continue, and the
win's next-level button, which is why that button now goes through the app). It
ends on a card naming the trick, with the rule in one line and a button on to the
level; the help then lists every trick the player has been shown, replayable.
Skipping counts as shown. `progress.learned` records them.

The lesson boards were found, not drawn: small boards searched with the engine
for the moment where **the new rule is the only move left** — everything easier
is already on the board (`Lesson.marks`), so the lesson opens part-way through —
and after which the rest is easy enough to hand over as the player's turn.
`npm test` holds each course to that:

- the board opens on true marks with nothing easier than its rule left to do;
- every square it asks for before the player's turn is one that rule proves;
- the player's own turn needs nothing past two-ways-out;
- `firstLevel` is exactly the first shipped board that can't be solved without
  the rule — so rebuilding the bank either keeps the lessons in place or says
  where they have to move.

Pointing at a square (`Gesture` `square`) joined pointing at a clue, because a
technique's reasons are about squares ("try the top one") as often as lines.

## Sound

**The sounds are generated, not sourced.** `npm run sfx:build` synthesises all
twenty-two effects and the music loop from `scripts/buildSounds.ts` — oscillators, seeded noise, one-pole
filters and envelopes over a Float32 buffer — and writes 16-bit mono WAVs into
`assets/sfx/`. A game this quiet needs a handful of very specific noises, and the
useful ones are easier to describe as a recipe than to find: twenty lines give
exactly the 46ms tick the board wants, weigh 4kB, are byte-identical on every
machine, and carry no licence. Same bargain as the level bank — the script is the
source, the files are its baked output, and a rebuild never shows up as a diff.

One instrument family, to match the toy-town look: struck wood and a small
marimba (`block` and `mallet` in the script — a marimba bar is a sine with a
fourth-harmonic overtone that dies almost at once, and that fast partial *is* the
mallet), plus one tin-toy horn when the convoy pulls away. Levels are set per
sound in the script rather than left to normalisation, because the difference
between a noise you can hear a thousand times and one you mute is mostly
loudness — and an undo is always quieter than the act it undoes.

**The music is one 20-second loop** at 22.05kHz: pad, plucked bass, a quiet
chord pulse and a marimba line that only uses pentatonic notes, so nothing in it
can clash with an effect laid over it. It is seamless by construction — every
note's tail that runs past the end is folded back onto the start. It has its own
switch (`progress.music`), is created lazily, and on the web waits for the first
touch, because browsers throw for audio started before one.

**The hot sounds come in threes.** `cross` and `pave` are heard thousands of
times, several a second inside one stroke, and the ear picks an identical sample
repeated at speed and starts hearing a machine gun. Three near-identical takes
rotate; as a bonus each play gets its own player, so consecutive ones overlap
properly. A floor of 28ms between plays stops a fast sweep rattling.

**What makes a noise is decided by the state, not the call site**
(`useGameSounds`). A claim can arrive from a double tap, from the hint button, or
from a drag that paved into an unknown square; a cross can be taken back by a
tap or a swipe. Watching `foundTotal`/`blockedTotal`/`route.length`/`shake` instead means
every route to an outcome makes the right noise exactly once, and a new route
gets its sound for free. Several things can move in one reducer pass — a push
into the unknown claims a square *and* extends the road — so the rules are ranked
and one wins. `fail` outranks `wrong` because losing the last heart bumps the
shake too, and the refusal is no longer the news.

**A sound has to keep up with its buzz.** The haptics fire on the touch itself,
so any delay in the sound is heard *against* them. Two delays used to add up on
a claim: the hook ran as a plain effect, after the paint, behind the redraw of a
claim's neighbours (and sometimes a whole swept line); and the clip's first note
came 20ms in and its loud one at 95ms, over a thump a phone speaker can't
play. The hook is a layout effect now, both notes land in the first 50ms, and a
sound's audible part starts at its first sample.

Two things that only bite off the web build, both worth keeping:

- **A finished player is parked at the end of its clip.** Only the web's
  `<audio>` rewinds itself; on iOS and Android, playing again from there is
  silence. So a used voice is rewound in the background once its clip is over and
  the next play finds it ready — and a voice retriggered *before* it finished has
  to chain `seekTo(0).then(play)`, never fire them side by side, because `seekTo`
  returns a promise and `play` does not.
- **The `expo-audio` config plugin asks for the microphone by default.** Left as
  the bare string `"expo-audio"`, a prebuild puts `RECORD_AUDIO` in the Android
  manifest and `NSMicrophoneUsageDescription` in Info.plist — for a game that
  only plays 400ms blips. `app.json` passes `microphonePermission: false` and
  `recordAudioAndroid: false` to turn both off.
- **…and for background playback.** `enableBackgroundPlayback` defaults to on,
  which writes `UIBackgroundModes: audio` into Info.plist — for an app that plays
  nothing once it is left, which App Review rejects (2.5.4) — and a
  `mediaPlayback` foreground service into the Android manifest, which Play makes
  you justify. `app.json` passes `enableBackgroundPlayback: false`. The plugin
  only ever *adds*, so a local `ios/`/`android/` made before that keeps both until
  `npx expo prebuild --clean`.

The session obeys the ring switch (`playsInSilentMode: false`, which on iOS is
the `ambient` category: it also mixes with the player's own music rather than
ducking it). A game that clicks through a phone set to silent is one that gets
deleted.

## The ladder

600 levels in sixteen bands (`BANDS` in `levels.ts`), a region each. The first road
trip: 4×4 (1–10), 5×5 (11–25), 6×6 (26–45), 7×7 (46–75), 8×8 (76–120) — then two
more 8×8 bands that change the game instead of the board, Mountain Pass (121–135)
and Cloud Summit (136–150); see "The mountains". The second road trip (151–600) is
nine regions of fifty; see "The second road trip". The first three levels of each band get one bonus revealed
piece — that is difficulty, not correctness, since both gates have already passed
by then. A band, not a size, is what a region is: two bands can share a size, so
the map, the header plate and the town all read `bandFor(level).region`.

**Within a band, difficulty ramps** (see the bank, above), and the ramp is what
`npm test` checks — not that a board is hard, but that it is harder than the one
before it. Levels below `HARD_TIER_FROM` (96) must fall to pure forward deduction;
from 96 up a board's clues may require the assume-and-refute rule, at depth one.
That last tier is still sound reasoning rather than a gamble, which is what keeps
it compatible with a checked claim and three hearts: the half that concludes
*empty* is written down with a free cross, and the half that concludes *road* only
costs a heart if the player mis-executes it.

A level is nothing but a number: its size and seed both derive from it, so
progress persists as a single integer. Clearing the newest level unlocks the
next and pays one hint (capped at 9, starting stock 5). Replaying pays nothing.
Alongside it, `progress.stars` keeps each level's best result (hearts left at the
win) — a record for the map, and the currency of the garage's paint jobs.

The board's restart button is exactly **Try again** without having lost first:
a fresh board, full hearts. Since leaving a level now keeps its board, hearts and
all, it is the *only* way back to three hearts, and it pays for them with
everything on the board — which is why it asks first (see "Leaving never costs
the board").

Hints spend from persisted stock (see "Hints say why" for what one does).

## Rewarded video

Two things are sold for a short ad, both opt-in and both said on the button:
**a heart back on a lost board** (`FailOverlay`) and **a hint once the stock is
empty** (the bulb's badge turns to ▶ and it asks first, `HintOffer`). Nothing
else in the game shows an ad.

- **A revive is one heart, once per board** (`REVIVE`, `REVIVES_PER_BOARD`).
  Stars are the hearts left at the win, so a revived board can still be won but
  never cleanly, and the board comes back exactly as it was lost — no answer.
  The save keeps `revived`, or leaving and returning would buy a second one.
- **A video hint is given at once**, not stocked: the player pressed the bulb
  because they wanted one now. It is offered only when there is one to give
  (`hintToGive`); if the board has moved on by the time the video ends, it goes
  into the stock instead. It still counts in `hintsUsed`.
- **No SDK, no video, the reward anyway.** Expo Go can't carry the native ad
  module and the web can't bundle it, so there `showRewarded` pays at once
  (`adsSimulated`). The package is loaded only past that check
  (`adsSdk.native.ts`): importing it looks its native module up and throws.
- **Dev builds show Google's test ads** whatever `UNITS` says; a blank unit id
  does too. Release builds show the real units in `UNITS`, under the app ids
  in `app.json`.
- **Consent before the SDK starts** (`initAds`, after the splash): Google's UMP
  form where the law wants one, and no ad requests until it allows them.
- **Then Apple's tracking prompt**, on iOS (`askToTrack`,
  `expo-tracking-transparency`): after Google's form, before any request. It
  waits for the app to be active, because iOS silently answers "no" to a prompt
  asked any earlier, and App Review rejects a build whose prompt it never saw.
  The prompt's text lives in that plugin's options in `app.json`, and nowhere
  else.
- **And it can be changed.** Where the law gives the player a way back to their
  answer, Google says so (`privacyOptionsRequired`) and Settings grows a
  **Privacy options** row that reopens the form (`showPrivacyOptions`). A new
  answer that forbids ads counts the SDK as stopped, so the next video asks
  again and finds nothing to show.
- **The privacy policy and support page live outside this repo**, on the
  developer site: `/var/www/vhosts/mithatck.com/httpdocs/apps/connectroads/`
  (`privacy-policy.html`, and `index.html` — the store's support URL), served at
  `https://mithatck.com/apps/connectroads/`. Settings links to the policy
  (`PRIVACY_POLICY_URL`), since App Review wants it reachable in the app too. The
  policy describes what the app actually does — no accounts, no analytics,
  progress only on the device, AdMob the one thing that goes online — so a change
  to any of that means an edit there as well.
- **Every ad is rated PG at most** (`maxAdContentRating`, set before the SDK
  starts): the game is rated for everyone, and the videos it plays must be too.
- **`app.json` carries the app ids twice.** The Expo plugin reads them from its
  options; the SDK's own Gradle script reads a root-level
  `"react-native-google-mobile-ads"` key, and in 17.2.0 its "key absent" branch
  sets a misspelt property and then reads the real one — so without the key the
  Android build fails with *Cannot get property 'googleMobileAdsJson'*. Keep the
  two in step.
- **An unshowable ad is a line, not an error**: "No video right now". The music
  is held while a video plays (`sound.holdMusic`).

## The mountains: scenery and fog

The ladder grew the board from 4×4 to 8×8 and then stopped — a ninth size would
shrink cells past what a thumb can hit, and a rectangle would touch every
`size` in the code. So the bands after the classic five keep the board and change
the game — Mountain Pass and Cloud Summit first, the whole second road trip after.

- **Scenery** (Mountain Pass, and Cloud Summit too): squares printed as rocks,
  pines or a lake (`Puzzle.scenery`), off the road by construction. They are
  *given* facts — the player never has to rule them out — and they read as
  landscape, not as ✕, because a ✕ is a note about a square and scenery is the
  square itself. The rules treat them like
  printed pieces (`isGiven`): no mark lands on one, the road turns away from one
  for free (`isUnknown`), and a line counts it as spent when deciding whether its
  sign turns red.
- **Fog** (Cloud Summit): some counts hidden under a cloud with a `?`
  (`Puzzle.fog`). A fogged sign never turns green or red, since either would say
  what the count is. Fog is always **on one axis and at least two lines**: the
  other axis still sums to the road's length (so the HUD's total gives nothing
  away), and one fogged line alone would be no secret — it would be that sum less
  the visible ones.

Scenery hands facts over and fog takes some back, which is why they come as a
pair: the result is a different *texture* of puzzle, not just a harder one. The
engine treats scenery as seeded empties and a fogged clue as `-1` (the solver
never prunes on it; T1 and T4 skip it, and T4 skips a fogged crossing line when
testing a placement). The solver can no longer count on pigeonhole to meet every
line once one is fogged, so arrival checks each visible line outright — a check
that can never fail on a classic board, which is how all 600 classic grade
readings stayed byte-identical through the change.

The generator lays scenery before any gate (it is part of the board, like the
terminals) and adds fog **one line at a time, only while the deducibility gate
still passes**, so fog can make a board harder but never unfair. Both are stored
as two optional codec fields, left off every classic line — which is what let the
two bands be baked with `npm run levels:build -- 121 136` and every line of 1–120
come through byte for byte. Each band gets a twist lesson at its foot
(`Technique` `kind: "twist"`), and no daily ever carries either twist.

## The second road trip

At 150 the ladder had shown everything it has: every rule, both twists, the
biggest board. Levels 151–600 are nine more regions of fifty, and none of them adds
a rule or a size — each is scenery and fog **in a new measure**, one region to a
measure, climbing again from a 6×6:

| Levels | Region | Board | Twist | Cap |
|---|---|---|---|---|
| 151–200 | Harbour Bay | 6×6 | fog 2 | T4 |
| 201–250 | Orchard Hills | 7×7 | scenery 3 | T4 |
| 251–300 | Sunset Canyon | 7×7 | scenery 4, fog 2 | T4 |
| 301–350 | Palm Isles | 8×8 | scenery 8, fog 2 | T4 |
| 351–400 | Frost Valley | 8×8 | scenery 6 | T5 |
| 401–450 | Lantern Town | 8×8 | fog 3 | T4 |
| 451–500 | Ember Ridge | 8×8 | none | T5 |
| 501–550 | Blossom Valley | 8×8 | fog 4 | T4 |
| 551–600 | Castle Hill | 8×8 | scenery 3, fog 4 | T4 |

- **It starts small on purpose.** After thirty 8×8 mountain boards a player has
  earned a quick one, and two fogged lines on a 6×6 hide a third of an axis — a
  sharper puzzle than the size suggests. The size is back at 8×8 by 301 and stays.
- **A band can name its own cap** (`Band.cap`). A twisted band asks for no what-if
  unless it says so, as the mountains never did. Frost Valley does: its scenery
  hands squares over and a what-if asks the player to earn one, which pull in
  different directions rather than piling up. Fog can't carry one anyway — each
  line goes under only while the board still falls to T4, so a fogged board's clues
  never need more. Ember Ridge is the classic game at its hardest: no twist, T5.
- **No new lessons.** Every rule and twist here was taught by level 136, so
  `techniqueDue` has nothing to add, and each technique's first board is still
  where its lesson says.
- **Baked band by band** with 1–150 copied through byte for byte
  (`npm run levels:build -- 151 201 251 301 351 401 451 501 551`, ~7 min). On that
  bake T4 carries most of every band, with T5 in the hard end of Frost Valley (9 of
  50) and Ember Ridge (16 of 50).
- **Each region is its own world** — sky, skyline, weather, tray, lawn, town and
  printed scenery (see Rendering) — and `npm test` holds the bands to tiling the
  ladder, to 8×8 at most, and to one region each with a sign colour of its own.

## The daily road

The ladder is a thing a player finishes, and nothing in it asked anyone to come
back *tomorrow*. The daily road does: one board a day, the same for everyone,
unlocked once the first region is cleared (`DAILY_UNLOCK`), with a streak of days
in a row and a hint paid the first time each day's road is built.

**The week is the difficulty curve** (`WEEK` in `daily.ts`): Monday a 5×5 that
falls to the basics, Tuesday a 6×6, then up through 6×6 and 7×7 boards that may
need "try each way" to Saturday's and Sunday's 8×8 — Sunday drawing twice the
candidates and keeping the hardest. Measured on the bank: Monday and Tuesday are
all T1/T2, and nine in ten of Thursday–Sunday need T4. Nothing past T4 ever
appears; the what-if is the ladder's endgame, and a daily must be playable by
anyone past level 10. A daily brings its own lessons: `open` asks what the board
actually needs (`tierNeeded`) and shows any trick up to that the player hasn't
seen (`techniqueFor`) — so a daily can teach "try each way" before level 20 does.

**Baked, like the ladder** (`npm run daily:build`, ~2 min): an 8×8 costs the
generator up to most of a second on a desktop, a visible freeze on a phone every
morning. The bank is 52 whole weeks and cycles — whole weeks, so a wrap keeps
every Monday a Monday — from `DAILY_EPOCH`, a Monday.

**A day is the player's own calendar day** (`today()`), turning over at their
midnight. A daily's board id is `DAILY_BASE + day`, which is how the rest of the
game tells it from a level: it keeps its own record (`progress.daily`, not the
ladder's stars), wears the accent on the header plate, and its win card's big
button goes back to the road trip wherever the player left it. An unfinished
daily is saved like any board and kept while it can still count — today's, or
yesterday's started before midnight, which counts for the day it was dealt.

The streak (`recordDaily`, `currentStreak`) counts days in a row: the next day's
road extends it, a gap restarts it at one, the same day again changes only its
stars, and it stays alive until a whole day has passed unbuilt — "yesterday" is
still a streak, because today's may just not have been played yet.

## Commands

```
npm test              headless core tests — run this before trusting anything
npm run typecheck     tsc --noEmit
npm start             expo start
npm run levels:build  regenerate the level bank (changes existing levels)
npm run levels:build -- 121 136   rebuild only the bands starting there
npm run daily:build   regenerate the daily bank (~2 min, changes the days to come)
npm run sfx:build     re-synthesise every sound and the music loop
npm run art:build     re-draw the icon, adaptive icon, splash and favicon
npx expo export --platform android   bundle check
```

`npm test` asserts, for every one of the 600 shipped boards: clues match the
path, **no clue is 0**, the path is a genuine self-avoiding walk, pieces face their neighbours,
only the terminals leave the grid, the solver finds **exactly one** solution and
it is the intended one, the bank round-trips through the codec, and the play rules
accept the solution's own moves while refusing jumps, restarts and unclaimed
squares. A half-played copy of every board is saved and restored through JSON and
must come back exactly — hearts included — while a save for another board, one
claiming an empty square, or one with no hearts left is refused. Every one of the
364 daily boards is held to the same structural and uniqueness checks, is its
weekday's size, deduces within its weekday's cap, and the bank wraps without
moving a weekday; the streak rules and the local-midnight turnover are pinned
too. The garage's thresholds only climb, the first is free and the last is
reachable but asks for mostly clean wins. Each technique
course needs exactly its rule and arrives just before the first board that does
(see "Techniques are taught when they're needed"). A player who
does nothing but follow the hints must finish every board, and no hint may ever
claim an empty square or rule out a road one; a crossed-out road square must be
the first thing a hint fixes, and none may point at a green line's leftovers. A
full line's sweep never crosses out road, never lands on scenery or a mark, never
follows a fogged count, and once the road is all claimed has crossed out every
other square. The
mountain bands carry exactly their twists and the classic ones none; scenery only
ever stands off the road; fog is on one axis, two lines or more, and a fogged sign
never turns green or red. The bands tile the ladder with none past 8×8, each band
is a region of its own with its own sign colour and a complete look, and every
region's lawn stays green. It
also plays the tutorial's lessons by their script (see Onboarding), sweeping as
the game does, and fails a step the board has already done for the player.

And the assertions this ladder exists for:

- **it is deducible from the clues alone**, with only the terminals showing, using
  no rule beyond the level's cap. This is the headline check and the one the old
  bank failed 80 times over.
- the deduction is **sound** — every square it settles matches the solution, so a
  bug that made the engine over-claim can't pass as a puzzle getting easier.
- each band is **ordered easiest-first** and actually gets harder end to end.
- the engine's tiers are a real ladder: a board graded at tier _n_ is checked to be
  unsolvable at _n−1_, so a bug that quietly folded one tier's reasoning into
  another would show up as a flat ladder rather than passing silently.

~419k checks, about fifteen seconds — most of it proving that each of the 600
levels and 364 daily boards has exactly one route.
