// The town that grows round the road: on a won board's empty squares, on the
// home screen's diorama, and on the road-trip map as the player clears it.
//
// Every piece is a toy seen from above, drawn in the same hand as the rest of
// the tray — a soft offset shadow, a lit and a shaded half, outlines in the ink
// colour at a third of its strength — so a barn and a skyscraper sit on the same
// lawn without either looking pasted in.
//
// **Each region builds its own town** (`TOWNS`). The regions were only ever a
// name and a colour on the map; the town a won board grew was the same four
// things everywhere, so "Metropolis" looked exactly like "Meadow Lane" the moment
// it mattered. Now the fields give way to cottages, then to shops and market
// stalls, then to terraces along the canals, then to rooftops — the road trip is
// a trip because the scenery changes, and the board size already says where the
// player is.

import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from "react-native-svg";

import type { RegionId } from "../game/levels";
import { sound } from "../sound";
import { font, theme } from "../theme";

export type TownKind =
  | "house"
  | "trees"
  | "pond"
  | "garden"
  | "barn"
  | "hay"
  | "field"
  | "sheep"
  | "well"
  | "shop"
  | "stall"
  | "terrace"
  | "canal"
  | "tower"
  | "helipad"
  | "fountain"
  | "pines"
  | "rocks"
  | "lake"
  | "cabin";

/**
 * What each region builds. A kind listed twice is twice as likely, which is how
 * each town gets its character: mostly fields in the meadows, mostly rooftops in
 * the city, with trees everywhere.
 */
export const TOWNS: Record<RegionId, TownKind[]> = {
  meadow: ["field", "field", "barn", "hay", "sheep", "trees", "trees", "pond"],
  village: ["house", "house", "house", "trees", "trees", "garden", "well", "pond"],
  market: ["shop", "shop", "stall", "stall", "house", "trees", "garden", "fountain"],
  riverside: ["terrace", "terrace", "terrace", "canal", "canal", "trees", "house", "garden"],
  metropolis: ["tower", "tower", "tower", "tower", "helipad", "fountain", "trees", "terrace"],
  pass: ["cabin", "cabin", "pines", "pines", "pines", "rocks", "lake"],
  summit: ["cabin", "pines", "pines", "rocks", "rocks", "lake"],
};

/** The piece a region builds for a hash in [0, 1). */
export function townKind(region: RegionId, h: number): TownKind {
  const kinds = TOWNS[region];
  return kinds[Math.floor(h * kinds.length) % kinds.length];
}

/**
 * What a square of **scenery** is — the mountains' printed empties. Only the
 * wild things: rocks, pines, a lake. A cabin is something the player's road
 * brings, so it is built on a won board and never printed on a fresh one.
 */
export const sceneryKind = (h: number): TownKind => (h < 0.45 ? "rocks" : h < 0.85 ? "pines" : "lake");

