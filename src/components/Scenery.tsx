// The world the board sits in: sky, sun, weather drifting past, a far ridge and
// rolling hills. Drawn, not photographed, so it scales to any screen and shares
// its palette with the board exactly.
//
// **Each region brings its own world** (`LOOKS` in `theme.ts`): the sky's
// colours, what stands on the far ridge — windmills in the meadows, a skyline in
// the city, a lighthouse over the harbour, a volcano on Ember Ridge — and what
// drifts across it: clouds, snow, falling leaves, petals, embers, stars. The
// ridge is drawn side-on and in the haze, because it is far away; the one thing
// on screen that is close and seen from above is the board.
//
// Only the weather moves, and slowly — the backdrop is there to make the board
// feel like an object in a place, and anything busier would compete with the
// puzzle. Every motion is a native-driver transform or opacity, so the scenery
// costs the JS thread nothing while the player is dragging road. And it is
// memoised on its props: the game screen re-renders on every step of road, and
// the sky has no reason to be redrawn with it.

import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import type { RegionId } from "../game/levels";
import { lookFor, theme, type Look, type Skyline, type Weather } from "../theme";

/** A soft hill line across the whole width, as an SVG path closed to the bottom. */
function hillPath(w: number, h: number, base: number, amp: number, waves: number, phase: number) {
  let d = `M 0,${h} L 0,${base}`;
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w;
    const y = base - Math.sin((i / steps) * Math.PI * waves + phase) * amp - Math.sin((i / steps) * Math.PI * 1.3 + phase * 2) * amp * 0.35;
    d += ` L ${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return `${d} L ${w},${h} Z`;
}

/** Mix two `#rrggbb` colours; `t` = 0 is `a`, 1 is `b`. */
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const x = (pa >> shift) & 255;
    const y = (pb >> shift) & 255;
    return Math.round(x + (y - x) * t);
  };
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}
const lighter = (c: string, t: number) => mix(c, "#FFFFFF", t);
const darker = (c: string, t: number) => mix(c, "#000000", t);

/** A fixed scatter in [0, 1): the same backdrop on every render and every device. */
const rnd = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export const Scenery = React.memo(function Scenery({
  horizon = 0.62,
  sun = true,
  decor = true,
  width,
  height,
  region,
}: {
  /** Where the far hills start, as a fraction of the screen height. */
  horizon?: number;
  sun?: boolean;
  /** What stands on the far ridge — the region's skyline, or cottages and trees. */
  decor?: boolean;
  /**
   * The size to draw at, when it isn't the window's. On Android the window
   * leaves out the system bars, so anything covering the whole screen passes
   * its measured size rather than stopping short of the bottom.
   */
  width?: number;
  height?: number;
  /** Whose world to draw; the classic one when unset. */
  region?: RegionId;
}) {
  const win = useWindowDimensions();
  const w = width ?? win.width;
  const h = height ?? win.height;
  const base = h * horizon;
  const look = lookFor(region);

  const hills = useMemo(
    () => ({
      far: hillPath(w, h, base, h * 0.035, 2.2, 0.4),
      mid: hillPath(w, h, base + h * 0.07, h * 0.04, 1.6, 2.1),
      near: hillPath(w, h, base + h * 0.15, h * 0.03, 2.6, 4.2),
    }),
    [w, h, base],
  );

  const ctx: Ctx = {
    w,
    h,
    base,
    u: Math.max(12, w * 0.048),
    haze: look.haze,
    // The far hill's own line, so what stands on it stands *on* it.
    ridge: (fx) =>
      look.sea
        ? base - h * 0.012
        : base - Math.sin(fx * Math.PI * 2.2 + 0.4) * h * 0.035 - Math.sin(fx * Math.PI * 1.3 + 0.8) * h * 0.035 * 0.35,
  };

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={look.skyTop} />
            <Stop offset="1" stopColor={look.skyLow} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} fill="url(#sky)" />
        {look.weather === "stars" ? <StarField w={w} h={base} /> : null}
        {sun && look.sun ? (
          look.night ? (
            <Moon x={w * 0.84} y={h * 0.1} r={w * 0.07} colour={look.sun} sky={look.skyTop} />
          ) : (
            <G>
              <Circle cx={w * 0.84} cy={h * 0.1} r={w * 0.2} fill={look.sun} opacity={0.18} />
              <Circle cx={w * 0.84} cy={h * 0.1} r={w * 0.13} fill={look.sun} opacity={0.3} />
              <Circle cx={w * 0.84} cy={h * 0.1} r={w * 0.075} fill={look.sun} />
            </G>
          )
        ) : null}
        {decor ? <SkylineArt kind={look.skyline} ctx={ctx} layer="back" /> : null}
        {look.sea ? <Sea ctx={ctx} colour={look.sea} /> : <Path d={hills.far} fill={look.hillFar} />}
        {decor ? <SkylineArt kind={look.skyline} ctx={ctx} layer="ridge" /> : null}
        <Path d={hills.mid} fill={look.hillMid} />
        <Path d={hills.near} fill={look.hillNear} />
      </Svg>
      <WeatherLayer key={look.weather} kind={look.weather} look={look} w={w} h={h} base={base} />
    </View>
  );
});

// --- the far ridge ------------------------------------------------------------

type Ctx = {
  w: number;
  h: number;
  base: number;
  /** One unit of skyline: a cottage is about one of these wide. */
  u: number;
  haze: string;
  /** Height of the far ridge at a fraction of the width. */
  ridge: (fx: number) => number;
};

/**
 * What stands on the far ridge. `back` is drawn before the far hill, so the hill
 * swallows its foot and it reads as standing *behind* the ridge — mountains, a
 * skyline; `ridge` is drawn on top of it, for the things that stand along it.
 */
function SkylineArt({ kind, ctx, layer }: { kind: Skyline; ctx: Ctx; layer: "back" | "ridge" }) {
  const back = layer === "back";
  switch (kind) {
    case "cottages":
      return back ? null : <Cottages ctx={ctx} />;
    case "windmills":
      return back ? null : <Windmills ctx={ctx} />;
    case "spire":
      return back ? null : <Spire ctx={ctx} />;
    case "market":
      return back ? <MarketRoofs ctx={ctx} /> : null;
    case "bridge":
      return back ? <Bridge ctx={ctx} /> : null;
    case "city":
      return back ? <City ctx={ctx} /> : null;
    case "peaks":
      return back ? <Peaks ctx={ctx} snow={0.26} /> : <RidgePines ctx={ctx} snowy={false} />;
    case "cloudsea":
      return back ? <Peaks ctx={ctx} snow={0.34} pale /> : <CloudBank ctx={ctx} />;
    case "harbour":
      return back ? null : <Harbour ctx={ctx} />;
    case "orchard":
      return back ? null : <OrchardRows ctx={ctx} />;
    case "mesas":
      return back ? <Mesas ctx={ctx} /> : <Saguaros ctx={ctx} />;
    case "islands":
      return back ? null : <Islands ctx={ctx} />;
    case "snowpeaks":
      return back ? <Peaks ctx={ctx} snow={0.5} /> : <RidgePines ctx={ctx} snowy />;
    case "lanterns":
      return back ? <NightRoofs ctx={ctx} /> : <LanternStrings ctx={ctx} />;
    case "volcano":
      return back ? <Volcano ctx={ctx} /> : null;
    case "pagoda":
      return back ? null : <Pagoda ctx={ctx} />;
    case "castle":
      return back ? <Castle ctx={ctx} /> : null;
  }
}

