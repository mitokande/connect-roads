// Draws one piece of road inside a cell: grass verges, tarmac over them, then
// the dashed line down the middle.
//
// A piece is a bitmask of the edges it opens onto (see `src/game/types.ts`), and
// all six of them plus the four half-laid "stubs" come out of one geometry:
//
//   * two edges facing each other  → a straight run through the middle
//   * two edges meeting at a corner → a quarter circle centred on that corner,
//     radius half a cell, so its ends land exactly on the edge midpoints and
//     therefore exactly on the neighbouring piece's ends
//   * one edge only → a stub from that edge to the middle, which is what the
//     moving end of a drag looks like while the rest is still being drawn
//
// Everything else is that centreline offset sideways: the verges are it at
// ±VERGE_OFF, the kerbs at ±KERB_OFF, the dashes are it exactly. On a curve an
// offset is a concentric arc — a wider radius outside the bend, a tighter one
// inside — and each end slides along its edge by `k` so the offset still meets
// the cell border square, which is what makes two neighbouring pieces line up
// tarmac-to-tarmac and grass-to-grass with no seam.
//
// Caps are butt, never round: a rounded end would bulge past the cell edge and
// print a lip where two pieces meet.

import React from "react";
import Svg, { Circle, G, Path } from "react-native-svg";

import { bit, DIRS, hasDir, type Dir, type Piece } from "../game/types";
import { theme } from "../theme";

/**
 * All widths and offsets are fractions of the cell. The tarmac's width is
 * exported because anything painted *on* the road — the start line — has to be
 * exactly as wide as the road, and two constants would drift apart.
 */
export const ROAD_W = 0.44;
const VERGE_W = 0.15;
const VERGE_OFF = ROAD_W / 2 + VERGE_W / 2;
/** How far the tarmac's dark edge shows beyond the tarmac itself. */
const KERB = 0.03;
const LINE_W = 0.032;
/** Dash and gap down the middle of the road. */
const DASH = 0.15;
const GAP = 0.13;

/**
 * Below this the cell is too small for planting: bushes on a 40px square read as
 * smudges, and the road is what the player is trying to see.
 */
const BUSH_MIN_PX = 52;
const BUSH_R = 0.05;
/** Where things grow along a run, as fractions of it. */
const STRAIGHT_BUSHES = [0.26, 0.74];
const CURVE_BUSHES = [0.22, 0.78];
const STUB_BUSHES = [0.55];

type Point = [number, number];

/** The midpoint of the cell edge a direction points at. */
function edgeMid(d: Dir, s: number): Point {
  if (d === 0) return [s / 2, 0];
  if (d === 1) return [s, s / 2];
  if (d === 2) return [s / 2, s];
  return [0, s / 2];
}

/**
 * The shape of this piece, as everything the layers need: a path at any sideways
 * offset, and the point at any offset and any fraction along the run.
 */
type Geometry = {
  path: (off: number) => string;
  /**
   * The same run as `path`, but as a *relative* command with no move in front of
   * it — so runs from neighbouring cells can be strung into one continuous path
   * without knowing where either cell sits on the grid. The win's growing glow
   * needs that: a dash pattern restarts at every path element and every subpath,
   * so a light that draws itself along the whole road has to be one of each.
   */
  step: (off: number) => string;
  at: (off: number, t: number) => Point;
};

function straightGeometry(s: number, horizontal: boolean): Geometry {
  return {
    path: (off) => {
      const o = off * s;
      return horizontal
        ? `M 0,${s / 2 + o} L ${s},${s / 2 + o}`
        : `M ${s / 2 + o},0 L ${s / 2 + o},${s}`;
    },
    step: () => (horizontal ? `l ${s},0` : `l 0,${s}`),
    at: (off, t) => {
      const o = off * s;
      return horizontal ? [t * s, s / 2 + o] : [s / 2 + o, t * s];
    },
  };
}

