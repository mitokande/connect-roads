// All game state: the board being played (a reducer) and the progress that
// outlives it (AsyncStorage).
//
// The rules themselves live in `src/game/board.ts`; this module owns *when* they
// are consulted and what it costs to be wrong. Two decisions are load-bearing:
//
// **A claim is checked, a cross is not.** Double-tapping a cell that has no
// road is refused and costs a heart, so a ✓ on the board is always true and the
// road can trust the claimed set completely. Crossing out is free and
// unchecked — it is note-taking, and charging for notes would make sweeping a
// settled row (the game's most common deduction, and the one the tutorial
// teaches) feel like a gamble.
//
// There are two ways to claim and they cost the same: the double tap, and
// dragging the road into a square nothing is known about. `refuse` is shared
// between them so that can't drift — a claim that is cheaper by one route would
// make that route the only one worth using.
//
// **Losing the last heart doesn't wipe the board, and doesn't give the answer
// away either.** `failed` locks input and leaves the grid exactly as the player
// built it — every claim, every cross, still there to look at. It used to draw
// the solution dimmed underneath as well, and that was the puzzle handing over
// the one thing it exists to withhold: a loss became a free look at the answer,
// so the cheapest way past a hard board was to spend three hearts on purpose,
// read the route off the grid, and hit *Try again*. Nothing else in the game
// ever shows a square the player hasn't earned — a refused claim reports only
// that one square, and a hint costs stock — so the board must not either.
//
// What's left is still worth the moment: the marks that lost the board are the
// evidence of where the reasoning went wrong, and re-reading them against the
// clues is the same act the puzzle was asking for all along.
//
// **A board in progress is kept.** Leaving a level — the map button, the back
// gesture, the app being swept away — no longer throws its board away: each
// unfinished one is stored per level, hearts and all, and opening the level
// again picks it up (`src/game/save.ts` says what a save is and why the hearts
// go with it). Only *Try again* deals a fresh board, and that is also the only
// way back to three hearts.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  connectComplete,
  crossOutRest,
  deductionComplete,
  initialMarks,
  isGiven,
  isRoadCell,
  MARK_BLOCKED,
  MARK_NONE,
  MARK_ROAD,
  markAt,
  paveStep,
  shownPiece,
  withMark,
  type Marks,
} from "../game/board";
import {
  dailyPuzzle,
  dayOf,
  isDaily,
  NO_DAILY,
  recordDaily,
  today,
  type DailyRecord,
} from "../game/daily";
import { newlyUnlocked, totalStars, type Fleet } from "../game/garage";
import { deductionTip, routeTip, type Tip } from "../game/hint";
import { LEVEL_COUNT, puzzleForLevel } from "../game/levels";
import { restoreBoard, saveBoard, worthKeeping, type SavedBoard } from "../game/save";
import { type Coord, type Puzzle } from "../game/types";

export const MAX_HEARTS = 3;
export const STARTING_HINTS = 5;
const HINT_CAP = 9;
// Named for the game as it shipped first. It is a key, not a label: renaming
// it would quietly wipe every existing player's progress.
const STORE_KEY = "tracks.progress.v1";
/** Unfinished boards, by level. Kept apart so a board's churn never rewrites progress. */
const BOARDS_KEY = "tracks.boards.v1";
/**
 * How long a board's marks wait before they are written. A swipe crosses a
 * square every few milliseconds; one write at the end of it is enough. A heart is
 * never kept waiting — see the save effect.
 */
const SAVE_DELAY_MS = 400;

export type Phase = "deduce" | "connect" | "won";

export type Progress = {
  /** Highest level the player may open. */
  unlockedLevel: number;
  hints: number;
  haptics: boolean;
  sound: boolean;
  music: boolean;
  tutorialSeen: boolean;
  /** Technique courses already shown (`TECHNIQUES` ids), so each comes once. */
  learned: string[];
  /** The daily road: the streak, and each day's best (`src/game/daily.ts`). */
  daily: DailyRecord;
  /** The convoy's paint job (`FLEETS` id). Cosmetic: nothing in play reads it. */
  fleet: string;
  /**
   * Best result per cleared level: the hearts left standing when it was won.
   * A record, not a rule — nothing reads it back into play.
   */
  stars: Record<number, number>;
};

const DEFAULT_PROGRESS: Progress = {
  unlockedLevel: 1,
  hints: STARTING_HINTS,
  haptics: true,
  sound: true,
  music: true,
  tutorialSeen: false,
  learned: [],
  daily: NO_DAILY,
  fleet: "classic",
  stars: {},
};

