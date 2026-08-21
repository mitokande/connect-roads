// The board: clue gutters, the framed grid, the two border terminals, and every
// touch the game understands.
//
// All input arrives through one PanResponder on the grid rather than per-cell
// pressables, because three of the four gestures are *strokes* — painting ✕
// across a settled row, and drawing the route — and a stroke can't be assembled
// out of independent button presses. Cells are `pointerEvents="none"` so the
// container always owns the touch, and a grant records the page-space origin of
// the grid (page minus location) so later move events can be resolved to a cell
// without measuring anything.
//
// The road gesture and the deduction gestures share the grid for the whole
// board rather than taking turns: a touch landing on the drawn road — or on the
// entry, before there is one — pays out road, and every other touch marks a
// square. Since a road can only be extended from its own end, no square is ever
// ambiguous, which is what lets the player lay road as soon as they can see it
// instead of holding it in their head until the deduction is finished.
//
// Double tap is handled optimistically: the first tap applies its ✕ immediately
// and the second *replaces* it with a claim. Waiting out the double-tap window
// before showing anything would put ~250ms of lag on the single most repeated
// action in the game; taking it back is invisible by comparison.

import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import Svg, { Path, Polygon, Rect } from "react-native-svg";

import {
  connectStep,
  grabsRoad,
  lineOverCrossed,
  MARK_BLOCKED,
  MARK_NONE,
  MARK_ROAD,
  markAt,
  rowFound,
  colFound,
  routePieces,
  shownPiece,
  type Marks,
} from "../game/board";
import {
  dirBetween,
  key,
  same,
  type Coord,
  type Dir,
  type Piece,
  type Puzzle,
} from "../game/types";
import { radius, theme } from "../theme";
import { CarRide } from "./CarRide";
import { Cell } from "./Cell";
import { ROAD_SPAN, ROAD_W, roadRun } from "./RoadPiece";

const DOUBLE_TAP_MS = 280;

/**
 * Nothing on the board may be selected — a web necessity, not a nicety.
 *
 * Left selectable, a stroke across the grid selects the clue digits, and the
 * *next* press inside that selection is read by the browser as the start of a
 * native drag-and-drop: `dragstart` fires, the pointer stream is cancelled, and
 * the responder is terminated mid-gesture, so the road silently stops following
 * the finger. Phones never see it; the web build did.
 *
 * The cast is because React Native's `ViewStyle` doesn't carry `userSelect` —
 * it is web-only, and ignored everywhere else.
 */
const NO_SELECT = { userSelect: "none" } as unknown as ViewStyle;

export type Phase = "deduce" | "connect" | "won";

export type BoardProps = {
  puzzle: Puzzle;
  marks: Marks;
  route: Coord[];
  phase: Phase;
  /** Width the board may occupy, gutters included. */
  width: number;
  /** Cells to draw dimmed pieces on — the shape hint. */
  ghosts?: Map<number, Piece>;
  hint?: Coord | null;
  wrong?: Coord | null;
  onTap: (cell: Coord) => void;
  onClaim: (cell: Coord) => void;
  onPaint: (cell: Coord, value: number) => void;
  onRoute: (route: Coord[]) => void;
  /** Pay the road out towards this cell — it may claim squares on the way. */
  onPave: (target: Coord) => void;
  riding?: boolean;
  onRideDone?: () => void;
};