/** A tree side-on: a trunk and a round crown. */
function FarTree({ x, y, r, crown, trunk }: { x: number; y: number; r: number; crown: string; trunk: string }) {
  return (
    <G>
      <Rect x={x - r * 0.18} y={y - r * 1.1} width={r * 0.36} height={r * 1.2} fill={trunk} />
      <Circle cx={x} cy={y - r * 1.6} r={r} fill={crown} />
      <Circle cx={x - r * 0.3} cy={y - r * 1.85} r={r * 0.45} fill={lighter(crown, 0.18)} />
    </G>
  );
}

/** A cottage side-on: walls, a pitched roof, a door. */
function FarHouse({ x, y, s, wall, roof }: { x: number; y: number; s: number; wall: string; roof: string }) {
  return (
    <G>
      <Rect x={x - s * 0.45} y={y - s * 0.7} width={s * 0.9} height={s * 0.75} fill={wall} />
      <Path d={`M ${x - s * 0.6},${y - s * 0.66} L ${x},${y - s * 1.2} L ${x + s * 0.6},${y - s * 0.66} Z`} fill={roof} />
      <Rect x={x - s * 0.12} y={y - s * 0.35} width={s * 0.24} height={s * 0.4} fill={darker(wall, 0.35)} />
    </G>
  );
}

/** The classic ridge: a few cottages and trees, in colour. */
function Cottages({ ctx }: { ctx: Ctx }) {
  const { w, h, base } = ctx;
  const s = Math.max(10, w * 0.035);
  const y0 = base + h * 0.02;
  const items = [
    { x: 0.08, k: "tree" },
    { x: 0.14, k: "house", roof: theme.roofs[0] },
    { x: 0.3, k: "tree" },
    { x: 0.62, k: "house", roof: theme.roofs[2] },
    { x: 0.7, k: "tree" },
    { x: 0.76, k: "tree" },
    { x: 0.9, k: "house", roof: theme.roofs[1] },
  ];
  return (
    <G>
      {items.map((it, i) => {
        const x = it.x * w;
        const y = y0 - Math.sin(it.x * Math.PI * 2.2 + 0.4) * w * 0.04;
        if (it.k === "tree")
          return (
            <G key={i}>
              <Rect x={x - s * 0.08} y={y - s * 0.5} width={s * 0.16} height={s * 0.6} fill={theme.trunk} />
              <Circle cx={x} cy={y - s * 0.8} r={s * 0.45} fill={theme.bush} />
              <Circle cx={x - s * 0.12} cy={y - s * 0.92} r={s * 0.22} fill={theme.bushLight} />
            </G>
          );
        return <FarHouse key={i} x={x} y={y} s={s} wall={theme.walls[i % theme.walls.length]} roof={it.roof ?? theme.roofs[0]} />;
      })}
    </G>
  );
}

/** Meadow Lane: windmills turning over the fields — or they would, if they moved. */
function Windmills({ ctx }: { ctx: Ctx }) {
  const { w, u, haze } = ctx;
  const mill = (fx: number, k: number) => {
    const x = fx * w;
    const y = ctx.ridge(fx) + u * 0.25;
    const s = u * (k === 1 ? 1.15 : 0.9);
    const hub = { x, y: y - s * 2.75 };
    const blade = (a: number) => {
      const r = (a * Math.PI) / 180;
      return `M ${hub.x},${hub.y} L ${hub.x + Math.cos(r) * s * 1.9},${hub.y + Math.sin(r) * s * 1.9}`;
    };
    return (
      <G key={fx}>
        <Path d={`M ${x - s * 0.55},${y} L ${x - s * 0.3},${y - s * 2.6} L ${x + s * 0.3},${y - s * 2.6} L ${x + s * 0.55},${y} Z`} fill={lighter(haze, 0.25)} />
        <Path d={`M ${x - s * 0.42},${y - s * 2.55} L ${x},${y - s * 3.05} L ${x + s * 0.42},${y - s * 2.55} Z`} fill={darker(haze, 0.12)} />
        <Rect x={x - s * 0.14} y={y - s * 0.6} width={s * 0.28} height={s * 0.6} fill={darker(haze, 0.2)} />
        {[20 + k * 25, 110 + k * 25, 200 + k * 25, 290 + k * 25].map((a) => (
          <Path key={a} d={blade(a)} stroke={darker(haze, 0.05)} strokeWidth={s * 0.32} strokeLinecap="butt" />
        ))}
        <Circle cx={hub.x} cy={hub.y} r={s * 0.16} fill={darker(haze, 0.25)} />
      </G>
    );
  };
  return (
    <G>
      {[0.26, 0.4, 0.84].map((fx) => (
        <FarTree key={fx} x={fx * w} y={ctx.ridge(fx) + u * 0.3} r={u * 0.42} crown={darker(haze, 0.05)} trunk={darker(haze, 0.3)} />
      ))}
      {mill(0.12, 0)}
      {mill(0.64, 1)}
      {mill(0.93, 2)}
    </G>
  );
}

/** Village Green: cottages round a church, its spire the tallest thing for miles. */
function Spire({ ctx }: { ctx: Ctx }) {
  const { w, u, haze } = ctx;
  const wall = lighter(haze, 0.3);
  const roof = darker(haze, 0.08);
  const cx = 0.7 * w;
  const cy = ctx.ridge(0.7) + u * 0.3;
  return (
    <G>
      {[0.08, 0.34, 0.9].map((fx) => (
        <FarTree key={fx} x={fx * w} y={ctx.ridge(fx) + u * 0.3} r={u * 0.45} crown={darker(haze, 0.04)} trunk={darker(haze, 0.3)} />
      ))}
      {[0.17, 0.25, 0.56, 0.82].map((fx, i) => (
        <FarHouse key={fx} x={fx * w} y={ctx.ridge(fx) + u * 0.3} s={u * (i % 2 ? 0.85 : 1)} wall={wall} roof={roof} />
      ))}
      <Rect x={cx - u * 1.2} y={cy - u * 1.3} width={u * 1.9} height={u * 1.35} fill={wall} />
      <Path d={`M ${cx - u * 1.35},${cy - u * 1.25} L ${cx - u * 0.25},${cy - u * 2.1} L ${cx + u * 0.85},${cy - u * 1.25} Z`} fill={roof} />
      <Rect x={cx + u * 0.5} y={cy - u * 3.2} width={u * 0.8} height={u * 3.25} fill={lighter(haze, 0.22)} />
      <Path d={`M ${cx + u * 0.42},${cy - u * 3.15} L ${cx + u * 0.9},${cy - u * 5.1} L ${cx + u * 1.38},${cy - u * 3.15} Z`} fill={roof} />
      <Circle cx={cx + u * 0.9} cy={cy - u * 2.6} r={u * 0.18} fill={darker(haze, 0.2)} />
      <Rect x={cx - u * 0.45} y={cy - u * 0.65} width={u * 0.3} height={u * 0.7} fill={darker(haze, 0.25)} />
    </G>
  );
}