export type GameState = {
  /** Which board this is. The tutorial's lessons use ids past the ladder. */
  level: number;
  puzzle: Puzzle;
  marks: Marks;
  route: Coord[];
  phase: Phase;
  hearts: number;
  failed: boolean;
  /** The car is running; the win card waits for it. */
  riding: boolean;
  celebrate: boolean;
  /** Cell to flash red — a refused claim. */
  wrong: Coord | null;
  /**
   * The hint on screen: what it says, and what it is pointing at. Up until the
   * player does something other than act on it (`followTip`).
   */
  tip: Tip | null;
  /** Bumped whenever the board should shake. */
  shake: number;
  hintsUsed: number;
};

export type Action =
  /** A board for a level: the one left unfinished there, if `saved` holds up, else fresh. */
  | { type: "NEW"; level: number; saved?: SavedBoard }
  | { type: "TAP"; cell: Coord }
  | { type: "CLAIM"; cell: Coord }
  | { type: "PAINT"; cell: Coord; value: number }
  | { type: "ROUTE"; route: Coord[] }
  | { type: "PAVE"; target: Coord }
  | { type: "HINT" }
  | { type: "RIDE_DONE" }
  | { type: "CLEAR_FLASH" };

/** A board by id: a ladder level, or a day's daily road (`DAILY_BASE + day`). */
function freshBoard(level: number): GameState {
  return boardFor(isDaily(level) ? dailyPuzzle(dayOf(level)) : puzzleForLevel(level), level);
}

/**
 * A fresh board for any puzzle, not only a level's. `marks` lets the tutorial
 * open a board part-solved; the phase is read off them like anywhere else.
 */
export function boardFor(puzzle: Puzzle, level: number, marks?: Marks): GameState {
  const m = marks ?? initialMarks(puzzle);
  return {
    level,
    puzzle,
    marks: m,
    route: [],
    phase: deductionComplete(puzzle, m) ? "connect" : "deduce",
    hearts: MAX_HEARTS,
    failed: false,
    riding: false,
    celebrate: false,
    wrong: null,
    tip: null,
    shake: 0,
    hintsUsed: 0,
  };
}

/**
 * Marks after a change, plus the phase that change may have unlocked.
 *
 * The road needs no looking after here. Claims only ever accumulate — nothing
 * takes one back (see `TAP`) — so a square the road stands on can't stop being
 * claimed underneath it, and every cell of the route stays one `connectStep`
 * would accept.
 */
function settle(state: GameState, marks: Marks): GameState {
  const phase: Phase = deductionComplete(state.puzzle, marks) ? "connect" : "deduce";
  return { ...state, marks, phase };
}

/**
 * A claim the board refuses: a heart, and the square crossed out instead. Shared
 * by the two ways of claiming — a double tap and a road pushed into an unknown
 * square — because they are the same commitment and must cost the same.
 */
function refuse(state: GameState, cell: Coord): GameState {
  const hearts = state.hearts - 1;
  const marks = withMark(state.marks, state.puzzle.size, cell.r, cell.c, MARK_BLOCKED);
  return {
    ...settle(state, marks),
    hearts,
    failed: hearts <= 0,
    wrong: cell,
    shake: state.shake + 1,
  };
}

/**
 * The route just drawn, and the win it may have completed.
 *
 * Winning also crosses out whatever is left unmarked (`crossOutRest`). The board
 * writes no ✕ of its own at any other moment — see the note there — but a
 * finished route means the deduction is finished too, so the last empties are
 * already proved and the grid may as well say so.
 */
function laid(state: GameState, route: Coord[]): GameState {
  if (connectComplete(state.puzzle, route)) {
    return { ...state, route, marks: crossOutRest(state.marks), phase: "won", riding: true };
  }
  return { ...state, route };
}

/**
 * A hint stays up while the player is acting on it — crossing out the squares it
 * points at, one by one — and goes the moment they do anything else. A reason
 * that lingered after the board had moved on would be explaining a board that
 * isn't there any more.
 */
function followTip(before: GameState, after: GameState): GameState {
  const { tip } = before;
  if (!tip || after === before || !after.tip) return after;
  if (after.route === before.route) {
    const n = after.puzzle.size;
    const pointed = new Set(tip.point.map(({ r, c }) => r * n + c));
    let onTip = true;
    for (let i = 0; i < after.marks.length; i++) {
      if (after.marks[i] !== before.marks[i] && !pointed.has(i)) onTip = false;
    }
    const open = tip.point.some(({ r, c }) => markAt(after.marks, n, r, c) === MARK_NONE);
    if (onTip && open) return after;
  }
  return { ...after, tip: null };
}

