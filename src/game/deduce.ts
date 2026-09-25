// The deduction engine: can a *person* solve this board, and how hard is it?
//
// `solver.ts` answers a different question — "how many routes satisfy these
// clues" — and it answers it by brute force. A board can have exactly one route
// and still be unsolvable by reasoning, which is the state the level bank was in
// before this module existed: on an 8×8 a player could deduce 43% of the grid and
// then had to guess, with three hearts and a checked claim. Uniqueness is
// necessary and nowhere near sufficient.
//
// So this is the shipping gate. It resolves a board the way the deduce phase asks
// the player to — *which squares carry road*, never what shape the piece is —
// using a fixed ladder of rules a person can actually carry out:
//
//   T1 line counting      the count is met, so the rest of the line is empty;
//                         or it needs everything left, so all of it is road
//   T2 two ways out       a road cell needs exactly two connections, and only a
//                         not-known-empty neighbour can be one
//   T3 connectivity       what the entry cannot reach holds no road, and a cell
//                         the road must squeeze through holds some
//   T4 line intersection  what every legal placement of a line's count agrees
//                         on is true whatever else turns out to happen
//   T5 assume and refute  assume a square, propagate T1–T4, and take a
//                         contradiction as proof of the opposite
//
// The tiers double as the difficulty scale: `maxTier` is the hardest rule a board
// actually needed, which orders a ladder far better than grid size does, and is
// what the bank now sorts on.
//
// **T5 is sound reasoning, not gambling**, so it does not fight the heart
// economy. The half that concludes *empty* is recorded with a free cross, and the
// half that concludes *road* only costs a heart if the player mis-executes it.
// It is capped at depth one — the inner propagation may never itself use T5 —
// because "assume inside an assumption" is where deduction stops being something
// a person does at a bus stop.

import {
  DC,
  DIRS,
  DR,
  hasDir,
  key,
  type Coord,
  shownClues,
  type Piece,
  type Puzzle,
  type Terminal,
} from "./types";

/** Nothing known about this square yet. */
export const UNKNOWN = -1;
/** Known to hold no road. */
export const NO_ROAD = 0;
/** Known to hold road. */
export const ROAD = 1;

export type Tier = 1 | 2 | 3 | 4 | 5;

/** What the engine needs to know. Deliberately the shape `SolverInput` uses. */
export type DeduceInput = {
  size: number;
  /** Counts as shown: `-1` where fog hides one, and no rule reads that line's. */
  rows: number[];
  cols: number[];
  entry: Terminal;
  exit: Terminal;
  /** `key(r, c)` → the piece printed on that cell from the start. */
  fixed: Map<number, Piece>;
  /** `key(r, c)` of squares printed as scenery: known to hold no road. */
  blocked: Set<number>;
};

export type Grade = {
  /** The hardest rule the board actually required. */
  maxTier: Tier;
  /** Deductions that came from the top two tiers — how *often* it was hard. */
  topLoad: number;
  /** Propagation passes: how long the forced chain runs. */
  rounds: number;
  /** Single sortable number. Fields can't bleed into each other; see below. */
  score: number;
};

export type DeduceResult = {
  /** One cell per square, row-major: `UNKNOWN` / `NO_ROAD` / `ROAD`. */
  state: Int8Array;
  /** Squares reasoning could not settle. Zero is the shipping gate. */
  unknown: number;
  /** Nothing left unknown — the board falls to reasoning alone. */
  solved: boolean;
  /** The clues and the rules disagree; the board is broken. */
  contradiction: boolean;
  grade: Grade;
};

/** A row or a column. */
export type Line = { column: boolean; index: number };

/**
 * One application of one rule — a single line counted, a single square's ways
 * out — and what it settled. This is the unit a hint explains: the reason a
 * player could give for these squares, in the words of the rule that found them.
 */
