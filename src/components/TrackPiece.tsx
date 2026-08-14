// Draws one piece of railway inside a cell: sleepers first, rails over them.
//
// A piece is a bitmask of the edges it opens onto (see `src/game/types.ts`), and
// all six of them plus the four half-laid "stubs" come out of the same geometry:
//
//   * two edges facing each other  → a straight run through the middle
//   * two edges meeting at a corner → a quarter circle centred on that corner,
//     radius half a cell, so its ends land exactly on the edge midpoints and
//     therefore exactly on the neighbouring piece's ends
//   * one edge only → a stub from that edge to the middle, which is what the
//     moving end of a drag looks like while the rest is still being drawn
//
// Rails are the centreline offset by ±RAIL_GAP, which for the curve means two
// concentric arcs — the outer one longer than the inner, exactly as real track
// is. Sleepers sit perpendicular to travel: rotated to the polar angle on a
// curve, axis-aligned on a straight.

import React from "react";
import Svg, { G, Path, Rect } from "react-native-svg";

import { DIRS, hasDir, type Dir, type Piece } from "../game/types";
import { theme } from "../theme";

/** Distance from the centreline to each rail, as a fraction of the cell. */
const RAIL_GAP = 0.185;
const RAIL_W = 0.062;
const SLEEPER_LEN = 0.63;
const SLEEPER_W = 0.15;
/** Where sleepers sit along a straight run / a curve, as fractions of it. */
const STRAIGHT_TIES = [0.27, 0.73];
const CURVE_TIES = [0.16, 0.5, 0.84];
const STUB_TIES = [0.5];

type Point = [number, number];

/** The midpoint of the cell edge a direction points at. */
function edgeMid(d: Dir, s: number): Point {
  if (d === 0) return [s / 2, 0];
  if (d === 1) return [s, s / 2];
  if (d === 2) return [s / 2, s];
  return [0, s / 2];
}

const deg = (rad: number) => (rad * 180) / Math.PI;

export type TrackPieceProps = {
  /** Cell size in px. */
  size: number;
  /** Edge mask: two bits for a whole piece, one for a half-laid stub. */
  piece: Piece;
  /** Dim the whole thing — used for hints and for the solution peek. */
  faded?: boolean;
};

export function TrackPiece({ size: s, piece, faded }: TrackPieceProps) {
  if (!piece) return null;

  const dirs = DIRS.filter((d) => hasDir(piece, d));
  const railW = RAIL_W * s;
  const tieLen = SLEEPER_LEN * s;
  const tieW = SLEEPER_W * s;
  const gap = RAIL_GAP * s;
  const opacity = faded ? 0.35 : 1;

  const rails: string[] = [];
  /** [cx, cy, rotation in degrees] per sleeper. */
  const ties: [number, number, number][] = [];

  if (dirs.length === 2 && (dirs[0] + 2) % 4 === dirs[1]) {
    // --- straight ---------------------------------------------------------
    const horizontal = hasDir(piece, 1);
    for (const off of [-gap, gap]) {
      rails.push(
        horizontal
          ? `M 0,${s / 2 + off} L ${s},${s / 2 + off}`
          : `M ${s / 2 + off},0 L ${s / 2 + off},${s}`,
      );
    }
    for (const t of STRAIGHT_TIES) {
      ties.push(horizontal ? [t * s, s / 2, 90] : [s / 2, t * s, 0]);
    }
  } else if (dirs.length === 2) {
    // --- curve ------------------------------------------------------------
    const corner: Point = [hasDir(piece, 1) ? s : 0, hasDir(piece, 0) ? 0 : s];
    const [a, b] = dirs;
    const ma = edgeMid(a, s);
    const mb = edgeMid(b, s);

    for (const off of [-gap, gap]) {
      const r = s / 2 + off;
      // Slide each end along its edge so the rail meets the neighbour's rail.
      const k = 1 - (2 * r) / s;
      const p1: Point = [ma[0] + (corner[0] - ma[0]) * k, ma[1] + (corner[1] - ma[1]) * k];
      const p2: Point = [mb[0] + (corner[0] - mb[0]) * k, mb[1] + (corner[1] - mb[1]) * k];
      // Which way round the corner: the sign of the cross product, in a
      // y-down space, is exactly SVG's sweep flag.
      const cross =
        (p1[0] - corner[0]) * (p2[1] - corner[1]) - (p1[1] - corner[1]) * (p2[0] - corner[0]);
      rails.push(
        `M ${p1[0]},${p1[1]} A ${r},${r} 0 0 ${cross > 0 ? 1 : 0} ${p2[0]},${p2[1]}`,
      );
    }

    const a1 = Math.atan2(ma[1] - corner[1], ma[0] - corner[0]);
    const a2 = Math.atan2(mb[1] - corner[1], mb[0] - corner[0]);
    // Shortest way round — the quarter, never the three-quarters.
    let sweep = a2 - a1;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    for (const t of CURVE_TIES) {
      const ang = a1 + sweep * t;
      ties.push([
        corner[0] + (s / 2) * Math.cos(ang),
        corner[1] + (s / 2) * Math.sin(ang),
        deg(ang),
      ]);
    }
  } else {
    // --- stub: the rail being paid out under the finger --------------------
    const d = dirs[0];
    const m = edgeMid(d, s);
    const horizontal = d === 1 || d === 3;
    for (const off of [-gap, gap]) {
      rails.push(
        horizontal
          ? `M ${m[0]},${s / 2 + off} L ${s / 2},${s / 2 + off}`
          : `M ${s / 2 + off},${m[1]} L ${s / 2 + off},${s / 2}`,
      );
    }
    for (const t of STUB_TIES) {
      const cx = m[0] + (s / 2 - m[0]) * t;
      const cy = m[1] + (s / 2 - m[1]) * t;
      ties.push([cx, cy, horizontal ? 90 : 0]);
    }
  }

  return (
    <Svg width={s} height={s} pointerEvents="none">
      <G opacity={opacity}>
        {ties.map(([cx, cy, rot], i) => (
          <G key={`tie${i}`} transform={`translate(${cx}, ${cy}) rotate(${rot})`}>
            <Rect
              x={-tieLen / 2}
              y={-tieW / 2}
              width={tieLen}
              height={tieW}
              rx={tieW * 0.35}
              fill={theme.sleeper}
              stroke={theme.sleeperEdge}
              strokeWidth={Math.max(0.5, s * 0.008)}
            />
          </G>
        ))}
        {rails.map((d, i) => (
          <Path
            key={`rail${i}`}
            d={d}
            stroke={theme.rail}
            strokeWidth={railW}
            strokeLinecap="round"
            fill="none"
          />
        ))}
      </G>
    </Svg>
  );
}