/**
 * The rules of a board in play. Exported for the tutorial, which runs its lessons
 * through this very reducer — gated, but never re-implemented — so what it
 * teaches can't drift from what the game does.
 */
export function reduce(state: GameState, action: Action): GameState {
  const next = apply(state, action);
  return action.type === "HINT" ? next : followTip(state, next);
}

function apply(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "NEW": {
      const fresh = freshBoard(action.level);
      const back = action.saved ? restoreBoard(fresh.puzzle, action.saved, MAX_HEARTS) : null;
      if (!back) return fresh;
      // Through `boardFor` like any board, so the phase is read off the restored
      // marks rather than trusted from anywhere.
      return {
        ...boardFor(fresh.puzzle, action.level, back.marks),
        route: back.route,
        hearts: back.hearts,
        hintsUsed: back.hintsUsed,
      };
    }

    case "CLEAR_FLASH":
      return state.wrong ? { ...state, wrong: null } : state;

    case "TAP": {
      if (state.failed || state.phase !== "deduce") return state;
      const { r, c } = action.cell;
      if (isGiven(state.puzzle, r, c)) return state;
      const now = markAt(state.marks, state.puzzle.size, r, c);
      // A claim is permanent. It was checked when it went down, so it is true,
      // and taking it back could only ever lose something — a verified square,
      // and the road standing on it. A tap is also the most careless touch there
      // is, and a claimed square is exactly where a player prods while reading
      // the road through it; that tap must not quietly unpick their work.
      if (now === MARK_ROAD) return state;
      const next = now === MARK_NONE ? MARK_BLOCKED : MARK_NONE;
      return settle(state, withMark(state.marks, state.puzzle.size, r, c, next));
    }

    case "PAINT": {
      if (state.failed || state.phase !== "deduce") return state;
      const { r, c } = action.cell;
      if (isGiven(state.puzzle, r, c)) return state;
      const now = markAt(state.marks, state.puzzle.size, r, c);
      if (now === MARK_ROAD || now === action.value) return state;
      return settle(state, withMark(state.marks, state.puzzle.size, r, c, action.value));
    }

    case "CLAIM": {
      if (state.failed || state.phase !== "deduce") return state;
      const { r, c } = action.cell;
      if (isGiven(state.puzzle, r, c)) return state;
      if (markAt(state.marks, state.puzzle.size, r, c) === MARK_ROAD) return state;

      // A refused claim leaves the cell crossed out: it *is* now known to be
      // empty, and paying a heart for nothing would be worse than the mistake.
      if (!isRoadCell(state.puzzle, r, c)) return refuse(state, action.cell);
      return settle(state, withMark(state.marks, state.puzzle.size, r, c, MARK_ROAD));
    }

    case "ROUTE": {
      // Road are drawable throughout, so this is refused only once the board is
      // over. Finishing the route still means the deduction is finished too: a
      // complete route is `roadTotal` distinct claimed cells, and claims are
      // checked, so every road cell must have been found to draw it.
      if (state.failed || state.phase === "won") return state;
      return laid(state, action.route);
    }

    case "PAVE": {
      // The road paid out towards where the finger is, one step at a time. A
      // step onto an unknown square is a claim, so this loop is where the two
      // halves of the game meet: it can lay road, find road, or cost a heart.
      if (state.failed || state.phase === "won") return state;
      let s = state;
      for (let guard = 0; guard < 12; guard++) {
        const step = paveStep(s.puzzle, s.marks, s.route, action.target);
        if (!step) break;
        if (step.kind === "move") {
          s = laid(s, step.route);
          if (s.phase === "won") break;
          continue;
        }
        // A wrong push stops the road where it stands — the square it tried is
        // now crossed out, and the shake is the answer to the gesture.
        if (!isRoadCell(s.puzzle, step.cell.r, step.cell.c)) return refuse(s, step.cell);
        s = settle(s, withMark(s.marks, s.puzzle.size, step.cell.r, step.cell.c, MARK_ROAD));
      }
      return s;
    }

    case "HINT": {
      // A hint is a reason, not just an answer — see `src/game/hint.ts`.
      if (state.failed || state.phase === "won") return state;
      if (state.phase === "connect") {
        const next = routeTip(state.puzzle, state.route);
        if (!next) return state;
        // Through `laid` like every other way of finishing, so a hint that lays
        // the last piece wins the board on exactly the same terms.
        return laid({ ...state, tip: next.tip, hintsUsed: state.hintsUsed + 1 }, next.route);
      }
      const tip = deductionTip(state.puzzle, state.marks, state.route);
      if (!tip) return state;
      let marks = state.marks;
      for (const { r, c } of tip.claim) marks = withMark(marks, state.puzzle.size, r, c, MARK_ROAD);
      const next = settle(state, marks);
      return {
        ...next,
        // A hint that finds the last road square has better news than its
        // reason: the board has changed phase, and the banner is for that.
        tip: next.phase === "deduce" ? tip : null,
        hintsUsed: state.hintsUsed + 1,
      };
    }

    case "RIDE_DONE":
      return { ...state, riding: false, celebrate: true };

    default:
      return state;
  }
}