export function Board(props: BoardProps) {
  const { puzzle, marks, route, phase, width, ghosts, hint, wrong, riding, onRideDone } = props;
  const n = puzzle.size;

  const gutter = Math.max(22, Math.min(34, width * 0.085));
  const frame = 3;
  const cell = Math.floor((width - gutter - frame * 2) / n);
  const grid = cell * n;

  // Everything the gesture handlers need, refreshed every render — the
  // responder itself is created once and would otherwise capture stale props.
  const live = useRef({ ...props, cell, n });
  live.current = { ...props, cell, n };

  const gesture = useRef<{
    mode: "none" | "paint" | "route";
    paintTo: number | null;
    last: Coord | null;
    /** The refused-claim flash as it stood when the stroke began. */
    wrongAt: Coord | null;
    ox: number;
    oy: number;
  }>({ mode: "none", paintTo: null, last: null, wrongAt: null, ox: 0, oy: 0 });
  const lastTap = useRef<{ r: number; c: number; t: number } | null>(null);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: (e) => {
          const g = gesture.current;
          const { locationX, locationY, pageX, pageY } = e.nativeEvent;
          g.ox = pageX - locationX;
          g.oy = pageY - locationY;
          g.mode = "none";
          g.paintTo = null;
          g.wrongAt = live.current.wrong ?? null;

          const at = cellAt(locationX, locationY, live.current.cell, live.current.n);
          g.last = at;
          if (!at) return;
          const { puzzle: p, marks: m, route: rt, phase: ph } = live.current;

          // Road first, and at any point in the board — a touch on the drawn
          // road (or on the entry, before there is one) pays road out under the
          // finger whether or not the deduction is finished. Once it *is*
          // finished there are no marks left to make, so any touch may extend
          // the road; before that only a touch on the road itself does, which is
          // what keeps the two gestures from fighting over the same square.
          if (ph === "connect" || (ph === "deduce" && grabsRoad(p, rt, at))) {
            g.mode = "route";
            // Taking hold of the road is not itself a move: putting a finger
            // down on a drawn cell leaves the road exactly where it is, and
            // only dragging back off it rubs anything out. A touch anywhere
            // else takes the step if it's a legal one.
            if (!rt.some((c) => same(c, at))) {
              const next = connectStep(p, m, rt, at);
              if (next) live.current.onRoute(next);
            }
            return;
          }
          if (ph !== "deduce") return;
          if (shownPiece(p, at.r, at.c) !== null) return; // a printed clue is fixed

          const before = markAt(m, p.size, at.r, at.c);
          const prev = lastTap.current;
          const now = Date.now();
          if (prev && prev.r === at.r && prev.c === at.c && now - prev.t < DOUBLE_TAP_MS) {
            lastTap.current = null;
            live.current.onClaim(at);
            return;
          }
          lastTap.current = { r: at.r, c: at.c, t: now };
          live.current.onTap(at);
          // A stroke continues whatever the first tap just did — and never
          // rubs out a claim, which is hard-won and easy to swipe over.
          g.mode = "paint";
          g.paintTo =
            before === MARK_NONE ? MARK_BLOCKED : before === MARK_BLOCKED ? MARK_NONE : null;
        },

        onPanResponderMove: (e, state) => {
          const g = gesture.current;
          if (g.mode === "none") return;
          const at = cellAt(
            state.moveX - g.ox,
            state.moveY - g.oy,
            live.current.cell,
            live.current.n,
          );
          if (!at || (g.last && same(at, g.last))) return;
          g.last = at;
          lastTap.current = null; // a stroke is not the first half of a double tap

          if (g.mode === "paint" && g.paintTo !== null) {
            live.current.onPaint(at, g.paintTo);
          } else if (g.mode === "route") {
            // A push that cost a heart ends the stroke. The road can claim as it
            // goes, and one careless flick shouldn't be able to spend all three
            // — being made to lift the finger is the pause that costs nothing
            // and stops a mistake from compounding.
            const w = live.current.wrong ?? null;
            if (w && w !== g.wrongAt) {
              g.mode = "none";
              return;
            }
            // While the finger is down the road's end follows it: dragging back
            // onto a cell the road already runs through winds it back to there,
            // and anything else pays more road out.
            const idx = live.current.route.findIndex((c) => same(c, at));
            if (idx >= 0) {
              if (idx < live.current.route.length - 1) {
                live.current.onRoute(live.current.route.slice(0, idx + 1));
              }
            } else {
              live.current.onPave(at);
            }
          }
        },

        onPanResponderRelease: () => {
          gesture.current.mode = "none";
          gesture.current.last = null;
        },
        onPanResponderTerminate: () => {
          gesture.current.mode = "none";
          gesture.current.last = null;
        },
      }),
    [],
  );

  // --- what to draw ---------------------------------------------------------
  const drawn = useMemo(() => routePieces(puzzle, route), [puzzle, route]);
  // A won board is read for one thing only, so it is lit for one thing only:
  // the finished route glows and everything the player wrote around it — their
  // ✕ notes, the clues they were counting — steps back out of its way.
  const celebrating = phase === "won";
  const onRoute = useMemo(() => new Set(route.map((c) => key(c.r, c.c))), [route]);
  // The lit cell is where the next road goes: the moving end of the drawn route,
  // or — before there is one — the entry, the only place a road may start. It is
  // lit from the first moment of the board, because that is when laying road
  // becomes possible; nothing is lit once the board is won and there is no next
  // step to point at.
  const head =
    phase === "won"
      ? null
      : route.length
        ? route[route.length - 1]
        : { r: puzzle.entry.r, c: puzzle.entry.c };

  const cells: React.ReactNode[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const k = key(r, c);
      const fixedPiece = shownPiece(puzzle, r, c);
      const laid = drawn.get(k) ?? null;
      const ghost = ghosts?.get(k) ?? null;
      const mark = markAt(marks, n, r, c);
      // The printed clue outranks everything: it is the same piece the road
      // would draw anyway, and it stays whole while the road's end rests on it.
      const piece = fixedPiece !== null ? fixedPiece : laid !== null ? laid : ghost;
      cells.push(
        <Cell
          key={k}
          size={cell}
          r={r}
          c={c}
          piece={piece}
          ghost={piece !== null && laid === null && fixedPiece === null}
          claimed={piece === null && mark === MARK_ROAD}
          blocked={mark === MARK_BLOCKED}
          glow={(head !== null && head.r === r && head.c === c) || (!!hint && hint.r === r && hint.c === c)}
          wrong={!!wrong && wrong.r === r && wrong.c === c}
          dim={celebrating && !onRoute.has(k)}
        />,
      );
    }
  }

  const lines: React.ReactNode[] = [];
  for (let i = 1; i < n; i++) {
    lines.push(
      <View key={`v${i}`} style={[styles.vLine, { left: i * cell, height: grid }]} />,
      <View key={`h${i}`} style={[styles.hLine, { top: i * cell, width: grid }]} />,
    );
  }

  return (
    <View style={[{ width: gutter + grid + frame * 2 }, NO_SELECT]}>
      {/* column clues */}
      <View style={[styles.row, { marginLeft: gutter + frame, height: gutter }]}>
        {puzzle.cols.map((clue, c) => (
          <Clue
            key={c}
            value={clue}
            done={colFound(puzzle, marks, c) >= clue}
            warn={lineOverCrossed(puzzle, marks, c, true)}
            size={cell}
            dim={celebrating}
          />
        ))}
      </View>

      <View style={styles.row}>
        {/* row clues */}
        <View style={{ width: gutter, marginTop: frame }}>
          {puzzle.rows.map((clue, r) => (
            <Clue
              key={r}
              value={clue}
              done={rowFound(puzzle, marks, r) >= clue}
              warn={lineOverCrossed(puzzle, marks, r, false)}
              size={cell}
              dim={celebrating}
              column
            />
          ))}
        </View>

        <View style={[styles.frame, { borderWidth: frame, borderRadius: radius.md }]}>
          <View style={{ width: grid, height: grid }} {...responder.panHandlers}>
            {lines}
            {/* Under the cells, so the road's own tarmac and verges stay on top
                of it and the light reads as coming from around the road rather
                than painted over it. */}
            {celebrating ? (
              <LitRoad puzzle={puzzle} route={route} cell={cell} grid={grid} />
            ) : null}
            {cells}
            <Terminal t={puzzle.entry} cell={cell} n={n} inward />
            <Terminal t={puzzle.exit} cell={cell} n={n} />
            {/* The start line goes once the car is away — there is nothing left
                to start. The finish flag stays put, so both ends say what they
                are with no instruction. */}
            {riding || phase === "won" ? null : <StartLine t={puzzle.entry} cell={cell} />}
            <FinishFlag t={puzzle.exit} cell={cell} />
            {riding ? <CarRide puzzle={puzzle} cell={cell} onDone={onRideDone} /> : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function cellAt(x: number, y: number, cell: number, n: number): Coord | null {
  if (cell <= 0) return null;
  const c = Math.floor(x / cell);
  const r = Math.floor(y / cell);
  if (r < 0 || c < 0 || r >= n || c >= n) return null;
  return { r, c };
}

function Clue({
  value,
  done,
  warn,
  size,
  dim,
  column,
}: {
  value: number;
  done: boolean;
  /** The player has ruled out too much of this line for the clue to be met. */
  warn?: boolean;
  size: number;
  /** The board is won — there is nothing left to count. */
  dim?: boolean;
  column?: boolean;
}) {
  return (
    <View style={[column ? { height: size } : { width: size }, styles.clue, dim && styles.dim]}>
      <Text
        style={{
          fontSize: Math.min(22, Math.max(13, size * 0.42)),
          fontWeight: "800",
          color: warn ? theme.danger : done ? theme.good : theme.textDim,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * The dark gate on the border where the road enters or leaves.
 *
 * Kept deliberately thin: it sits *over* the cell, and a chunky one buries the
 * piece underneath it — which is the piece the player most needs to read, since
 * it is one of the two the board gives away. The chevron points the way the
 * car travels (in at the entry, out at the exit) rather than simply off the
 * board, so the pair also answers "which end do I drag from".
 */
function Terminal({
  t,
  cell,
  n,
  inward,
}: {
  t: { r: number; c: number; dir: Dir };
  cell: number;
  n: number;
  inward?: boolean;
}) {
  const thick = Math.max(8, cell * 0.13);
  const long = cell * 0.58;
  const pad = (cell - long) / 2;
  const horizontal = t.dir === 1 || t.dir === 3;

  const box = horizontal
    ? {
        width: thick,
        height: long,
        top: t.r * cell + pad,
        left: t.dir === 3 ? 0 : n * cell - thick,
      }
    : {
        width: long,
        height: thick,
        left: t.c * cell + pad,
        top: t.dir === 0 ? 0 : n * cell - thick,
      };

  const point: Dir = inward ? (((t.dir + 2) % 4) as Dir) : t.dir;
  const a = thick * 0.62;
  const h = a * 0.62;
  const pts =
    point === 1
      ? `0,0 ${h},${a / 2} 0,${a}`
      : point === 3
        ? `${h},0 0,${a / 2} ${h},${a}`
        : point === 2
          ? `0,0 ${a / 2},${h} ${a},0`
          : `0,${h} ${a / 2},0 ${a},${h}`;

  return (
    <View pointerEvents="none" style={[styles.terminal, box, { borderRadius: thick * 0.5 }]}>
      <Svg width={horizontal ? h : a} height={horizontal ? a : h}>
        <Polygon points={pts} fill="#9DB3C9" />
      </Svg>
    </View>
  );
}

/**
 * The start line, painted across the tarmac where the road enters the board.
 *
 * A whole car parked here said "you start from this square" but *covered* the
 * printed piece while saying it — and that piece is one of the few facts the
 * board gives away, so it is the last thing worth burying. A line painted on the
 * road is flat: it sits inside the lane, states the same thing, and leaves the
 * shape underneath entirely readable. It also rhymes with the chequered flag at
 * the other end, so the two squares read as a pair.
 *
 * It is inset from the border rather than flush with it because the terminal tab
 * sits on that edge and would cover a line drawn under it.
 */
function StartLine({ t, cell }: { t: { r: number; c: number; dir: Dir }; cell: number }) {
  const across = ROAD_W * cell;
  const thick = Math.max(4, cell * 0.1);
  const inset = Math.max(8, cell * 0.15);
  const horizontal = t.dir === 1 || t.dir === 3;
  const w = horizontal ? thick : across;
  const h = horizontal ? across : thick;
  // Hard against the edge the road comes in by, one tab's width in.
  const left =
    t.c * cell + (t.dir === 3 ? inset : t.dir === 1 ? cell - inset - thick : (cell - w) / 2);
  const top =
    t.r * cell + (t.dir === 0 ? inset : t.dir === 2 ? cell - inset - thick : (cell - h) / 2);

  return (
    <View pointerEvents="none" style={{ position: "absolute", left, top }}>
      <Svg width={w} height={h}>
        {/* Solid, and across the lane rather than along it — the dashes already
            run the other way, so nothing else on the road looks like this. */}
        <Rect
          x={0}
          y={0}
          width={w}
          height={h}
          rx={Math.min(w, h) * 0.3}
          fill={theme.roadLine}
        />
      </Svg>
    </View>
  );
}

/** The chequered flag on the finish square. */
function FinishFlag({ t, cell }: { t: { r: number; c: number }; cell: number }) {
  const s = cell * 0.46;
  const pole = Math.max(1.5, s * 0.09);
  const sq = s / 4;
  const squares: React.ReactNode[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      squares.push(
        <Rect
          key={`${r}${c}`}
          x={pole + c * sq}
          y={r * sq}
          width={sq}
          height={sq}
          fill={(r + c) % 2 === 0 ? "#FFFFFF" : theme.frame}
        />,
      );
    }
  }
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: t.c * cell + (cell - s) / 2,
        top: t.r * cell + (cell - s) / 2,
      }}
    >
      <Svg width={s} height={s}>
        <Rect x={0} y={0} width={pole} height={s} rx={pole / 2} fill={theme.frame} />
        {squares}
      </Svg>
    </View>
  );
}

/**
 * The finished road, lit from underneath — to its own shape, and from one end to
 * the other.
 *
 * **Shape.** It traces `roadRun`, the very centreline the tarmac and the verges
 * are drawn as offsets of, so the light bends through every corner exactly as the
 * road does and the square it runs through is never mentioned. Filling whole
 * cells was the first try and it lit the *grid*: a staircase of blocks with the
 * road somewhere inside it, which is the one reading the board spends the whole
 * game teaching the player to stop making.
 *
 * **Growth.** The glow draws itself from the entry to the exit rather than
 * arriving all at once, because the road is a journey and a journey has a
 * direction — the same one the convoy is about to take. That is a dash the
 * length of the whole road, with its offset wound from full to nothing.
 *
 * Which is why the route is *one* path rather than one per cell: a dash pattern
 * restarts at every subpath and every element, so a light that runs the length
 * of the road has to be a single unbroken one. `roadRun` hands back relative
 * commands for exactly that reason. It pays off twice — the joins between cells
 * are now tangent-continuous (a straight meets an edge square on, and so does a
 * curve's end), so the glow has no seams in it at all, and the whole sweep costs
 * two animated props a frame instead of two per cell.
 *
 * Two passes, both wider than the road's own span, give the falloff a single
 * flat band can't: a faint wide one and a solid inner one, so the glow reads as
 * spilling off the verges rather than as a second road painted under the first.
 * Both stay inside the cell.
 *
 * Only once the light has arrived does the pulse take over — the one thing on
 * the board that ever moves by itself, and it says the board is over.
 */
const HALO = [
  { span: 0.98, opacity: 0.38 },
  { span: ROAD_SPAN + 0.12, opacity: 1 },
];

/** How fast the light travels: one pace, clamped so no board drags or blinks. */
const LIT_MS_PER_CELL = 45;
const LIT_MIN_MS = 800;
const LIT_MAX_MS = 1600;

const AnimatedPath = Animated.createAnimatedComponent(Path);

function LitRoad({
  puzzle,
  route,
  cell,
  grid,
}: {
  puzzle: Puzzle;
  route: Coord[];
  cell: number;
  grid: number;
}) {
  // The whole road as one unbroken line, in the order the car will drive it.
  const road = useMemo(() => {
    if (route.length === 0) return null;
    let d = "";
    let length = 0;
    for (let i = 0; i < route.length; i++) {
      const c = route[i];
      const back = i === 0 ? puzzle.entry.dir : dirBetween(c, route[i - 1]);
      const fwd = i === route.length - 1 ? puzzle.exit.dir : dirBetween(c, route[i + 1]);
      const run = roadRun(cell, back, fwd);
      if (i === 0) d = `M ${c.c * cell + run.start[0]},${c.r * cell + run.start[1]}`;
      d += ` ${run.step}`;
      length += run.length;
    }
    return { d, length };
  }, [puzzle, route, cell]);

  const grow = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    grow.setValue(0);
    pulse.setValue(1);
    let beat: Animated.CompositeAnimation | null = null;
    // The dash offset is not a transform or an opacity, so this one runs on the
    // JS thread — which is affordable at two paths and would not be at two a
    // cell. The pulse that follows it is native, and so is the confetti.
    const sweep = Animated.timing(grow, {
      toValue: 1,
      duration: Math.min(
        LIT_MAX_MS,
        Math.max(LIT_MIN_MS, (route.length || 1) * LIT_MS_PER_CELL),
      ),
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    sweep.start(({ finished }) => {
      if (!finished) return;
      beat = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 0,
            duration: 780,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 780,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      beat.start();
    });
    return () => {
      sweep.stop();
      beat?.stop();
    };
  }, [grow, pulse, route.length]);

  if (!road) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) },
      ]}
    >
      <Svg width={grid} height={grid}>
        {HALO.map((band, i) => (
          <AnimatedPath
            key={i}
            d={road.d}
            stroke={theme.roadLit}
            strokeWidth={band.span * cell}
            strokeOpacity={band.opacity}
            strokeLinecap="butt"
            // One dash as long as the road and one gap to match: wound fully
            // back the road is all gap, wound to nothing it is all dash.
            strokeDasharray={[road.length, road.length]}
            strokeDashoffset={grow.interpolate({
              inputRange: [0, 1],
              outputRange: [road.length, 0],
            })}
            fill="none"
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  dim: { opacity: 0.3 },
  clue: { alignItems: "center", justifyContent: "center" },
  frame: {
    borderColor: theme.frame,
    backgroundColor: theme.cell,
    overflow: "hidden",
  },
  vLine: { position: "absolute", top: 0, width: 1, backgroundColor: theme.grid },
  hLine: { position: "absolute", left: 0, height: 1, backgroundColor: theme.grid },
  terminal: { position: "absolute", backgroundColor: theme.frame },
});