export type Step = {
  tier: Tier;
  /** Squares it proved hold road. */
  road: Coord[];
  /** Squares it proved hold none. */
  empty: Coord[];
  because:
    /** T1: this line's count is met, or needs every square it has left. */
    | { rule: "count"; line: Line }
    /** T2: this road square has exactly as many ways out as it needs. */
    | { rule: "exits"; cell: Coord }
    /** T2: this square can't muster two ways out. */
    | { rule: "deadEnd" }
    /** T3: the road can't get here from the start. */
    | { rule: "unreachable" }
    /** T3: the road can't get to the flag without this square. */
    | { rule: "bottleneck" }
    /** T4: every placement of this line's count agrees here. */
    | { rule: "overlap"; line: Line }
    /** T5: assuming the opposite ends in a contradiction. */
    | { rule: "refute" };
};

/**
 * Build engine input from a puzzle, optionally overriding which cells are
 * printed.
 *
 * The override is the whole reason this exists: the generator has to ask "is this
 * board deducible with **only the two terminals** showing", separately from
 * grading the board as the player will actually meet it. Passing the puzzle's own
 * `fixed` gives the second; passing the terminals gives the first.
 */
export function deduceInput(puzzle: Puzzle, fixed?: readonly Coord[]): DeduceInput {
  const cells = fixed ?? puzzle.fixed;
  const map = new Map<number, Piece>();
  for (const { r, c } of cells) map.set(key(r, c), puzzle.solution[r][c]);
  // Scenery and fog are the board, not reveals: they are there whichever
  // reading is being taken, terminals-only included.
  const { rows, cols } = shownClues(puzzle);
  return {
    size: puzzle.size,
    rows,
    cols,
    entry: puzzle.entry,
    exit: puzzle.exit,
    fixed: map,
    blocked: new Set((puzzle.scenery ?? []).map(({ r, c }) => key(r, c))),
  };
}

/** Just the two terminals, which every board prints no matter what. */
export const terminalCells = (puzzle: Puzzle): Coord[] => [
  { r: puzzle.entry.r, c: puzzle.entry.c },
  { r: puzzle.exit.r, c: puzzle.exit.c },
];

/**
 * Where a board belongs in the ladder, from its two readings.
 *
 * Led by the tier the **clues** demand, not the tier the played board demands,
 * and that ordering is what makes the ladder well-formed rather than merely
 * sorted. A printed piece can drop a board that needs assume-and-refute down to
 * plain counting, so ranking on the played tier lets a board whose clues are the
 * hardest on the ladder sit in the middle of it — and, worse, lets it land in a
 * level whose cap forbids that rule. Because more givens can only make a board
 * easier, the clue tier is the higher of the two, so leading with it keeps clue
 * difficulty non-decreasing across a band for free.
 *
 * Workload then breaks ties: how many of the deductions came from the hard end,
 * and how long the forced chain ran.
 */
export const ladderScore = (clues: Grade, played: Grade): number =>
  clues.maxTier * 1000 + Math.min(99, played.topLoad) * 10 + Math.min(9, played.rounds);

/**
 * How many placements a line can have. Guards the T4 enumeration, which is the
 * one part of the engine that can blow up.
 */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let out = 1;
  for (let i = 0; i < k; i++) out = (out * (n - i)) / (i + 1);
  return Math.round(out);
}

/**
 * Above this many placements a line is left for another round to narrow. The
 * cheaper tiers usually cut it down before the next pass, so the cap costs less
 * deduction than it looks like it should — and it is what keeps a wide-open line
 * on an 8×8 from dominating the whole build.
 */
const T4_PLACEMENT_CAP = 3_000;

type Run = {
  contradiction: boolean;
  /** Deductions made, indexed by tier (1-based; index 0 unused). */
  perTier: number[];
  rounds: number;
};

/**
 * Propagate to a fixpoint over `state`, mutating it in place.
 *
 * Split out from {@link deduce} so T5 can re-enter it on a copied state with a
 * lower cap — that recursion is the entire implementation of "assume and refute",
 * and capping the inner call at 4 is what keeps the depth at one.
 *
 * **Given `probe`, it reasons one round and changes nothing.** Every rule is then
 * read against `state` exactly as it stands, each application that would settle
 * something is written into `probe` as a {@link Step}, and the run stops after
 * the cheapest tier that bites. That is what a hint needs: conclusions a player
 * could reach from what is on the board *now*, each resting only on that — never
 * on a square an earlier step in the same pass settled out of sight. (T5 is the
 * exception in cost only: it stops at the first refutation, since trying every
 * square twice to list them all is the slowest thing the engine can do.)
 */
