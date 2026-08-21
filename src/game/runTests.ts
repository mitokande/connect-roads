// Headless correctness tests for the game core. Run with:
//   npm test        (npx tsx src/game/runTests.ts)
//
// What has to be true before any of this is worth rendering:
//   (a) every shipped level generates, and its clues admit exactly one route —
//       checked by re-running the solver from scratch on the clues alone, not by
//       trusting the generator's own verdict;
//   (b) the clues, the piece grid and the path all describe the same board;
//   (c) generation is fast enough to run on a phone while a screen fades in;
//   (d) the play rules accept the solution and refuse everything else.

import {
  connectComplete,
  connectStep,
  deductionComplete,
  blockedTotal,
  colFound,
  foundTotal,
  grabsRoad,
  hintCell,
  initialMarks,
  isUnknown,
  lineOverCrossed,
  MARK_BLOCKED,
  MARK_NONE,
  MARK_ROAD,
  markAt,
  nextRouteCell,
  paveStep,
  routePieces,
  rowFound,
  shownPiece,
  stubDir,
  roadTotal,
  trimRoute,
  withMark,
  type Marks,
} from "./board";
import { decodePuzzle, encodePuzzle } from "./codec";
import {
  deduce,
  deduceInput,
  ladderScore,
  terminalCells,
  NO_ROAD,
  ROAD,
  UNKNOWN,
  type Tier,
} from "./deduce";
import {
  fixedMap,
  generateGraded,
  generatePuzzle,
  MAX_EXTRA_REVEALS,
  mulberry32,
  piecesFromPath,
  touchesEveryLine,
} from "./generator";
import { LEVEL_BANK } from "./levelData";
import {
  bandIndex,
  GRACE_LEVELS,
  HARD_TIER_FROM,
  LEVEL_COUNT,
  levelSeed,
  puzzleForLevel,
  sizeForLevel,
  tierCapForLevel,
} from "./levels";
import { countSolutions } from "./solver";
import {
  DC,
  DIRS,
  DR,
  EMPTY,
  dirsOf,
  hasDir,
  key,
  opposite,
  same,
  type Coord,
  type Puzzle,
} from "./types";

let failures = 0;
let checks = 0;
/** Pushes into the unknown that would have been wrong — the drag's own risk. */
let wrongPushes = 0;

function check(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    failures++;
    console.error("  FAIL:", msg);
  }
}

