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
// **Losing the last heart doesn't wipe the board.** `failed` locks input and
// shows the solution dimmed underneath what the player had worked out, because
// the interesting question at that moment is *where did I go wrong*, and a
// cleared grid answers it with nothing.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import {
  connectComplete,
  crossOutRest,
  deductionComplete,
  hintCell,
  initialMarks,
  isRoadCell,
  MARK_BLOCKED,
  MARK_NONE,
  MARK_ROAD,
  markAt,
  nextRouteCell,
  paveStep,
  shownPiece,
  trimRoute,
  withMark,
  type Marks,
} from "../game/board";
import { LEVEL_COUNT, puzzleForLevel } from "../game/levels";
import { key, type Coord, type Piece, type Puzzle } from "../game/types";

export const MAX_HEARTS = 3;
export const STARTING_HINTS = 5;
const HINT_CAP = 9;
// Named for the game as it shipped first. It is a key, not a label: renaming
// it would quietly wipe every existing player's progress.
const STORE_KEY = "tracks.progress.v1";

export type Phase = "deduce" | "connect" | "won";

export type Progress = {
  /** Highest level the player may open. */
  unlockedLevel: number;
  hints: number;
  haptics: boolean;
  sound: boolean;
  tutorialSeen: boolean;
};

const DEFAULT_PROGRESS: Progress = {
  unlockedLevel: 1,
  hints: STARTING_HINTS,
  haptics: true,
  sound: true,
  tutorialSeen: false,
};

type GameState = {
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
  /** Cell to highlight — where a hint landed. */
  hint: Coord | null;
  /** Bumped whenever the board should shake. */
  shake: number;
  hintsUsed: number;
};

type Action =
  | { type: "NEW"; level: number }
  | { type: "TAP"; cell: Coord }
  | { type: "CLAIM"; cell: Coord }
  | { type: "PAINT"; cell: Coord; value: number }
  | { type: "ROUTE"; route: Coord[] }
  | { type: "PAVE"; target: Coord }
  | { type: "HINT" }
  | { type: "RIDE_DONE" }
  | { type: "CLEAR_FLASH" };

function freshBoard(level: number): GameState {
  const puzzle = puzzleForLevel(level);
  return {
    level,
    puzzle,
    marks: initialMarks(puzzle),
    route: [],
    phase: "deduce",
    hearts: MAX_HEARTS,
    failed: false,
    riding: false,
    celebrate: false,
    wrong: null,
    hint: null,
    shake: 0,
    hintsUsed: 0,
  };
}

/** Marks after a change, plus the phase that change may have unlocked. */
function settle(state: GameState, marks: Marks): GameState {
  const phase: Phase = deductionComplete(state.puzzle, marks) ? "connect" : "deduce";
  // Road outlive a mark change only as far as the marks still back them up:
  // taking a claim back cuts the road at that cell rather than leaving it
  // hanging off a square that is no longer claimed.
  return { ...state, marks, phase, route: trimRoute(state.puzzle, marks, state.route) };
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

function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "NEW":
      return freshBoard(action.level);

    case "CLEAR_FLASH":
      return state.wrong || state.hint ? { ...state, wrong: null, hint: null } : state;

    case "TAP": {
      if (state.failed || state.phase !== "deduce") return state;
      const { r, c } = action.cell;
      if (shownPiece(state.puzzle, r, c) !== null) return state;
      const now = markAt(state.marks, state.puzzle.size, r, c);
      const next = now === MARK_NONE ? MARK_BLOCKED : MARK_NONE;
      return settle(state, withMark(state.marks, state.puzzle.size, r, c, next));
    }

    case "PAINT": {
      if (state.failed || state.phase !== "deduce") return state;
      const { r, c } = action.cell;
      if (shownPiece(state.puzzle, r, c) !== null) return state;
      const now = markAt(state.marks, state.puzzle.size, r, c);
      if (now === MARK_ROAD || now === action.value) return state;
      return settle(state, withMark(state.marks, state.puzzle.size, r, c, action.value));
    }

    case "CLAIM": {
      if (state.failed || state.phase !== "deduce") return state;
      const { r, c } = action.cell;
      if (shownPiece(state.puzzle, r, c) !== null) return state;
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
      if (state.failed || state.phase === "won") return state;
      if (state.phase === "connect") {
        const cell = nextRouteCell(state.puzzle, state.route);
        if (!cell) return state;
        // Through `laid` like every other way of finishing, so a hint that lays
        // the last piece wins the board on exactly the same terms.
        return laid(
          { ...state, hint: cell, hintsUsed: state.hintsUsed + 1 },
          [...state.route, cell],
        );
      }
      const cell = hintCell(state.puzzle, state.marks);
      if (!cell) return state;
      return {
        ...settle(state, withMark(state.marks, state.puzzle.size, cell.r, cell.c, MARK_ROAD)),
        hint: cell,
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

  // --- persistence ---------------------------------------------------------
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORE_KEY)
      .then((raw) => {
        if (!alive) return;
        if (raw) {
          const saved = JSON.parse(raw) as Partial<Progress>;
          setProgress({ ...DEFAULT_PROGRESS, ...saved });
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
    if (state.level === p.unlockedLevel && p.unlockedLevel < LEVEL_COUNT) {
      save({
        ...p,
        unlockedLevel: p.unlockedLevel + 1,
        hints: Math.min(HINT_CAP, p.hints + 1),
      });
    }
  }, [state.celebrate, state.level, save]);

  // Flashes are transient — clear them so a later shake or hint re-triggers.
  useEffect(() => {
    if (!state.wrong && !state.hint) return;
    const t = setTimeout(() => dispatch({ type: "CLEAR_FLASH" }), 700);
    return () => clearTimeout(t);
  }, [state.wrong, state.hint]);

  const start = useCallback((level: number) => {
    awarded.current = 0;
    dispatch({ type: "NEW", level });
  }, []);

  const useHint = useCallback(() => {
    if (progressRef.current.hints <= 0) return false;
    patch({ hints: progressRef.current.hints - 1 });
    dispatch({ type: "HINT" });
    return true;
  }, [patch]);

  /** The solution, shown dimmed behind a failed board. */
  const ghosts = useMemo(() => {
    if (!state.failed) return undefined;
    const out = new Map<number, Piece>();
    for (const cell of state.puzzle.path) {
      out.set(key(cell.r, cell.c), state.puzzle.solution[cell.r][cell.c]);
    }
    return out;
  }, [state.failed, state.puzzle]);

  return {
    ...state,
    ghosts,
    progress,
    loaded,
    start,
    retry: useCallback(() => start(state.level), [start, state.level]),
    next: useCallback(
      () => start(Math.min(LEVEL_COUNT, state.level + 1)),
      [start, state.level],
    ),
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
      save(DEFAULT_PROGRESS);
      dispatch({ type: "NEW", level: 1 });
    }, [save]),
  };
}

export type Game = ReturnType<typeof useGame>;