/** A tiny deterministic hash, so the same won board always builds the same town. */
export function townHash(r: number, c: number, seed: number) {
  let h = (r * 73856093) ^ (c * 19349663) ^ (seed * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** A piece of town, standing still — for scenery off the board. */
export function TownArt({ size: s, kind, h }: { size: number; kind: TownKind; h: number }) {
  return (
    <Svg width={s} height={s}>
      <Piece kind={kind} s={s} h={h} />
    </Svg>
  );
}

/**
 * A piece of town springing up on a won board, `delay` into the win so the
 * building spreads out across the tray rather than landing all at once.
 */
export function TownGrow({
  size: s,
  kind,
  h,
  delay,
}: {
  size: number;
  kind: TownKind;
  h: number;
  delay: number;
}) {
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

  return (
    <Animated.View
      style={{
        width: s,
        height: s,
        opacity: grow.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
        transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
      }}
    >
      <TownArt size={s} kind={kind} h={h} />
    </Animated.View>
  );
}

function Piece({ kind, s, h }: { kind: TownKind; s: number; h: number }) {
  switch (kind) {
    case "house":
      return <House s={s} h={h} />;
    case "trees":
      return <Trees s={s} h={h} />;
    case "pond":
      return <Pond s={s} />;
    case "garden":
      return <Garden s={s} h={h} />;
    case "barn":
      return <Barn s={s} h={h} />;
    case "hay":
      return <Hay s={s} h={h} />;
    case "field":
      return <Field s={s} h={h} />;
    case "sheep":
      return <Sheep s={s} h={h} />;
    case "well":
      return <Well s={s} />;
    case "shop":
      return <Shop s={s} h={h} />;
    case "stall":
      return <Stalls s={s} h={h} />;
    case "terrace":
      return <Terrace s={s} h={h} />;
    case "canal":
      return <Canal s={s} h={h} />;
    case "tower":
      return <Tower s={s} h={h} />;
    case "helipad":
      return <Helipad s={s} />;
    case "fountain":
      return <Fountain s={s} />;
    case "pines":
      return <Pines s={s} h={h} />;
    case "rocks":
      return <Rocks s={s} h={h} />;
    case "lake":
      return <Lake s={s} />;
    case "cabin":
      return <Cabin s={s} h={h} />;
  }
}

const ink = (s: number) => ({ stroke: theme.text, strokeOpacity: 0.35, strokeWidth: Math.max(1, s * 0.025) });
const pick = <T,>(list: readonly T[], h: number): T => list[Math.floor(h * list.length) % list.length];

/** The soft shadow every standing thing casts, down and to the right. */
function Shadow({ x, y, w, d, s, rx }: { x: number; y: number; w: number; d: number; s: number; rx?: number }) {
  return <Rect x={x + s * 0.05} y={y + s * 0.06} width={w} height={d} rx={rx ?? s * 0.05} fill="#000" opacity={0.18} />;
}

/**
 * A pitched roof from above: split along its ridge into a lit and a shaded half,
 * the ridge itself a pale line. Everything with a roof is one of these.
 */
function Roof({
  x,
  y,
  w,
  d,
  s,
  fill,
  across,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  s: number;
  fill: string;
  /** Ridge runs left–right (true) or top–bottom. */
  across: boolean;
}) {
  const sw = Math.max(1, s * 0.025);
  return (
    <G>
      <Rect x={x} y={y} width={w} height={d} rx={s * 0.05} fill={fill} {...ink(s)} />
      {across ? (
        <Rect x={x} y={y + d / 2} width={w} height={d / 2} rx={s * 0.05} fill="#000" opacity={0.14} />
      ) : (
        <Rect x={x + w / 2} y={y} width={w / 2} height={d} rx={s * 0.05} fill="#000" opacity={0.14} />
      )}
      {across ? (
        <Path d={`M ${x + sw},${y + d / 2} L ${x + w - sw},${y + d / 2}`} stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={sw} />
      ) : (
        <Path d={`M ${x + w / 2},${y + sw} L ${x + w / 2},${y + d - sw}`} stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={sw} />
      )}
    </G>
  );
}

// --- everywhere ---------------------------------------------------------------

/** A house from above: a roof and a chimney. */
function House({ s, h }: { s: number; h: number }) {
  const roof = pick(theme.roofs, h);
  const wide = h > 0.5;
  const w = s * (wide ? 0.66 : 0.5);
  const d = s * (wide ? 0.5 : 0.62);
  const x = (s - w) / 2;
  const y = (s - d) / 2;
  return (
    <G>
      <Shadow x={x} y={y} w={w} d={d} s={s} />
      <Roof x={x} y={y} w={w} d={d} s={s} fill={roof} across={wide} />
      <Rect x={x + w * 0.68} y={y + d * 0.14} width={s * 0.08} height={s * 0.08} rx={s * 0.01} fill={theme.trunk} />
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

const FLOWERS = ["#FF7AA8", "#FFD23F", "#FFFFFF", "#FF9F43", "#B29BF6"];

function Garden({ s, h }: { s: number; h: number }) {
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
          fill={FLOWERS[(i + Math.floor(h * 5)) % FLOWERS.length]}
          stroke="#FFFFFF"
          strokeOpacity={0.6}
          strokeWidth={Math.max(0.6, s * 0.012)}
        />
      ))}
    </G>
  );
}

// --- Meadow Lane: farmland ------------------------------------------------------