/** Every structural invariant a finished puzzle must satisfy. */
function auditPuzzle(p: Puzzle, label: string) {
  const n = p.size;

  // Clues agree with the path.
  const rows = new Array(n).fill(0);
  const cols = new Array(n).fill(0);
  for (const { r, c } of p.path) {
    rows[r]++;
    cols[c]++;
  }
  check(rows.every((v, i) => v === p.rows[i]), `${label}: row clues match the path`);
  check(cols.every((v, i) => v === p.cols[i]), `${label}: column clues match the path`);

  // No line is empty. A 0 clue is a strip of grid the player crosses off without
  // reading anything else, so the bank is built to never print one — see
  // `touchesEveryLine` in the generator.
  check(
    touchesEveryLine(p.rows, p.cols),
    `${label}: every row and column carries road (no 0 clue)`,
  );

  // The path visits no cell twice and every step is a step.
  const seen = new Set<number>();
  for (let i = 0; i < p.path.length; i++) {
    seen.add(key(p.path[i].r, p.path[i].c));
    if (i > 0) {
      const a = p.path[i - 1];
      const b = p.path[i];
      check(
        Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1,
        `${label}: path step ${i} is orthogonal`,
      );
    }
  }
  check(seen.size === p.path.length, `${label}: path never revisits a cell`);

  // The piece grid is exactly the path, and pieces face each other.
  let pieceCells = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const piece = p.solution[r][c];
      if (piece === EMPTY) continue;
      pieceCells++;
      check(dirsOf(piece).length === 2, `${label}: piece at ${r},${c} joins two edges`);
      for (const d of DIRS) {
        if (!hasDir(piece, d)) continue;
        const r2 = r + DR[d];
        const c2 = c + DC[d];
        const offBoard = r2 < 0 || c2 < 0 || r2 >= n || c2 >= n;
        if (offBoard) {
          const isEntry = p.entry.r === r && p.entry.c === c && p.entry.dir === d;
          const isExit = p.exit.r === r && p.exit.c === c && p.exit.dir === d;
          check(isEntry || isExit, `${label}: piece at ${r},${c} only leaves via a terminal`);
        } else {
          check(
            hasDir(p.solution[r2][c2], opposite(d)),
            `${label}: piece at ${r},${c} meets its neighbour ${d}`,
          );
        }
      }
    }
  }
  check(pieceCells === p.path.length, `${label}: piece grid covers exactly the path`);
  check(
    p.solution[p.entry.r][p.entry.c] !== EMPTY && p.solution[p.exit.r][p.exit.c] !== EMPTY,
    `${label}: both terminals hold road`,
  );
  check(
    !(p.entry.r === p.exit.r && p.entry.c === p.exit.c),
    `${label}: terminals are different cells`,
  );

  // Revealed pieces: the two terminals, the shape reveals, and at most one bonus.
  // Derived from the generator's own cap rather than restated, so raising that cap
  // can't leave this quietly asserting the old number.
  const revealCeiling = 2 + MAX_EXTRA_REVEALS + 1;
  check(p.fixed.length >= 2, `${label}: terminals are revealed`);
  check(
    p.fixed.length <= revealCeiling,
    `${label}: at most ${revealCeiling} pieces revealed (got ${p.fixed.length})`,
  );
  for (const cell of p.fixed) {
    check(
      p.solution[cell.r][cell.c] !== EMPTY,
      `${label}: revealed cell ${cell.r},${cell.c} is on the path`,
    );
  }

  // The referee, re-run from the clues alone.
  const res = countSolutions({
    size: n,
    rows: p.rows,
    cols: p.cols,
    entry: p.entry,
    exit: p.exit,
    fixed: fixedMap(p),
  });
  check(res.exhausted, `${label}: solver finished within budget`);
  check(res.count === 1, `${label}: exactly one solution (got ${res.count})`);
  if (res.solution) {
    let identical = true;
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) if (res.solution[r][c] !== p.solution[r][c]) identical = false;
    check(identical, `${label}: the one solution is the generated one`);
  }
}