function stubGeometry(s: number, d: Dir): Geometry {
  const m = edgeMid(d, s);
  const mid: Point = [s / 2, s / 2];
  const horizontal = d === 1 || d === 3;
  return {
    path: (off) => {
      const o = off * s;
      return horizontal
        ? `M ${m[0]},${s / 2 + o} L ${s / 2},${s / 2 + o}`
        : `M ${s / 2 + o},${m[1]} L ${s / 2 + o},${s / 2}`;
    },
    step: () =>
      horizontal ? `l ${mid[0] - m[0]},0` : `l 0,${mid[1] - m[1]}`,
    at: (off, t) => {
      const o = off * s;
      const x = m[0] + (mid[0] - m[0]) * t;
      const y = m[1] + (mid[1] - m[1]) * t;
      return horizontal ? [x, y + o] : [x + o, y];
    },
  };
}

function curveGeometry(s: number, piece: Piece, dirs: Dir[]): Geometry {
  const corner: Point = [hasDir(piece, 1) ? s : 0, hasDir(piece, 0) ? 0 : s];
  const [a, b] = dirs;
  const ma = edgeMid(a, s);
  const mb = edgeMid(b, s);
  const a1 = Math.atan2(ma[1] - corner[1], ma[0] - corner[0]);
  const a2 = Math.atan2(mb[1] - corner[1], mb[0] - corner[0]);
  // Shortest way round — the quarter, never the three-quarters.
  let sweep = a2 - a1;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;

  /** The arc at a given offset: where it starts, where it ends, and which way. */
  const ends = (off: number) => {
    const r = s / 2 + off * s;
    // Slide each end along its edge so the offset arc still meets the border.
    const k = 1 - (2 * r) / s;
    const p1: Point = [ma[0] + (corner[0] - ma[0]) * k, ma[1] + (corner[1] - ma[1]) * k];
    const p2: Point = [mb[0] + (corner[0] - mb[0]) * k, mb[1] + (corner[1] - mb[1]) * k];
    // Which way round the corner: the sign of the cross product, in a y-down
    // space, is exactly SVG's sweep flag.
    const cross =
      (p1[0] - corner[0]) * (p2[1] - corner[1]) - (p1[1] - corner[1]) * (p2[0] - corner[0]);
    return { r, p1, p2, sweep: cross > 0 ? 1 : 0 };
  };

  return {
    path: (off) => {
      const { r, p1, p2, sweep } = ends(off);
      return `M ${p1[0]},${p1[1]} A ${r},${r} 0 0 ${sweep} ${p2[0]},${p2[1]}`;
    },
    step: (off) => {
      const { r, p1, p2, sweep } = ends(off);
      return `a ${r},${r} 0 0 ${sweep} ${p2[0] - p1[0]},${p2[1] - p1[1]}`;
    },
    at: (off, t) => {
      const r = s / 2 + off * s;
      const ang = a1 + sweep * t;
      return [corner[0] + r * Math.cos(ang), corner[1] + r * Math.sin(ang)];
    },
  };
}

/**
 * Which of the three shapes this piece is, and the geometry that draws it.
 *
 * Split out of `RoadPiece` because the win lights the road by *tracing* it, and
 * a second copy of "is this a straight, a curve or a stub" would be a second
 * chance to disagree with the road it is supposed to be hugging.
 */
function geometryFor(s: number, piece: Piece) {
  if (!piece) return null;
  const dirs = DIRS.filter((d) => hasDir(piece, d));
  const kind =
    dirs.length === 1 ? "stub" : (dirs[0] + 2) % 4 === dirs[1] ? "straight" : "curve";
  const geo =
    kind === "stub"
      ? stubGeometry(s, dirs[0])
      : kind === "straight"
        ? straightGeometry(s, hasDir(piece, 1))
        : curveGeometry(s, piece, dirs);
  return { kind, geo };
}

/** One cell of the road's centreline, taken in the direction of travel. */
export type RoadRun = {
  /** Where the road crosses into the cell, in cell-local px. */
  start: Point;
  /** How to draw onward from there — relative, so it can follow any current point. */
  step: string;
  /** How long that is in px, which is what a dash pattern has to be measured in. */
  length: number;
};