/** A red barn with a silo beside it. */
function Barn({ s, h }: { s: number; h: number }) {
  const w = s * 0.5;
  const d = s * 0.6;
  const x = s * (h > 0.5 ? 0.12 : 0.38);
  const y = (s - d) / 2;
  const siloX = h > 0.5 ? s * 0.78 : s * 0.22;
  return (
    <G>
      <Shadow x={x} y={y} w={w} d={d} s={s} />
      <Roof x={x} y={y} w={w} d={d} s={s} fill="#D9483B" across={false} />
      <Rect x={x} y={y} width={w} height={d} rx={s * 0.05} fill="none" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={Math.max(1, s * 0.022)} />
      <Circle cx={siloX + s * 0.04} cy={s * 0.36 + s * 0.05} r={s * 0.13} fill="#000" opacity={0.16} />
      <Circle cx={siloX} cy={s * 0.36} r={s * 0.13} fill="#C9CED6" {...ink(s)} />
      <Circle cx={siloX} cy={s * 0.36} r={s * 0.07} fill="#A9B0BB" />
    </G>
  );
}

/** Round bales of hay, rolled up and left in the field. */
function Hay({ s, h }: { s: number; h: number }) {
  const bales = h > 0.5
    ? [[0.32, 0.36, 0.15], [0.66, 0.42, 0.14], [0.46, 0.7, 0.15]]
    : [[0.36, 0.4, 0.17], [0.66, 0.64, 0.16]];
  return (
    <G>
      {bales.map(([x, y, r], i) => (
        <G key={i}>
          <Circle cx={s * x + s * 0.04} cy={s * y + s * 0.05} r={s * r} fill="#000" opacity={0.16} />
          <Circle cx={s * x} cy={s * y} r={s * r} fill="#F2C94C" {...ink(s)} />
          <Circle cx={s * x} cy={s * y} r={s * r * 0.6} fill="none" stroke="#D9A93A" strokeWidth={Math.max(1, s * 0.03)} />
          <Circle cx={s * x} cy={s * y} r={s * r * 0.22} fill="#D9A93A" />
        </G>
      ))}
    </G>
  );
}

/** A ploughed plot in rows — the one piece that is the ground itself. */
function Field({ s, h }: { s: number; h: number }) {
  const across = h > 0.5;
  const crop = pick(["#7FC243", "#F2C94C", "#8FD16A"], h * 3);
  const rows = [0.3, 0.43, 0.57, 0.7];
  return (
    <G>
      <Rect x={s * 0.14} y={s * 0.14} width={s * 0.72} height={s * 0.72} rx={s * 0.08} fill="#9C6B3F" opacity={0.75} />
      {rows.map((f, i) =>
        across ? (
          <Rect key={i} x={s * 0.2} y={s * f - s * 0.035} width={s * 0.6} height={s * 0.07} rx={s * 0.035} fill={crop} />
        ) : (
          <Rect key={i} x={s * f - s * 0.035} y={s * 0.2} width={s * 0.07} height={s * 0.6} rx={s * 0.035} fill={crop} />
        ),
      )}
    </G>
  );
}

function Lamb({ x, y, r, flip }: { x: number; y: number; r: number; flip: boolean }) {
  const hx = flip ? x - r * 1.05 : x + r * 1.05;
  return (
    <G>
      <Ellipse cx={x + r * 0.25} cy={y + r * 0.35} rx={r * 1.1} ry={r * 0.85} fill="#000" opacity={0.14} />
      <Circle cx={x - r * 0.45} cy={y} r={r * 0.6} fill="#FFFFFF" />
      <Circle cx={x + r * 0.45} cy={y} r={r * 0.6} fill="#FFFFFF" />
      <Circle cx={x} cy={y - r * 0.35} r={r * 0.6} fill="#FFFFFF" />
      <Circle cx={x} cy={y + r * 0.35} r={r * 0.6} fill="#F2F0EA" />
      <Circle cx={hx} cy={y} r={r * 0.36} fill={theme.text} />
    </G>
  );
}

/** Two sheep, grazing in opposite directions. */
function Sheep({ s, h }: { s: number; h: number }) {
  return (
    <G>
      <Lamb x={s * 0.36} y={s * 0.38} r={s * 0.14} flip={h > 0.5} />
      <Lamb x={s * 0.64} y={s * 0.66} r={s * 0.13} flip={h <= 0.5} />
    </G>
  );
}

// --- Village Green ----------------------------------------------------------------

/** The village well: a stone ring and the dark water down it. */
function Well({ s }: { s: number }) {
  return (
    <G>
      <Circle cx={s * 0.54} cy={s * 0.56} r={s * 0.22} fill="#000" opacity={0.16} />
      <Circle cx={s * 0.5} cy={s * 0.5} r={s * 0.22} fill="#C8C2B6" {...ink(s)} />
      <Circle cx={s * 0.5} cy={s * 0.5} r={s * 0.13} fill="#2F6E94" />
      <Rect x={s * 0.24} y={s * 0.47} width={s * 0.52} height={s * 0.06} rx={s * 0.02} fill={theme.trunk} />
    </G>
  );
}