/** Market Town: gabled shopfronts shoulder to shoulder, a clock tower, bunting. */
function MarketRoofs({ ctx }: { ctx: Ctx }) {
  const { w, h, u, haze } = ctx;
  const foot = ctx.base + h * 0.04;
  const houses: React.ReactNode[] = [];
  let x = -u * 0.4;
  let i = 0;
  while (x < w) {
    const bw = u * (1.1 + rnd(i, 1) * 0.7);
    const top = ctx.ridge(Math.min(1, x / w)) - u * (1.2 + rnd(i, 2) * 1.3);
    const fill = i % 2 ? lighter(haze, 0.12) : lighter(haze, 0.24);
    houses.push(
      <G key={i}>
        <Rect x={x} y={top} width={bw} height={foot - top} fill={fill} />
        <Path d={`M ${x - u * 0.05},${top + u * 0.05} L ${x + bw / 2},${top - u * 0.7} L ${x + bw + u * 0.05},${top + u * 0.05} Z`} fill={darker(haze, 0.06)} />
        <Rect x={x + bw * 0.3} y={top + u * 0.4} width={bw * 0.4} height={u * 0.45} fill={darker(haze, 0.15)} />
      </G>,
    );
    x += bw + u * 0.08;
    i++;
  }
  const tx = w * 0.5;
  const tTop = ctx.ridge(0.5) - u * 4.4;
  const flags = ["#E84A5F", "#FFC83D", "#2E9CCA", "#27B9A8"];
  const bx0 = w * 0.08;
  const bx1 = w * 0.4;
  const by = ctx.ridge(0.2) - u * 2.3;
  return (
    <G>
      {houses}
      <Rect x={tx - u * 0.55} y={tTop} width={u * 1.1} height={foot - tTop} fill={lighter(haze, 0.18)} />
      <Path d={`M ${tx - u * 0.7},${tTop + u * 0.05} L ${tx},${tTop - u * 1.2} L ${tx + u * 0.7},${tTop + u * 0.05} Z`} fill={darker(haze, 0.12)} />
      <Circle cx={tx} cy={tTop + u * 0.7} r={u * 0.36} fill={lighter(haze, 0.6)} />
      <Path d={`M ${tx},${tTop + u * 0.7} L ${tx},${tTop + u * 0.45} M ${tx},${tTop + u * 0.7} L ${tx + u * 0.18},${tTop + u * 0.78}`} stroke={darker(haze, 0.3)} strokeWidth={u * 0.06} />
      <Path d={`M ${bx0},${by} Q ${(bx0 + bx1) / 2},${by + u * 0.9} ${bx1},${by}`} stroke={darker(haze, 0.2)} strokeWidth={u * 0.05} fill="none" />
      {Array.from({ length: 7 }, (_, k) => {
        const t = (k + 0.5) / 7;
        const fx = bx0 + (bx1 - bx0) * t;
        const fy = by + u * 0.9 * 2 * t * (1 - t);
        return (
          <Path key={k} d={`M ${fx - u * 0.16},${fy} L ${fx + u * 0.16},${fy} L ${fx},${fy + u * 0.36} Z`} fill={mix(flags[k % 4], haze, 0.3)} />
        );
      })}
    </G>
  );
}

/** Riverside City: a stone bridge of many arches, and a terrace along the far bank. */
function Bridge({ ctx }: { ctx: Ctx }) {
  const { w, h, u, haze } = ctx;
  const deck = ctx.base - u * 1.9;
  const foot = ctx.base + h * 0.05;
  const x0 = -u * 0.5;
  const x1 = w * 0.62;
  const spans = 5;
  const sw = (x1 - x0) / spans;
  const pier = sw * 0.16;
  const r = (sw - pier) / 2;
  let d = `M ${x0},${foot} L ${x0},${deck} L ${x1},${deck} L ${x1},${foot}`;
  for (let k = spans - 1; k >= 0; k--) {
    const right = x0 + sw * (k + 1) - pier / 2;
    const left = x0 + sw * k + pier / 2;
    const spring = deck + u * 0.55 + r;
    d += ` L ${right},${foot} L ${right},${spring} A ${r},${r} 0 0 0 ${left},${spring} L ${left},${foot}`;
  }
  d += " Z";
  const terrace: React.ReactNode[] = [];
  for (let k = 0; k < 7; k++) {
    const bx = x1 + u * 0.4 + k * u * 0.95;
    if (bx > w) break;
    const top = ctx.ridge(bx / w) - u * (1.6 + (k % 3) * 0.35);
    terrace.push(
      <G key={k}>
        <Rect x={bx} y={top} width={u * 0.9} height={foot - top} fill={k % 2 ? lighter(haze, 0.14) : lighter(haze, 0.26)} />
        <Path d={`M ${bx},${top} L ${bx + u * 0.45},${top - u * 0.5} L ${bx + u * 0.9},${top} Z`} fill={darker(haze, 0.08)} />
        <Rect x={bx + u * 0.3} y={top + u * 0.35} width={u * 0.3} height={u * 0.4} fill={darker(haze, 0.18)} />
      </G>,
    );
  }
  return (
    <G>
      {terrace}
      <Path d={d} fill={lighter(haze, 0.1)} />
      <Rect x={x0} y={deck - u * 0.28} width={x1 - x0} height={u * 0.28} fill={darker(haze, 0.1)} />
    </G>
  );
}

/** Metropolis: towers and a mast or two, windows catching the late sun. */
function City({ ctx }: { ctx: Ctx }) {
  const { w, h, u, haze } = ctx;
  const foot = ctx.base + h * 0.05;
  const out: React.ReactNode[] = [];
  let x = -u * 0.3;
  let i = 0;
  while (x < w) {
    const bw = u * (0.9 + rnd(i, 3) * 0.9);
    const tall = u * (1.8 + rnd(i, 4) * (i % 4 === 1 ? 5 : 3));
    const top = ctx.ridge(Math.min(1, Math.max(0, x / w))) - tall;
    const fill = [lighter(haze, 0.08), lighter(haze, 0.2), haze][i % 3];
    out.push(
      <G key={i}>
        <Rect x={x} y={top} width={bw} height={foot - top} fill={fill} />
        {rnd(i, 5) > 0.6 ? (
          <Rect x={x + bw / 2 - u * 0.04} y={top - u * 1.1} width={u * 0.08} height={u * 1.1} fill={darker(haze, 0.15)} />
        ) : null}
        {Array.from({ length: Math.floor(tall / (u * 0.7)) }, (_, k) =>
          rnd(i * 7 + k, 6) > 0.55 ? (
            <Rect
              key={k}
              x={x + bw * 0.22}
              y={top + u * 0.35 + k * u * 0.7}
              width={bw * 0.56}
              height={u * 0.18}
              fill="#FFE9B8"
              opacity={0.55}
            />
          ) : null,
        )}
      </G>,
    );
    x += bw + u * (0.05 + rnd(i, 7) * 0.3);
    i++;
  }
  return <G>{out}</G>;
}

