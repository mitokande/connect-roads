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
//
// The second road trip carries on in the same hand: beach huts and a lighthouse
// round the harbour, fruit trees and pumpkin patches in the orchards, adobe and
// cactus in the canyon, palms and thatch on the isles, snowed-on chalets in the
// valley, lanterns strung over the night town, dark stone by the volcano,
// blossom and teahouses, and turrets on Castle Hill. The mountains' printed
// scenery changes with them (`sceneryKind`), so a canyon board opens on mesas
// and cacti rather than on alpine pines.

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
  | "cabin"
  | "hut"
  | "lighthouse"
  | "boat"
  | "umbrella"
  | "orchard"
  | "pumpkins"
  | "beehives"
  | "adobe"
  | "cactus"
  | "mesa"
  | "oasis"
  | "palms"
  | "tiki"
  | "lagoon"
  | "chalet"
  | "snowpines"
  | "snowman"
  | "rink"
  | "ice"
  | "snowrocks"
  | "lit"
  | "lamps"
  | "stonehouse"
  | "lavarock"
  | "hotspring"
  | "cherry"
  | "teahouse"
  | "koi"
  | "turret"
  | "keep"
  | "maze";

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
  harbour: ["hut", "hut", "lighthouse", "boat", "boat", "umbrella", "trees"],
  orchard: ["orchard", "orchard", "orchard", "pumpkins", "beehives", "barn", "hay"],
  canyon: ["adobe", "adobe", "cactus", "cactus", "mesa", "oasis"],
  isles: ["palms", "palms", "tiki", "tiki", "lagoon", "boat", "umbrella"],
  frost: ["chalet", "chalet", "snowpines", "snowpines", "snowman", "rink"],
  lantern: ["lit", "lit", "lit", "lamps", "lamps", "stall", "fountain"],
  ember: ["stonehouse", "stonehouse", "lavarock", "lavarock", "hotspring", "pines"],
  blossom: ["cherry", "cherry", "cherry", "teahouse", "teahouse", "koi", "garden"],
  castle: ["turret", "turret", "keep", "maze", "house", "trees", "fountain"],
};

/** The piece a region builds for a hash in [0, 1). */
export function townKind(region: RegionId, h: number): TownKind {
  const kinds = TOWNS[region];
  return kinds[Math.floor(h * kinds.length) % kinds.length];
}

/**
 * The wild things each region prints as scenery, commonest first. A region not
 * listed prints the mountains' own rocks, pines and lakes.
 */
const WILD: Partial<Record<RegionId, [TownKind, TownKind, TownKind]>> = {
  orchard: ["rocks", "orchard", "pond"],
  canyon: ["mesa", "cactus", "rocks"],
  isles: ["rocks", "palms", "lagoon"],
  frost: ["snowrocks", "snowpines", "ice"],
};

/**
 * What a square of **scenery** is — the printed empties. Only the wild things:
 * rocks, pines, a lake, and each region's own in their place. A cabin is
 * something the player's road brings, so it is built on a won board and never
 * printed on a fresh one; the same goes for every building.
 */
export function sceneryKind(region: RegionId | undefined, h: number): TownKind {
  const [common, middling, rare] = (region && WILD[region]) || ["rocks", "pines", "lake"];
  return h < 0.45 ? common : h < 0.85 ? middling : rare;
}

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
    case "hut":
      return <Huts s={s} h={h} />;
    case "lighthouse":
      return <Lighthouse s={s} h={h} />;
    case "boat":
      return <Boat s={s} h={h} />;
    case "umbrella":
      return <Umbrellas s={s} h={h} />;
    case "orchard":
      return <Orchard s={s} h={h} />;
    case "pumpkins":
      return <Pumpkins s={s} h={h} />;
    case "beehives":
      return <Beehives s={s} h={h} />;
    case "adobe":
      return <Adobe s={s} h={h} />;
    case "cactus":
      return <Cactus s={s} h={h} />;
    case "mesa":
      return <Mesa s={s} h={h} />;
    case "oasis":
      return <Oasis s={s} />;
    case "palms":
      return <Palms s={s} h={h} />;
    case "tiki":
      return <Tiki s={s} h={h} />;
    case "lagoon":
      return <Lagoon s={s} />;
    case "chalet":
      return <Chalet s={s} h={h} />;
    case "snowpines":
      return <SnowPines s={s} h={h} />;
    case "snowman":
      return <Snowman s={s} />;
    case "rink":
      return <Rink s={s} />;
    case "ice":
      return <Ice s={s} />;
    case "snowrocks":
      return <SnowRocks s={s} h={h} />;
    case "lit":
      return <Lit s={s} h={h} />;
    case "lamps":
      return <Lamps s={s} h={h} />;
    case "stonehouse":
      return <StoneHouse s={s} h={h} />;
    case "lavarock":
      return <LavaRocks s={s} h={h} />;
    case "hotspring":
      return <HotSpring s={s} />;
    case "cherry":
      return <Cherry s={s} h={h} />;
    case "teahouse":
      return <Teahouse s={s} h={h} />;
    case "koi":
      return <Koi s={s} />;
    case "turret":
      return <Turret s={s} h={h} />;
    case "keep":
      return <Keep s={s} h={h} />;
    case "maze":
      return <Maze s={s} h={h} />;
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

// --- the second road trip ---------------------------------------------------------

const SAND = "#F0DBA0";
const SAND_EDGE = "#DDC282";
const PASTELS = ["#FF8F8F", "#7FCBF5", "#8FDDB0", "#C9A6F5", "#FFB27A"];

/** A patch of sand under a seaside piece, so it reads as beach on any lawn. */
function Sand({ s }: { s: number }) {
  return (
    <Rect
      x={s * 0.08}
      y={s * 0.08}
      width={s * 0.84}
      height={s * 0.84}
      rx={s * 0.16}
      fill={SAND}
      stroke={SAND_EDGE}
      strokeWidth={Math.max(1, s * 0.02)}
    />
  );
}

/**
 * A leaf from (x, y) out to `r` along angle `a`, `w` wide either side of its
 * spine: a palm frond, a fish's body.
 */
function leaf(x: number, y: number, r: number, a: number, w: number) {
  const tx = x + Math.cos(a) * r;
  const ty = y + Math.sin(a) * r;
  const mx = (x + tx) / 2;
  const my = (y + ty) / 2;
  const nx = -Math.sin(a) * w;
  const ny = Math.cos(a) * w;
  return `M ${x},${y} Q ${mx + nx},${my + ny} ${tx},${ty} Q ${mx - nx},${my - ny} ${x},${y} Z`;
}

// --- Harbour Bay -------------------------------------------------------------------