// --- Market Town -------------------------------------------------------------------

/** A shop: a house whose front is shaded by a striped awning. */
function Shop({ s, h }: { s: number; h: number }) {
  const roof = pick(theme.roofs, h);
  const w = s * 0.64;
  const d = s * 0.46;
  const x = (s - w) / 2;
  const y = s * 0.18;
  const stripes = 5;
  const aw = s * 0.14;
  return (
    <G>
      <Shadow x={x} y={y} w={w} d={d + aw} s={s} />
      <Roof x={x} y={y} w={w} d={d} s={s} fill={roof} across />
      {Array.from({ length: stripes }, (_, i) => (
        <Rect
          key={i}
          x={x + (w / stripes) * i}
          y={y + d}
          width={w / stripes}
          height={aw}
          fill={i % 2 ? "#FFFFFF" : pick(["#E84A5F", "#2E9CCA", "#27B9A8"], h * 3)}
        />
      ))}
      <Rect x={x} y={y + d} width={w} height={aw} fill="none" {...ink(s)} />
    </G>
  );
}

/**
 * One market stall from above: a striped canvas canopy, its far half in shade
 * where it pitches down. (A canopy drawn to a point, in four triangles, was
 * tried first and read as a bow tie at board size.)
 */
function Stall({ x, y, w, colour }: { x: number; y: number; w: number; colour: string }) {
  const d = w * 0.78;
  const n = 4;
  const sw = Math.max(1, w * 0.05);
  return (
    <G>
      <Rect x={x + w * 0.1} y={y + w * 0.12} width={w} height={d} rx={w * 0.08} fill="#000" opacity={0.16} />
      {Array.from({ length: n }, (_, i) => (
        <Rect key={i} x={x + (w / n) * i} y={y} width={w / n} height={d} fill={i % 2 ? "#FFFFFF" : colour} />
      ))}
      <Rect x={x} y={y + d / 2} width={w} height={d / 2} fill="#000" opacity={0.12} />
      <Rect x={x} y={y} width={w} height={d} rx={w * 0.06} fill="none" stroke={theme.text} strokeOpacity={0.35} strokeWidth={sw} />
    </G>
  );
}

/** Two market stalls, side by side. */
function Stalls({ s, h }: { s: number; h: number }) {
  const w = s * 0.36;
  return (
    <G>
      <Stall x={s * 0.1} y={s * 0.18} w={w} colour={pick(["#E84A5F", "#FF9F43"], h * 2)} />
      <Stall x={s * 0.52} y={s * 0.52} w={w} colour={pick(["#2E9CCA", "#27B9A8"], h * 2)} />
    </G>
  );
}

// --- Riverside City ------------------------------------------------------------------

/** A terrace: three narrow houses shoulder to shoulder, each its own colour. */
function Terrace({ s, h }: { s: number; h: number }) {
  const n = 3;
  const w = s * 0.24;
  const d = s * 0.58;
  const x0 = (s - w * n) / 2;
  const y = (s - d) / 2;
  return (
    <G>
      <Shadow x={x0} y={y} w={w * n} d={d} s={s} />
      {Array.from({ length: n }, (_, i) => (
        <Roof
          key={i}
          x={x0 + w * i}
          y={y}
          w={w}
          d={d}
          s={s}
          fill={theme.roofs[(Math.floor(h * theme.roofs.length) + i * 2) % theme.roofs.length]}
          across
        />
      ))}
    </G>
  );
}

