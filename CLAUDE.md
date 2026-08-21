# CLAUDE.md — Connect Roads

Project context for Claude Code. Connect Roads is a **Train Tracks** puzzle
(the newspaper logic puzzle, sometimes called Railroad Tracks) built with Expo
SDK 54 and React Native.

## What the game is

An _n×n_ grid. A single unbroken road enters at one border **terminal** and
leaves at another, never branching and never re-using a square. Each row and
column carries a **count** — how many of its squares hold road, not which. Two
pieces are printed on the board from the start (the two terminals), plus one or
two more when the generator needs them to force a unique answer.

Every shipped board has exactly **one** solution, and `npm test` re-proves that
for all 120 of them from the clues alone.

A road piece joins exactly two of a square's four edges, so there are six of
them: two straights and four curves. Internally a piece is just a **2-bit mask**
of the directions it opens onto (`src/game/types.ts`), which makes "do these two
pieces meet" a bitwise test and makes the four half-laid **stubs** (single-bit
masks) fall out of the same representation for free.

## The two phases — this is the whole design

**Deduce.** Work out *which* squares carry road. Double tap claims a square
("road goes here"); a single tap or a swipe crosses one out. You never say what
*shape* the piece is — that isn't knowable yet, and the board draws a claimed
square as four road ends pointing inward around a `?`.

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

**Only the player's own ✕ turns the road away for free** (`isUnknown`) — their
note, respected, and it tells them nothing they didn't write themselves. The
clues get no say: a square in a line whose count is already accounted for is
provably empty, and the road still pushes into it and still charges, because
noticing that is exactly the counting the player is there to do. The board used
to exempt those squares, which was three things at once — inconsistent with the
double tap, which charges for the same false belief; silent, since no ✕ is drawn
there to explain the refusal, so a miscount got corrected without being
reported; and a hole in the oracle rule, because an exemption the player can't
see is itself a free probe (refused means empty, at no cost).

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
a road is only ever extended from its own end, no square is ever ambiguous. The
side effect is that a claim under the road can't be un-claimed while the road is
standing on it; drag the road back off it first.

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
note-taking. Sweeping a settled row is the game's most common deduction and the
first thing the tutorial teaches — charging for it would make the core move feel
like a gamble.

The consequence worth protecting: because claims are verified, **a ✓ on the
board is always true**, so the road can trust the claimed set completely and
`connectStep` only has to police adjacency and the printed pieces. That is also
what makes drawing road mid-deduction sound rather than a way to cheat.

Three hearts. Losing the last one sets `failed`, which locks input and shows the
solution *dimmed underneath the player's own marks* (`ghosts` in `useGame`)
rather than clearing the board — at that moment the only interesting question is
"where did I go wrong", and a wiped grid answers it with nothing.

### Every cross is the player's

The board draws no ✕ of its own. It used to: a settled row or column had its
leftovers crossed out in a paler grey, derived rather than stored so they
couldn't drift. Two things were wrong with it. Sweeping a settled line is the
game's central deduction, and filling it in the instant the last ✓ landed did
that deduction for the player — the grid walked itself to "obviously finished"
without them ever reading the clue. And it made the glyph ambiguous: a player
scanning the grid had to sort their own marks from the board's before trusting
any of them, which is a tax on the one thing they most need to trust.

So there is one ✕, in one weight (`mark`), and it means "the player says this is
empty". Nothing else on the grid crosses anything out, and no rule consults a
settled line on the player's behalf either — the exemption that used to survive
in `isUnknown` went with the marks, for the reasons above.

The one exception is the last frame of a won board: finishing the route means
every road square is claimed, so the squares still unmarked are empty *and the
player has already proved it*. `crossOutRest` writes them in as the win is
committed — no deduction is being done for anyone at that point, and the finished
grid states the whole answer instead of trailing the squares that were never
worth the tap.

`lineOverCrossed` turns a clue red when the player has ruled out so much of a
line that its count can no longer be met. Nothing is enforced — the notes stay
wrong until the player says otherwise — but it catches a bad assumption before
ten more moves get built on it.

## Layout