/** Beach huts in a row on the sand, each its own colour, a deck out front. */
function Huts({ s, h }: { s: number; h: number }) {
  const n = h > 0.5 ? 3 : 2;
  const w = s * (n === 3 ? 0.19 : 0.24);
  const d = s * 0.36;
  const gap = s * 0.05;
  const x0 = (s - (n * w + (n - 1) * gap)) / 2;
  const y = s * 0.2;
  return (
    <G>
      <Sand s={s} />
      {Array.from({ length: n }, (_, i) => {
        const x = x0 + i * (w + gap);
        return (
          <G key={i}>
            <Shadow x={x} y={y} w={w} d={d} s={s} />
            <Roof x={x} y={y} w={w} d={d} s={s} fill={PASTELS[(Math.floor(h * 5) + i * 2) % PASTELS.length]} across={false} />
            <Rect x={x + w * 0.12} y={y + d + s * 0.05} width={w * 0.76} height={s * 0.11} rx={s * 0.02} fill={theme.trunk} opacity={0.75} />
          </G>
        );
      })}
    </G>
  );
}

/**
 * A lighthouse on its rock, seen side-on like a toy stood in the tray — from
 * straight above it was only red and white rings, and read as a dartboard.
 */
function Lighthouse({ s, h }: { s: number; h: number }) {
  const c = s / 2;
  const top = s * 0.3;
  const foot = s * 0.78;
  // Half the tower's width at height y: it tapers towards the lamp.
  const half = (y: number) => s * (0.09 + 0.06 * ((y - top) / (foot - top)));
  const band = (y0: number, y1: number) =>
    `M ${c - half(y0)},${y0} L ${c + half(y0)},${y0} L ${c + half(y1)},${y1} L ${c - half(y1)},${y1} Z`;
  const beam = h > 0.5 ? 1 : -1;
  return (
    <G>
      <Path
        d={`M ${c},${s * 0.21} L ${c + beam * s * 0.46},${s * 0.08} L ${c + beam * s * 0.46},${s * 0.34} Z`}
        fill="#FFF6C8"
        opacity={0.6}
      />
      <Ellipse cx={c + s * 0.05} cy={s * 0.82} rx={s * 0.34} ry={s * 0.1} fill="#000" opacity={0.16} />
      <Ellipse cx={c} cy={s * 0.8} rx={s * 0.32} ry={s * 0.11} fill="#A9A399" {...ink(s)} />
      <Ellipse cx={c - s * 0.1} cy={s * 0.77} rx={s * 0.12} ry={s * 0.04} fill="#C4BEB3" />
      <Path d={band(top, foot)} fill="#FFFFFF" {...ink(s)} />
      <Path d={band(s * 0.38, s * 0.48)} fill="#E8483F" />
      <Path d={band(s * 0.58, s * 0.68)} fill="#E8483F" />
      <Path d={band(s * 0.48, foot)} fill="#000" opacity={0.06} />
      <Rect x={c - s * 0.13} y={s * 0.26} width={s * 0.26} height={s * 0.045} rx={s * 0.015} fill="#5B6275" />
      <Rect x={c - s * 0.075} y={s * 0.16} width={s * 0.15} height={s * 0.1} rx={s * 0.02} fill="#FFF3B0" {...ink(s)} />
      <Path d={`M ${c - s * 0.1},${s * 0.165} Q ${c},${s * 0.06} ${c + s * 0.1},${s * 0.165} Z`} fill="#E8483F" {...ink(s)} />
    </G>
  );
}

/** A little sailboat on a square of harbour water, its wake behind it. */
function Boat({ s, h }: { s: number; h: number }) {
  const dir = h > 0.5 ? 1 : -1;
  const X = (u: number) => s / 2 + dir * u * s;
  const y = s * 0.56;
  const hullAt = (dx: number, dy: number) =>
    `M ${X(-0.22) + dx},${y - s * 0.08 + dy} L ${X(0.1) + dx},${y - s * 0.08 + dy} ` +
    `Q ${X(0.3) + dx},${y + dy} ${X(0.1) + dx},${y + s * 0.08 + dy} L ${X(-0.22) + dx},${y + s * 0.08 + dy} Z`;
  const hull = pick(["#E84A5F", "#FFFFFF", "#2E9CCA", "#FF9F43"], h * 4);
  return (
    <G>
      <Rect x={s * 0.06} y={s * 0.06} width={s * 0.88} height={s * 0.88} rx={s * 0.14} fill="#4AA8D0" />
      <Rect x={s * 0.1} y={s * 0.1} width={s * 0.8} height={s * 0.8} rx={s * 0.12} fill={theme.pond} />
      <Path
        d={`M ${X(-0.24)},${y - s * 0.05} L ${X(-0.38)},${y - s * 0.12} M ${X(-0.24)},${y + s * 0.05} L ${X(-0.38)},${y + s * 0.12}`}
        stroke="#FFFFFF"
        strokeOpacity={0.75}
        strokeWidth={Math.max(1, s * 0.025)}
        strokeLinecap="round"
      />
      <Path d={hullAt(s * 0.03, s * 0.05)} fill="#000" opacity={0.18} />
      <Path d={hullAt(0, 0)} fill={hull} {...ink(s)} />
      <Path d={`M ${X(-0.14)},${y - s * 0.02} L ${X(0.1)},${y - s * 0.02} L ${X(0)},${y - s * 0.34} Z`} fill="#FFFFFF" {...ink(s)} />
      <Circle cx={X(0)} cy={y - s * 0.02} r={s * 0.025} fill={theme.trunk} />
    </G>
  );
}

/** One beach umbrella from above: eight panels, every other one white. */
function Parasol({ x, y, r, colour }: { x: number; y: number; r: number; colour: string }) {
  const segs = 8;
  return (
    <G>
      <Circle cx={x + r * 0.3} cy={y + r * 0.35} r={r} fill="#000" opacity={0.16} />
      {Array.from({ length: segs }, (_, i) => {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        return (
          <Path
            key={i}
            d={`M ${x},${y} L ${x + r * Math.cos(a0)},${y + r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${x + r * Math.cos(a1)},${y + r * Math.sin(a1)} Z`}
            fill={i % 2 ? "#FFFFFF" : colour}
          />
        );
      })}
      <Circle cx={x} cy={y} r={r} fill="none" stroke={theme.text} strokeOpacity={0.35} strokeWidth={Math.max(1, r * 0.1)} />
      <Circle cx={x} cy={y} r={r * 0.12} fill={theme.trunk} />
    </G>
  );
}

/** Two umbrellas and a towel on the sand. */
function Umbrellas({ s, h }: { s: number; h: number }) {
  return (
    <G>
      <Sand s={s} />
      <Rect x={s * 0.56} y={s * 0.18} width={s * 0.14} height={s * 0.26} rx={s * 0.02} fill={pick(PASTELS, h)} />
      <Parasol x={s * 0.34} y={s * 0.36} r={s * 0.17} colour={pick(["#E84A5F", "#2E9CCA", "#27B9A8"], h * 3)} />
      <Parasol x={s * 0.64} y={s * 0.66} r={s * 0.15} colour={pick(["#FF9F43", "#A77BF3", "#E84A5F"], h * 3)} />
    </G>
  );
}

// --- Orchard Hills -----------------------------------------------------------------