/** A range of mountains behind the ridge, snow on their tops. */
function Peaks({ ctx, snow, pale }: { ctx: Ctx; snow: number; pale?: boolean }) {
  const { w, h, haze } = ctx;
  const rock = pale ? lighter(haze, 0.25) : haze;
  const foot = ctx.base + h * 0.05;
  const peaks = [
    { fx: 0.1, hf: 0.12, wf: 0.42 },
    { fx: 0.4, hf: 0.085, wf: 0.34 },
    { fx: 0.7, hf: 0.15, wf: 0.46 },
    { fx: 0.98, hf: 0.1, wf: 0.36 },
  ];
  return (
    <G>
      {peaks.map((p, i) => {
        const x = p.fx * w;
        const top = ctx.base - p.hf * h;
        const half = (p.wf * w) / 2;
        const tall = foot - top;
        // The snow line, and how wide the mountain is there.
        const sy = top + tall * snow;
        const sh = half * snow;
        const cap =
          `M ${x},${top} L ${x + sh},${sy} L ${x + sh * 0.45},${sy - tall * 0.04} L ${x + sh * 0.1},${sy + tall * 0.02} ` +
          `L ${x - sh * 0.35},${sy - tall * 0.05} L ${x - sh},${sy} Z`;
        return (
          <G key={i}>
            <Path d={`M ${x - half},${foot} L ${x},${top} L ${x + half},${foot} Z`} fill={rock} />
            <Path d={`M ${x},${top} L ${x + half},${foot} L ${x + half * 0.15},${foot} Z`} fill={darker(rock, 0.1)} />
            <Path d={cap} fill="#FFFFFF" opacity={pale ? 0.95 : 0.9} />
          </G>
        );
      })}
    </G>
  );
}

/** Pines along the ridge — dusted with snow in Frost Valley. */
function RidgePines({ ctx, snowy }: { ctx: Ctx; snowy: boolean }) {
  const { w, u, haze } = ctx;
  const needles = darker(haze, 0.25);
  return (
    <G>
      {[0.04, 0.09, 0.22, 0.27, 0.5, 0.56, 0.61, 0.83, 0.88].map((fx, i) => {
        const x = fx * w;
        const y = ctx.ridge(fx) + u * 0.35;
        const s = u * (0.75 + rnd(i, 8) * 0.4);
        return (
          <G key={i}>
            <Rect x={x - s * 0.08} y={y - s * 0.4} width={s * 0.16} height={s * 0.4} fill={darker(haze, 0.4)} />
            {[0, 1, 2].map((k) => {
              const ty = y - s * 0.3 - k * s * 0.55;
              const tw = s * (0.62 - k * 0.14);
              return (
                <G key={k}>
                  <Path d={`M ${x - tw},${ty} L ${x},${ty - s * 0.85} L ${x + tw},${ty} Z`} fill={needles} />
                  {snowy ? (
                    <Path d={`M ${x - tw * 0.5},${ty - s * 0.42} L ${x},${ty - s * 0.85} L ${x + tw * 0.5},${ty - s * 0.42} Z`} fill="#FFFFFF" opacity={0.92} />
                  ) : null}
                </G>
              );
            })}
          </G>
        );
      })}
    </G>
  );
}

/** Cloud Summit: a sea of cloud along the ridge, the peaks standing out of it. */
function CloudBank({ ctx }: { ctx: Ctx }) {
  const { w, u } = ctx;
  return (
    <G>
      {Array.from({ length: 14 }, (_, i) => {
        const fx = i / 13;
        const r = u * (1.1 + rnd(i, 9) * 0.9);
        return <Circle key={i} cx={fx * w} cy={ctx.ridge(fx) + r * 0.4} r={r} fill="#FFFFFF" opacity={0.92} />;
      })}
    </G>
  );
}

/** A sea on the horizon instead of the far hills, with a little light on it. */
function Sea({ ctx, colour }: { ctx: Ctx; colour: string }) {
  const { w, h, u } = ctx;
  const top = ctx.ridge(0);
  return (
    <G>
      <Rect x={0} y={top} width={w} height={h - top} fill={colour} />
      <Rect x={0} y={top} width={w} height={u * 0.12} fill={lighter(colour, 0.35)} />
      {Array.from({ length: 9 }, (_, i) => (
        <Rect
          key={i}
          x={rnd(i, 10) * w}
          y={top + u * (0.6 + rnd(i, 11) * 2.4)}
          width={u * (0.8 + rnd(i, 12) * 1.2)}
          height={u * 0.08}
          rx={u * 0.04}
          fill="#FFFFFF"
          opacity={0.35}
        />
      ))}
    </G>
  );
}

function Sailboat({ x, y, s, hull, sail }: { x: number; y: number; s: number; hull: string; sail: string }) {
  return (
    <G>
      <Path d={`M ${x - s * 0.7},${y - s * 0.25} L ${x + s * 0.7},${y - s * 0.25} L ${x + s * 0.45},${y} L ${x - s * 0.45},${y} Z`} fill={hull} />
      <Path d={`M ${x - s * 0.05},${y - s * 0.32} L ${x - s * 0.05},${y - s * 1.5} L ${x + s * 0.6},${y - s * 0.32} Z`} fill={sail} />
      <Path d={`M ${x - s * 0.12},${y - s * 0.32} L ${x - s * 0.12},${y - s * 1.2} L ${x - s * 0.55},${y - s * 0.32} Z`} fill={sail} opacity={0.85} />
    </G>
  );
}