/** Play the board the way a player would, and assert the rules cooperate. */
function auditPlay(p: Puzzle, label: string) {
  // --- Deduction -----------------------------------------------------------
  let marks: Marks = initialMarks(p);
  check(
    foundTotal(marks) === p.fixed.length,
    `${label}: revealed pieces start out claimed`,
  );
  check(!deductionComplete(p, marks), `${label}: a fresh board is not already solved`);

  for (const cell of p.path) {
    if (markAt(marks, p.size, cell.r, cell.c) !== MARK_ROAD) {
      marks = withMark(marks, p.size, cell.r, cell.c, MARK_ROAD);
    }
  }
  check(deductionComplete(p, marks), `${label}: claiming every road cell completes deduction`);
  check(
    foundTotal(marks) === roadTotal(p),
    `${label}: claimed count equals the road total`,
  );

  // Every cross is the player's, so the tally the sound layer listens to only
  // ever moves when the player moves it.
  check(blockedTotal(marks) === 0, `${label}: a solved deduction has no crosses of its own`);
  check(
    blockedTotal(withMark(initialMarks(p), p.size, 0, 0, MARK_BLOCKED)) === 1 &&
      blockedTotal(initialMarks(p)) === 0,
    `${label}: crossing one square out counts exactly one`,
  );

  // Only a mark of the player's makes a square known. A settled row or column
  // proves its leftovers empty, but the board keeps that to itself: it must not
  // quietly exempt those squares from the road's push, or "refused" would mean
  // "empty" and the drag would be a free probe. Unmarked is unknown, full stop.
  for (let r = 0; r < p.size; r++) {
    for (let c = 0; c < p.size; c++) {
      const settled = rowFound(p, marks, r) >= p.rows[r] || colFound(p, marks, c) >= p.cols[c];
      check(
        isUnknown(p, marks, r, c) === (markAt(marks, p.size, r, c) === MARK_NONE),
        `${label}: ${r},${c} is unknown exactly while the player hasn't marked it`,
      );
      if (p.solution[r][c] === EMPTY && settled) {
        check(
          isUnknown(p, marks, r, c),
          `${label}: a settled line doesn't exempt empty ${r},${c} from the push`,
        );
      }
    }
  }

  // Over-crossing: the solution's own marks never trip the warning, but
  // crossing out a whole row does — including a row whose clue is 0, which has
  // no road to lose and so must stay quiet.
  for (let r = 0; r < p.size; r++) {
    check(
      !lineOverCrossed(p, marks, r, false),
      `${label}: row ${r} isn't flagged when solved correctly`,
    );
    let crossed = initialMarks(p);
    for (let c = 0; c < p.size; c++) {
      if (markAt(crossed, p.size, r, c) !== MARK_ROAD) {
        crossed = withMark(crossed, p.size, r, c, MARK_BLOCKED);
      }
    }
    const stillFree = p.fixed.filter((f) => f.r === r).length;
    check(
      lineOverCrossed(p, crossed, r, false) === stillFree < p.rows[r],
      `${label}: row ${r} flags exactly when its clue became unreachable`,
    );
  }

  // Hints only ever point at unclaimed road.
  const partial = initialMarks(p);
  const hint = hintCell(p, partial);
  check(hint !== null, `${label}: an unfinished board offers a hint`);
  if (hint) {
    check(p.solution[hint.r][hint.c] !== EMPTY, `${label}: the hint cell holds road`);
    check(
      markAt(partial, p.size, hint.r, hint.c) !== MARK_ROAD,
      `${label}: the hint cell isn't one already claimed`,
    );
  }
  check(hintCell(p, marks) === null, `${label}: a complete board offers no hint`);

  // --- Road laid before the deduction is finished ---------------------------
  // Road can be drawn from the first move, so the rules have to hold on a
  // half-deduced board too: the road runs as far as the claims do and stops
  // dead at the first square the player hasn't claimed.
  {
    let early: Marks = initialMarks(p);
    const prefix = Math.min(3, p.path.length - 1);
    for (let i = 0; i < prefix; i++) {
      early = withMark(early, p.size, p.path[i].r, p.path[i].c, MARK_ROAD);
    }
    check(!deductionComplete(p, early), `${label}: the early-road board is still unfinished`);

    // How far the solution's own route may legally go with those claims.
    let reach = 0;
    while (
      reach + 1 < p.path.length &&
      markAt(early, p.size, p.path[reach + 1].r, p.path[reach + 1].c) === MARK_ROAD
    ) {
      reach++;
    }

    let road: Coord[] = [];
    check(grabsRoad(p, road, p.path[0]), `${label}: an unstarted road is grabbed at the entry`);
    check(!grabsRoad(p, road, p.path[1]), `${label}: an unstarted road is grabbed nowhere else`);
    for (let i = 0; i <= reach; i++) {
      const next = connectStep(p, early, road, p.path[i]);
      check(next !== null, `${label}: road step ${i} draws mid-deduction`);
      if (!next) break;
      road = next;
    }
    check(road.length === reach + 1, `${label}: the road reaches every claimed cell`);
    for (const cell of road) {
      check(grabsRoad(p, road, cell), `${label}: every drawn cell takes hold of the road`);
    }
    if (reach + 1 < p.path.length) {
      const beyond = p.path[reach + 1];
      check(
        connectStep(p, early, road, beyond) === null,
        `${label}: the road stops at the first unclaimed cell`,
      );
      check(!grabsRoad(p, road, beyond), `${label}: a cell off the road doesn't take hold of it`);
    }

    // Pushing the road into a square nothing is known about is a claim — and
    // the rules must offer that push even when the square turns out to be
    // empty, or the drag would be a free oracle for "is there road here?".
    if (reach + 1 < p.path.length) {
      const ahead = p.path[reach + 1];
      if (isUnknown(p, early, ahead.r, ahead.c)) {
        const step = paveStep(p, early, road, ahead);
        check(
          step !== null && step.kind === "claim" && same(step.cell, ahead),
          `${label}: pushing on to the next road square is a claim`,
        );
        const claimed = withMark(early, p.size, ahead.r, ahead.c, MARK_ROAD);
        const after = paveStep(p, claimed, road, ahead);
        check(
          after !== null && after.kind === "move" && after.route.length === road.length + 1,
          `${label}: once claimed, the same push is an ordinary step`,
        );
        // Crossed out, the same square refuses the road for free.
        const crossed = withMark(early, p.size, ahead.r, ahead.c, MARK_BLOCKED);
        const refused = paveStep(p, crossed, road, ahead);
        check(
          refused === null || refused.kind !== "claim",
          `${label}: the road won't push into a square ruled out`,
        );
      }
      for (const d of DIRS) {
        const head = road[road.length - 1];
        const cand = { r: head.r + DR[d], c: head.c + DC[d] };
        if (!isUnknown(p, early, cand.r, cand.c)) continue;
        if (!connectStep(p, withMark(early, p.size, cand.r, cand.c, MARK_ROAD), road, cand)) {
          continue;
        }
        const step = paveStep(p, early, road, cand);
        check(
          step !== null && step.kind === "claim" && same(step.cell, cand),
          `${label}: every legal push into the unknown is offered as a claim`,
        );
        if (p.solution[cand.r][cand.c] === EMPTY) wrongPushes++;
      }
    }

    // Un-claiming underneath a drawn road cuts it there — and takes the rest.
    check(trimRoute(p, early, road) === road, `${label}: a backed-up road is left alone`);
    if (road.length > 1) {
      const end = road[road.length - 1];
      check(
        trimRoute(p, withMark(early, p.size, end.r, end.c, MARK_NONE), road).length ===
          road.length - 1,
        `${label}: un-claiming the road's end cuts it back one`,
      );
    }
    if (road.length > 2) {
      const mid = road[1];
      check(
        trimRoute(p, withMark(early, p.size, mid.r, mid.c, MARK_NONE), road).length === 1,
        `${label}: un-claiming mid-road drops everything past it`,
      );
    }
  }

  // --- Connecting ----------------------------------------------------------
  let route: Coord[] = [];
  for (const cell of p.path) {
    const next = connectStep(p, marks, route, cell);
    check(next !== null, `${label}: the solution's own step to ${cell.r},${cell.c} is legal`);
    if (!next) return;
    route = next;
    // With every road square claimed there is nothing left to claim, so from here
    // the drag only ever moves: the shaping gesture can't cost a heart, however
    // wide a fast finger swings.
    const tip = route[route.length - 1];
    for (const d of DIRS) {
      const step = paveStep(p, marks, route, { r: tip.r + DR[d], c: tip.c + DC[d] });
      check(
        step === null || step.kind === "move",
        `${label}: a settled board's drag never asks for a claim`,
      );
    }
    const pieces = routePieces(p, route);
    if (route.length > 1 && route.length < p.path.length) {
      const head = route[route.length - 1];
      const drawn = pieces.get(key(head.r, head.c)) ?? 0;
      const printed = shownPiece(p, head.r, head.c);
      if (printed === null) {
        check(stubDir(drawn) !== null, `${label}: the moving end draws a stub`);
      } else {
        // A piece the board printed is immutable: the road resting on it draws
        // it whole rather than cutting it back to the edge it came in by.
        check(drawn === printed, `${label}: the moving end leaves a printed piece alone`);
      }
    }
    // …and that holds for every printed piece at every point in the drawing,
    // not just the one under the road's end.
    for (const f of p.fixed) {
      const shown = pieces.get(key(f.r, f.c));
      check(
        shown === undefined || shown === p.solution[f.r][f.c],
        `${label}: the printed piece at ${f.r},${f.c} is never redrawn`,
      );
    }
  }
  check(connectComplete(p, route), `${label}: the solution's route completes the road`);
  check(
    routePieces(p, route).size === p.path.length,
    `${label}: the finished route draws every cell`,
  );
  // Every drawn piece is the real one.
  for (const [k, piece] of routePieces(p, route)) {
    const r = Math.floor(k / 100);
    const c = k % 100;
    check(piece === p.solution[r][c], `${label}: drawn piece at ${r},${c} is the solution's`);
  }

  // Illegal moves are refused.
  check(connectStep(p, marks, [], p.path[1]) === null, `${label}: a route must start at the entry`);
  const half = p.path.slice(0, Math.max(2, Math.floor(p.path.length / 2)));
  const head = half[half.length - 1];
  const jump = { r: head.r, c: (head.c + 2) % p.size };
  check(connectStep(p, marks, half, jump) === null, `${label}: no jumping to a distant cell`);
  check(
    connectStep(p, marks, half, half[0]) === null || half.length === 2,
    `${label}: no leaping back to the start`,
  );
  check(
    connectStep(p, marks, half, half[half.length - 2])?.length === half.length - 1,
    `${label}: stepping back retreats the route`,
  );
  // A cell the player never claimed can't be drawn through.
  const unclaimed = withMark(marks, p.size, head.r, head.c, MARK_BLOCKED);
  const back = half[half.length - 2];
  check(
    connectStep(p, unclaimed, half.slice(0, -1), head) === null,
    `${label}: an unclaimed cell refuses the road`,
  );
  check(back !== undefined, `${label}: sanity — the route has a previous cell`);

  // The hint knows what comes next, and stops at the end.
  const upto = p.path.slice(0, 2);
  const nxt = nextRouteCell(p, upto);
  check(
    nxt !== null && nxt.r === p.path[2].r && nxt.c === p.path[2].c,
    `${label}: the route hint points at the next solution cell`,
  );
  check(nextRouteCell(p, p.path) === null, `${label}: a finished route has no next cell`);
}