/** A fruit tree: a tree with its crop showing. */
function FruitTree({ x, y, r, fruit }: { x: number; y: number; r: number; fruit: string }) {
  return (
    <G>
      <Tree x={x} y={y} r={r} />
      {[
        [0.38, -0.1],
        [-0.32, 0.28],
        [0.2, 0.46],
        [-0.02, -0.5],
      ].map(([u, v], i) => (
        <Circle key={i} cx={x + u * r} cy={y + v * r} r={r * 0.17} fill={fruit} />
      ))}
    </G>
  );
}

/** Fruit trees planted in rows, all bearing the same crop. */
function Orchard({ s, h }: { s: number; h: number }) {
  const fruit = pick(["#E84A3C", "#FF9F43", "#F25C8A"], h * 3);
  const r = s * 0.15;
  return (
    <G>
      {[
        [0.3, 0.3],
        [0.7, 0.3],
        [0.3, 0.7],
        [0.7, 0.7],
      ].map(([x, y], i) => (
        <FruitTree key={i} x={s * x} y={s * y} r={r} fruit={fruit} />
      ))}
    </G>
  );
}

function Pumpkin({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <G>
      <Ellipse cx={x + r * 0.25} cy={y + r * 0.3} rx={r * 1.05} ry={r * 0.9} fill="#000" opacity={0.16} />
      <Ellipse cx={x} cy={y} rx={r * 1.05} ry={r * 0.88} fill="#F28C28" stroke={theme.text} strokeOpacity={0.3} strokeWidth={Math.max(0.8, r * 0.1)} />
      <Ellipse cx={x} cy={y} rx={r * 0.5} ry={r * 0.88} fill="none" stroke="#D96F12" strokeWidth={Math.max(0.8, r * 0.12)} />
      <Ellipse cx={x - r * 0.35} cy={y - r * 0.32} rx={r * 0.24} ry={r * 0.14} fill="#FFFFFF" opacity={0.35} />
      <Rect x={x - r * 0.1} y={y - r * 1.02} width={r * 0.2} height={r * 0.36} rx={r * 0.06} fill="#4E7A2E" />
    </G>
  );
}

/** A pumpkin patch: tilled ground, a vine wandering across it, the pumpkins. */
function Pumpkins({ s, h }: { s: number; h: number }) {
  return (
    <G>
      <Rect x={s * 0.12} y={s * 0.12} width={s * 0.76} height={s * 0.76} rx={s * 0.12} fill="#9C6B3F" opacity={0.6} />
      <Path
        d={`M ${s * 0.18},${s * 0.74} Q ${s * 0.34},${s * 0.46} ${s * 0.5},${s * 0.56} T ${s * 0.82},${s * 0.3}`}
        stroke={theme.bush}
        strokeWidth={Math.max(1, s * 0.03)}
        fill="none"
        strokeLinecap="round"
      />
      {[
        [0.24, 0.6],
        [0.46, 0.52],
        [0.62, 0.5],
        [0.78, 0.36],
      ].map(([x, y], i) => (
        <Circle key={i} cx={s * x} cy={s * y} r={s * 0.045} fill={theme.bushLight} />
      ))}
      <Pumpkin x={s * 0.32} y={s * 0.34} r={s * 0.13} />
      <Pumpkin x={s * 0.66} y={s * 0.62} r={s * 0.15} />
      {h > 0.5 ? <Pumpkin x={s * 0.3} y={s * 0.74} r={s * 0.1} /> : null}
    </G>
  );
}

function Hive({ x, y, w, lid, s }: { x: number; y: number; w: number; lid: string; s: number }) {
  return (
    <G>
      <Shadow x={x} y={y} w={w} d={w} s={s} />
      <Rect x={x} y={y} width={w} height={w} rx={s * 0.03} fill="#E9C893" {...ink(s)} />
      <Rect x={x + w * 0.14} y={y + w * 0.14} width={w * 0.72} height={w * 0.72} rx={s * 0.02} fill={lid} />
      <Rect x={x + w * 0.14} y={y + w * 0.5} width={w * 0.72} height={w * 0.36} fill="#000" opacity={0.1} />
    </G>
  );
}

/** A few hive boxes among the flowers. */
function Beehives({ s, h }: { s: number; h: number }) {
  const lids = ["#FFFFFF", "#8FDDB0", "#7FCBF5", "#FF8F8F"];
  const w = s * 0.22;
  const k = Math.floor(h * lids.length);
  return (
    <G>
      {[
        [0.7, 0.62],
        [0.82, 0.8],
        [0.6, 0.82],
        [0.16, 0.84],
        [0.84, 0.16],
      ].map(([x, y], i) => (
        <Circle key={i} cx={s * x} cy={s * y} r={s * 0.05} fill={FLOWERS[(i + k) % FLOWERS.length]} stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={Math.max(0.6, s * 0.012)} />
      ))}
      <Hive x={s * 0.14} y={s * 0.16} w={w} lid={lids[k % lids.length]} s={s} />
      <Hive x={s * 0.52} y={s * 0.2} w={w} lid={lids[(k + 1) % lids.length]} s={s} />
      <Hive x={s * 0.28} y={s * 0.54} w={w} lid={lids[(k + 2) % lids.length]} s={s} />
    </G>
  );
}

// --- Sunset Canyon -----------------------------------------------------------------

/** An adobe house: a flat roof sunk behind its parapet, log ends poking out. */
function Adobe({ s, h }: { s: number; h: number }) {
  const wide = h > 0.5;
  const w = s * (wide ? 0.64 : 0.52);
  const d = s * (wide ? 0.5 : 0.6);
  const x = (s - w) / 2;
  const y = (s - d) / 2;
  const lip = s * 0.06;
  return (
    <G>
      <Shadow x={x} y={y} w={w} d={d} s={s} />
      {[0.3, 0.5, 0.7].map((f) => (
        <Rect key={f} x={x - s * 0.05} y={y + d * f - s * 0.025} width={s * 0.08} height={s * 0.05} rx={s * 0.02} fill={theme.trunk} />
      ))}
      <Rect x={x} y={y} width={w} height={d} rx={s * 0.03} fill={pick(["#D98A5C", "#E0A071", "#CF7B52"], h * 3)} {...ink(s)} />
      <Rect x={x + lip} y={y + lip} width={w - lip * 2} height={d - lip * 2} rx={s * 0.02} fill="#000" opacity={0.14} />
      <Rect x={x + w * 0.58} y={y + d * 0.24} width={s * 0.12} height={s * 0.08} rx={s * 0.015} fill="#B8663F" />
      <Circle cx={x + w * 0.32} cy={y + d * 0.66} r={s * 0.065} fill="#C47449" {...ink(s)} />
    </G>
  );
}

