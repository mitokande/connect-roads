// One square of the board. Draws whatever the cell currently is: bare lawn,
// crossed out, claimed-but-unpaved, a piece of road — or, once the board is won
// and the square has proved to be empty, a bit of the town that grows there.
//
// The claim glyph is worth a word. A double tap means "there is road here" —
// which in this puzzle is knowledge you can have long before you know *which*
// piece it is. So a claim is drawn as a graded plot of earth with the road
// poking in from all four edges and a road-works sign with a ? on it: road
// passes through, shape unknown. Replacing it with the real piece is the second
// half of the game.
//
// The lawn itself is not drawn here: `Board` paints the whole mown checker in
// one layer underneath, so a bare cell costs nothing but a transparent view.

import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path, Rect, Text as SvgText } from "react-native-svg";

import type { RegionId } from "../game/levels";
import type { Piece } from "../game/types";
import { font, theme } from "../theme";
import { RoadPiece } from "./RoadPiece";
import { sceneryKind, TownArt, townHash, townKind, TownGrow } from "./Town";

export type CellProps = {
  size: number;
  r: number;
  c: number;
  /** The piece to draw, if any: a fixed clue, or one the player has laid. */
  piece: Piece | null;
  claimed: boolean;
  /** Crossed out — always by the player; the board never crosses anything out. */
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

function CellView({ size, r, c, piece, claimed, blocked, glow, wrong, town, delay, seed, region, scenery }: CellProps) {
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
        <ClaimGlyph size={size} />
      ) : blocked ? (
        <CrossGlyph size={size} />
      ) : null}
    </View>
  );
}

/** "Road runs through here, shape unknown": a pegged-out plot and a sign. */
export function ClaimGlyph({ size: s }: { size: number }) {
  const inset = s * 0.11;
  const stub = inset + 1;
  const w = s * 0.26;
  const sign = s * 0.25;
  const cx = s / 2;
  const cy = s / 2;
  return (
    <Svg width={s} height={s}>
      {/* road ends poking in from each edge as far as the plot, so two claims
          side by side already look as if they could join */}
      <Rect x={cx - w / 2} y={0} width={w} height={stub} fill={theme.asphalt} />
      <Rect x={cx - w / 2} y={s - stub} width={w} height={stub} fill={theme.asphalt} />
      <Rect x={0} y={cy - w / 2} width={stub} height={w} fill={theme.asphalt} />
      <Rect x={s - stub} y={cy - w / 2} width={stub} height={w} fill={theme.asphalt} />
      <Rect
        x={inset}
        y={inset}
        width={s - inset * 2}
        height={s - inset * 2}
        rx={s * 0.16}
        fill={theme.dirt}
        stroke={theme.dirtDark}
        strokeWidth={Math.max(1, s * 0.025)}
      />
      {/* a few pebbles, so it reads as earth rather than as a beige tile */}
      <Circle cx={s * 0.27} cy={s * 0.3} r={s * 0.025} fill={theme.dirtPebble} />
      <Circle cx={s * 0.72} cy={s * 0.74} r={s * 0.03} fill={theme.dirtPebble} />
      <Circle cx={s * 0.3} cy={s * 0.7} r={s * 0.02} fill={theme.dirtPebble} />
      {/* the road-works sign */}
      <Path
        d={`M ${cx},${cy - sign} L ${cx + sign},${cy} L ${cx},${cy + sign} L ${cx - sign},${cy} Z`}
        fill={theme.sign}
        stroke={theme.signEdge}
        strokeWidth={Math.max(1.2, s * 0.03)}
        strokeLinejoin="round"
      />
      <SvgText
        x={cx}
        y={cy + sign * 0.36}
        fontSize={sign * 1.05}
        fontFamily={font.bold}
        fontWeight="bold"
        fill={theme.signEdge}
        textAnchor="middle"
      >
        ?
      </SvgText>
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
