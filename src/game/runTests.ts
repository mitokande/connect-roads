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
  isRoadCell,
  isUnknown,
  lineOverCrossed,
  lineSettled,
  MARK_BLOCKED,
  MARK_NONE,
  MARK_ROAD,
  markAt,
  paveStep,
  routePieces,
  rowFound,
  shownPiece,
  stubDir,
  roadTotal,
  replayRoute,
  withMark,
  type Marks,
} from "./board";
import { decodePuzzle, encodePuzzle } from "./codec";
import {
  deduce,
  deduceInput,
  ladderScore,
  nextSteps,
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
  solverInput,
  MAX_EXTRA_REVEALS,
  mulberry32,
  piecesFromPath,
  touchesEveryLine,
} from "./generator";
import { LEVEL_BANK } from "./levelData";
import {
  bandFor,
  bandIndex,
  GRACE_LEVELS,
  HARD_TIER_FROM,
  LEVEL_COUNT,
  levelSeed,
  puzzleForLevel,
  sizeForLevel,
  tierCapForLevel,
} from "./levels";
import {
  bankIndex,
  currentStreak,
  DAILY_EPOCH,
  DAILY_WEEKS,
  dailyId,
  dailyPuzzle,
  dayOf,
  isDaily,
  NO_DAILY,
  recordDaily,
  tierNeeded,
  today,
  WEEK,
  WEEKDAYS,
  weekday,
} from "./daily";
import { DAILY_BANK } from "./dailyData";
import { FLEETS, fleetById, isUnlocked, newlyUnlocked, totalStars } from "./garage";
import { deductionTip, routeTip } from "./hint";
import { restoreBoard, saveBoard, worthKeeping, type SavedBoard } from "./save";
import { countSolutions } from "./solver";
import {
  LESSONS,
  lessonPuzzle,
  TECHNIQUES,
  techniqueDue,
  techniqueFor,
  type Lesson,
  type Technique,
} from "./tutorial";
import {
  DC,
  DIRS,
  DR,
  EMPTY,
  dirsOf,
  hasDir,
  isFogged,
  isScenery,
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

  // The referee, re-run from the clues alone — as the player is given them, fog
  // and scenery included.
  const res = countSolutions(solverInput(p));
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

  // Only a mark of the player's — or something the board printed — makes a
  // square known. A settled row or column proves its leftovers empty, but the
  // board keeps that to itself: it must not quietly exempt those squares from the
  // road's push, or "refused" would mean "empty" and the drag would be a free
  // probe. Scenery is the one printed empty, and it is no probe: everyone can see
  // it. Otherwise unmarked is unknown, full stop.
  for (let r = 0; r < p.size; r++) {
    for (let c = 0; c < p.size; c++) {
      const settled = rowFound(p, marks, r) >= p.rows[r] || colFound(p, marks, c) >= p.cols[c];
      const printed = isScenery(p, r, c);
      check(
        isUnknown(p, marks, r, c) === (markAt(marks, p.size, r, c) === MARK_NONE && !printed),
        `${label}: ${r},${c} is unknown exactly while nothing — player or print — has said what it is`,
      );
      if (p.solution[r][c] === EMPTY && settled && !printed) {
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
      lineOverCrossed(p, crossed, r, false) === (!isFogged(p, false, r) && stillFree < p.rows[r]),
      `${label}: row ${r} flags exactly when its clue became unreachable (and never under fog)`,
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

    // A road drawn again from nothing — how a stored one is brought back — comes
    // out exactly as drawn, and is cut at the first square the marks don't back.
    const again = replayRoute(p, early, road);
    check(
      again.length === road.length && again.every((c, i) => same(c, road[i])),
      `${label}: a legal road replays as drawn`,
    );
    if (road.length > 1) {
      const end = road[road.length - 1];
      check(
        replayRoute(p, withMark(early, p.size, end.r, end.c, MARK_NONE), road).length ===
          road.length - 1,
        `${label}: a replay stops short of an unclaimed end`,
      );
      check(
        replayRoute(p, early, [...road, end]).length === road.length,
        `${label}: a square listed twice ends the replay`,
      );
    }
    if (road.length > 2) {
      const mid = road[1];
      check(
        replayRoute(p, withMark(early, p.size, mid.r, mid.c, MARK_NONE), road).length === 1,
        `${label}: an unclaimed square mid-road drops everything past it`,
      );
      check(
        replayRoute(p, early, [road[0], road[2]]).length === 1,
        `${label}: a replay refuses a jump`,
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

  // The road's hint knows what comes next, stops at the end, and winds a wrong
  // turn back to where it went wrong.
  const first = routeTip(p, []);
  check(
    first?.route.length === 1 && same(first.route[0], p.path[0]),
    `${label}: the road's first hint is the start line`,
  );
  const upto = routeTip(p, p.path.slice(0, 2));
  check(
    upto?.route.length === 3 && same(upto.route[2], p.path[2]) && same(upto.tip.point[0], p.path[2]),
    `${label}: the road's hint lays and points at the next solution cell`,
  );
  check(routeTip(p, p.path) === null, `${label}: a finished road has no hint`);
  if (p.path.length > 4) {
    const turned = [...p.path.slice(0, 3), p.path[4]];
    const back = routeTip(p, turned);
    check(
      back !== null && back.route.length === 4 && same(back.route[3], p.path[3]) && /wrong/i.test(back.tip.say),
      `${label}: a wrong turn is wound back and set right`,
    );
  }
}

/**
 * The hints, played by a player who does nothing but follow them. Every square a
 * hint claims must be road and every square it rules out must be empty — a hint
 * that lied would be the game cheating the player it is meant to help — and
 * following them alone must finish the board, every time.
 */
function auditHints(p: Puzzle, label: string): number {
  let marks = initialMarks(p);
  let worst = 0;
  let given = 0;
  let honest = true;
  let moving = true;
  let explained = true;
  while (!deductionComplete(p, marks) && given <= p.size * p.size) {
    const t0 = performance.now();
    const tip = deductionTip(p, marks, []);
    worst = Math.max(worst, performance.now() - t0);
    if (!tip) break;
    given++;
    if (!tip.say || !tip.point.length) explained = false;
    const before = marks;
    for (const { r, c } of tip.claim) {
      if (!isRoadCell(p, r, c)) honest = false;
      marks = withMark(marks, p.size, r, c, MARK_ROAD);
    }
    // A hint that claims nothing is pointing at empty squares for the player to
    // rule out themselves — the board never crosses anything out for them.
    if (!tip.claim.length) {
      for (const { r, c } of tip.point) {
        if (isRoadCell(p, r, c)) honest = false;
        marks = withMark(marks, p.size, r, c, MARK_BLOCKED);
      }
    }
    if (marks.every((m, i) => m === before[i])) {
      moving = false;
      break;
    }
  }
  check(honest, `${label}: every hint tells the truth`);
  check(explained, `${label}: every hint says why, and points at what`);
  check(moving, `${label}: every hint moves the board on`);
  check(deductionComplete(p, marks), `${label}: following the hints alone finishes the board`);

  // Mistakes come first: a road square crossed out is the hint's first business.
  const road = p.path.find((c) => shownPiece(p, c.r, c.c) === null);
  if (road) {
    const slipped = withMark(initialMarks(p), p.size, road.r, road.c, MARK_BLOCKED);
    const tip = deductionTip(p, slipped, []);
    check(
      tip !== null && tip.claim.length === 1 && same(tip.claim[0], road),
      `${label}: a road square crossed out is the first thing a hint fixes`,
    );
  }

  // A green line is read as swept: nobody pays a hint to be told what the green
  // sign already says.
  const row = p.path[0].r;
  let green = initialMarks(p);
  for (const { r, c } of p.path) if (r === row) green = withMark(green, p.size, r, c, MARK_ROAD);
  const tip = deductionTip(p, green, []);
  check(
    tip !== null &&
      !tip.point.some((c) => c.r === row && markAt(green, p.size, c.r, c.c) !== MARK_ROAD),
    `${label}: a hint never points at a green line's leftovers`,
  );
  return worst;
}

/**
 * A board left half-played comes back exactly as it was left — hearts included,
 * or leaving would be a refill — and a save that doesn't hold up comes back as
 * nothing at all rather than as a board the rules never produced.
 */
function auditSave(p: Puzzle, other: Puzzle, label: string) {
  const MAX = 3;
  const put = (s: string, i: number, m: number) => s.slice(0, i) + String(m) + s.slice(i + 1);

  check(
    !worthKeeping({ puzzle: p, marks: initialMarks(p), route: [], hearts: MAX, hintsUsed: 0 }, MAX),
    `${label}: an untouched board is not worth saving`,
  );

  // Mid-board: half the road claimed and drawn as far as the claims allow, an
  // empty square crossed out, a road square wrongly crossed out (crosses are the
  // player's, mistakes and all), a heart gone and a hint spent.
  let marks = initialMarks(p);
  const half = Math.floor(p.path.length / 2);
  for (const { r, c } of p.path.slice(0, half)) marks = withMark(marks, p.size, r, c, MARK_ROAD);
  let empty: Coord | null = null;
  for (let i = 0; i < p.size * p.size && !empty; i++) {
    if (!isRoadCell(p, Math.floor(i / p.size), i % p.size)) empty = { r: Math.floor(i / p.size), c: i % p.size };
  }
  if (!empty) {
    check(false, `${label}: sanity — the board has an empty square`);
    return;
  }
  marks = withMark(marks, p.size, empty.r, empty.c, MARK_BLOCKED);
  const miss = p.path.slice(half).find((c) => markAt(marks, p.size, c.r, c.c) === MARK_NONE);
  if (miss) marks = withMark(marks, p.size, miss.r, miss.c, MARK_BLOCKED);
  let route: Coord[] = [];
  for (const cell of p.path) {
    const next = connectStep(p, marks, route, cell);
    if (!next) break;
    route = next;
  }
  const board = { puzzle: p, marks, route, hearts: MAX - 1, hintsUsed: 1 };
  check(worthKeeping(board, MAX), `${label}: a half-played board is worth saving`);

  // Through JSON, as AsyncStorage will carry it.
  const stored = JSON.parse(JSON.stringify(saveBoard(board))) as SavedBoard;
  const back = restoreBoard(p, stored, MAX);
  check(back !== null, `${label}: a saved board restores`);
  if (back) {
    check(back.marks.every((m, i) => m === marks[i]), `${label}: every mark comes back as left`);
    check(
      back.route.length === route.length && back.route.every((c, i) => same(c, route[i])),
      `${label}: the road comes back as drawn`,
    );
    check(back.hearts === MAX - 1, `${label}: the hearts come back as left — leaving is no refill`);
    check(back.hintsUsed === 1, `${label}: the hints spent come back`);
  }

  check(restoreBoard(other, stored, MAX) === null, `${label}: a save for another board is refused`);
  const at = empty.r * p.size + empty.c;
  check(
    restoreBoard(p, { ...stored, marks: put(stored.marks, at, MARK_ROAD) }, MAX) === null,
    `${label}: a save claiming an empty square is refused — a ✓ is always true`,
  );
  check(restoreBoard(p, { ...stored, hearts: 0 }, MAX) === null, `${label}: a save with no hearts is refused`);
  check(
    restoreBoard(p, { ...stored, hearts: MAX + 1 }, MAX) === null,
    `${label}: a save with extra hearts is refused`,
  );
  check(
    restoreBoard(p, { ...stored, marks: stored.marks.slice(1) }, MAX) === null,
    `${label}: a save of the wrong size is refused`,
  );

  // A printed piece is claimed whatever the save says about it.
  const f = p.fixed[p.fixed.length - 1];
  const unprinted = restoreBoard(p, { ...stored, marks: put(stored.marks, f.r * p.size + f.c, MARK_NONE) }, MAX);
  check(
    unprinted !== null && markAt(unprinted.marks, p.size, f.r, f.c) === MARK_ROAD,
    `${label}: a printed piece comes back claimed`,
  );

  // The road is drawn again through the rules, not copied: a jump tacked on the
  // end is dropped.
  if (route.length > 0) {
    const head = route[route.length - 1];
    const far = { r: head.r, c: (head.c + 2) % p.size };
    const jumped = restoreBoard(p, { ...stored, route: [...stored.route, far.r * p.size + far.c] }, MAX);
    check(jumped?.route.length === route.length, `${label}: a stored road can't jump`);
  }

  // A whole road is a won board, which is never saved; one arriving anyway comes
  // back a step short, so the win is still the player's to land.
  let all = initialMarks(p);
  for (const { r, c } of p.path) all = withMark(all, p.size, r, c, MARK_ROAD);
  const finished = restoreBoard(
    p,
    saveBoard({ puzzle: p, marks: all, route: p.path, hearts: MAX, hintsUsed: 0 }),
    MAX,
  );
  check(
    finished !== null && finished.route.length === p.path.length - 1,
    `${label}: a finished road comes back one step short of the flag`,
  );
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

    const band = bandFor(level).first;
    if (!ramp.has(band)) ramp.set(band, []);
    ramp.get(band)!.push(ladderScore(bare.grade, played.grade));
  }

  // Each band is a ramp, not a bag: difficulty rises through it. This is the
  // fault that made levels 76 and 120 statistically the same 8×8 board — the seed
  // was a hash of the level number and nothing ever graded the result.
  for (const [first, scores] of [...ramp].sort((a, b) => a[0] - b[0])) {
    const name = `the ${bandFor(first).region} band`;
    let dip = -1;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] < scores[i - 1] && dip < 0) dip = i;
    }
    check(
      dip < 0,
      `${name} is ordered easiest-first` +
        (dip < 0 ? "" : ` (dips at slot ${dip}: ${scores[dip - 1]} → ${scores[dip]})`),
    );
    check(
      scores[scores.length - 1] > scores[0],
      `${name} actually gets harder (${scores[0]} → ${scores[scores.length - 1]})`,
    );
  }

  // The mountains carry exactly their twists, and the classic ladder none.
  for (let level = 1; level <= LEVEL_COUNT; level++) {
    const p = puzzleForLevel(level);
    const band = bandFor(level);
    const scenery = p.scenery ?? [];
    check(scenery.length === (band.scenery ?? 0), `level ${level}: has its band's ${band.scenery ?? 0} scenery squares`);
    check(
      scenery.every((s) => p.solution[s.r][s.c] === EMPTY),
      `level ${level}: scenery only ever stands where there is no road`,
    );
    check(
      new Set(scenery.map((s) => key(s.r, s.c))).size === scenery.length,
      `level ${level}: no square is scenery twice`,
    );
    const fog = p.fog?.index ?? [];
    check(fog.length === (band.fog ?? 0), `level ${level}: has its band's ${band.fog ?? 0} fogged lines`);
    // One fogged line alone would be no secret: the other axis sums to the
    // road's length, so it would be that sum less the visible ones.
    check(fog.length === 0 || fog.length >= 2, `level ${level}: fog hides two lines or none`);
    if (p.fog) {
      const column = p.fog.axis === "col";
      let silent = true;
      let all = initialMarks(p);
      for (const { r, c } of p.path) all = withMark(all, p.size, r, c, MARK_ROAD);
      // Every road square crossed out: each visible line would turn red.
      let none = initialMarks(p);
      for (const { r, c } of p.path) none = withMark(none, p.size, r, c, MARK_BLOCKED);
      for (const i of p.fog.index) {
        if (lineSettled(p, all, i, column) || lineOverCrossed(p, none, i, column)) silent = false;
      }
      check(silent, `level ${level}: a fogged sign never turns green or red — either would give its count away`);
    }
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
  /** The last board built — the "other board" a save must refuse to open on. */
  let prev: Puzzle = lessonPuzzle(LESSONS[0]);
  let hintWorst = 0;

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
    auditSave(puzzle, prev, `level ${level}`);
    hintWorst = Math.max(hintWorst, auditHints(puzzle, `level ${level}`));
    prev = puzzle;
  }
  // A hint is a button press; it has to answer at once, on a phone, on the
  // hardest board there is. Measured here in Node, with a wide margin for that.
  check(hintWorst < 100, `a hint answers at once (worst ${hintWorst.toFixed(1)}ms)`);
  console.log(`  hints: worst ${hintWorst.toFixed(1)}ms`);

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
    const input = solverInput(p);
    input.fixed.delete(key(p.fixed[2].r, p.fixed[2].c));
    const res = countSolutions(input, 5);
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

// --- 6. The tutorial teaches the truth --------------------------------------
// Every lesson is played start to finish through the same rules the game uses,
// by exactly the moves its script asks for. A lesson that points at an empty
// square and says "double tap" would teach a rule the game doesn't have.
{
  let lessonChecks = 0;
  const courses: { name: string; lessons: Lesson[]; technique?: Technique }[] = [
    { name: "lesson", lessons: LESSONS },
    ...TECHNIQUES.map((t) => ({ name: t.id, lessons: t.lessons, technique: t })),
  ];
  for (const course of courses) course.lessons.forEach((lesson, li) => {
    const p = lessonPuzzle(lesson);
    const name = `${course.name} ${li + 1}`;
    check(touchesEveryLine(p.rows, p.cols), `${name}: no clue is 0`);
    const solved = countSolutions(solverInput(p));
    check(solved.count === 1, `${name}: has exactly one route`);
    if (!course.technique) {
      check(deduce(deduceInput(p, terminalCells(p)), 2).solved, `${name}: falls to counting alone`);
    }

    let marks = initialMarks(p);
    if (lesson.claimed) for (const { r, c } of p.path) marks = withMark(marks, p.size, r, c, MARK_ROAD);
    if (lesson.marks) {
      // A board opened part-way through opens on the truth: every ✓ on it is
      // road, every ✕ is empty, and the printed pieces are claimed.
      check(lesson.marks.length === p.size * p.size, `${name}: its opening marks cover the board`);
      marks = Uint8Array.from(lesson.marks, Number);
      let truthful = true;
      for (let i = 0; i < marks.length; i++) {
        const road = isRoadCell(p, Math.floor(i / p.size), i % p.size);
        if ((marks[i] === MARK_ROAD && !road) || (marks[i] === MARK_BLOCKED && road)) truthful = false;
        if (marks[i] > MARK_BLOCKED) truthful = false;
      }
      check(truthful, `${name}: opens on marks that are all true`);
      check(p.fixed.every((f) => markAt(marks, p.size, f.r, f.c) === MARK_ROAD), `${name}: its printed pieces start claimed`);
    }
    if (course.technique) teaches(course.technique, lesson, p, marks, name);
    for (const step of lesson.steps) {
      const g = step.gesture;
      if (g?.kind === "square") {
        check(
          g.cell.r >= 0 && g.cell.c >= 0 && g.cell.r < p.size && g.cell.c < p.size,
          `${name}: points at a real square`,
        );
      }
      if (g?.kind === "point") {
        const clue = g.axis === "col" ? p.cols[g.index] : p.rows[g.index];
        check(clue > 0 && g.index < p.size, `${name}: points at a real clue`);
        if (/green/i.test(step.say)) {
          const found = g.axis === "col" ? colFound(p, marks, g.index) : rowFound(p, marks, g.index);
          check(found >= clue, `${name}: the clue called green is settled`);
        }
      }
      const goal = step.goal;
      if (goal.kind === "claim") {
        for (const c of goal.cells) {
          check(isRoadCell(p, c.r, c.c), `${name}: asks to claim (${c.r},${c.c}), which is road`);
          marks = withMark(marks, p.size, c.r, c.c, MARK_ROAD);
        }
      } else if (goal.kind === "cross") {
        for (const c of goal.cells) {
          check(!isRoadCell(p, c.r, c.c), `${name}: asks to cross out (${c.r},${c.c}), which is empty`);
          marks = withMark(marks, p.size, c.r, c.c, MARK_BLOCKED);
        }
      } else if (goal.kind === "solve") {
        check(!deductionComplete(p, marks), `${name}: leaves something to find on your turn`);
        for (const { r, c } of p.path) marks = withMark(marks, p.size, r, c, MARK_ROAD);
      } else if (goal.kind === "drive") {
        // Laid the way the hand shows it: from the start, square by square, each
        // step a legal move or a push that claims a true road square.
        let route: Coord[] = [];
        const first = connectStep(p, marks, route, p.path[0]);
        check(first !== null, `${name}: the road starts at the start line`);
        route = first ?? [];
        for (const target of p.path.slice(1)) {
          const step2 = paveStep(p, marks, route, target);
          if (step2?.kind === "claim") {
            check(isRoadCell(p, step2.cell.r, step2.cell.c), `${name}: a push claims only road`);
            marks = withMark(marks, p.size, step2.cell.r, step2.cell.c, MARK_ROAD);
            const again = paveStep(p, marks, route, target);
            route = again?.kind === "move" ? again.route : route;
          } else if (step2?.kind === "move") {
            route = step2.route;
          }
        }
        check(connectComplete(p, route), `${name}: the dragged road reaches the flag`);
      }
      lessonChecks++;
    }
    check(deductionComplete(p, marks), `${name}: ends with every road square found`);
  });
  check(lessonChecks > 0, "the tutorial has steps");

  // Each trick arrives just before the first board that can't be done without
  // it — not one level late (the player met the wall untaught) and not early
  // (taught a rule nothing asks for yet). Rebuild the bank and this says where
  // the lessons have to move to.
  for (const t of TECHNIQUES) {
    let first = 0;
    for (let level = 1; level <= LEVEL_COUNT && !first; level++) {
      const p = puzzleForLevel(level);
      // A rule is needed where the tier below it no longer finishes a board; a
      // twist where a board first carries it.
      const needs =
        t.kind === "rule"
          ? !deduce(deduceInput(p), (t.tier - 1) as Tier).solved
          : t.id === "scenery"
            ? (p.scenery?.length ?? 0) > 0
            : (p.fog?.index.length ?? 0) > 0;
      if (needs) first = level;
    }
    check(
      first === t.firstLevel,
      `"${t.name}" is shown before level ${t.firstLevel}, the first board that needs it (found ${first})`,
    );
  }
  check(
    TECHNIQUES.every((t, i) => i === 0 || TECHNIQUES[i - 1].firstLevel < t.firstLevel),
    "the tricks are listed in the order the ladder needs them",
  );
  check(techniqueDue(1, []) === null, "level 1 needs no trick");
  check(techniqueDue(2, [])?.id === "exits", "level 2 is preceded by two-ways-out");
  check(techniqueDue(19, ["exits"]) === null, "nothing new is owed before level 20");
  check(techniqueDue(60, [])?.id === "exits", "a player owed several tricks meets the first first");
  check(
    techniqueDue(LEVEL_COUNT, TECHNIQUES.map((t) => t.id)) === null,
    "a player who has seen every trick is shown none again",
  );
}

/**
 * Everything a technique's lesson may and may not rely on, read with the engine
 * the ladder is graded by. The lesson has to need *its* rule: open with nothing
 * easier left to do; ask the player for exactly the squares that rule proves;
 * and leave a rest the player can finish on their own with no more than the
 * basics and two-ways-out — the new rule is the lesson, not the homework.
 */
function teaches(t: Technique, lesson: Lesson, p: Puzzle, marks: Marks, name: string) {
  const n = p.size;
  const input = deduceInput(p);
  const known = new Int8Array(n * n).fill(UNKNOWN);
  for (let i = 0; i < n * n; i++) {
    if (marks[i] === MARK_ROAD) known[i] = ROAD;
    else if (marks[i] === MARK_BLOCKED || isScenery(p, Math.floor(i / n), i % n)) known[i] = NO_ROAD;
  }
  if (t.kind === "twist") {
    // A twist's lesson is about the board, not a rule: it has to carry its twist.
    const carries = t.id === "scenery" ? (p.scenery?.length ?? 0) > 0 : (p.fog?.index.length ?? 0) >= 2;
    check(carries, `${name}: its board carries "${t.name}"`);
  } else {
    check(
      nextSteps(input, known, (t.tier - 1) as Tier).length === 0,
      `${name}: opens with nothing easier than "${t.name}" left to do`,
    );
  }
  const proved = nextSteps(input, known, t.tier);
  // A rule's lesson has to need exactly that rule; a twist's asks for nothing past
  // it, since the twist is the lesson rather than the reasoning.
  check(
    proved.length > 0 && proved.every((s) => (t.kind === "rule" ? s.tier === t.tier : s.tier <= t.tier)),
    `${name}: "${t.name}" is the move the board needs`,
  );
  const road = new Set(proved.flatMap((s) => s.road.map((c) => c.r * n + c.c)));
  const empty = new Set(proved.flatMap((s) => s.empty.map((c) => c.r * n + c.c)));

  let asked = 0;
  for (const step of lesson.steps) {
    const goal = step.goal;
    if (goal.kind === "solve" || goal.kind === "drive") break;
    if (goal.kind === "claim") {
      for (const c of goal.cells) {
        check(road.has(c.r * n + c.c), `${name}: the square it asks to claim is one "${t.name}" proves`);
        known[c.r * n + c.c] = ROAD;
        asked++;
      }
    } else if (goal.kind === "cross") {
      for (const c of goal.cells) {
        check(empty.has(c.r * n + c.c), `${name}: the square it asks to rule out is one "${t.name}" proves`);
        known[c.r * n + c.c] = NO_ROAD;
        asked++;
      }
    }
  }
  check(asked > 0, `${name}: asks the player to use "${t.name}"`);

  for (let round = 0; round < n * n; round++) {
    const steps = nextSteps(input, known, 2);
    if (!steps.length) break;
    for (const st of steps) {
      for (const c of st.road) known[c.r * n + c.c] = ROAD;
      for (const c of st.empty) known[c.r * n + c.c] = NO_ROAD;
    }
  }
  check(!known.includes(UNKNOWN), `${name}: the player's own turn needs nothing past two-ways-out`);
}

// --- 7. The daily road ------------------------------------------------------
// One board a day for everyone, the week as its difficulty curve, and a streak.
// Every baked day is held to what a shipped level is held to — single-shaped,
// and deducible from its clues alone — within its weekday's cap.
{
  const t0 = performance.now();
  check(DAILY_BANK.length === DAILY_WEEKS * 7, `the daily bank is ${DAILY_WEEKS} whole weeks`);
  check(weekday(0) === 3, "1970-01-01 was a Thursday");
  check(weekday(20721) === 4, "2026-09-25 was a Friday");
  check(weekday(DAILY_EPOCH) === 0, "the daily bank starts on a Monday");
  let aligned = true;
  for (let d = DAILY_EPOCH - 800; d < DAILY_EPOCH + 1600; d += 11) {
    if (bankIndex(d) % 7 !== weekday(d) || bankIndex(d) < 0 || bankIndex(d) >= DAILY_BANK.length) aligned = false;
  }
  check(aligned, "every day, before the bank and after it wraps, gets its own weekday's board");

  // The player's own midnight turns the board over, not a server's.
  check(today(new Date(2026, 8, 25, 23, 59)) === 20721, "a minute to midnight is still that day");
  check(today(new Date(2026, 8, 26, 0, 1)) === 20722, "a minute past midnight is the next");

  check(!isDaily(LEVEL_COUNT) && !isDaily(1000 + 50), "no ladder level or lesson id is a daily");
  check(isDaily(dailyId(20721)) && dayOf(dailyId(20721)) === 20721, "a daily's id carries its day");
  check(
    dailyPuzzle(DAILY_EPOCH + 7 * DAILY_WEEKS).path.length === dailyPuzzle(DAILY_EPOCH).path.length &&
      encodePuzzle(dailyPuzzle(DAILY_EPOCH + 7 * DAILY_WEEKS)) === DAILY_BANK[0],
    "the bank wraps back to its first board",
  );

  const tiers: number[][] = WEEK.map(() => []);
  DAILY_BANK.forEach((code, i) => {
    const recipe = WEEK[i % 7];
    const label = `daily ${i} (${WEEKDAYS[i % 7].slice(0, 3)})`;
    const p = decodePuzzle(code, 1);
    check(encodePuzzle(p) === code, `${label}: round-trips through the codec`);
    check(p.size === recipe.size, `${label}: is its weekday's size`);
    auditPuzzle(p, label);
    const gate = deduce(deduceInput(p, terminalCells(p)), recipe.tier);
    check(gate.solved, `${label}: deducible from its clues within its weekday's cap (T${recipe.tier})`);
    let sound = true;
    for (let k = 0; k < gate.state.length; k++) {
      const road = p.solution[Math.floor(k / p.size)][k % p.size] !== EMPTY;
      if ((gate.state[k] === ROAD) !== road) sound = false;
    }
    check(sound, `${label}: its deduction agrees with its solution`);
    tiers[i % 7].push(tierNeeded(p));
  });
  // The week climbs: more of the later days need "try each way" than the early
  // ones, and the first two never do.
  const hard = tiers.map((ts) => ts.filter((t) => t >= 4).length);
  check(hard[0] === 0 && hard[1] === 0, "Monday and Tuesday never need more than the basics");
  check(hard[6] >= hard[2], "Sunday is at least as hard as Wednesday");

  // The streak.
  let r = recordDaily(NO_DAILY, 100, 3);
  check(r.streak === 1 && r.last === 100 && r.best === 1, "a first road starts a streak of one");
  r = recordDaily(r, 101, 2);
  check(r.streak === 2 && r.best === 2, "the next day's road extends it");
  r = recordDaily(r, 101, 3);
  check(r.streak === 2 && r.stars[101] === 3, "building the same day again changes only its stars");
  check(currentStreak(r, 101) === 2 && currentStreak(r, 102) === 2, "the streak survives until today is over");
  check(currentStreak(r, 103) === 0, "a whole day missed ends it");
  r = recordDaily(r, 103, 1);
  check(r.streak === 1 && r.best === 2, "a gap restarts the streak at one, and the best stands");
  r = recordDaily(r, 102, 3);
  check(r.streak === 1 && r.last === 103 && r.stars[102] === 3, "an older day finished late can't rewind the streak");

  // A daily teaches the tricks its own board needs, whatever the ladder has reached.
  check(techniqueFor(1, []) === null, "a board that falls to counting needs no trick");
  check(
    techniqueFor(5, TECHNIQUES.filter((t) => t.kind === "rule").map((t) => t.id)) === null,
    "a daily never brings a twist's lesson — no daily carries one",
  );
  check(techniqueFor(2, [])?.id === "exits", "a two-ways-out daily brings its lesson");
  check(techniqueFor(4, ["exits"])?.id === "overlap", "a try-each-way daily brings its lesson");
  check(techniqueFor(4, ["exits", "overlap"]) === null, "a daily needs no trick once they're learned");
  console.log(`  daily: ${DAILY_BANK.length} boards audited in ${(performance.now() - t0).toFixed(0)}ms`);
}

// --- 8. The garage ---------------------------------------------------------------
// Stars open paint jobs, and nothing else: the first is free, each costs more
// than the last, and the last is reachable on the ladder — but not by accident.
{
  check(FLEETS[0].stars === 0, "the first paint job is everyone's");
  check(new Set(FLEETS.map((f) => f.id)).size === FLEETS.length, "every paint job has its own id");
  check(
    FLEETS.every((f, i) => i === 0 || FLEETS[i - 1].stars < f.stars),
    "each paint job costs more stars than the one before",
  );
  const most = FLEETS[FLEETS.length - 1].stars;
  check(most <= LEVEL_COUNT * 3, `the last paint job is reachable (${most} of ${LEVEL_COUNT * 3} stars)`);
  check(most > LEVEL_COUNT * 2, "the last paint job asks for mostly clean wins");
  const hex = /^#[0-9A-F]{6}$/i;
  check(
    FLEETS.every((f) => f.paints.length === 5 && f.paints.every((p) => hex.test(p.body) && hex.test(p.edge) && hex.test(p.roof))),
    "every fleet paints all five cars",
  );
  check(fleetById("no-such-fleet").id === "classic", "an unknown paint job falls back to the first");
  check(isUnlocked(FLEETS[1], FLEETS[1].stars) && !isUnlocked(FLEETS[1], FLEETS[1].stars - 1), "a threshold opens exactly at its count");
  check(newlyUnlocked(FLEETS[1].stars - 1, FLEETS[1].stars)?.id === FLEETS[1].id, "crossing a threshold announces its fleet");
  check(newlyUnlocked(FLEETS[1].stars, FLEETS[1].stars + 1) === null, "a win that crosses nothing announces nothing");
  check(newlyUnlocked(0, LEVEL_COUNT * 3)?.id === FLEETS[FLEETS.length - 1].id, "crossing several announces the biggest");
  check(totalStars({ 1: 3, 2: 2, 7: 1 }) === 6, "stars are summed across the ladder");
}

// The drag has to be able to be wrong: if no board ever offered a push into a
// square that turned out to be empty, the gesture would be telling the player
// where the road is instead of asking them.
check(wrongPushes > 0, `some pushes into the unknown are wrong (got ${wrongPushes})`);

console.log(
  `\n${checks - failures}/${checks} checks passed` + (failures ? ` — ${failures} FAILED` : " ✓"),
);
process.exit(failures ? 1 : 0);