/** A stretch of canal between stone banks, and a boat on it. */
function Canal({ s, h }: { s: number; h: number }) {
  const across = h > 0.5;
  const bank = s * 0.14;
  const boat = pick(["#E84A5F", "#FFC83D", "#FFFFFF"], h * 3);
  return (
    <G>
      {across ? (
        <G>
          <Rect x={0} y={bank} width={s} height={s - bank * 2} fill="#4AA8D0" />
          <Rect x={0} y={bank} width={s} height={s * 0.05} fill="#B9B2A4" />
          <Rect x={0} y={s - bank - s * 0.05} width={s} height={s * 0.05} fill="#B9B2A4" />
          <Ellipse cx={s * 0.42} cy={s * 0.5} rx={s * 0.2} ry={s * 0.08} fill={boat} {...ink(s)} />
          <Rect x={s * 0.36} y={s * 0.47} width={s * 0.1} height={s * 0.06} rx={s * 0.02} fill={theme.trunk} />
        </G>
      ) : (
        <G>
          <Rect x={bank} y={0} width={s - bank * 2} height={s} fill="#4AA8D0" />
          <Rect x={bank} y={0} width={s * 0.05} height={s} fill="#B9B2A4" />
          <Rect x={s - bank - s * 0.05} y={0} width={s * 0.05} height={s} fill="#B9B2A4" />
          <Ellipse cx={s * 0.5} cy={s * 0.42} rx={s * 0.08} ry={s * 0.2} fill={boat} {...ink(s)} />
          <Rect x={s * 0.47} y={s * 0.36} width={s * 0.06} height={s * 0.1} rx={s * 0.02} fill={theme.trunk} />
        </G>
      )}
      <Ellipse cx={s * 0.66} cy={s * 0.3} rx={s * 0.07} ry={s * 0.025} fill="#FFFFFF" opacity={0.55} />
    </G>
  );
}

// --- Metropolis ----------------------------------------------------------------------

/** A tower's flat roof: parapet, plant on the roof, a water tank. */
function Tower({ s, h }: { s: number; h: number }) {
  const slab = pick(["#D5D9E0", "#C9D6E8", "#E6DCCB", "#BFC6D4"], h * 4);
  const x = s * 0.14;
  const w = s * 0.72;
  return (
    <G>
      <Rect x={x + s * 0.07} y={x + s * 0.09} width={w} height={w} rx={s * 0.04} fill="#000" opacity={0.24} />
      <Rect x={x} y={x} width={w} height={w} rx={s * 0.04} fill={slab} {...ink(s)} />
      <Rect x={x + s * 0.06} y={x + s * 0.06} width={w - s * 0.12} height={w - s * 0.12} rx={s * 0.03} fill="#000" opacity={0.08} />
      <Rect x={s * 0.26} y={s * 0.26} width={s * 0.16} height={s * 0.11} rx={s * 0.02} fill="#9AA3B2" />
      <Rect x={s * 0.26} y={s * 0.42} width={s * 0.16} height={s * 0.11} rx={s * 0.02} fill="#9AA3B2" />
      <Circle cx={s * 0.63} cy={s * 0.6} r={s * 0.11} fill="#8C6A4E" {...ink(s)} />
      <Circle cx={s * 0.63} cy={s * 0.6} r={s * 0.05} fill="#6E523C" />
    </G>
  );
}

/** A rooftop helipad: the one roof anyone would recognise from the air. */
function Helipad({ s }: { s: number }) {
  const x = s * 0.14;
  const w = s * 0.72;
  return (
    <G>
      <Rect x={x + s * 0.07} y={x + s * 0.09} width={w} height={w} rx={s * 0.04} fill="#000" opacity={0.24} />
      <Rect x={x} y={x} width={w} height={w} rx={s * 0.04} fill="#5B6275" {...ink(s)} />
      <Circle cx={s * 0.5} cy={s * 0.5} r={s * 0.24} fill="none" stroke="#FFFFFF" strokeWidth={Math.max(1.2, s * 0.035)} />
      <SvgText
        x={s * 0.5}
        y={s * 0.5 + s * 0.1}
        fontSize={s * 0.28}
        fontFamily={font.bold}
        fontWeight="bold"
        fill="#FFFFFF"
        textAnchor="middle"
      >
        H
      </SvgText>
    </G>
  );
}

/** A city square: paving, and a fountain throwing up spray. */
function Fountain({ s }: { s: number }) {
  return (
    <G>
      <Rect x={s * 0.12} y={s * 0.12} width={s * 0.76} height={s * 0.76} rx={s * 0.12} fill="#E3DDD0" />
      <Circle cx={s * 0.5} cy={s * 0.5} r={s * 0.26} fill="#C8C2B6" {...ink(s)} />
      <Circle cx={s * 0.5} cy={s * 0.5} r={s * 0.2} fill={theme.pond} />
      <Circle cx={s * 0.5} cy={s * 0.5} r={s * 0.06} fill="#FFFFFF" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Circle
          key={i}
          cx={s * 0.5 + Math.cos((i * Math.PI) / 3) * s * 0.12}
          cy={s * 0.5 + Math.sin((i * Math.PI) / 3) * s * 0.12}
          r={s * 0.025}
          fill="#FFFFFF"
          opacity={0.8}
        />
      ))}
    </G>
  );
}