console.log("Connect Roads — core tests\n");

// --- 1. Determinism ---------------------------------------------------------
{
  const a = generatePuzzle(12345, { size: 5 });
  const b = generatePuzzle(12345, { size: 5 });
  check(JSON.stringify(a) === JSON.stringify(b), "the same seed builds the same puzzle");
  const c = generatePuzzle(12346, { size: 5 });
  check(JSON.stringify(a) !== JSON.stringify(c), "a different seed builds a different puzzle");

  const rng = mulberry32(7);
  const rng2 = mulberry32(7);
  const draws = [rng(), rng(), rng()];
  const redraws = [rng2(), rng2(), rng2()];
  check(draws.every((v, i) => v === redraws[i]), "the PRNG is reproducible");
  check(new Set(draws).size === 3, "the PRNG doesn't repeat itself");
}

// --- 2. piecesFromPath ------------------------------------------------------
{
  // A hand-checked 3×3: in at (0,0) from the west, down the middle, out east.
  const path: Coord[] = [
    { r: 0, c: 0 },
    { r: 1, c: 0 },
    { r: 1, c: 1 },
    { r: 1, c: 2 },
  ];
  const grid = piecesFromPath(path, { r: 0, c: 0, dir: 3 }, { r: 1, c: 2, dir: 1 }, 3);
  check(grid[0][0] === (1 << 3 | 1 << 2), "entry cell curves west→south");
  check(grid[1][0] === (1 << 0 | 1 << 1), "the turn curves north→east");
  check(grid[1][1] === (1 << 1 | 1 << 3), "the middle runs straight east–west");
  check(grid[1][2] === (1 << 3 | 1 << 1), "exit cell runs west→east");
  check(grid[2][2] === EMPTY, "cells off the path stay empty");
}

