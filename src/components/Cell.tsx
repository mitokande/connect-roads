// One square of the board. Draws whatever the cell currently is: bare lawn,
// crossed out, claimed-but-unpaved, a piece of road — or, once the board is won
// and the square has proved to be empty, a bit of the town that grows there.
//
// The claim glyph is worth a word. A double tap means "there is road here" —
// which in this puzzle is knowledge you can have long before you know *which*
// piece it is. So a claim is drawn as road works — fresh tarmac, taped off,
// reaching out to its neighbours: road passes through here, but nothing on it
// says which way yet. Replacing it with the real piece is the second half of
// the game.
//
// The lawn itself is not drawn here: `Board` paints the whole mown checker in
// one layer underneath, so a bare cell costs nothing but a transparent view.

import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from "react-native-svg";

import type { RegionId } from "../game/levels";
import { hasDir, type Piece } from "../game/types";
import { theme } from "../theme";
import { EDGE_DARK, RoadPiece } from "./RoadPiece";
import { sceneryKind, TownArt, townHash, townKind, TownGrow } from "./Town";

export type CellProps = {
  size: number;
  r: number;
  c: number;
  /** The piece to draw, if any: a fixed clue, or one the player has laid. */
  piece: Piece | null;
  claimed: boolean;
  /**
   * For a claimed square: the sides (a direction mask) the road could still
   * leave it by, each drawn as a neck of unpainted road out to the cell's edge.
   * All four unless the board says otherwise — see `claimWays` in `Board`.
   */
  ways?: number;
  /** Crossed out — by the player, or by the board sweeping a full line. */
  blocked: boolean;
  /** The moving end of the route, or the cell a hint is pointing at. */
  glow?: boolean;
  wrong?: boolean;
  /**
   * The board is won and this square is off the route: build on it. The win
   * crosses out every square the road missed (they are proved empty by then),
   * and a finished town says the same thing more happily than a sheet of ✕.
   * `delay` staggers the building so it spreads out from the road.
   */
  town?: boolean;
  delay?: number;
  seed?: number;
  /** Which region's town grows here (`TOWNS`). */
  region?: RegionId;
  /**
   * Printed scenery — a rock, pines, a lake — known empty from the start. It is
   * drawn over everything else: no mark can land on it, and the town grows round
   * it rather than on it.
   */
  scenery?: boolean;
};

function CellView({ size, r, c, piece, claimed, ways, blocked, glow, wrong, town, delay, seed, region, scenery }: CellProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.cell,
        {
          width: size,
          height: size,
          left: c * size,
          top: r * size,
          backgroundColor: wrong ? theme.cellWrong : glow ? theme.cellHot : "transparent",
        },
      ]}
    >
      {scenery ? (
        <TownArt size={size} kind={sceneryKind(townHash(r, c, (seed ?? 0) + 3))} h={townHash(c, r, seed ?? 0)} />
      ) : town ? (
        <TownGrow
          size={size}
          kind={townKind(region ?? "village", townHash(r, c, seed ?? 0))}
          h={townHash(c, r, (seed ?? 0) + 7)}
          delay={delay ?? 0}
        />
      ) : piece !== null ? (
        <RoadPiece size={size} piece={piece} />
      ) : claimed ? (
        <ClaimGlyph size={size} ways={ways} />
      ) : blocked ? (
        <CrossGlyph size={size} />
      ) : null}
    </View>
  );
}

/**
 * Where the aggregate shows in a claim's fresh tarmac, as offsets from the
 * middle in units of the patch it is scattered over, and whether it is a pale
 * stone or a dark one.
 */
const GRIT: readonly (readonly [number, number, boolean])[] = [
  [-0.6, -0.7, true], [0.2, -0.8, false], [0.75, -0.45, true], [-0.2, -0.3, false],
  [0.45, 0, true], [-0.75, 0.1, false], [0.05, 0.35, true], [0.7, 0.6, false],
  [-0.45, 0.65, true], [-0.05, 0.8, false], [0.35, -0.3, false], [-0.4, -0.05, true],
];

/**
 * How wide a claim's necks are, tarmac only, as a fraction of the cell. Well
 * short of the road's own `ROAD_W`: a neck says the road *may* leave this way,
 * and at full width four of them are a crossroads, and a board of claims fuses
 * into one car park.
 */
const NECK_W = 0.26;
/**
 * The works tape standing where the kerb will go. A shade wider than the road's
 * own kerb (0.06): any narrower and the stripes blur into a brown edge on an 8×8.
 */
const TAPE_W = 0.075;
/**
 * Yellow-and-black repeats across one cell, counted along its edge. Whole, so a
 * cell's stripes end exactly where its neighbour's begin and two claims' tape
 * runs on unbroken where their necks meet.
 */
const TAPE_STRIPES = 5;