```
App.tsx                     screens + overlays, no game logic
src/game/                   pure, headless, no React — the whole rulebook
  types.ts                  directions, pieces as bitmasks, Puzzle
  solver.ts                 exhaustive path search; the *shape* uniqueness referee
  deduce.ts                 the five human rules; the *solvability* gate + grader
  generator.ts              seeded generate-and-test, gated on both
  codec.ts                  compact puzzle serialisation
  levelData.ts              GENERATED — the baked level bank
  levels.ts                 the ladder: level → size, seed, puzzle
  board.ts                  rules of play (marks, clue tallies, route legality)
  runTests.ts               npm test
src/state/useGame.ts        board reducer + AsyncStorage progress
src/state/useGameSounds.ts  what the board sounds like, derived from what changed
src/components/             Board, Cell, RoadPiece, CarRide, screens, overlays
src/haptics.ts              vibration, one switch
src/sound.ts                sound effects, one switch
src/theme.ts                palette; colour is assigned by function
assets/sfx/                 GENERATED — the baked sounds
scripts/buildLevels.ts      npm run levels:build
scripts/buildSounds.ts      npm run sfx:build
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
   worth playing (`shapeIsPlayable`: enough extreme clues to give the deduction a
   way in, enough corners, not too much road lying alongside itself).
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

**The bank, and why it is *sorted*.** `npm run levels:build` bakes all 120 into
`src/game/levelData.ts` as one line each (~66s), and `puzzleForLevel` parses
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

**The difficulty dial is the foothold floor**, and it is adaptive. Extreme clues
(0, _n_, _n−1_) are where counting bites, so *withholding* them is what forces the
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

`RoadPiece.tsx` derives all ten drawings (6 pieces + 4 stubs) from one geometry:
a curve is a quarter circle centred on the corner with **radius half a cell**, so
its ends land exactly on the edge midpoints and therefore exactly on the
neighbouring piece's ends. Everything else is that centreline offset sideways —
the grass verges at ±`VERGE_OFF`, the dark kerb as a wider stroke under the
tarmac, the dashes as the centreline itself. On a curve an offset is a concentric
arc (wider outside the bend, tighter inside) whose ends **slide along their edge**
by `k = 1 − 2r/s`, which is what makes two neighbouring pieces meet
tarmac-to-tarmac and grass-to-grass with no seam. The SVG sweep flag is the sign
of a cross product, not a lookup table. Caps are butt, never round: a rounded end
bulges past the cell edge and prints a lip where two pieces meet.

Bushes are planted on the verges only above `BUSH_MIN_PX`. On an 8×8 the cells
are small enough that shrubbery turns into smudges, and the road is the thing the
player is trying to read.

`CarRide.tsx` flattens the finished route into a polyline (curves sampled around
their arc), measures it, and uses **cumulative distance** as the interpolation
input — constant speed through corners, which is the thing the eye notices.
Headings are unwrapped so a crossing of ±180° never spins the long way round.
Both ends are extended off the board so the cars arrive from off-screen and leave
the same way; the grid's clipping does the rest. Everything is native-driver
(translate and rotate only).

**Five cars, not one.** The four behind the leader are that same interpolation
with the input range slid forward by a fixed *distance*, so they trail by a
constant gap rather than a constant time and the convoy bends through a corner in
file instead of concertina-ing. The drive runs past 1 to `end = 1 + gap·(CARS−1)`
so the last car reaches the end of the line; the ones already finished clamp at
the departure point, which is off the board and clipped away. The duration is
scaled by `end` too — the extra stretch is time the tail spends leaving, not the
leader driving faster to cover it. They are painted from `theme.fleet`: five of
one colour reads as a copy-paste, five colours read as traffic.

The two ends say what they are with no instruction: a **start line** painted
across the tarmac where the road enters, and the **chequered flag** on the square
where it leaves. The start line was a parked car first, and the car was wrong —
it covered the printed piece underneath, which is one of the few facts the board
gives away and the last thing worth burying. A line is flat: same statement, road
still readable. It is inset from the border because the terminal tab sits on that
edge, it takes its width from `ROAD_W` so it can't drift from the lane it is
painted on, and it goes once the car is away — there is nothing left to start.

**The win is built around the board, not over it.** It used to be a modal card
with the score on it, which covered the one thing the player had just spent
minutes making. Now the finished route is *lit*, and lit **to the road's own
shape**: `LitRoad` traces `roadRun` — the very centreline the tarmac, kerbs,
dashes and verges are all offsets of — in two passes a little wider than
`ROAD_SPAN`, so the glow bends through every corner exactly as the road does and
never mentions the square it runs through. Filling whole cells was the first try
and it lit the *grid*: a staircase of blocks with the road somewhere inside it,
which is the one reading the board spends the whole game teaching the player to
stop making. Sharing the geometry rather than re-deriving it is the point — a
second copy of "straight, curve or stub" is a second chance to disagree with the
road it is hugging.

**And it grows, entry to exit**, because the road is a journey and a journey has
a direction — the same one the convoy is about to take. That is one dash as long
as the whole road with its offset wound from full to nothing, which is why the
route is *one* path rather than one per cell: a dash pattern restarts at every
subpath and every element, so `roadRun` hands back **relative** commands and
`Geometry.step` exists to build them. It pays off twice — the cell-to-cell joins
are tangent-continuous (a straight meets an edge square on, and so does a curve's
end), so the glow has no seams at all, and the sweep costs two animated props a
frame instead of two per cell. A dash offset is neither a transform nor an
opacity, so that one runs on the JS thread; the pulse that takes over once the
light has arrived is native, and so is the confetti. The light is quicker than
the cars, so it gets there first and they follow it down a road already lit.
Every cell off the route and every clue fades back to 0.3.

The rest of the celebration is dropped into slots `GameScreen` already has
(`WinCelebration.tsx`): the congratulation replaces the instruction banner — a
gold word arched over the board, each letter its own `Text` so the text engine
still measures the spacing, rotated and dropped on a circle. There is no outline
on it: a dark ring made the word read as a sticker pasted over the screen, and it
was the only black on a page that is otherwise paper and ink. The letters carry
themselves — heavy, in the one warm colour the game keeps for winning, lifted off
the pale board by a wide blurred glow of their own colour. The buttons replace
the hint button,
one big **Level _n+1_** between a replay and a levels icon. Only the confetti is
an overlay, because it belongs to the whole screen; it loops, since a single
burst ends in a bare screen and reads as the celebration breaking rather than
finishing. The title is absolutely positioned inside the banner's 62pt box and
allowed to overflow it: laid out in flow it would re-centre the stage and jog the
board down at the exact moment the player is looking at it. Nothing restates the
score — hearts are already along the top and the hint stock is already on the
button that spends it.

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

## Sound

**The sounds are generated, not sourced.** `npm run sfx:build` synthesises all
seventeen from `scripts/buildSounds.ts` — oscillators, seeded noise, one-pole
filters and envelopes over a Float32 buffer — and writes 16-bit mono WAVs into
`assets/sfx/`. A game this quiet needs a handful of very specific noises, and the
useful ones are easier to describe as a recipe than to find: twenty lines give
exactly the 46ms tick the board wants, weigh 4kB, are byte-identical on every
machine, and carry no licence. Same bargain as the level bank — the script is the
source, the files are its baked output, and a rebuild never shows up as a diff.

One instrument family: a short filtered-noise transient with a pitched body under
it, nothing brighter than about 6kHz, nothing that rings. Levels are set per
sound in the script rather than left to normalisation, because the difference
between a noise you can hear a thousand times and one you mute is mostly
loudness — and an undo is always quieter than the act it undoes.

**The hot sounds come in threes.** `cross` and `pave` are heard thousands of
times, several a second inside one stroke, and the ear picks an identical sample
repeated at speed and starts hearing a machine gun. Three near-identical takes
rotate; as a bonus each play gets its own player, so consecutive ones overlap
properly. A floor of 28ms between plays stops a fast sweep rattling.

**What makes a noise is decided by the state, not the call site**
(`useGameSounds`). A claim can arrive from a double tap, from the hint button, or
from a drag that paved into an unknown square; a mark can be taken back three
ways. Watching `foundTotal`/`blockedTotal`/`route.length`/`shake` instead means
every route to an outcome makes the right noise exactly once, and a new route
gets its sound for free. Several things can move in one reducer pass — a push
into the unknown claims a square *and* extends the road — so the rules are ranked
and one wins. `fail` outranks `wrong` because losing the last heart bumps the
shake too, and the refusal is no longer the news.

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

## The ladder

120 levels: 4×4 (1–10), 5×5 (11–25), 6×6 (26–45), 7×7 (46–75), 8×8 (76–120).
The first three levels of each new size get one bonus revealed piece — that is
difficulty, not correctness, since both gates have already passed by then.

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

Hints spend from persisted stock: during deduction one claims a road square
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
it is the intended one, the bank round-trips through the codec, and the play rules
accept the solution's own moves while refusing jumps, restarts and unclaimed
squares.

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

~61k checks, a couple of seconds.