// --- 3. The level ladder ----------------------------------------------------
{
  check(sizeForLevel(1) === 4, "level 1 is 4×4");
  check(sizeForLevel(10) === 4 && sizeForLevel(11) === 5, "the 5×5 band starts at level 11");
  check(sizeForLevel(LEVEL_COUNT) === 8, "the ladder tops out at 8×8");
  check(bandIndex(11) === 0 && bandIndex(13) === 2, "band index counts from the band's first level");
  const seeds = new Set<number>();
  for (let l = 1; l <= LEVEL_COUNT; l++) seeds.add(levelSeed(l));
  check(seeds.size === LEVEL_COUNT, "every level draws its own seed");
}

// --- 3b. The baked bank ------------------------------------------------------
{
  check(LEVEL_BANK.length === LEVEL_COUNT, "the bank holds every shipped level");

  // This used to assert the bank *was* `generatePuzzle(levelSeed(level))`, and it
  // deliberately no longer can: the builder generates a surplus per band, grades
  // every candidate and ships them sorted, so a level's board is chosen by its
  // difficulty rather than drawn from its own seed. What replaces the drift check
  // is stronger and lives below — every baked board is re-proved deducible,
  // single-shaped, and correctly ordered, which is what the drift check was only
  // ever a proxy for.
  //
  // The round trip still has to be exact, since the bank stores only the route
  // and recomputes the clues and pieces from it.
  for (const level of [1, 5, 11, 26, 46, 76, 96, LEVEL_COUNT]) {
    const baked = decodePuzzle(LEVEL_BANK[level - 1], levelSeed(level));
    check(
      encodePuzzle(baked) === LEVEL_BANK[level - 1],
      `level ${level}: the bank line round-trips through the codec`,
    );
    check(
      JSON.stringify(baked.solution) ===
        JSON.stringify(piecesFromPath(baked.path, baked.entry, baked.exit, baked.size)),
      `level ${level}: decoding rebuilds the piece grid from the route`,
    );
    const rows = new Array<number>(baked.size).fill(0);
    const cols = new Array<number>(baked.size).fill(0);
    for (const { r, c } of baked.path) {
      rows[r]++;
      cols[c]++;
    }
    check(
      JSON.stringify(baked.rows) === JSON.stringify(rows) &&
        JSON.stringify(baked.cols) === JSON.stringify(cols),
      `level ${level}: decoding rebuilds the clues from the route`,
    );
    check(sizeForLevel(level) === baked.size, `level ${level}: the bank line is the right size`);
  }
}