function propagate(input: DeduceInput, state: Int8Array, maxTier: Tier, probe?: Step[]): Run {
  const { size: n, rows, cols, entry, exit, fixed } = input;
  const perTier = [0, 0, 0, 0, 0, 0];
  let contradiction = false;
  let rounds = 0;
  /** On once the printed pieces are seeded — they are given, not concluded. */
  let probing = false;
  /** What the rule application under way has settled, while probing. */
  const settling: { r: number; c: number; v: number }[] = [];

  const idx = (r: number, c: number) => r * n + c;
  const at = (r: number, c: number) => state[idx(r, c)];
  const inBounds = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n;

  /**
   * Record a square, reporting whether the board *changed*.
   *
   * The return value must be "changed", never "consistent". A setter that says
   * true for re-stating what a cell already holds leaves the fixpoint loop's
   * `moved` flag permanently raised and the engine spins forever — it is the
   * single easiest way to hang this file.
   */
  function set(r: number, c: number, v: number, tier: Tier): boolean {
    const i = idx(r, c);
    if (state[i] === UNKNOWN) {
      if (probing) {
        settling.push({ r, c, v });
      } else {
        state[i] = v;
        perTier[tier]++;
      }
      return true;
    }
    if (state[i] !== v) contradiction = true;
    return false;
  }

  /**
   * Close one application of a rule: while probing, whatever it settled becomes
   * a step, credited to the reason given. Free otherwise.
   */
  function note(tier: Tier, because: Step["because"]) {
    if (!probe) return;
    if (settling.length) {
      const road: Coord[] = [];
      const empty: Coord[] = [];
      for (const { r, c, v } of settling) (v === ROAD ? road : empty).push({ r, c });
      probe.push({ tier, road, empty, because });
    }
    settling.length = 0;
  }

  /** Connections this cell gets for free by leaving the board. */
  const offBoard = (r: number, c: number) =>
    (entry.r === r && entry.c === c ? 1 : 0) + (exit.r === r && exit.c === c ? 1 : 0);

  /**
   * Neighbours that could still be this cell's connections, narrowed by a printed
   * piece to the two edges it opens onto.
   *
   * `alsoEmpty` lets T4 ask the question about a hypothetical placement without
   * touching the real state.
   */
  function ports(
    r: number,
    c: number,
    alsoEmpty?: (r: number, c: number) => boolean,
  ): Coord[] {
    const fx = fixed.get(key(r, c));
    const out: Coord[] = [];
    for (const d of DIRS) {
      if (fx !== undefined && !hasDir(fx, d)) continue;
      const r2 = r + DR[d];
      const c2 = c + DC[d];
      if (!inBounds(r2, c2)) continue;
      if (at(r2, c2) === NO_ROAD) continue;
      if (alsoEmpty?.(r2, c2)) continue;
      out.push({ r: r2, c: c2 });
    }
    return out;
  }

  /**
   * The same count without building the list. T4 asks this up to a few thousand
   * times per line per round, and the array it would otherwise allocate each time
   * is the single hottest thing in the engine.
   */
  function portCount(
    r: number,
    c: number,
    alsoEmpty?: (r: number, c: number) => boolean,
  ): number {
    const fx = fixed.get(key(r, c));
    let count = 0;
    for (const d of DIRS) {
      if (fx !== undefined && !hasDir(fx, d)) continue;
      const r2 = r + DR[d];
      const c2 = c + DC[d];
      if (!inBounds(r2, c2)) continue;
      if (at(r2, c2) === NO_ROAD) continue;
      if (alsoEmpty?.(r2, c2)) continue;
      count++;
    }
    return count;
  }

  // --- T1: line counting ---------------------------------------------------
  function t1(): boolean {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (const column of [false, true]) {
        const clue = column ? cols[i] : rows[i];
        if (clue < 0) continue; // fogged: nothing to count against
        let road = 0;
        const unknown: Coord[] = [];
        for (let j = 0; j < n; j++) {
          const r = column ? j : i;
          const c = column ? i : j;
          if (at(r, c) === ROAD) road++;
          else if (at(r, c) === UNKNOWN) unknown.push({ r, c });
        }
        if (road > clue || road + unknown.length < clue) {
          contradiction = true;
          return moved;
        }
        if (unknown.length === 0) continue;
        if (road === clue) {
          for (const { r, c } of unknown) moved = set(r, c, NO_ROAD, 1) || moved;
        } else if (road + unknown.length === clue) {
          for (const { r, c } of unknown) moved = set(r, c, ROAD, 1) || moved;
        }
        note(1, { rule: "count", line: { column, index: i } });
      }
    }
    return moved;
  }

  // --- T2: two ways out ----------------------------------------------------
  function t2(): boolean {
    let moved = false;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const cell = at(r, c);
        if (cell === ROAD) {
          const need = 2 - offBoard(r, c);
          const cands = ports(r, c);
          if (cands.length < need) {
            contradiction = true;
            return moved;
          }
          if (cands.length === need) {
            for (const p of cands) moved = set(p.r, p.c, ROAD, 2) || moved;
          }
          note(2, { rule: "exits", cell: { r, c } });
        } else if (cell === UNKNOWN) {
          // Nothing that cannot muster two connections can hold road.
          if (offBoard(r, c) + portCount(r, c) < 2) {
            moved = set(r, c, NO_ROAD, 2) || moved;
          }
          note(2, { rule: "deadEnd" });
        }
      }
    }
    return moved;
  }

  // --- T3: connectivity ----------------------------------------------------
  //
  // **Measured: this tier resolves nothing on any of the 120 shipped boards.**
  // Not one of them has a square it settles that T1 and T2 had not already got
  // to, and no board grades T3. That is not a bug in it — it is sound, and it is
  // a technique players genuinely use ("the road can't get over there") — it is
  // that counting plus two-ways-out is simply faster to the same squares, helped
  // along by the foothold floor the generator holds every board to.
  //
  // Kept anyway, on two grounds: it costs 14ms across the whole bank, and it is
  // the tier that would start earning the moment the shape dials move (a band
  // built with sparser extreme clues gives T1 much less to bite on). Worth
  // re-measuring rather than assuming if those dials are ever turned — and worth
  // *not* mistaking for load-bearing before then.
  /** Squares reachable from the entry without crossing a known-empty one. */
  function reachable(skip?: Coord): Uint8Array {
    const seen = new Uint8Array(n * n);
    if (skip && skip.r === entry.r && skip.c === entry.c) return seen;
    const stack: Coord[] = [{ r: entry.r, c: entry.c }];
    seen[idx(entry.r, entry.c)] = 1;
    while (stack.length) {
      const { r, c } = stack.pop()!;
      for (const d of DIRS) {
        const r2 = r + DR[d];
        const c2 = c + DC[d];
        if (!inBounds(r2, c2) || seen[idx(r2, c2)]) continue;
        if (at(r2, c2) === NO_ROAD) continue;
        if (skip && skip.r === r2 && skip.c === c2) continue;
        seen[idx(r2, c2)] = 1;
        stack.push({ r: r2, c: c2 });
      }
    }
    return seen;
  }

  function t3(): boolean {
    let moved = false;
    const seen = reachable();
    if (!seen[idx(exit.r, exit.c)]) {
      contradiction = true;
      return moved;
    }
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!seen[idx(r, c)]) moved = set(r, c, NO_ROAD, 3) || moved;
      }
    }
    note(3, { rule: "unreachable" });
    if (moved) return true;
    // A square the road has no way around is a square the road goes through.
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (at(r, c) !== UNKNOWN) continue;
        const without = reachable({ r, c });
        if (!without[idx(exit.r, exit.c)]) moved = set(r, c, ROAD, 3) || moved;
        note(3, { rule: "bottleneck" });
      }
    }
    return moved;
  }

  // --- T4: line intersection -----------------------------------------------
  /**
   * Everything every legal placement of a line's remaining count agrees on.
   *
   * Enumerates *combinations of exactly the count still owed*, not all `2^k`
   * subsets — the naive version is unusably slow and was measured as such. A line
   * whose placement count is over the cap is left alone this round; the cheaper
   * tiers will usually narrow it before the next one.
   */
  function t4(): boolean {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (const column of [false, true]) {
        const clue = column ? cols[i] : rows[i];
        if (clue < 0) continue; // fogged: no count to place
        const slots: Coord[] = [];
        let road = 0;
        for (let j = 0; j < n; j++) {
          const r = column ? j : i;
          const c = column ? i : j;
          if (at(r, c) === ROAD) road++;
          else if (at(r, c) === UNKNOWN) slots.push({ r, c });
        }
        const need = clue - road;
        if (slots.length === 0) continue;
        if (need < 0 || need > slots.length) {
          contradiction = true;
          return moved;
        }
        if (choose(slots.length, need) > T4_PLACEMENT_CAP) continue;

        // Cell → slot, so a placement can be tested with an array lookup rather
        // than a scan. Everything below runs once per placement, so nothing in
        // here is allowed to be O(cells).
        const slotAt = new Int16Array(n * n).fill(-1);
        for (let s = 0; s < slots.length; s++) slotAt[idx(slots[s].r, slots[s].c)] = s;

        // What each perpendicular line already holds, and how much it could still
        // take, so a placement that overruns or starves one is thrown out.
        const perpRoad = new Array<number>(n).fill(0);
        const perpUnknown = new Array<number>(n).fill(0);
        for (let j = 0; j < n; j++) {
          for (let m = 0; m < n; m++) {
            const r = column ? j : m;
            const c = column ? m : j;
            if (at(r, c) === ROAD) perpRoad[j]++;
            else if (at(r, c) === UNKNOWN) perpUnknown[j]++;
          }
        }
        const perpOf = (s: Coord) => (column ? s.r : s.c);
        const perpClue = (s: Coord) => (column ? rows[s.r] : cols[s.c]);

        // Only road cells touching this line can be starved by its placement, so
        // those are the only ones worth re-checking.
        const neighbours: Coord[] = [];
        const marked = new Uint8Array(n * n);
        for (const s of slots) {
          for (const d of DIRS) {
            const r2 = s.r + DR[d];
            const c2 = s.c + DC[d];
            if (!inBounds(r2, c2) || marked[idx(r2, c2)]) continue;
            if (at(r2, c2) !== ROAD) continue;
            marked[idx(r2, c2)] = 1;
            neighbours.push({ r: r2, c: c2 });
          }
        }

        const pick = new Uint8Array(slots.length);
        const emptyHere = (r: number, c: number) => {
          const s = slotAt[idx(r, c)];
          return s >= 0 && !pick[s];
        };

        const alwaysRoad = new Array<boolean>(slots.length).fill(true);
        const alwaysEmpty = new Array<boolean>(slots.length).fill(true);
        let feasible = 0;

        function viable(): boolean {
          for (let s = 0; s < slots.length; s++) {
            const cell = slots[s];
            const p = perpOf(cell);
            // A fogged crossing line has no count for a placement to break.
            const pc = perpClue(cell);
            if (pick[s]) {
              if (pc >= 0 && perpRoad[p] + 1 > pc) return false;
              if (offBoard(cell.r, cell.c) + portCount(cell.r, cell.c, emptyHere) < 2) {
                return false;
              }
            } else if (pc >= 0 && perpRoad[p] + perpUnknown[p] - 1 < pc) {
              return false;
            }
          }
          for (const cell of neighbours) {
            if (portCount(cell.r, cell.c, emptyHere) < 2 - offBoard(cell.r, cell.c)) {
              return false;
            }
          }
          return true;
        }

        /** Every way of choosing exactly `need` of the slots. */
        function place(from: number, left: number): void {
          if (left === 0) {
            if (!viable()) return;
            feasible++;
            for (let s = 0; s < slots.length; s++) {
              if (pick[s]) alwaysEmpty[s] = false;
              else alwaysRoad[s] = false;
            }
            return;
          }
          if (slots.length - from < left) return;
          pick[from] = 1;
          place(from + 1, left - 1);
          pick[from] = 0;
          place(from + 1, left);
        }

        place(0, need);

        if (feasible === 0) {
          contradiction = true;
          return moved;
        }
        for (let s = 0; s < slots.length; s++) {
          const { r, c } = slots[s];
          if (alwaysRoad[s]) moved = set(r, c, ROAD, 4) || moved;
          else if (alwaysEmpty[s]) moved = set(r, c, NO_ROAD, 4) || moved;
        }
        note(4, { rule: "overlap", line: { column, index: i } });
      }
    }
    return moved;
  }

  // --- T5: assume and refute -----------------------------------------------
  /**
   * Assume a square, propagate the cheaper tiers, and read a contradiction as
   * proof of the opposite. The inner run is capped at 4, which is what makes this
   * depth one and not an open-ended search.
   */
  function t5(): boolean {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (at(r, c) !== UNKNOWN) continue;
        for (const guess of [ROAD, NO_ROAD]) {
          const trial = state.slice();
          trial[idx(r, c)] = guess;
          const res = propagate(input, trial, 4);
          if (res.contradiction) {
            const proven = guess === ROAD ? NO_ROAD : ROAD;
            const moved = set(r, c, proven, 5);
            note(5, { rule: "refute" });
            if (moved) return true;
          }
        }
      }
    }
    return false;
  }

  // Seed: a printed piece is a square known to hold road, and scenery one known
  // to hold none.
  for (const k of fixed.keys()) {
    const r = Math.floor(k / 100);
    const c = k % 100;
    set(r, c, ROAD, 1);
  }
  for (const k of input.blocked) set(Math.floor(k / 100), k % 100, NO_ROAD, 1);
  perTier[1] = 0; // the seed is given, not deduced
  probing = !!probe;

  const tiers = [t1, t2, t3, t4, t5];
  search: for (;;) {
    rounds++;
    // Always fall back to the cheapest rule that still bites. That is both
    // faster and what makes `maxTier` an honest statement about the easiest
    // ladder that finishes the board.
    for (let t = 1; t <= maxTier; t++) {
      if (contradiction) break search;
      if (tiers[t - 1]()) {
        if (probing) break search;
        continue search;
      }
    }
    break;
  }

  return { contradiction, perTier, rounds };
}