/**
 * The road's centreline through one cell — the line the tarmac, the kerbs, the
 * dashes and the verges are all offsets of — from the edge the road arrives at
 * to the edge it leaves by. Anything that wants to follow the *shape* of the
 * road rather than the square it sits in traces this.
 *
 * In travel order, and relative, because the caller is stringing a whole route
 * together: `piece` alone can't say which way round its two edges are used, and
 * the road only has a start and a finish once you know which way the car goes.
 */
export function roadRun(s: number, from: Dir, to: Dir): RoadRun {
  const a = edgeMid(from, s);
  const b = edgeMid(to, s);
  if ((from + 2) % 4 === to) {
    // A straight is the line between the two edge midpoints, which is exactly
    // `straightGeometry` at no offset — written out here only because a run has
    // a direction and that geometry doesn't.
    return { start: a, step: `l ${b[0] - a[0]},${b[1] - a[1]}`, length: s };
  }
  const mask = (bit(from) | bit(to)) as Piece;
  return {
    start: a,
    step: curveGeometry(s, mask, [from, to]).step(0),
    // A quarter of a circle of radius half a cell — see the header.
    length: (Math.PI / 4) * s,
  };
}

/**
 * How much of a cell the road actually covers, verges included. Exported for the
 * same reason as `ROAD_W`: a halo drawn around the road has to be measured from
 * the road, not from a number that happens to look right today.
 */
export const ROAD_SPAN = ROAD_W + VERGE_W * 2;

export type RoadPieceProps = {
  /** Cell size in px. */
  size: number;
  /** Edge mask: two bits for a whole piece, one for a half-laid stub. */
  piece: Piece;
};

export function RoadPiece({ size: s, piece }: RoadPieceProps) {
  const shape = geometryFor(s, piece);
  if (!shape) return null;
  const { kind, geo } = shape;

  const bushAt =
    kind === "stub" ? STUB_BUSHES : kind === "straight" ? STRAIGHT_BUSHES : CURVE_BUSHES;
  const planted = s >= BUSH_MIN_PX;

  return (
    <Svg width={s} height={s} pointerEvents="none">
      <G>
        {[-VERGE_OFF, VERGE_OFF].map((off, i) => (
          <Path
            key={`verge${i}`}
            d={geo.path(off)}
            stroke={theme.verge}
            strokeWidth={VERGE_W * s}
            fill="none"
          />
        ))}
        {planted
          ? [-VERGE_OFF, VERGE_OFF].flatMap((off, i) =>
              bushAt.map((t, j) => {
                const [cx, cy] = geo.at(off, t);
                const r = BUSH_R * s;
                // One shrub, and a bloom beside every other one — enough to look
                // planted rather than stamped.
                return (
                  <G key={`bush${i}-${j}`}>
                    <Circle cx={cx - r * 0.5} cy={cy} r={r * 0.78} fill={theme.bush} />
                    <Circle cx={cx + r * 0.45} cy={cy + r * 0.2} r={r * 0.62} fill={theme.bush} />
                    <Circle cx={cx} cy={cy - r * 0.5} r={r * 0.7} fill={theme.vergeDeep} />
                    {(i + j) % 2 === 0 ? (
                      <Circle cx={cx + r * 1.15} cy={cy - r * 0.85} r={r * 0.24} fill={theme.bloom} />
                    ) : null}
                  </G>
                );
              }),
            )
          : null}
        <Path
          d={geo.path(0)}
          stroke={theme.asphaltEdge}
          strokeWidth={(ROAD_W + KERB) * s}
          fill="none"
        />
        <Path d={geo.path(0)} stroke={theme.asphalt} strokeWidth={ROAD_W * s} fill="none" />
        <Path
          d={geo.path(0)}
          stroke={theme.roadLine}
          strokeWidth={LINE_W * s}
          strokeDasharray={`${DASH * s},${GAP * s}`}
          strokeLinecap="butt"
          fill="none"
        />
      </G>
    </Svg>
  );
}