/** A saguaro with its arms up, a barrel cactus beside it on a good day. */
function Cactus({ s, h }: { s: number; h: number }) {
  const green = "#4E9E5A";
  const trunk = (dx: number, dy: number) => `M ${s * 0.48 + dx},${s * 0.78 + dy} L ${s * 0.48 + dx},${s * 0.22 + dy}`;
  const arms = (dx: number, dy: number) =>
    `M ${s * 0.48 + dx},${s * 0.56 + dy} L ${s * 0.32 + dx},${s * 0.56 + dy} L ${s * 0.32 + dx},${s * 0.4 + dy} ` +
    `M ${s * 0.48 + dx},${s * 0.46 + dy} L ${s * 0.64 + dx},${s * 0.46 + dy} L ${s * 0.64 + dx},${s * 0.3 + dy}`;
  const body = s * 0.13;
  const arm = s * 0.09;
  const off = s * 0.05;
  return (
    <G>
      <Ellipse cx={s * 0.52} cy={s * 0.8} rx={s * 0.24} ry={s * 0.08} fill={SAND} />
      <Path d={trunk(off, off)} stroke="#000" strokeOpacity={0.18} strokeWidth={body} strokeLinecap="round" />
      <Path d={arms(off, off)} stroke="#000" strokeOpacity={0.18} strokeWidth={arm} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d={trunk(0, 0)} stroke={green} strokeWidth={body} strokeLinecap="round" />
      <Path d={arms(0, 0)} stroke={green} strokeWidth={arm} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d={trunk(-s * 0.025, 0)} stroke="#72C07A" strokeWidth={Math.max(1, s * 0.025)} strokeLinecap="round" />
      <Circle cx={s * 0.48} cy={s * 0.2} r={s * 0.04} fill="#FF7AA8" />
      {h > 0.5 ? (
        <G>
          <Circle cx={s * 0.8} cy={s * 0.74} r={s * 0.09} fill="#000" opacity={0.16} />
          <Circle cx={s * 0.77} cy={s * 0.71} r={s * 0.09} fill={green} {...ink(s)} />
          <Circle cx={s * 0.77} cy={s * 0.71} r={s * 0.045} fill="#72C07A" />
          <Circle cx={s * 0.77} cy={s * 0.71} r={s * 0.022} fill="#FF7AA8" />
        </G>
      ) : null}
    </G>
  );
}

/**
 * A mesa, side-on like the cactus: a flat-topped butte banded in red rock.
 * (Drawn from above, as stacked layers, it read as a cushion.)
 */
function Mesa({ s, h }: { s: number; h: number }) {
  // Mirrored on half the hashes, so a canyon's mesas don't all lean one way.
  const X = (u: number) => (h > 0.5 ? s - u * s : u * s);
  const Y = (v: number) => v * s;
  const poly = (pts: number[][]) => `M ${pts.map(([u, v]) => `${X(u)},${Y(v)}`).join(" L ")} Z`;
  // The butte's left and right edges, for laying bands across it.
  const left = (v: number) => 0.24 - ((v - 0.36) / 0.44) * 0.1;
  const right = (v: number) => 0.78 + ((v - 0.38) / 0.42) * 0.08;
  const band = (v0: number, v1: number) =>
    poly([
      [left(v0), v0],
      [right(v0), v0],
      [right(v1), v1],
      [left(v1), v1],
    ]);
  return (
    <G>
      <Ellipse cx={s / 2 + s * 0.05} cy={Y(0.82)} rx={s * 0.4} ry={s * 0.08} fill="#000" opacity={0.18} />
      <Path d={poly([[0.14, 0.8], [0.24, 0.36], [0.32, 0.3], [0.7, 0.3], [0.78, 0.38], [0.86, 0.8]])} fill="#C9694A" {...ink(s)} />
      <Path d={poly([[0.24, 0.36], [0.32, 0.3], [0.7, 0.3], [0.78, 0.38]])} fill="#E8946B" />
      <Path d={band(0.5, 0.56)} fill="#A9543A" opacity={0.7} />
      <Path d={band(0.66, 0.71)} fill="#A9543A" opacity={0.7} />
      <Path d={poly([[0.62, 0.38], [0.78, 0.38], [0.86, 0.8], [0.66, 0.8]])} fill="#000" opacity={0.12} />
      <Ellipse cx={X(0.12)} cy={Y(0.84)} rx={s * 0.05} ry={s * 0.03} fill="#B5573A" />
      <Ellipse cx={X(0.9)} cy={Y(0.86)} rx={s * 0.04} ry={s * 0.025} fill="#B5573A" />
    </G>
  );
}

/** A palm from above: a star of fronds round the crown. */
function Palm({ x, y, r }: { x: number; y: number; r: number }) {
  const n = 7;
  const angles = Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2 + 0.3);
  return (
    <G>
      <Circle cx={x + r * 0.3} cy={y + r * 0.35} r={r * 0.9} fill="#000" opacity={0.16} />
      {angles.map((a, i) => (
        <Path key={i} d={leaf(x, y, r, a, r * 0.24)} fill="#3F9E4D" stroke="#2F7A3B" strokeWidth={Math.max(0.6, r * 0.05)} />
      ))}
      {angles.map((a, i) => (
        <Path
          key={`v${i}`}
          d={`M ${x},${y} L ${x + Math.cos(a) * r * 0.85},${y + Math.sin(a) * r * 0.85}`}
          stroke="#6DBB5F"
          strokeWidth={Math.max(0.6, r * 0.06)}
        />
      ))}
      <Circle cx={x} cy={y} r={r * 0.16} fill={theme.trunk} />
    </G>
  );
}

/** A spring in the sand, and the palm it keeps alive. */
function Oasis({ s }: { s: number }) {
  return (
    <G>
      <Sand s={s} />
      <Ellipse cx={s * 0.56} cy={s * 0.6} rx={s * 0.26} ry={s * 0.2} fill="#4AA8D0" />
      <Ellipse cx={s * 0.56} cy={s * 0.6} rx={s * 0.22} ry={s * 0.16} fill={theme.pond} />
      <Ellipse cx={s * 0.5} cy={s * 0.55} rx={s * 0.08} ry={s * 0.03} fill="#FFFFFF" opacity={0.6} />
      <Palm x={s * 0.32} y={s * 0.32} r={s * 0.2} />
    </G>
  );
}

// --- Palm Isles --------------------------------------------------------------------

function Palms({ s, h }: { s: number; h: number }) {
  return h < 0.5 ? (
    <G>
      <Palm x={s * 0.36} y={s * 0.38} r={s * 0.22} />
      <Palm x={s * 0.68} y={s * 0.66} r={s * 0.19} />
    </G>
  ) : (
    <G>
      <Palm x={s * 0.3} y={s * 0.3} r={s * 0.17} />
      <Palm x={s * 0.7} y={s * 0.38} r={s * 0.17} />
      <Palm x={s * 0.44} y={s * 0.72} r={s * 0.18} />
    </G>
  );
}