/** Harbour Bay: a headland, boats out on the water, and the lighthouse. */
function Harbour({ ctx }: { ctx: Ctx }) {
  const { w, u, haze } = ctx;
  const sea = ctx.ridge(0);
  const lx = w * 0.84;
  const rockTop = sea - u * 0.8;
  const towerTop = rockTop - u * 3.4;
  const red = mix("#E0524A", haze, 0.2);
  const white = lighter(haze, 0.75);
  const band = (t0: number, t1: number) => {
    const y0 = rockTop - (rockTop - towerTop) * t0;
    const y1 = rockTop - (rockTop - towerTop) * t1;
    const hw = (t: number) => u * (0.55 - 0.2 * t);
    return `M ${lx - hw(t0)},${y0} L ${lx - hw(t1)},${y1} L ${lx + hw(t1)},${y1} L ${lx + hw(t0)},${y0} Z`;
  };
  return (
    <G>
      <Path d={`M -2,${sea + 1} Q ${w * 0.08},${sea - u * 2.2} ${w * 0.3},${sea + 1} Z`} fill={darker(haze, 0.05)} />
      <FarHouse x={w * 0.1} y={sea - u * 1.2} s={u * 0.8} wall={lighter(haze, 0.55)} roof={mix("#E0524A", haze, 0.35)} />
      <Sailboat x={w * 0.42} y={sea + u * 1.2} s={u * 0.9} hull={darker(haze, 0.2)} sail={lighter(haze, 0.8)} />
      <Sailboat x={w * 0.6} y={sea + u * 0.5} s={u * 0.6} hull={darker(haze, 0.1)} sail={lighter(haze, 0.7)} />
      <Path d={`M ${lx - u * 1.6},${sea + 1} Q ${lx - u * 0.6},${rockTop - u * 0.3} ${lx},${rockTop} Q ${lx + u * 0.9},${rockTop - u * 0.2} ${lx + u * 1.7},${sea + 1} Z`} fill={darker(haze, 0.18)} />
      <Path d={band(0, 1)} fill={white} />
      <Path d={band(0, 0.25)} fill={red} />
      <Path d={band(0.5, 0.75)} fill={red} />
      <Circle cx={lx} cy={towerTop - u * 0.35} r={u * 0.9} fill="#FFE27A" opacity={0.35} />
      <Rect x={lx - u * 0.36} y={towerTop - u * 0.6} width={u * 0.72} height={u * 0.6} fill="#FFE9A0" />
      <Path d={`M ${lx - u * 0.5},${towerTop - u * 0.58} L ${lx},${towerTop - u * 1.15} L ${lx + u * 0.5},${towerTop - u * 0.58} Z`} fill={red} />
    </G>
  );
}

/** Orchard Hills: fruit trees in rows along the ridge, and a barn among them. */
function OrchardRows({ ctx }: { ctx: Ctx }) {
  const { w, u, haze } = ctx;
  const crown = darker(haze, 0.02);
  const fruit = mix("#E8553D", haze, 0.25);
  const bx = 0.62 * w;
  const by = ctx.ridge(0.62) + u * 0.3;
  const barn = mix("#C8483B", haze, 0.3);
  return (
    <G>
      {Array.from({ length: 17 }, (_, i) => {
        const fx = 0.02 + i * 0.06;
        if (Math.abs(fx - 0.62) < 0.07) return null;
        const x = fx * w;
        const y = ctx.ridge(fx) + u * 0.35;
        const r = u * (0.46 + rnd(i, 13) * 0.12);
        return (
          <G key={i}>
            <FarTree x={x} y={y} r={r} crown={crown} trunk={darker(haze, 0.35)} />
            <Circle cx={x + r * 0.35} cy={y - r * 1.45} r={r * 0.14} fill={fruit} />
            <Circle cx={x - r * 0.2} cy={y - r * 1.25} r={r * 0.14} fill={fruit} />
          </G>
        );
      })}
      <Rect x={bx - u * 0.9} y={by - u * 1.2} width={u * 1.8} height={u * 1.25} fill={barn} />
      <Path
        d={`M ${bx - u * 1.05},${by - u * 1.15} L ${bx - u * 0.7},${by - u * 1.75} L ${bx},${by - u * 2.05} L ${bx + u * 0.7},${by - u * 1.75} L ${bx + u * 1.05},${by - u * 1.15} Z`}
        fill={darker(barn, 0.2)}
      />
      <Rect x={bx - u * 0.35} y={by - u * 0.8} width={u * 0.7} height={u * 0.85} fill={lighter(barn, 0.5)} />
    </G>
  );
}

/** Sunset Canyon: flat-topped mesas and a butte, banded where the rock was laid down. */
function Mesas({ ctx }: { ctx: Ctx }) {
  const { w, h, u, haze } = ctx;
  const foot = ctx.base + h * 0.05;
  const mesas = [
    { fx: 0.16, wf: 0.34, hf: 0.085 },
    { fx: 0.52, wf: 0.14, hf: 0.13 },
    { fx: 0.84, wf: 0.3, hf: 0.07 },
  ];
  return (
    <G>
      {mesas.map((m, i) => {
        const x = m.fx * w;
        const half = (m.wf * w) / 2;
        const top = ctx.base - m.hf * h;
        const lip = half * 0.72;
        return (
          <G key={i}>
            <Path d={`M ${x - half},${foot} L ${x - lip},${top} L ${x + lip},${top} L ${x + half},${foot} Z`} fill={haze} />
            <Path d={`M ${x + lip * 0.4},${top} L ${x + lip},${top} L ${x + half},${foot} L ${x + half * 0.5},${foot} Z`} fill={darker(haze, 0.1)} />
            {[0.25, 0.5].map((t) => {
              const y = top + (foot - top) * t;
              const hw = lip + (half - lip) * t;
              return <Rect key={t} x={x - hw} y={y} width={hw * 2} height={u * 0.14} fill={lighter(haze, 0.18)} />;
            })}
            <Rect x={x - lip} y={top} width={lip * 2} height={u * 0.18} fill={lighter(haze, 0.25)} />
          </G>
        );
      })}
    </G>
  );
}