/**
 * Resolve a board by reasoning alone, and grade how hard that was.
 *
 * `solved` is the shipping gate: false means a player would reach that point and
 * have to guess, which with three hearts and a checked claim is a coin flip
 * rather than a puzzle.
 */
export function deduce(input: DeduceInput, maxTier: Tier): DeduceResult {
  const n = input.size;
  const state = new Int8Array(n * n).fill(UNKNOWN);
  const run = propagate(input, state, maxTier);

  let unknown = 0;
  for (let i = 0; i < state.length; i++) if (state[i] === UNKNOWN) unknown++;

  let hardest: Tier = 1;
  for (let t = 5; t >= 1; t--) {
    if (run.perTier[t] > 0) {
      hardest = t as Tier;
      break;
    }
  }
  const topLoad = run.perTier[hardest] + (hardest > 1 ? run.perTier[hardest - 1] : 0);

  // The fields cannot bleed into each other: `topLoad` is bounded by the cell
  // count (64 at 8×8, so under 100 slots) and `rounds` by the deductions it
  // takes, so tier dominates, then load, then chain length.
  const score = hardest * 1000 + Math.min(99, topLoad) * 10 + Math.min(9, run.rounds);

  return {
    state,
    unknown,
    solved: unknown === 0 && !run.contradiction,
    contradiction: run.contradiction,
    grade: { maxTier: hardest, topLoad, rounds: run.rounds, score },
  };
}

/**
 * What a person could conclude next, from exactly what `known` holds — the
 * engine's side of a hint.
 *
 * Every application of the cheapest rule that settles anything, each read
 * against `known` as it stands (see `probe` on `propagate`), so a step never
 * leans on a square only another step has settled. Empty when nothing more can
 * be reasoned out, which on a correctly marked shipped board means it is done.
 *
 * `known` must hold every printed piece as `ROAD`, as a player's marks always do.
 */
export function nextSteps(input: DeduceInput, known: Int8Array, maxTier: Tier = 5): Step[] {
  const steps: Step[] = [];
  const run = propagate(input, known.slice(), maxTier, steps);
  return run.contradiction ? [] : steps;
}