/** A round thatched hut: straw laid in ridges from the crown, a walkway out. */
function Tiki({ s, h }: { s: number; h: number }) {
  const c = s / 2;
  const r = s * 0.3;
  return (
    <G>
      {h > 0.5 ? <Rect x={c - s * 0.05} y={c + r * 0.8} width={s * 0.1} height={s * 0.18} rx={s * 0.02} fill={theme.trunk} /> : null}
      <Circle cx={c + s * 0.05} cy={c + s * 0.06} r={r} fill="#000" opacity={0.2} />
      <Circle cx={c} cy={c} r={r} fill="#D9B26A" {...ink(s)} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <Path
            key={i}
            d={`M ${c + Math.cos(a) * r * 0.3},${c + Math.sin(a) * r * 0.3} L ${c + Math.cos(a) * r * 0.95},${c + Math.sin(a) * r * 0.95}`}
            stroke="#B98F48"
            strokeWidth={Math.max(1, s * 0.02)}
          />
        );
      })}
      <Path d={`M ${c},${c - r} A ${r} ${r} 0 0 1 ${c},${c + r} Z`} fill="#000" opacity={0.12} />
      <Circle cx={c} cy={c} r={r * 0.3} fill="#E6C27E" />
      <Circle cx={c} cy={c} r={r * 0.12} fill={theme.trunk} />
    </G>
  );
}

/** A lagoon: warm shallow water inside a rim of sand. */
function Lagoon({ s }: { s: number }) {
  return (
    <G>
      <Ellipse cx={s / 2} cy={s / 2} rx={s * 0.4} ry={s * 0.33} fill={SAND} stroke={SAND_EDGE} strokeWidth={Math.max(1, s * 0.02)} />
      <Ellipse cx={s / 2} cy={s / 2} rx={s * 0.33} ry={s * 0.26} fill="#2FC1D3" />
      <Ellipse cx={s * 0.52} cy={s * 0.53} rx={s * 0.22} ry={s * 0.15} fill="#6FE3E6" />
      <Ellipse cx={s * 0.4} cy={s * 0.42} rx={s * 0.1} ry={s * 0.035} fill="#FFFFFF" opacity={0.6} />
    </G>
  );
}

// --- Frost Valley ------------------------------------------------------------------

/** A chalet under snow, its wooden eaves showing round the edge. */
function Chalet({ s, h }: { s: number; h: number }) {
  const w = s * 0.56;
  const d = s * 0.5;
  const x = (s - w) / 2;
  const y = (s - d) / 2;
  const e = s * 0.035;
  return (
    <G>
      <Shadow x={x - e} y={y - e} w={w + e * 2} d={d + e * 2} s={s} />
      <Rect x={x - e} y={y - e} width={w + e * 2} height={d + e * 2} rx={s * 0.05} fill="#8B5A3C" {...ink(s)} />
      <Roof x={x} y={y} w={w} d={d} s={s} fill="#F3F7FB" across={h > 0.5} />
      <Rect x={x + w * 0.66} y={y + d * 0.12} width={s * 0.1} height={s * 0.1} rx={s * 0.02} fill="#A9A399" />
      <Rect x={x + w * 0.66} y={y + d * 0.12} width={s * 0.1} height={s * 0.04} rx={s * 0.02} fill="#FFFFFF" />
    </G>
  );
}

/** A pine with snow lying on its boughs. */
function SnowPine({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <G>
      <Pine x={x} y={y} r={r} />
      <Circle cx={x - r * 0.25} cy={y - r * 0.3} r={r * 0.36} fill="#FFFFFF" opacity={0.92} />
      <Circle cx={x + r * 0.38} cy={y + r * 0.12} r={r * 0.2} fill="#FFFFFF" opacity={0.85} />
      <Circle cx={x - r * 0.12} cy={y + r * 0.48} r={r * 0.15} fill="#FFFFFF" opacity={0.8} />
    </G>
  );
}

function SnowPines({ s, h }: { s: number; h: number }) {
  return h < 0.4 ? (
    <G>
      <SnowPine x={s * 0.34} y={s * 0.36} r={s * 0.17} />
      <SnowPine x={s * 0.66} y={s * 0.62} r={s * 0.19} />
    </G>
  ) : (
    <G>
      <SnowPine x={s * 0.3} y={s * 0.3} r={s * 0.14} />
      <SnowPine x={s * 0.68} y={s * 0.36} r={s * 0.16} />
      <SnowPine x={s * 0.44} y={s * 0.68} r={s * 0.17} />
    </G>
  );
}

/** A snowman on his patch of snow: hat, scarf, carrot. */
function Snowman({ s }: { s: number }) {
  const dot = s * 0.018;
  return (
    <G>
      <Ellipse cx={s * 0.5} cy={s * 0.66} rx={s * 0.34} ry={s * 0.22} fill="#F4F8FC" opacity={0.95} />
      <Circle cx={s * 0.55} cy={s * 0.67} r={s * 0.2} fill="#000" opacity={0.14} />
      <Circle cx={s * 0.5} cy={s * 0.62} r={s * 0.2} fill="#FFFFFF" {...ink(s)} />
      <Circle cx={s * 0.5} cy={s * 0.35} r={s * 0.14} fill="#FFFFFF" {...ink(s)} />
      <Rect x={s * 0.38} y={s * 0.45} width={s * 0.24} height={s * 0.06} rx={s * 0.03} fill="#E84A5F" />
      <Rect x={s * 0.55} y={s * 0.45} width={s * 0.05} height={s * 0.13} rx={s * 0.02} fill="#E84A5F" />
      <Rect x={s * 0.37} y={s * 0.2} width={s * 0.26} height={s * 0.035} rx={s * 0.015} fill={theme.text} />
      <Rect x={s * 0.42} y={s * 0.11} width={s * 0.16} height={s * 0.1} rx={s * 0.02} fill={theme.text} />
      <Circle cx={s * 0.46} cy={s * 0.32} r={dot} fill={theme.text} />
      <Circle cx={s * 0.54} cy={s * 0.32} r={dot} fill={theme.text} />
      <Path d={`M ${s * 0.5},${s * 0.35} L ${s * 0.61},${s * 0.375} L ${s * 0.5},${s * 0.395} Z`} fill="#FF9F43" />
      <Circle cx={s * 0.5} cy={s * 0.6} r={dot * 1.2} fill={theme.text} />
      <Circle cx={s * 0.5} cy={s * 0.68} r={dot * 1.2} fill={theme.text} />
    </G>
  );
}

/** An ice rink: white boards round a sheet of ice, skate marks on it. */
function Rink({ s }: { s: number }) {
  const sw = Math.max(1, s * 0.022);
  return (
    <G>
      <Rect x={s * 0.15} y={s * 0.26} width={s * 0.8} height={s * 0.6} rx={s * 0.3} fill="#000" opacity={0.16} />
      <Rect x={s * 0.1} y={s * 0.2} width={s * 0.8} height={s * 0.6} rx={s * 0.3} fill="#FFFFFF" {...ink(s)} />
      <Rect x={s * 0.14} y={s * 0.24} width={s * 0.72} height={s * 0.52} rx={s * 0.26} fill="#CFEFFF" />
      <Path d={`M ${s * 0.5},${s * 0.24} L ${s * 0.5},${s * 0.76}`} stroke="#E84A5F" strokeOpacity={0.6} strokeWidth={sw} />
      <Circle cx={s * 0.5} cy={s * 0.5} r={s * 0.08} fill="none" stroke="#E84A5F" strokeOpacity={0.6} strokeWidth={sw} />
      <Path
        d={`M ${s * 0.22},${s * 0.4} Q ${s * 0.34},${s * 0.3} ${s * 0.42},${s * 0.42} M ${s * 0.58},${s * 0.62} Q ${s * 0.68},${s * 0.72} ${s * 0.78},${s * 0.6}`}
        stroke="#FFFFFF"
        strokeWidth={sw}
        fill="none"
        strokeLinecap="round"
      />
    </G>
  );
}

