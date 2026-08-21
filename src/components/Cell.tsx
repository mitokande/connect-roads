// One square of the board. Draws whatever the cell currently is: bare, crossed
// out, claimed-but-unpaved, or a piece of road.
//
// The claim glyph is worth a word. A double tap means "there is road here" —
// which in this puzzle is knowledge you can have long before you know *which*
// piece it is. So it draws four stubs of tarmac poking in from the four edges
// with a ? between them: road passes through, shape unknown. Replacing it with
// the real piece is the second half of the game.
//
// A square holding a drawn piece keeps the board's own white behind it: the road
// brings its own grass and kerbs, and a tint under that would fight them. The
// cooler shade is for a claim that has no road on it yet, where being able to
// see at a glance which squares are settled is the whole point.

import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Line, Path, Rect, Text as SvgText } from "react-native-svg";

import type { Piece } from "../game/types";
import { theme } from "../theme";
import { RoadPiece } from "./RoadPiece";

export type CellProps = {
  size: number;
  r: number;
  c: number;
  /** The piece to draw, if any: a fixed clue, or one the player has laid. */
  piece: Piece | null;
  /** Draw `piece` dimmed — the shape hint. */
  ghost?: boolean;
  claimed: boolean;
  /** Crossed out — always by the player; the board never crosses anything out. */
  blocked: boolean;
  /** The moving end of the route, or the cell a hint is pointing at. */
  glow?: boolean;
  wrong?: boolean;
  /**
   * Pushed into the background. Only the win uses it: once the board is over,
   * the route is the only thing worth reading and the player's own notes have
   * done their job, so they fade back rather than being cleared — the board
   * they solved is still there to look at, just no longer competing.
   */
  dim?: boolean;
};

function CellView({ size, r, c, piece, ghost, claimed, blocked, glow, wrong, dim }: CellProps) {
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
          opacity: dim ? 0.3 : 1,
          backgroundColor: wrong
            ? "#FDE4E1"
            : glow
              ? theme.cellHot
              : claimed && piece === null
                ? theme.cellRoad
                : "transparent",
        },
      ]}
    >
      {piece !== null ? (
        <RoadPiece size={size} piece={piece} faded={ghost} />
      ) : claimed ? (
        <ClaimGlyph size={size} />
      ) : blocked ? (
        <CrossGlyph size={size} />
      ) : null}
    </View>
  );
}

/** "Road runs through here, shape unknown." */
function ClaimGlyph({ size: s }: { size: number }) {
  const stub = s * 0.17;
  const w = Math.max(2, s * 0.11);
  const box = s * 0.5;
  return (
    <Svg width={s} height={s}>
      {/* tarmac poking in from each edge */}
      <Line x1={s / 2} y1={0} x2={s / 2} y2={stub} stroke={theme.asphalt} strokeWidth={w} opacity={0.4} />
      <Line x1={s / 2} y1={s} x2={s / 2} y2={s - stub} stroke={theme.asphalt} strokeWidth={w} opacity={0.4} />
      <Line x1={0} y1={s / 2} x2={stub} y2={s / 2} stroke={theme.asphalt} strokeWidth={w} opacity={0.4} />
      <Line x1={s} y1={s / 2} x2={s - stub} y2={s / 2} stroke={theme.asphalt} strokeWidth={w} opacity={0.4} />
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

function CrossGlyph({ size: s }: { size: number }) {
  const a = s * 0.3;
  const b = s * 0.7;
  const w = Math.max(2.5, s * 0.1);
  return (
    <Svg width={s} height={s}>
      <Path
        d={`M ${a},${a} L ${b},${b} M ${b},${a} L ${a},${b}`}
        stroke={theme.mark}
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