export function useGame() {
  const [progress, setProgress] = useState<Progress>(DEFAULT_PROGRESS);
  const [loaded, setLoaded] = useState(false);
  const [state, dispatch] = useReducer(reduce, 1, freshBoard);
  /** A paint job this board's win just opened in the garage — said on the win card. */
  const [newFleet, setNewFleet] = useState<Fleet | null>(null);

  /**
   * Unfinished boards by level, as last written. A ref rather than state: nothing
   * renders from it, it is only read when a level is opened.
   */
  const boards = useRef<Record<number, SavedBoard>>({});

  // --- persistence ---------------------------------------------------------
  useEffect(() => {
    let alive = true;
    AsyncStorage.multiGet([STORE_KEY, BOARDS_KEY])
      .then(([[, raw], [, rawBoards]]) => {
        if (!alive) return;
        // Apart, so a damaged board store costs the boards and never the progress.
        try {
          if (rawBoards) boards.current = JSON.parse(rawBoards) ?? {};
        } catch {
          boards.current = {};
        }
        // A daily left unfinished is only worth keeping while it can still be
        // finished for its streak: yesterday's (started before midnight) or today's.
        for (const id of Object.keys(boards.current).map(Number)) {
          if (isDaily(id) && dayOf(id) < today() - 1) delete boards.current[id];
        }
        if (raw) {
          const saved = JSON.parse(raw) as Partial<Progress>;
          setProgress({
            ...DEFAULT_PROGRESS,
            ...saved,
            stars: { ...(saved.stars ?? {}) },
            daily: { ...NO_DAILY, ...(saved.daily ?? {}) },
          });
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const progressRef = useRef(progress);
  progressRef.current = progress;

  const save = useCallback((next: Progress) => {
    setProgress(next);
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const patch = useCallback(
    (fields: Partial<Progress>) => save({ ...progressRef.current, ...fields }),
    [save],
  );

  // --- awarding a clear ----------------------------------------------------
  // Runs off `celebrate` rather than the phase flip so the unlock lands with the
  // win card, and only ever advances (replaying a cleared level pays nothing).
  const awarded = useRef(0);
  useEffect(() => {
    if (!state.celebrate || awarded.current === state.level) return;
    awarded.current = state.level;
    const p = progressRef.current;
    // A daily keeps its own record — the streak — and pays a hint the first time
    // each day's road is built, as a new ladder level does.
    if (isDaily(state.level)) {
      const day = dayOf(state.level);
      const first = p.daily.stars[day] === undefined;
      save({
        ...p,
        daily: recordDaily(p.daily, day, state.hearts),
        hints: first ? Math.min(HINT_CAP, p.hints + 1) : p.hints,
      });
      return;
    }
    // The star record is kept on every clear, replays included — it only ever
    // improves, and it pays nothing but the garage's paint jobs.
    const best = Math.max(p.stars[state.level] ?? 0, state.hearts);
    const stars = { ...p.stars, [state.level]: best };
    setNewFleet(newlyUnlocked(totalStars(p.stars), totalStars(stars)));
    if (state.level === p.unlockedLevel && p.unlockedLevel < LEVEL_COUNT) {
      save({
        ...p,
        stars,
        unlockedLevel: p.unlockedLevel + 1,
        hints: Math.min(HINT_CAP, p.hints + 1),
      });
    } else if (best !== p.stars[state.level]) {
      save({ ...p, stars });
    }
  }, [state.celebrate, state.level, state.hearts, save]);

  // Flashes are transient — clear them so a later shake re-triggers.
  useEffect(() => {
    if (!state.wrong) return;
    const t = setTimeout(() => dispatch({ type: "CLEAR_FLASH" }), 700);
    return () => clearTimeout(t);
  }, [state.wrong]);

  // --- keeping the board in play -------------------------------------------
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeBoards = useCallback(() => {
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = null;
    AsyncStorage.setItem(BOARDS_KEY, JSON.stringify(boards.current)).catch(() => {});
  }, []);

  // Anything still waiting goes down before the app can be killed in the
  // background — which is exactly where "swept away mid-board" happens.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active" && writeTimer.current) writeBoards();
    });
    return () => {
      sub.remove();
      if (writeTimer.current) writeBoards();
    };
  }, [writeBoards]);

  /**
   * False until a level is actually opened. The reducer starts on a placeholder
   * level-1 board nobody has played; left to the effect below it would look like
   * an untouched level 1 and delete the save waiting there.
   */
  const opened = useRef(false);

  useEffect(() => {
    if (!opened.current) return;
    const { level } = state;
    const before = boards.current[level];
    // A lost board isn't kept — its *Try again* is a fresh board — and nor is a
    // won one, or one with nothing on it.
    const keep = !state.failed && state.phase !== "won" && worthKeeping(state, MAX_HEARTS);
    if (!keep && !before) return;
    const next = { ...boards.current };
    if (keep) next[level] = saveBoard(state);
    else delete next[level];
    boards.current = next;
    // **A heart is written at once.** Marks can wait for the end of a stroke, but
    // a lost heart can't: if it sat in the delay, killing the app straight after
    // a wrong claim would bring the board back with the heart and the answer
    // both — a free look at a square, which is the one thing hearts price.
    const heartMoved =
      state.failed || (before ? before.hearts !== state.hearts : state.hearts < MAX_HEARTS);
    if (heartMoved) {
      writeBoards();
      return;
    }
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(writeBoards, SAVE_DELAY_MS);
  }, [
    state.level,
    state.puzzle,
    state.marks,
    state.route,
    state.hearts,
    state.hintsUsed,
    state.phase,
    state.failed,
    writeBoards,
  ]);

  /**
   * Open a level: the board left unfinished there, or a fresh one. `fresh` is
   * *Try again* — the saved board is dropped first, so this is the one way back
   * to three hearts and it costs everything on the board, as it always has.
   */
  const start = useCallback(
    (level: number, fresh = false) => {
      awarded.current = 0;
      opened.current = true;
      setNewFleet(null);
      if (fresh && boards.current[level]) {
        const next = { ...boards.current };
        delete next[level];
        boards.current = next;
        writeBoards();
      }
      dispatch({ type: "NEW", level, saved: fresh ? undefined : boards.current[level] });
    },
    [writeBoards],
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  const useHint = useCallback(() => {
    if (progressRef.current.hints <= 0) return false;
    // Charged only for a hint there is to give: the reducer is pure, so asking
    // it first is free, and a spent hint that did nothing is a small theft.
    if (reduce(stateRef.current, { type: "HINT" }) === stateRef.current) return false;
    patch({ hints: progressRef.current.hints - 1 });
    dispatch({ type: "HINT" });
    return true;
  }, [patch]);

  // A failed board shows **nothing new** — see the note on `failed` at the top.
  // The solution used to be derived here and drawn dimmed under the player's own
  // marks; it isn't any more, and nothing is left that could draw it.

  return {
    ...state,
    progress,
    loaded,
    newFleet,
    /** Something on this board would be lost by starting it again. */
    inProgress: !state.failed && state.phase !== "won" && worthKeeping(state, MAX_HEARTS),
    start,
    retry: useCallback(() => start(state.level, true), [start, state.level]),
    tap: useCallback((cell: Coord) => dispatch({ type: "TAP", cell }), []),
    claim: useCallback((cell: Coord) => dispatch({ type: "CLAIM", cell }), []),
    paint: useCallback(
      (cell: Coord, value: number) => dispatch({ type: "PAINT", cell, value }),
      [],
    ),
    setRoute: useCallback((route: Coord[]) => dispatch({ type: "ROUTE", route }), []),
    pave: useCallback((target: Coord) => dispatch({ type: "PAVE", target }), []),
    rideDone: useCallback(() => dispatch({ type: "RIDE_DONE" }), []),
    useHint,
    patch,
    reset: useCallback(() => {
      awarded.current = 0;
      boards.current = {};
      writeBoards();
      save(DEFAULT_PROGRESS);
      dispatch({ type: "NEW", level: 1 });
    }, [save, writeBoards]),
  };
}

export type Game = ReturnType<typeof useGame>;