/** A frozen pond on a snowy bank, the ice cracked across. */
function Ice({ s }: { s: number }) {
  return (
    <G>
      <Ellipse cx={s / 2} cy={s / 2} rx={s * 0.4} ry={s * 0.33} fill="#F4F8FC" />
      <Ellipse cx={s / 2} cy={s / 2} rx={s * 0.34} ry={s * 0.27} fill="#BFE3F5" stroke="#9CCBE6" strokeWidth={Math.max(1, s * 0.02)} />
      <Ellipse cx={s * 0.42} cy={s * 0.42} rx={s * 0.13} ry={s * 0.045} fill="#FFFFFF" opacity={0.7} />
      <Path
        d={`M ${s * 0.28},${s * 0.56} L ${s * 0.4},${s * 0.5} L ${s * 0.5},${s * 0.58} L ${s * 0.64},${s * 0.52} M ${s * 0.5},${s * 0.58} L ${s * 0.54},${s * 0.68}`}
        stroke="#8FC3DE"
        strokeWidth={Math.max(1, s * 0.022)}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </G>
  );
}

/** A boulder with snow settled on its top. */
function SnowRock({ x, y, w, d }: { x: number; y: number; w: number; d: number }) {
  return (
    <G>
      <Rock x={x} y={y} w={w} d={d} />
      <Ellipse cx={x - w * 0.08} cy={y - d * 0.18} rx={w * 0.32} ry={d * 0.22} fill="#FFFFFF" opacity={0.95} />
    </G>
  );
}

function SnowRocks({ s, h }: { s: number; h: number }) {
  return h < 0.5 ? (
    <G>
      <SnowRock x={s * 0.44} y={s * 0.46} w={s * 0.5} d={s * 0.4} />
      <SnowRock x={s * 0.72} y={s * 0.72} w={s * 0.22} d={s * 0.18} />
    </G>
  ) : (
    <G>
      <SnowRock x={s * 0.34} y={s * 0.36} w={s * 0.32} d={s * 0.26} />
      <SnowRock x={s * 0.64} y={s * 0.5} w={s * 0.36} d={s * 0.3} />
      <SnowRock x={s * 0.36} y={s * 0.7} w={s * 0.2} d={s * 0.16} />
    </G>
  );
}

// --- Lantern Town ------------------------------------------------------------------

const LANTERNS = ["#FF6B5B", "#FFB347", "#FF8FB1"];

