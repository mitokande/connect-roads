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

import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from "react-native-svg";

import type { Piece } from "../game/types";
import { sound } from "../sound";
import { font, theme } from "../theme";
import { RoadPiece } from "./RoadPiece";

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
};

function CellView({ size, r, c, piece, claimed, blocked, glow, wrong, town, delay, seed }: CellProps) {
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
      {town ? (
        <Town size={size} r={r} c={c} seed={seed ?? 0} delay={delay ?? 0} />
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

/** A tiny deterministic hash, so the same won board always builds the same town. */
function hash(r: number, c: number, seed: number) {
  let h = (r * 73856093) ^ (c * 19349663) ^ (seed * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** A town square with no entrance animation — for scenery outside the board. */
export function TownArt({ size: s, kind, h }: { size: number; kind: "house" | "trees" | "pond" | "garden"; h: number }) {
  return (
    <Svg width={s} height={s}>
      {kind === "house" ? (
        <House s={s} h={h} />
      ) : kind === "trees" ? (
        <Trees s={s} h={h} />
      ) : kind === "pond" ? (
        <Pond s={s} />
      ) : (
        <Garden s={s} h={h} />
      )}
    </Svg>
  );
}

function Town({ size: s, r, c, seed, delay }: { size: number; r: number; c: number; seed: number; delay: number }) {
  const grow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const t = setTimeout(() => sound.pop(), delay + 60);
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.spring(grow, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
    ]);
    anim.start();
    return () => {
      clearTimeout(t);
      anim.stop();
    };
  }, [grow, delay]);

  const h = hash(r, c, seed);
  const h2 = hash(c, r, seed + 7);
  const kind = h < 0.46 ? "house" : h < 0.8 ? "trees" : h < 0.9 ? "pond" : "garden";

  return (
    <Animated.View
      style={{
        width: s,
        height: s,
        opacity: grow.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
        transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
      }}
    >
      <Svg width={s} height={s}>
        {kind === "house" ? (
          <House s={s} h={h2} />
        ) : kind === "trees" ? (
          <Trees s={s} h={h2} />
        ) : kind === "pond" ? (
          <Pond s={s} />
        ) : (
          <Garden s={s} h={h2} />
        )}
      </Svg>
    </Animated.View>
  );
}

/** A house from above: its roof, split along the ridge into a lit and a shaded half. */
function House({ s, h }: { s: number; h: number }) {
  const roof = theme.roofs[Math.floor(h * theme.roofs.length) % theme.roofs.length];
  const wide = h > 0.5;
  const w = s * (wide ? 0.66 : 0.5);
  const d = s * (wide ? 0.5 : 0.62);
  const x = (s - w) / 2;
  const y = (s - d) / 2;
  const sw = Math.max(1, s * 0.025);
  return (
    <G>
      <Rect x={x + s * 0.05} y={y + s * 0.06} width={w} height={d} rx={s * 0.05} fill="#000" opacity={0.18} />
      <Rect x={x} y={y} width={w} height={d} rx={s * 0.05} fill={roof} stroke={theme.text} strokeOpacity={0.35} strokeWidth={sw} />
      {wide ? (
        <Rect x={x} y={y + d / 2} width={w} height={d / 2} rx={s * 0.05} fill="#000" opacity={0.14} />
      ) : (
        <Rect x={x + w / 2} y={y} width={w / 2} height={d} rx={s * 0.05} fill="#000" opacity={0.14} />
      )}
      {wide ? (
        <Path d={`M ${x + sw},${y + d / 2} L ${x + w - sw},${y + d / 2}`} stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={sw} />
      ) : (
        <Path d={`M ${x + w / 2},${y + sw} L ${x + w / 2},${y + d - sw}`} stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={sw} />
      )}
      {/* chimney */}
      <Rect x={x + w * 0.68} y={y + d * 0.14} width={s * 0.08} height={s * 0.08} rx={s * 0.01} fill="#8A5A36" />
    </G>
  );
}

function Tree({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <G>
      <Ellipse cx={x + r * 0.25} cy={y + r * 0.35} rx={r} ry={r * 0.9} fill="#000" opacity={0.16} />
      <Circle cx={x} cy={y} r={r} fill={theme.bush} />
      <Circle cx={x - r * 0.28} cy={y - r * 0.28} r={r * 0.55} fill={theme.bushLight} />
    </G>
  );
}

function Trees({ s, h }: { s: number; h: number }) {
  const n = h < 0.33 ? 1 : h < 0.7 ? 2 : 3;
  if (n === 1) return <Tree x={s * 0.5} y={s * 0.48} r={s * 0.24} />;
  if (n === 2)
    return (
      <G>
        <Tree x={s * 0.34} y={s * 0.36} r={s * 0.17} />
        <Tree x={s * 0.64} y={s * 0.62} r={s * 0.2} />
      </G>
    );
  return (
    <G>
      <Tree x={s * 0.3} y={s * 0.32} r={s * 0.14} />
      <Tree x={s * 0.68} y={s * 0.34} r={s * 0.15} />
      <Tree x={s * 0.47} y={s * 0.68} r={s * 0.17} />
    </G>
  );
}

function Pond({ s }: { s: number }) {
  return (
    <G>
      <Ellipse cx={s / 2} cy={s / 2} rx={s * 0.34} ry={s * 0.27} fill="#4AA8D0" />
      <Ellipse cx={s / 2} cy={s / 2} rx={s * 0.3} ry={s * 0.23} fill={theme.pond} />
      <Ellipse cx={s * 0.42} cy={s * 0.43} rx={s * 0.1} ry={s * 0.04} fill="#FFFFFF" opacity={0.6} />
      <Circle cx={s * 0.62} cy={s * 0.57} r={s * 0.055} fill={theme.bushLight} />
    </G>
  );
}

function Garden({ s, h }: { s: number; h: number }) {
  const flowers = ["#FF7AA8", "#FFD23F", "#FFFFFF", "#FF9F43", "#B29BF6"];
  const pts = [
    [0.3, 0.3], [0.5, 0.26], [0.7, 0.32], [0.28, 0.52], [0.5, 0.5], [0.72, 0.54], [0.36, 0.72], [0.6, 0.72],
  ];
  return (
    <G>
      <Rect x={s * 0.16} y={s * 0.16} width={s * 0.68} height={s * 0.68} rx={s * 0.14} fill="#7A5236" opacity={0.35} />
      {pts.map(([x, y], i) => (
        <Circle
          key={i}
          cx={s * x}
          cy={s * y}
          r={s * 0.06}
          fill={flowers[(i + Math.floor(h * 5)) % flowers.length]}
          stroke="#FFFFFF"
          strokeOpacity={0.6}
          strokeWidth={Math.max(0.6, s * 0.012)}
        />
      ))}
    </G>
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