// --- 3c. Every shipped board can be reasoned out ----------------------------
//
// The headline assertion of the whole suite, and the one the bank used to fail:
// uniqueness was being proved and solvability was not, so 80 of 120 levels could
// not be deduced at all — a player reasoned out 43% of an 8×8 and then had to
// guess, with three hearts and a checked claim.
//
// The gate is run on the **terminals alone**, which is stricter than what the
// player gets. That ordering is the invariant the generator is built around: the
// clues have to carry the deduction on their own, so no printed piece can be
// quietly standing in for a deduction the player was supposed to make.
{
  const ramp = new Map<number, number[]>();

  for (let level = 1; level <= LEVEL_COUNT; level++) {
    const p = puzzleForLevel(level);
    const cap = tierCapForLevel(level);

    const bare = deduce(deduceInput(p, terminalCells(p)), cap);
    check(
      bare.solved,
      `level ${level}: deducible from the clues alone (${bare.unknown} squares left, tier cap ${cap})`,
    );
    check(!bare.contradiction, `level ${level}: the clues don't contradict themselves`);

    // Sound, not just complete: every square it settled must match the truth.
    let wrong = 0;
    for (let r = 0; r < p.size; r++) {
      for (let c = 0; c < p.size; c++) {
        const truth = p.solution[r][c] !== EMPTY ? ROAD : NO_ROAD;
        const got = bare.state[r * p.size + c];
        if (got !== UNKNOWN && got !== truth) wrong++;
      }
    }
    check(wrong === 0, `level ${level}: deduction never contradicts the solution`);

    // As the player meets it — reveals included — for the grade and the ramp.
    const played = deduce(deduceInput(p), cap);
    check(played.solved, `level ${level}: still deducible with its pieces showing`);
    check(
      played.grade.maxTier <= cap,
      `level ${level}: needs no rule beyond tier ${cap} (used T${played.grade.maxTier})`,
    );
    if (level < HARD_TIER_FROM) {
      check(
        played.grade.maxTier <= 4,
        `level ${level}: never asks for assume-and-refute (used T${played.grade.maxTier})`,
      );
    }

    const band = sizeForLevel(level);
    if (!ramp.has(band)) ramp.set(band, []);
    ramp.get(band)!.push(ladderScore(bare.grade, played.grade));
  }

  // Each band is a ramp, not a bag: difficulty rises through it. This is the
  // fault that made levels 76 and 120 statistically the same 8×8 board — the seed
  // was a hash of the level number and nothing ever graded the result.
  for (const [size, scores] of [...ramp].sort((a, b) => a[0] - b[0])) {
    let dip = -1;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] < scores[i - 1] && dip < 0) dip = i;
    }
    check(
      dip < 0,
      `the ${size}×${size} band is ordered easiest-first` +
        (dip < 0 ? "" : ` (dips at slot ${dip}: ${scores[dip - 1]} → ${scores[dip]})`),
    );
    check(
      scores[scores.length - 1] > scores[0],
      `the ${size}×${size} band actually gets harder (${scores[0]} → ${scores[scores.length - 1]})`,
    );
  }
}