/** A house with a string of paper lanterns slung across its roof, glowing. */
function Lit({ s, h }: { s: number; h: number }) {
  const wide = h > 0.5;
  const w = s * (wide ? 0.66 : 0.52);
  const d = s * (wide ? 0.5 : 0.62);
  const x = (s - w) / 2;
  const y = (s - d) / 2;
  // The string sags from one corner of the roof to the other.
  const x0 = x;
  const y0 = y + d * 0.2;
  const x1 = x + w;
  const y1 = y + d * 0.8;
  const qx = (x0 + x1) / 2;
  const qy = (y0 + y1) / 2 + s * 0.08;
  const at = (t: number) => ({
    x: (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * qx + t * t * x1,
    y: (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * qy + t * t * y1,
  });
  return (
    <G>
      <Shadow x={x} y={y} w={w} d={d} s={s} />
      <Roof x={x} y={y} w={w} d={d} s={s} fill={pick(["#7A4E8F", "#4F5D9A", "#B0443A", "#3F7F7A"], h * 4)} across={wide} />
      <Path d={`M ${x0},${y0} Q ${qx},${qy} ${x1},${y1}`} stroke={theme.text} strokeOpacity={0.5} strokeWidth={Math.max(0.8, s * 0.015)} fill="none" />
      {[0.1, 0.3, 0.5, 0.7, 0.9].map((t, i) => {
        const p = at(t);
        return (
          <G key={i}>
            <Circle cx={p.x} cy={p.y} r={s * 0.075} fill="#FFD27A" opacity={0.35} />
            <Circle cx={p.x} cy={p.y} r={s * 0.036} fill={LANTERNS[(i + Math.floor(h * 3)) % LANTERNS.length]} {...ink(s)} />
          </G>
        );
      })}
    </G>
  );
}

/** A street lamp from above: its head, and the warm pool it throws. */
function Lamp({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={s * 0.2} fill="#FFE9A8" opacity={0.55} />
      <Circle cx={x} cy={y} r={s * 0.12} fill="#FFF3C4" opacity={0.6} />
      <Circle cx={x + s * 0.03} cy={y + s * 0.04} r={s * 0.045} fill="#000" opacity={0.2} />
      <Circle cx={x} cy={y} r={s * 0.045} fill="#FFF8DC" {...ink(s)} />
    </G>
  );
}

/** A lamplit square: paving, two lamps, and a bench on a good day. */
function Lamps({ s, h }: { s: number; h: number }) {
  return (
    <G>
      <Rect x={s * 0.08} y={s * 0.08} width={s * 0.84} height={s * 0.84} rx={s * 0.12} fill="#D8D2C4" />
      <Lamp x={s * 0.3} y={s * 0.32} s={s} />
      <Lamp x={s * 0.7} y={s * 0.68} s={s} />
      {h > 0.5 ? <Rect x={s * 0.56} y={s * 0.2} width={s * 0.22} height={s * 0.07} rx={s * 0.02} fill={theme.trunk} /> : null}
    </G>
  );
}

// --- Ember Ridge -------------------------------------------------------------------

/** A house roofed in the dark stone of the mountain, its chimney glowing. */
function StoneHouse({ s, h }: { s: number; h: number }) {
  const wide = h > 0.5;
  const w = s * (wide ? 0.64 : 0.5);
  const d = s * (wide ? 0.5 : 0.62);
  const x = (s - w) / 2;
  const y = (s - d) / 2;
  return (
    <G>
      <Shadow x={x} y={y} w={w} d={d} s={s} />
      {/* Warm tuff, not charcoal: a dark grey roof with a pale ridge line is
          exactly what a piece of road looks like at 8×8. */}
      <Roof x={x} y={y} w={w} d={d} s={s} fill={pick(["#8C6A5C", "#7A5E54", "#96786A"], h * 3)} across={wide} />
      {[
        [0.2, 0.22],
        [0.36, 0.7],
        [0.7, 0.66],
      ].map(([u, v], i) => (
        <Rect key={i} x={x + w * u} y={y + d * v} width={s * 0.08} height={s * 0.05} rx={s * 0.02} fill="#000" opacity={0.14} />
      ))}
      <Rect x={x + w * 0.64} y={y + d * 0.12} width={s * 0.1} height={s * 0.1} rx={s * 0.02} fill="#8A847C" />
      <Circle cx={x + w * 0.64 + s * 0.05} cy={y + d * 0.12 + s * 0.05} r={s * 0.025} fill="#FF9A5A" />
    </G>
  );
}

/** A lump of lava rock, still glowing in its cracks. */
function LavaStone({ x, y, w, d }: { x: number; y: number; w: number; d: number }) {
  const crack =
    `M ${x - w * 0.3},${y + d * 0.05} L ${x - w * 0.05},${y - d * 0.12} ` +
    `L ${x + w * 0.12},${y + d * 0.12} L ${x + w * 0.3},${y - d * 0.02}`;
  return (
    <G>
      <Ellipse cx={x + w * 0.12} cy={y + d * 0.18} rx={w / 2} ry={d / 2} fill="#000" opacity={0.22} />
      <Ellipse cx={x} cy={y} rx={w / 2} ry={d / 2} fill="#3F3739" stroke={theme.text} strokeOpacity={0.35} strokeWidth={Math.max(1, w * 0.05)} />
      <Ellipse cx={x - w * 0.14} cy={y - d * 0.18} rx={w * 0.22} ry={d * 0.16} fill="#5A5054" />
      <Path d={crack} stroke="#FF7A3D" strokeWidth={Math.max(1, w * 0.08)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={crack} stroke="#FFD27A" strokeWidth={Math.max(0.6, w * 0.03)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </G>
  );
}

function LavaRocks({ s, h }: { s: number; h: number }) {
  return h < 0.5 ? (
    <G>
      <LavaStone x={s * 0.44} y={s * 0.46} w={s * 0.5} d={s * 0.4} />
      <LavaStone x={s * 0.72} y={s * 0.72} w={s * 0.22} d={s * 0.18} />
    </G>
  ) : (
    <G>
      <LavaStone x={s * 0.34} y={s * 0.36} w={s * 0.32} d={s * 0.26} />
      <LavaStone x={s * 0.64} y={s * 0.52} w={s * 0.36} d={s * 0.3} />
    </G>
  );
}

/** A hot spring in a ring of stones, steaming. */
function HotSpring({ s }: { s: number }) {
  const wisp = (x: number, y: number) =>
    `M ${x},${y} C ${x + s * 0.05},${y - s * 0.06} ${x - s * 0.05},${y - s * 0.12} ${x},${y - s * 0.18}`;
  return (
    <G>
      <Ellipse cx={s / 2 + s * 0.03} cy={s / 2 + s * 0.05} rx={s * 0.4} ry={s * 0.33} fill="#000" opacity={0.16} />
      <Ellipse cx={s / 2} cy={s / 2} rx={s * 0.4} ry={s * 0.33} fill="#A9A399" {...ink(s)} />
      <Ellipse cx={s / 2} cy={s / 2} rx={s * 0.32} ry={s * 0.25} fill="#3FB8A8" />
      <Ellipse cx={s * 0.52} cy={s * 0.53} rx={s * 0.22} ry={s * 0.15} fill="#7FDCCF" />
      {[
        [0.4, 0.56],
        [0.54, 0.5],
        [0.64, 0.6],
      ].map(([x, y], i) => (
        <Path key={i} d={wisp(s * x, s * y)} stroke="#FFFFFF" strokeOpacity={0.75} strokeWidth={Math.max(1, s * 0.03)} fill="none" strokeLinecap="round" />
      ))}
    </G>
  );
}

// --- Blossom Valley ----------------------------------------------------------------

/** A cherry tree in flower. */
function Blossom({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <G>
      <Ellipse cx={x + r * 0.25} cy={y + r * 0.35} rx={r} ry={r * 0.9} fill="#000" opacity={0.16} />
      <Circle cx={x} cy={y} r={r} fill="#F29BC0" />
      <Circle cx={x - r * 0.28} cy={y - r * 0.28} r={r * 0.55} fill="#FFC4DC" />
      {[
        [0.45, 0.1],
        [-0.1, 0.5],
        [0.2, -0.55],
        [-0.55, 0.05],
        [0.35, 0.45],
      ].map(([u, v], i) => (
        <Circle key={i} cx={x + u * r} cy={y + v * r} r={r * 0.1} fill="#FFFFFF" opacity={0.85} />
      ))}
    </G>
  );
}

/** Cherry trees, and the petals they have let go of. */
function Cherry({ s, h }: { s: number; h: number }) {
  const petals = [
    [0.16, 0.8],
    [0.84, 0.2],
    [0.8, 0.86],
    [0.22, 0.14],
  ];
  return (
    <G>
      {petals.map(([x, y], i) => (
        <Circle key={i} cx={s * x} cy={s * y} r={s * 0.025} fill="#F7A8C8" />
      ))}
      {h < 0.33 ? (
        <Blossom x={s * 0.5} y={s * 0.48} r={s * 0.25} />
      ) : h < 0.7 ? (
        <G>
          <Blossom x={s * 0.34} y={s * 0.36} r={s * 0.18} />
          <Blossom x={s * 0.64} y={s * 0.62} r={s * 0.2} />
        </G>
      ) : (
        <G>
          <Blossom x={s * 0.3} y={s * 0.32} r={s * 0.15} />
          <Blossom x={s * 0.68} y={s * 0.34} r={s * 0.15} />
          <Blossom x={s * 0.47} y={s * 0.68} r={s * 0.17} />
        </G>
      )}
    </G>
  );
}

/** A teahouse: a tiled roof on red beams, stepping stones to its door. */
function Teahouse({ s, h }: { s: number; h: number }) {
  const w = s * 0.56;
  const d = s * 0.46;
  const x = (s - w) / 2;
  const y = s * 0.18;
  const e = s * 0.04;
  return (
    <G>
      <Shadow x={x - e} y={y - e} w={w + e * 2} d={d + e * 2} s={s} />
      <Rect x={x - e} y={y - e} width={w + e * 2} height={d + e * 2} rx={s * 0.08} fill="#C8453C" {...ink(s)} />
      <Roof x={x} y={y} w={w} d={d} s={s} fill={pick(["#3F8A8F", "#5E8A4F", "#7A62A8"], h * 3)} across />
      <Circle cx={s * 0.5} cy={s * 0.78} r={s * 0.045} fill="#C8C2B6" {...ink(s)} />
      <Circle cx={s * 0.42} cy={s * 0.89} r={s * 0.04} fill="#C8C2B6" {...ink(s)} />
    </G>
  );
}

/** A koi, from its tail (x, y) out along angle `a`. */
function Fish({ x, y, a, len, colour }: { x: number; y: number; a: number; len: number; colour: string }) {
  const bx = x - Math.cos(a) * len * 0.22;
  const by = y - Math.sin(a) * len * 0.22;
  const nx = -Math.sin(a) * len * 0.16;
  const ny = Math.cos(a) * len * 0.16;
  return (
    <G>
      <Path d={`M ${x},${y} L ${bx + nx},${by + ny} L ${bx - nx},${by - ny} Z`} fill={colour} opacity={0.9} />
      <Path d={leaf(x, y, len, a, len * 0.26)} fill={colour} />
      <Circle cx={x + Math.cos(a) * len * 0.55} cy={y + Math.sin(a) * len * 0.55} r={len * 0.1} fill={colour === "#FFFFFF" ? "#FF8A3D" : "#FFFFFF"} opacity={0.9} />
    </G>
  );
}

/** A koi pond in its ring of stones, a lily pad on it. */
function Koi({ s }: { s: number }) {
  return (
    <G>
      <Ellipse cx={s / 2} cy={s / 2} rx={s * 0.4} ry={s * 0.33} fill="#C8C2B6" {...ink(s)} />
      <Ellipse cx={s / 2} cy={s / 2} rx={s * 0.34} ry={s * 0.27} fill="#3A8FB8" />
      <Ellipse cx={s * 0.4} cy={s * 0.38} rx={s * 0.1} ry={s * 0.035} fill="#FFFFFF" opacity={0.45} />
      <Circle cx={s * 0.66} cy={s * 0.38} r={s * 0.07} fill="#63B847" />
      <Path d={`M ${s * 0.66},${s * 0.38} L ${s * 0.74},${s * 0.34} L ${s * 0.74},${s * 0.42} Z`} fill="#3A8FB8" />
      <Fish x={s * 0.3} y={s * 0.6} a={-0.35} len={s * 0.2} colour="#FF8A3D" />
      <Fish x={s * 0.66} y={s * 0.62} a={2.7} len={s * 0.17} colour="#FFFFFF" />
    </G>
  );
}

// --- Castle Hill -------------------------------------------------------------------

/** A round tower: battlements round a conical roof, a pennant at its point. */
function Turret({ s, h }: { s: number; h: number }) {
  const c = s / 2;
  const r = s * 0.32;
  const roof = pick(["#5F7FD6", "#C8453C", "#7A4FC4", "#27B9A8"], h * 4);
  const flag = roof === "#C8453C" ? "#FFFFFF" : "#E84A5F";
  const m = r * 0.2;
  return (
    <G>
      <Circle cx={c + s * 0.06} cy={c + s * 0.07} r={r} fill="#000" opacity={0.22} />
      <Circle cx={c} cy={c} r={r} fill="#C9C4BA" {...ink(s)} />
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return (
          <Rect
            key={i}
            x={c + Math.cos(a) * r * 0.84 - m / 2}
            y={c + Math.sin(a) * r * 0.84 - m / 2}
            width={m}
            height={m}
            rx={m * 0.2}
            fill="#E0DCD3"
          />
        );
      })}
      <Circle cx={c} cy={c} r={r * 0.62} fill={roof} {...ink(s)} />
      <Path d={`M ${c},${c - r * 0.62} A ${r * 0.62} ${r * 0.62} 0 0 1 ${c},${c + r * 0.62} Z`} fill="#000" opacity={0.16} />
      <Path d={`M ${c},${c} L ${c + r * 0.62},${c - r * 0.3} L ${c + r * 0.05},${c - r * 0.5} Z`} fill={flag} {...ink(s)} />
      <Circle cx={c} cy={c} r={s * 0.025} fill={theme.trunk} />
    </G>
  );
}

/** A square keep: battlements round a sunken roof, its banner flying. */
function Keep({ s, h }: { s: number; h: number }) {
  const x = s * 0.16;
  const w = s * 0.68;
  const deck = "#A7A196";
  const notch = s * 0.06;
  const at = [0.3, 0.5, 0.7];
  return (
    <G>
      <Rect x={x + s * 0.07} y={x + s * 0.09} width={w} height={w} rx={s * 0.04} fill="#000" opacity={0.24} />
      <Rect x={x} y={x} width={w} height={w} rx={s * 0.03} fill="#C9C4BA" {...ink(s)} />
      <Rect x={x + s * 0.08} y={x + s * 0.08} width={w - s * 0.16} height={w - s * 0.16} rx={s * 0.02} fill={deck} />
      {at.flatMap((f, i) => [
        <Rect key={`t${i}`} x={s * f - notch / 2} y={x} width={notch} height={s * 0.08} fill={deck} />,
        <Rect key={`b${i}`} x={s * f - notch / 2} y={x + w - s * 0.08} width={notch} height={s * 0.08} fill={deck} />,
        <Rect key={`l${i}`} x={x} y={s * f - notch / 2} width={s * 0.08} height={notch} fill={deck} />,
        <Rect key={`r${i}`} x={x + w - s * 0.08} y={s * f - notch / 2} width={s * 0.08} height={notch} fill={deck} />,
      ])}
      <Rect x={s * 0.36} y={s * 0.58} width={s * 0.1} height={s * 0.08} rx={s * 0.015} fill={theme.trunk} />
      <Path
        d={`M ${s * 0.56},${s * 0.34} L ${s * 0.76},${s * 0.4} L ${s * 0.56},${s * 0.46} Z`}
        fill={pick(["#5F7FD6", "#E84A5F", "#7A4FC4"], h * 3)}
        {...ink(s)}
      />
      <Circle cx={s * 0.56} cy={s * 0.34} r={s * 0.025} fill={theme.trunk} />
    </G>
  );
}

/** A hedge maze on gravel, mirrored on half the hashes. */
function Maze({ s, h }: { s: number; h: number }) {
  const p = (i: number) => s * (0.16 + i * 0.17);
  const X = (i: number) => (h > 0.5 ? s - p(i) : p(i));
  const walls =
    // the outer hedge, open at one corner and the opposite one
    `M ${X(0)},${p(1)} L ${X(0)},${p(4)} L ${X(4)},${p(4)} ` +
    `M ${X(1)},${p(0)} L ${X(4)},${p(0)} L ${X(4)},${p(3)} ` +
    // the inside
    `M ${X(1)},${p(1)} L ${X(3)},${p(1)} M ${X(2)},${p(1)} L ${X(2)},${p(3)} ` +
    `M ${X(0)},${p(3)} L ${X(1)},${p(3)} M ${X(3)},${p(2)} L ${X(3)},${p(4)}`;
  return (
    <G>
      <Rect x={s * 0.08} y={s * 0.08} width={s * 0.84} height={s * 0.84} rx={s * 0.08} fill="#E3D6B8" />
      <Path d={walls} stroke="#000" strokeOpacity={0.16} strokeWidth={s * 0.08} strokeLinecap="square" fill="none" transform={`translate(${s * 0.02},${s * 0.03})`} />
      <Path d={walls} stroke="#3F8A3A" strokeWidth={s * 0.08} strokeLinecap="square" strokeLinejoin="miter" fill="none" />
      <Path d={walls} stroke="#5AAE4E" strokeWidth={s * 0.025} strokeLinecap="round" fill="none" />
    </G>
  );
}