/** Two saguaros standing on the near side of the ridge. */
function Saguaros({ ctx }: { ctx: Ctx }) {
  const { w, u, haze } = ctx;
  const ink = darker(mix(haze, "#4F7A3A", 0.5), 0.1);
  const one = (fx: number, s: number, flip: number) => {
    const x = fx * w;
    const y = ctx.ridge(fx) + u * 0.3;
    const sw = s * 0.34;
    return (
      <G key={fx}>
        <Path d={`M ${x},${y} L ${x},${y - s * 2.2}`} stroke={ink} strokeWidth={sw} strokeLinecap="round" />
        <Path
          d={`M ${x},${y - s * 0.9} L ${x + flip * s * 0.6},${y - s * 0.9} L ${x + flip * s * 0.6},${y - s * 1.6}`}
          stroke={ink}
          strokeWidth={sw * 0.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Path
          d={`M ${x},${y - s * 1.3} L ${x - flip * s * 0.5},${y - s * 1.3} L ${x - flip * s * 0.5},${y - s * 1.8}`}
          stroke={ink}
          strokeWidth={sw * 0.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </G>
    );
  };
  return (
    <G>
      {one(0.34, u * 0.95, 1)}
      {one(0.7, u * 0.7, -1)}
      {one(0.95, u * 0.85, 1)}
    </G>
  );
}

function Palm({ x, y, s, ink }: { x: number; y: number; s: number; ink: string }) {
  const tx = x + s * 0.35;
  const ty = y - s * 2;
  return (
    <G>
      <Path d={`M ${x},${y} Q ${x + s * 0.05},${y - s * 1.2} ${tx},${ty}`} stroke={ink} strokeWidth={s * 0.2} fill="none" strokeLinecap="round" />
      {[-150, -110, -60, -20, 25].map((a) => {
        const r = (a * Math.PI) / 180;
        const ex = tx + Math.cos(r) * s * 1.1;
        const ey = ty + Math.sin(r) * s * 0.7 + s * 0.35;
        const mx = tx + Math.cos(r) * s * 0.6;
        const my = ty + Math.sin(r) * s * 0.6 - s * 0.15;
        return <Path key={a} d={`M ${tx},${ty} Q ${mx},${my} ${ex},${ey}`} stroke={ink} strokeWidth={s * 0.22} fill="none" strokeLinecap="round" />;
      })}
    </G>
  );
}

/** Palm Isles: islands out on a turquoise sea, palms leaning over them. */
function Islands({ ctx }: { ctx: Ctx }) {
  const { w, u, haze } = ctx;
  const sea = ctx.ridge(0);
  const land = darker(haze, 0.02);
  const sand = lighter(mix(haze, "#F4E2A8", 0.7), 0.1);
  const isle = (fx: number, half: number, tall: number) => {
    const x = fx * w;
    return (
      <G key={fx}>
        <Path d={`M ${x - half * 1.1},${sea + 1} Q ${x},${sea - tall * 1.1} ${x + half * 1.1},${sea + 1} Z`} fill={sand} />
        <Path d={`M ${x - half},${sea + 1} Q ${x},${sea - tall * 2} ${x + half},${sea + 1} Z`} fill={land} />
      </G>
    );
  };
  return (
    <G>
      {isle(0.18, w * 0.17, u * 1.4)}
      {isle(0.76, w * 0.12, u * 1.1)}
      <Palm x={w * 0.13} y={sea - u * 0.9} s={u * 0.95} ink={darker(haze, 0.2)} />
      <Palm x={w * 0.22} y={sea - u * 0.8} s={u * 0.75} ink={darker(haze, 0.2)} />
      <Palm x={w * 0.78} y={sea - u * 0.7} s={u * 0.8} ink={darker(haze, 0.2)} />
      <Sailboat x={w * 0.48} y={sea + u * 1.0} s={u * 0.75} hull={darker(mix(haze, "#2DBBD0", 0.5), 0.3)} sail="#FFFFFF" />
    </G>
  );
}

/** Lantern Town: rooftops against the night, their windows lit. */
function NightRoofs({ ctx }: { ctx: Ctx }) {
  const { w, h, u, haze } = ctx;
  const foot = ctx.base + h * 0.05;
  const out: React.ReactNode[] = [];
  let x = -u * 0.3;
  let i = 0;
  while (x < w) {
    const bw = u * (1.2 + rnd(i, 14) * 0.9);
    const top = ctx.ridge(Math.min(1, Math.max(0, x / w))) - u * (1 + rnd(i, 15) * 1.6);
    const curl = i % 3 === 1;
    const roof = curl
      ? `M ${x - u * 0.35},${top - u * 0.15} Q ${x + bw * 0.2},${top - u * 0.1} ${x + bw / 2},${top - u * 0.75} Q ${x + bw * 0.8},${top - u * 0.1} ${x + bw + u * 0.35},${top - u * 0.15} L ${x + bw},${top + u * 0.05} L ${x},${top + u * 0.05} Z`
      : `M ${x - u * 0.08},${top + u * 0.05} L ${x + bw / 2},${top - u * 0.65} L ${x + bw + u * 0.08},${top + u * 0.05} Z`;
    out.push(
      <G key={i}>
        <Rect x={x} y={top} width={bw} height={foot - top} fill={i % 2 ? haze : lighter(haze, 0.06)} />
        <Path d={roof} fill={darker(haze, 0.25)} />
        {[0, 1].map((k) =>
          rnd(i * 3 + k, 16) > 0.35 ? (
            <Rect key={k} x={x + bw * (0.18 + k * 0.42)} y={top + u * 0.45} width={bw * 0.22} height={u * 0.35} fill="#FFD27A" opacity={0.9} />
          ) : null,
        )}
      </G>,
    );
    x += bw + u * 0.1;
    i++;
  }
  return <G>{out}</G>;
}

/** Strings of paper lanterns slung between poles along the ridge. */
function LanternStrings({ ctx }: { ctx: Ctx }) {
  const { w, u } = ctx;
  const poles = [0.04, 0.3, 0.56, 0.8, 1.02];
  const lamps = ["#FFB84D", "#FF7A5A", "#FFD27A"];
  const out: React.ReactNode[] = [];
  poles.forEach((fx, i) => {
    const x = fx * w;
    const y = ctx.ridge(Math.min(1, fx)) + u * 0.3;
    out.push(<Rect key={`p${i}`} x={x - u * 0.06} y={y - u * 2.6} width={u * 0.12} height={u * 2.6} fill="#161A3A" />);
    if (i === poles.length - 1) return;
    const nx = poles[i + 1] * w;
    const ny = ctx.ridge(Math.min(1, poles[i + 1])) + u * 0.3;
    const y0 = y - u * 2.5;
    const y1 = ny - u * 2.5;
    const sag = u * 0.9;
    out.push(
      <Path key={`s${i}`} d={`M ${x},${y0} Q ${(x + nx) / 2},${(y0 + y1) / 2 + sag * 2} ${nx},${y1}`} stroke="#161A3A" strokeWidth={u * 0.05} fill="none" />,
    );
    for (let k = 1; k <= 5; k++) {
      const t = k / 6;
      const lx = x + (nx - x) * t;
      const ly = y0 + (y1 - y0) * t + sag * 2 * 2 * t * (1 - t);
      const c = lamps[(i + k) % lamps.length];
      out.push(
        <G key={`l${i}:${k}`}>
          <Circle cx={lx} cy={ly + u * 0.3} r={u * 0.55} fill={c} opacity={0.18} />
          <Ellipse cx={lx} cy={ly + u * 0.3} rx={u * 0.2} ry={u * 0.26} fill={c} />
        </G>,
      );
    }
  });
  return <G>{out}</G>;
}

/** Ember Ridge: the volcano itself, glowing at the top and smoking gently. */
function Volcano({ ctx }: { ctx: Ctx }) {
  const { w, h, u, haze } = ctx;
  const foot = ctx.base + h * 0.05;
  const x = w * 0.62;
  const top = ctx.base - h * 0.16;
  const half = w * 0.46;
  const lip = w * 0.07;
  const glow = "#FF7A3D";
  return (
    <G>
      <Path d={`M ${-w * 0.1},${foot} L ${w * 0.1},${ctx.base - h * 0.07} L ${w * 0.16},${ctx.base - h * 0.07} L ${w * 0.4},${foot} Z`} fill={lighter(haze, 0.12)} />
      {[0, 1, 2].map((k) => (
        <Circle key={k} cx={x + u * (k * 0.9 - 0.6)} cy={top - u * (1.2 + k * 1.3)} r={u * (0.9 + k * 0.45)} fill="#8E767C" opacity={0.45 - k * 0.1} />
      ))}
      <Path
        d={`M ${x - half},${foot} L ${x - lip},${top} L ${x - lip * 0.4},${top + u * 0.35} L ${x + lip * 0.3},${top + u * 0.2} L ${x + lip},${top} L ${x + half},${foot} Z`}
        fill={haze}
      />
      <Path d={`M ${x + lip * 0.3},${top + u * 0.2} L ${x + lip},${top} L ${x + half},${foot} L ${x + half * 0.2},${foot} Z`} fill={darker(haze, 0.15)} />
      <Ellipse cx={x} cy={top + u * 0.15} rx={lip * 0.9} ry={u * 0.4} fill={glow} opacity={0.75} />
      <Path d={`M ${x - lip * 0.2},${top + u * 0.3} Q ${x - lip * 0.9},${top + u * 2.4} ${x - lip * 1.6},${top + u * 4.4}`} stroke={glow} strokeWidth={u * 0.22} opacity={0.6} fill="none" strokeLinecap="round" />
      <Path d={`M ${x + lip * 0.3},${top + u * 0.3} Q ${x + lip * 0.8},${top + u * 1.8} ${x + lip * 1.9},${top + u * 3.2}`} stroke={glow} strokeWidth={u * 0.18} opacity={0.5} fill="none" strokeLinecap="round" />
    </G>
  );
}

/** Blossom Valley: a pagoda among cherry trees in flower. */
function Pagoda({ ctx }: { ctx: Ctx }) {
  const { w, u, haze } = ctx;
  const bloom = mix("#F3A8C8", haze, 0.2);
  const px = w * 0.74;
  const py = ctx.ridge(0.74) + u * 0.3;
  const wall = lighter(haze, 0.3);
  const eave = darker(haze, 0.25);
  const tiers = [0, 1, 2, 3];
  return (
    <G>
      {[0.06, 0.16, 0.3, 0.44, 0.56, 0.92].map((fx, i) => {
        const x = fx * w;
        const y = ctx.ridge(fx) + u * 0.35;
        const r = u * (0.5 + rnd(i, 17) * 0.2);
        return (
          <G key={fx}>
            <Rect x={x - r * 0.14} y={y - r * 1.1} width={r * 0.28} height={r * 1.2} fill={darker(haze, 0.4)} />
            <Circle cx={x - r * 0.45} cy={y - r * 1.5} r={r * 0.7} fill={bloom} />
            <Circle cx={x + r * 0.45} cy={y - r * 1.55} r={r * 0.72} fill={bloom} />
            <Circle cx={x} cy={y - r * 1.95} r={r * 0.75} fill={lighter(bloom, 0.2)} />
          </G>
        );
      })}
      {tiers.map((k) => {
        const tw = u * (1.1 - k * 0.2);
        const y = py - k * u * 1.05;
        return (
          <G key={k}>
            <Rect x={px - tw * 0.7} y={y - u * 0.75} width={tw * 1.4} height={u * 0.75} fill={wall} />
            <Path
              d={`M ${px - tw * 1.35},${y - u * 0.95} Q ${px - tw},${y - u * 0.7} ${px - tw * 0.6},${y - u * 1.1} L ${px + tw * 0.6},${y - u * 1.1} Q ${px + tw},${y - u * 0.7} ${px + tw * 1.35},${y - u * 0.95} L ${px + tw},${y - u * 0.72} L ${px - tw},${y - u * 0.72} Z`}
              fill={eave}
            />
          </G>
        );
      })}
      <Rect x={px - u * 0.05} y={py - u * 5.2} width={u * 0.1} height={u * 1.2} fill={eave} />
    </G>
  );
}

/** Castle Hill: curtain walls, round towers under pointed roofs, pennants flying. */
function Castle({ ctx }: { ctx: Ctx }) {
  const { w, h, u, haze } = ctx;
  const foot = ctx.base + h * 0.05;
  const stone = lighter(haze, 0.22);
  const roof = mix("#6A4A9C", haze, 0.3);
  const flag = mix("#E84A5F", haze, 0.15);
  const cx = w * 0.66;
  const wallTop = ctx.base - u * 2.2;
  const left = cx - u * 3.2;
  const right = cx + u * 3.2;
  const crenels = (x0: number, x1: number, y: number) => {
    let d = `M ${x0},${y}`;
    const n = Math.max(2, Math.round((x1 - x0) / (u * 0.5)));
    const step = (x1 - x0) / n;
    for (let k = 0; k < n; k++) {
      const a = x0 + k * step;
      d += k % 2 === 0 ? ` L ${a},${y - u * 0.35} L ${a + step},${y - u * 0.35} L ${a + step},${y}` : ` L ${a + step},${y}`;
    }
    return `${d} L ${x1},${foot} L ${x0},${foot} Z`;
  };
  const tower = (x: number, tall: number) => {
    const top = ctx.base - tall;
    return (
      <G key={x}>
        <Rect x={x - u * 0.7} y={top} width={u * 1.4} height={foot - top} fill={stone} />
        <Path d={`M ${x - u * 0.9},${top + u * 0.05} L ${x},${top - u * 1.8} L ${x + u * 0.9},${top + u * 0.05} Z`} fill={roof} />
        <Rect x={x - u * 0.03} y={top - u * 2.6} width={u * 0.06} height={u * 0.9} fill={darker(haze, 0.3)} />
        <Path d={`M ${x + u * 0.03},${top - u * 2.6} L ${x + u * 0.75},${top - u * 2.4} L ${x + u * 0.03},${top - u * 2.2} Z`} fill={flag} />
        <Rect x={x - u * 0.12} y={top + u * 0.6} width={u * 0.24} height={u * 0.45} fill={darker(haze, 0.2)} />
      </G>
    );
  };
  return (
    <G>
      <Path d={`M ${cx - u * 7},${foot} Q ${cx},${ctx.base - u * 2.6} ${cx + u * 7},${foot} Z`} fill={darker(haze, 0.02)} />
      <Path d={crenels(left, right, wallTop)} fill={lighter(haze, 0.12)} />
      <Path d={crenels(cx - u * 1.1, cx + u * 1.1, ctx.base - u * 4.2)} fill={stone} />
      <Path d={`M ${cx - u * 0.45},${foot} L ${cx - u * 0.45},${wallTop + u * 0.9} Q ${cx},${wallTop + u * 0.2} ${cx + u * 0.45},${wallTop + u * 0.9} L ${cx + u * 0.45},${foot} Z`} fill={darker(haze, 0.25)} />
      {tower(left, u * 3.4)}
      {tower(right, u * 3.1)}
    </G>
  );
}

// --- the sky ------------------------------------------------------------------

/** A moon in place of the sun: a disc, a soft halo, and a crescent's shadow. */
function Moon({ x, y, r, colour, sky }: { x: number; y: number; r: number; colour: string; sky: string }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={r * 2.4} fill={colour} opacity={0.08} />
      <Circle cx={x} cy={y} r={r * 1.5} fill={colour} opacity={0.12} />
      <Circle cx={x} cy={y} r={r} fill={colour} />
      <Circle cx={x + r * 0.42} cy={y - r * 0.18} r={r * 0.82} fill={sky} />
    </G>
  );
}

/** The night's fixed stars, thinning towards the horizon. */
function StarField({ w, h }: { w: number; h: number }) {
  return (
    <G>
      {Array.from({ length: 46 }, (_, i) => {
        const y = Math.pow(rnd(i, 21), 1.6) * h * 0.9;
        return <Circle key={i} cx={rnd(i, 20) * w} cy={y} r={0.6 + rnd(i, 22) * 1.1} fill="#FFFFFF" opacity={0.35 + rnd(i, 23) * 0.5} />;
      })}
    </G>
  );
}

// --- the weather --------------------------------------------------------------

/**
 * A value running 0 → 1 forever over `ms`. It starts `offset` of the way in, so
 * the sky is populated from the first frame rather than filling up.
 */
function useLoop(ms: number, offset: number) {
  const t = useRef(new Animated.Value(offset)).current;
  useEffect(() => {
    const first = Animated.timing(t, {
      toValue: 1,
      duration: ms * (1 - offset),
      easing: Easing.linear,
      useNativeDriver: true,
    });
    let loop: Animated.CompositeAnimation | null = null;
    first.start(({ finished }) => {
      if (!finished) return;
      t.setValue(0);
      loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }));
      loop.start();
    });
    return () => {
      first.stop();
      loop?.stop();
    };
  }, [t, ms, offset]);
  return t;
}