/**
 * "Road runs through here, shape unknown": road works. A square of fresh tarmac,
 * taped off in yellow and black, with a neck of the same works reaching out to
 * each side the road could be joined from.
 *
 * It is the road's own build-up — tarmac on the road's dark hairline — with the
 * finish still to come: no kerb stones yet, only the tape where they will go, and
 * none of the road's paint, because the white edge lines and the yellow dashes are
 * what say which way a road goes, and that is exactly what isn't known. The tarmac
 * is fresh, a shade paler than the finished road's and with its stones still
 * showing. So the moment the real piece replaces it is the works being finished:
 * the tape comes down, the kerbs go in, the lines are painted.
 *
 * The necks are the other half: a claim is a square the road will pass *through*,
 * so it reaches for its neighbours. They run right to the cell's edge, so two
 * claims side by side meet neck to neck and a printed piece that turns this way
 * plugs straight in — which is what makes a run of claims read as road waiting to
 * be joined up rather than as a row of tiles.
 *
 * A claim is the one checked mark on the board, so nothing on it may look
 * doubtful: only its *shape* is still to come.
 */
export function ClaimGlyph({ size: s, ways = 15 }: { size: number; ways?: number }) {
  const inset = s * 0.1;
  const rx = s * 0.2;
  const tape = TAPE_W * s;
  const neck = (NECK_W / 2 + TAPE_W) * s;
  // A neck starts at the cell's edge and runs in past the tile's rounded corner,
  // so the two fuse into one outline.
  const reach = inset + rx;
  /**
   * The tile and its necks as one shape, `d` in from the outside: every layer is
   * drawn whole before the next, as `RoadPiece` lays kerb before tarmac, which is
   * what fuses them without a seam.
   */
  const layer = (d: number, fill: string) => {
    const w = neck - d;
    const mid = s / 2 - w;
    return (
      <G fill={fill}>
        {hasDir(ways, 0) ? <Rect x={mid} y={0} width={w * 2} height={reach} /> : null}
        {hasDir(ways, 1) ? <Rect x={s - reach} y={mid} width={reach} height={w * 2} /> : null}
        {hasDir(ways, 2) ? <Rect x={mid} y={s - reach} width={w * 2} height={reach} /> : null}
        {hasDir(ways, 3) ? <Rect x={0} y={mid} width={reach} height={w * 2} /> : null}
        <Rect
          x={inset + d}
          y={inset + d}
          width={s - (inset + d) * 2}
          height={s - (inset + d) * 2}
          rx={Math.max(0, rx - d)}
        />
      </G>
    );
  };
  // One stripe pattern per cell size. Every claim on a board is the same size and
  // so defines the same pattern, which matters on the web, where an id is looked
  // up across the whole page and the first one found wins.
  const stripes = `works-${Math.round(s * 10)}`;
  // Turned 45°, a repeat of `r` recurs every r·√2 along either axis.
  const repeat = s / (TAPE_STRIPES * Math.SQRT2);
  const spread = s * 0.28;
  const grit = Math.max(0.8, s * 0.018);
  return (
    <Svg width={s} height={s}>
      <Defs>
        <Pattern
          id={stripes}
          patternUnits="userSpaceOnUse"
          width={repeat}
          height={repeat}
          patternTransform="rotate(45)"
        >
          <Rect width={repeat} height={repeat} fill={theme.tape} />
          <Rect width={repeat / 2} height={repeat} fill={theme.tapeStripe} />
        </Pattern>
      </Defs>
      {layer(-1, theme.tapeEdge)}
      {layer(0, `url(#${stripes})`)}
      {layer(tape - (EDGE_DARK * s) / 2, theme.asphaltEdge)}
      {layer(tape, theme.asphaltFresh)}
      {GRIT.map(([u, v, pale], i) => (
        <Circle
          key={i}
          cx={s / 2 + u * spread}
          cy={s / 2 + v * spread}
          r={grit}
          fill={pale ? theme.gritLight : theme.gritDark}
        />
      ))}
    </Svg>
  );
}

/** The player's note: a chalky ✕ with a shadow, so it stands off the lawn. */
export function CrossGlyph({ size: s }: { size: number }) {
  const a = s * 0.32;
  const b = s * 0.68;
  const w = Math.max(2.5, s * 0.1);
  const d = `M ${a},${a} L ${b},${b} M ${b},${a} L ${a},${b}`;
  const o = Math.max(1, s * 0.025);
  return (
    <Svg width={s} height={s}>
      <Path d={d} stroke={theme.markShadow} strokeWidth={w} strokeLinecap="round" opacity={0.5} transform={`translate(${o},${o})`} />
      <Path d={d} stroke={theme.mark} strokeWidth={w} strokeLinecap="round" />
    </Svg>
  );
}

// --- the town ---------------------------------------------------------------

const styles = StyleSheet.create({
  cell: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});

export const Cell = React.memo(CellView);