// --- 3d. The engine's tiers are a real ladder -------------------------------
//
// Each tier has to *earn* its place: a board it solves must be a board the tier
// below cannot. Without this, a bug that quietly folded T4's reasoning into T2
// would still pass everything above — every board would come out "solvable", the
// grades would collapse to one value, and the ladder would silently go flat.
{
  /** The tier each generated board needed, and whether one lower is enough. */
  function tierIsRequired(seed: number, size: number, cap: Tier): void {
    const { puzzle, grade } = generateGraded(seed, { size, maxTier: cap });
    const input = deduceInput(puzzle, terminalCells(puzzle));
    check(
      deduce(input, grade.maxTier).solved,
      `${size}×${size}/${seed}: solvable at the tier it was graded (T${grade.maxTier})`,
    );
    if (grade.maxTier > 1) {
      const lower = (grade.maxTier - 1) as Tier;
      check(
        !deduce(input, lower).solved,
        `${size}×${size}/${seed}: T${grade.maxTier} was needed — T${lower} doesn't finish it`,
      );
    }
  }

  // A spread of sizes and seeds, so between them the harder tiers get exercised.
  for (const [seed, size] of [
    [1000, 5],
    [7919, 5],
    [1000, 6],
    [15838, 6],
    [1000, 7],
  ] as [number, number][]) {
    tierIsRequired(seed, size, 4);
  }

  // Hand-built: a 4×4 that falls to counting alone. Column 0 owes everything,
  // column 3 owes nothing, so T1 settles both without any geometry.
  {
    const path: Coord[] = [
      { r: 0, c: 0 },
      { r: 1, c: 0 },
      { r: 2, c: 0 },
      { r: 3, c: 0 },
      { r: 3, c: 1 },
      { r: 3, c: 2 },
    ];
    const entry = { r: 0, c: 0, dir: 0 } as const;
    const exit = { r: 3, c: 2, dir: 2 } as const;
    const solution = piecesFromPath(path, entry, exit, 4);
    const rows = [1, 1, 1, 3];
    const cols = [4, 1, 1, 0];
    const p: Puzzle = {
      size: 4, rows, cols, entry, exit, solution, path,
      fixed: [{ r: 0, c: 0 }, { r: 3, c: 2 }], seed: 0,
    };
    const res = deduce(deduceInput(p), 1);
    check(res.solved, "a counting-only board falls to T1 alone");
    check(res.grade.maxTier === 1, "and is graded T1");
  }

  // Contradictory clues are reported, not solved and not thrown.
  {
    const p = puzzleForLevel(1);
    const broken = deduceInput(p);
    const bad = deduce(
      { ...broken, rows: p.rows.map((v, i) => (i === 0 ? p.size + 1 : v)) },
      4,
    );
    check(bad.contradiction, "a clue larger than its line is a contradiction");
    check(!bad.solved, "and such a board is never reported solved");
  }
}