function WeatherLayer({ kind, look, w, h, base }: { kind: Weather; look: Look; w: number; h: number; base: number }) {
  const clouds = (n: number) =>
    [
      <Cloud key="c0" y={h * 0.08} size={w * 0.3} span={w} ms={70000} offset={0.1} colour={look.cloud} />,
      <Cloud key="c1" y={h * 0.2} size={w * 0.2} span={w} ms={95000} offset={0.6} colour={look.cloud} />,
      <Cloud key="c2" y={h * 0.32} size={w * 0.24} span={w} ms={120000} offset={0.35} colour={look.cloud} />,
    ].slice(0, n);
  switch (kind) {
    case "clouds":
      return <>{clouds(3)}</>;
    case "snow":
      return (
        <>
          {Array.from({ length: 18 }, (_, i) => (
            <Fall key={i} i={i} w={w} h={h} kind="snow" />
          ))}
        </>
      );
    case "leaves":
      return (
        <>
          {clouds(2)}
          {Array.from({ length: 9 }, (_, i) => (
            <Fall key={i} i={i} w={w} h={h} kind="leaf" />
          ))}
        </>
      );
    case "petals":
      return (
        <>
          {clouds(2)}
          {Array.from({ length: 12 }, (_, i) => (
            <Fall key={i} i={i} w={w} h={h} kind="petal" />
          ))}
        </>
      );
    case "embers":
      return (
        <>
          {clouds(1)}
          {Array.from({ length: 12 }, (_, i) => (
            <Ember key={i} i={i} w={w} h={h} base={base} />
          ))}
        </>
      );
    case "stars":
      return (
        <>
          {Array.from({ length: 7 }, (_, i) => (
            <Twinkle key={i} i={i} w={w} h={base} />
          ))}
        </>
      );
  }
}

