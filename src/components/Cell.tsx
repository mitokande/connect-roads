// One square of the board. Draws whatever the cell currently is: bare, crossed
// out, claimed-but-unshaped, or a piece of railway.
//
// The claim glyph is worth a word. A double tap means "there is track here" —
// which in this puzzle is knowledge you can have long before you know *which*
// piece it is. So it draws four rail ends poking in from the four edges with a
// ? between them: track passes through, shape unknown. Replacing it with the
// real piece is the second half of the game.
//
// Backgrounds are transparent for a bare cell so the grid's hairlines show
// through, and opaque for a claimed one so they don't — which is what makes
// found track read as a solid ribbon across the board rather than as a set of
// separately shaded squares.

import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Line, Path, Rect, Text as SvgText } from "react-native-svg";

import type { Piece } from "../game/types";
import { theme } from "../theme";
import { TrackPiece } from "./TrackPiece";

export type CellProps = {
  size: number;
  r: number;
  c: number;
  /** The piece to draw, if any: a fixed clue, or one the player has laid. */
  piece: Piece | null;
  /** Draw `piece` dimmed — the shape hint. */
  ghost?: boolean;
  claimed: boolean;
  blocked: boolean;
  /** Crossed out by the board rather than by the player. */
  auto: boolean;
  /** The moving end of the route, or the cell a hint is pointing at. */
  glow?: boolean;
  wrong?: boolean;
};

function CellView({ size, r, c, piece, ghost, claimed, blocked, auto, glow, wrong }: CellProps) {
  const shaded = claimed || piece !== null;

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
          backgroundColor: wrong
            ? "#FDE4E1"
            : glow
              ? theme.cellHot
              : shaded
                ? theme.cellTrack
                : "transparent",
        },
      ]}
    >
      {piece !== null ? (
        <TrackPiece size={size} piece={piece} faded={ghost} />
      ) : claimed ? (
        <ClaimGlyph size={size} />
      ) : blocked || auto ? (
        <CrossGlyph size={size} color={auto ? theme.markAuto : theme.mark} />
      ) : null}
    </View>
  );
}

/** "Track runs through here, shape unknown." */
function ClaimGlyph({ size: s }: { size: number }) {
  const stub = s * 0.17;
  const w = Math.max(2, s * 0.075);
  const box = s * 0.5;
  return (
    <Svg width={s} height={s}>
      {/* rail ends poking in from each edge */}
      <Line x1={s / 2} y1={0} x2={s / 2} y2={stub} stroke={theme.rail} strokeWidth={w} opacity={0.5} />
      <Line x1={s / 2} y1={s} x2={s / 2} y2={s - stub} stroke={theme.rail} strokeWidth={w} opacity={0.5} />
      <Line x1={0} y1={s / 2} x2={stub} y2={s / 2} stroke={theme.rail} strokeWidth={w} opacity={0.5} />
      <Line x1={s} y1={s / 2} x2={s - stub} y2={s / 2} stroke={theme.rail} strokeWidth={w} opacity={0.5} />
      <Rect
        x={(s - box) / 2}
        y={(s - box) / 2}
        width={box}
        height={box}
        rx={box * 0.28}
        fill={theme.guessFill}
        stroke={theme.guess}
        strokeWidth={Math.max(1.5, s * 0.035)}
      />
      <SvgText
        x={s / 2}
        y={s / 2 + box * 0.29}
        fontSize={box * 0.82}
        fontWeight="bold"
        fill={theme.guess}
        textAnchor="middle"
      >
        ?
      </SvgText>
    </Svg>
  );
}

function CrossGlyph({ size: s, color }: { size: number; color: string }) {
  const a = s * 0.3;
  const b = s * 0.7;
  const w = Math.max(2.5, s * 0.1);
  return (
    <Svg width={s} height={s}>
      <Path
        d={`M ${a},${a} L ${b},${b} M ${b},${a} L ${a},${b}`}
        stroke={color}
        strokeWidth={w}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  cell: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});

export const Cell = React.memo(CellView);