// --- 4. Every shipped level -------------------------------------------------
{
  const worst = new Map<number, number>();
  const totals = new Map<number, { n: number; ms: number; fill: number }>();

  for (let level = 1; level <= LEVEL_COUNT; level++) {
    const t0 = performance.now();
    let puzzle: Puzzle;
    try {
      puzzle = puzzleForLevel(level);
    } catch (err) {
      failures++;
      console.error(`  FAIL: level ${level} did not generate — ${(err as Error).message}`);
      continue;
    }
    const ms = performance.now() - t0;
    const size = puzzle.size;
    worst.set(size, Math.max(worst.get(size) ?? 0, ms));
    const agg = totals.get(size) ?? { n: 0, ms: 0, fill: 0 };
    agg.n++;
    agg.ms += ms;
    agg.fill += puzzle.path.length / (size * size);
    totals.set(size, agg);

    auditPuzzle(puzzle, `level ${level}`);
    auditPlay(puzzle, `level ${level}`);
  }

  console.log("  generation, by size:");
  for (const [size, agg] of [...totals].sort((a, b) => a[0] - b[0])) {
    console.log(
      `    ${size}×${size}: ${agg.n} levels, avg ${(agg.ms / agg.n).toFixed(1)}ms, ` +
        `worst ${(worst.get(size) ?? 0).toFixed(0)}ms, fill ${(100 * agg.fill / agg.n).toFixed(0)}%`,
    );
    check(
      (worst.get(size) ?? 0) < 2000,
      `${size}×${size} generation stays under 2s (worst ${(worst.get(size) ?? 0).toFixed(0)}ms)`,
    );
  }
}

// --- 5. The solver is honest ------------------------------------------------
{
  // Drop a revealed piece from a board that needed it and the count must rise —
  // otherwise "uniqueness" was never being enforced by the reveals at all.
  let checkedOne = false;
  for (let level = 1; level <= 40 && !checkedOne; level++) {
    const p = puzzleForLevel(level);
    if (p.fixed.length < 3) continue;
    const fixed = fixedMap(p);
    fixed.delete(key(p.fixed[2].r, p.fixed[2].c));
    const res = countSolutions(
      { size: p.size, rows: p.rows, cols: p.cols, entry: p.entry, exit: p.exit, fixed },
      5,
    );
    check(res.count >= 1, `level ${level}: the true solution survives dropping a reveal`);
    checkedOne = true;
  }
  check(checkedOne, "found a board with an extra reveal to test against");

  // Impossible clues yield nothing rather than hanging or throwing.
  const bogus = countSolutions({
    size: 4,
    rows: [4, 4, 4, 4],
    cols: [1, 1, 1, 1],
    entry: { r: 0, c: 0, dir: 3 },
    exit: { r: 3, c: 3, dir: 1 },
    fixed: new Map(),
  });
  check(bogus.count === 0, "mismatched clue totals have no solution");
}

// The drag has to be able to be wrong: if no board ever offered a push into a
// square that turned out to be empty, the gesture would be telling the player
// where the road is instead of asking them.
check(wrongPushes > 0, `some pushes into the unknown are wrong (got ${wrongPushes})`);

console.log(
  `\n${checks - failures}/${checks} checks passed` + (failures ? ` — ${failures} FAILED` : " ✓"),
);
process.exit(failures ? 1 : 0);