/** One puffy cloud, drifting left to right forever. */
function Cloud({ y, size, span, ms, offset, colour }: { y: number; size: number; span: number; ms: number; offset: number; colour: string }) {
  const t = useLoop(ms, offset);
  const h = size * 0.5;
  return (
    <Animated.View
      style={{
        position: "absolute",
        top: y,
        left: 0,
        transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-size, span + size * 0.2] }) }],
      }}
    >
      <Svg width={size} height={h}>
        <Ellipse cx={size * 0.5} cy={h * 0.72} rx={size * 0.46} ry={h * 0.26} fill={colour} opacity={0.95} />
        <Circle cx={size * 0.34} cy={h * 0.56} r={h * 0.3} fill={colour} />
        <Circle cx={size * 0.58} cy={h * 0.44} r={h * 0.38} fill={colour} />
        <Circle cx={size * 0.76} cy={h * 0.62} r={h * 0.24} fill={colour} />
      </Svg>
    </Animated.View>
  );
}

const LEAVES = ["#E8743B", "#D9483B", "#F2B33D", "#C8662E"];
const PETALS = ["#FFC2DA", "#FFB0CF", "#FFD6E6"];

/**
 * Something falling the height of the screen, swaying as it goes: a snowflake, a
 * leaf turning over, a petal. Flat views, not SVG — there can be a dozen of them,
 * and a coloured rounded rectangle is all a leaf is at this size.
 */
function Fall({ i, w, h, kind }: { i: number; w: number; h: number; kind: "snow" | "leaf" | "petal" }) {
  const ms = (kind === "snow" ? 11000 : 14000) + rnd(i, 30) * 9000;
  const t = useLoop(ms, rnd(i, 31));
  const size = kind === "snow" ? 3 + rnd(i, 32) * 4 : kind === "leaf" ? 8 + rnd(i, 32) * 5 : 6 + rnd(i, 32) * 3;
  const sway = 10 + rnd(i, 33) * 18;
  const drift = kind === "snow" ? 0 : 30 + rnd(i, 34) * 40;
  const colour = kind === "snow" ? "#FFFFFF" : kind === "leaf" ? LEAVES[i % LEAVES.length] : PETALS[i % PETALS.length];
  const turns = kind === "snow" ? 0 : 1 + Math.floor(rnd(i, 35) * 2);
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: rnd(i, 36) * w - drift / 2,
        top: 0,
        width: size,
        height: kind === "snow" ? size : size * 0.62,
        backgroundColor: colour,
        opacity: kind === "snow" ? 0.85 : 0.9,
        borderRadius: kind === "snow" ? size / 2 : 0,
        borderTopLeftRadius: size,
        borderBottomRightRadius: size,
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [-20, h + 20] }) },
          {
            translateX: t.interpolate({
              inputRange: [0, 0.25, 0.5, 0.75, 1],
              outputRange: [0, sway + drift * 0.25, drift * 0.5, -sway + drift * 0.75, drift],
            }),
          },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${turns * 360}deg`] }) },
        ],
      }}
    />
  );
}

/** A spark rising off the hills and dying out on the way up. */
function Ember({ i, w, h, base }: { i: number; w: number; h: number; base: number }) {
  const t = useLoop(7000 + rnd(i, 40) * 6000, rnd(i, 41));
  const size = 2.5 + rnd(i, 42) * 3;
  const rise = h * (0.25 + rnd(i, 43) * 0.25);
  const start = base + (h - base) * (0.3 + rnd(i, 44) * 0.6);
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: rnd(i, 45) * w,
        top: start,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: i % 3 ? "#FF9A4A" : "#FFD27A",
        opacity: t.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 0.95, 0.6, 0] }),
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -rise] }) },
          { translateX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 8 - rnd(i, 46) * 16, 4] }) },
        ],
      }}
    />
  );
}

/** A star that brightens and fades, somewhere in the night sky. */
function Twinkle({ i, w, h }: { i: number; w: number; h: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(400 + rnd(i, 50) * 2400),
        Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, i]);
  const size = 3 + rnd(i, 51) * 2.5;
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: rnd(i, 52) * w,
        top: Math.pow(rnd(i, 53), 1.4) * h * 0.8,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#FFFFFF",
        opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] }),
        transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.3] }) }],
      }}
    />
  );
}