// --- the mountains ---------------------------------------------------------------

/** A conifer from above: tiers of dark needles narrowing to a lit tip. */
function Pine({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <G>
      <Circle cx={x + r * 0.3} cy={y + r * 0.35} r={r} fill="#000" opacity={0.18} />
      <Circle cx={x} cy={y} r={r} fill="#256B43" />
      <Circle cx={x - r * 0.12} cy={y - r * 0.12} r={r * 0.66} fill="#2F8052" />
      <Circle cx={x - r * 0.22} cy={y - r * 0.22} r={r * 0.3} fill="#4FA56F" />
    </G>
  );
}

function Pines({ s, h }: { s: number; h: number }) {
  if (h < 0.4) {
    return (
      <G>
        <Pine x={s * 0.34} y={s * 0.36} r={s * 0.17} />
        <Pine x={s * 0.66} y={s * 0.62} r={s * 0.19} />
      </G>
    );
  }
  return (
    <G>
      <Pine x={s * 0.3} y={s * 0.3} r={s * 0.14} />
      <Pine x={s * 0.68} y={s * 0.36} r={s * 0.16} />
      <Pine x={s * 0.44} y={s * 0.68} r={s * 0.17} />
    </G>
  );
}

/** A boulder: a rounded grey lump, lit from the top left. */
function Rock({ x, y, w, d }: { x: number; y: number; w: number; d: number }) {
  return (
    <G>
      <Ellipse cx={x + w * 0.12} cy={y + d * 0.18} rx={w / 2} ry={d / 2} fill="#000" opacity={0.2} />
      <Ellipse cx={x} cy={y} rx={w / 2} ry={d / 2} fill="#9C968C" stroke={theme.text} strokeOpacity={0.3} strokeWidth={Math.max(1, w * 0.05)} />
      <Ellipse cx={x - w * 0.12} cy={y - d * 0.14} rx={w * 0.28} ry={d * 0.24} fill="#C4BEB3" />
    </G>
  );
}

/** A scatter of boulders, big and small. */
function Rocks({ s, h }: { s: number; h: number }) {
  return h < 0.5 ? (
    <G>
      <Rock x={s * 0.44} y={s * 0.46} w={s * 0.5} d={s * 0.4} />
      <Rock x={s * 0.72} y={s * 0.72} w={s * 0.22} d={s * 0.18} />
    </G>
  ) : (
    <G>
      <Rock x={s * 0.34} y={s * 0.36} w={s * 0.32} d={s * 0.26} />
      <Rock x={s * 0.64} y={s * 0.5} w={s * 0.36} d={s * 0.3} />
      <Rock x={s * 0.36} y={s * 0.7} w={s * 0.2} d={s * 0.16} />
    </G>
  );
}

/** A mountain lake: deeper and colder than a village pond, with a stony shore. */
function Lake({ s }: { s: number }) {
  return (
    <G>
      <Ellipse cx={s / 2} cy={s / 2} rx={s * 0.4} ry={s * 0.33} fill="#A9A399" />
      <Ellipse cx={s / 2} cy={s / 2} rx={s * 0.36} ry={s * 0.29} fill="#2F7FB0" />
      <Ellipse cx={s * 0.48} cy={s * 0.48} rx={s * 0.26} ry={s * 0.19} fill="#3E95C8" />
      <Ellipse cx={s * 0.4} cy={s * 0.4} rx={s * 0.1} ry={s * 0.035} fill="#FFFFFF" opacity={0.55} />
    </G>
  );
}

/** A log cabin: a steep wooden roof and a stone chimney. */
function Cabin({ s, h }: { s: number; h: number }) {
  const w = s * 0.52;
  const d = s * 0.5;
  const x = (s - w) / 2;
  const y = (s - d) / 2;
  return (
    <G>
      <Shadow x={x} y={y} w={w} d={d} s={s} />
      <Roof x={x} y={y} w={w} d={d} s={s} fill={pick(["#8B5A3C", "#7A4E33", "#9C6645"], h)} across={h > 0.5} />
      <Rect x={x + w * 0.66} y={y + d * 0.1} width={s * 0.1} height={s * 0.1} rx={s * 0.02} fill="#A9A399" />
    </G>
  );
}
