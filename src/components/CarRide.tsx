// The payoff: a convoy drives the finished road.
//
// The tarmac is already on screen, so the animation only has to follow it
// exactly — anything that visibly cuts a corner would read as a bug in the road
// rather than as a flourish. So the route is flattened into a polyline (curves
// sampled around their arc, straights taken as-is), the polyline is measured,
// and cumulative distance becomes the interpolation input. That gives constant
// speed through corners for free, which is the thing the eye actually notices.
//
// The cars behind the leader are that same interpolation with the input range
// slid forward by a fixed *distance*, so they trail by a constant gap rather
// than a constant time — the convoy bends through a corner in file instead of
// concertina-ing. The drive therefore runs on past 1 to `end`, far enough for
// the last car to reach the end of the line; cars that have already finished
// clamp at the departure point, which is off the board and clipped away.
//
// Both the entry and the exit are extended off the board so the cars arrive from
// off-screen and leave the same way; the grid's own clipping does the rest.
//
// Everything runs on the native driver: translate and rotate only.

import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { DC, DR, dirBetween, hasDir, type Dir, type Puzzle } from "../game/types";
import { theme } from "../theme";

/**
 * Drive pace. The duration scales with the route's length so a long board takes
 * proportionally longer to drive — the car runs at one speed, not one duration,
 * which is what stops an 8×8 from looking like it is being fast-forwarded.
 */
const MS_PER_CELL = 330;
const MIN_MS = 3000;
/** How many cars take the finished road, lead car first. */
const CARS = 5;
/** Nose-to-nose distance between them, in cells. */
const SPACING = 0.95;
/** Samples taken around a quarter turn. */
const CURVE_SAMPLES = 7;

type Pt = { x: number; y: number };

const edgeMid = (d: Dir, s: number): Pt =>
  d === 0
    ? { x: s / 2, y: 0 }
    : d === 1
      ? { x: s, y: s / 2 }
      : d === 2
        ? { x: s / 2, y: s }
        : { x: 0, y: s / 2 };

/** The centreline of the whole route, in grid pixels, ends run off the board. */
function centreline(puzzle: Puzzle, s: number): Pt[] {
  const pts: Pt[] = [];
  const push = (p: Pt) => {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.05) pts.push(p);
  };

  const { path, entry, exit } = puzzle;

  // Approach: a cell and a half outside the entry.
  const entryMid = edgeMid(entry.dir, s);
  push({
    x: entry.c * s + entryMid.x + DC[entry.dir] * s * 1.6,
    y: entry.r * s + entryMid.y + DR[entry.dir] * s * 1.6,
  });

  for (let i = 0; i < path.length; i++) {
    const cellPt = path[i];
    const ox = cellPt.c * s;
    const oy = cellPt.r * s;
    const back = i === 0 ? entry.dir : dirBetween(cellPt, path[i - 1]);
    const fwd = i === path.length - 1 ? exit.dir : dirBetween(cellPt, path[i + 1]);
    const a = edgeMid(back, s);
    const b = edgeMid(fwd, s);

    if ((back + 2) % 4 === fwd) {
      push({ x: ox + a.x, y: oy + a.y });
      push({ x: ox + b.x, y: oy + b.y });
    } else {
      const mask = (1 << back) | (1 << fwd);
      const corner = { x: hasDir(mask, 1) ? s : 0, y: hasDir(mask, 0) ? 0 : s };
      const a1 = Math.atan2(a.y - corner.y, a.x - corner.x);
      const a2 = Math.atan2(b.y - corner.y, b.x - corner.x);
      let sweep = a2 - a1;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      for (let k = 0; k <= CURVE_SAMPLES; k++) {
        const ang = a1 + (sweep * k) / CURVE_SAMPLES;
        push({
          x: ox + corner.x + (s / 2) * Math.cos(ang),
          y: oy + corner.y + (s / 2) * Math.sin(ang),
        });
      }
    }
  }

  // Departure: far enough past the exit for the car to clear the board.
  const exitMid = edgeMid(exit.dir, s);
  push({
    x: exit.c * s + exitMid.x + DC[exit.dir] * s * 2.2,
    y: exit.r * s + exitMid.y + DR[exit.dir] * s * 2.2,
  });
  return pts;
}

export function CarRide({
  puzzle,
  cell,
  onDone,
}: {
  puzzle: Puzzle;
  cell: number;
  onDone?: () => void;
}) {
  const ride = useRef(new Animated.Value(0)).current;

  const road = useMemo(() => {
    const pts = centreline(puzzle, cell);
    const dist: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      dist.push(dist[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    const total = dist[dist.length - 1] || 1;

    // Heading at each sample, unwrapped so the interpolation never spins the
    // long way round when the angle crosses ±180°.
    const angles: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const from = pts[Math.max(0, i - 1)];
      const to = pts[Math.min(pts.length - 1, i + 1)];
      let a = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
      if (i > 0) {
        const prev = angles[i - 1];
        while (a - prev > 180) a -= 360;
        while (prev - a > 180) a += 360;
      }
      angles.push(a);
    }

    return {
      t: dist.map((d) => d / total),
      xs: pts.map((p) => p.x),
      ys: pts.map((p) => p.y),
      angles,
      gap: (cell * SPACING) / total,
    };
  }, [puzzle, cell]);

  const end = 1 + road.gap * (CARS - 1);

  useEffect(() => {
    ride.setValue(0);
    const anim = Animated.timing(ride, {
      toValue: end,
      // Scaled by `end` so the extra stretch is time the tail spends leaving,
      // not the leader driving faster to make up for it.
      duration: Math.max(MIN_MS, puzzle.path.length * MS_PER_CELL) * end,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) onDone?.();
    });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [road, end]);

  const len = cell * 0.62;
  const wide = cell * 0.36;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: CARS }, (_, i) => {
        // Slide this car's input range forward by i gaps: at ride = R it sits
        // where the leader was R − i·gap ago.
        const input = road.t.map((t) => t + road.gap * i);
        const common = { inputRange: input, extrapolate: "clamp" as const };
        const paint = theme.fleet[i % theme.fleet.length];
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: len,
              height: wide,
              marginLeft: -len / 2,
              marginTop: -wide / 2,
              transform: [
                { translateX: ride.interpolate({ ...common, outputRange: road.xs }) },
                { translateY: ride.interpolate({ ...common, outputRange: road.ys }) },
                {
                  rotate: ride.interpolate({
                    ...common,
                    outputRange: road.angles.map((a) => `${a}deg`),
                  }),
                },
              ],
            }}
          >
            <Car length={len} width={wide} body={paint.body} edge={paint.edge} />
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * One car, seen from above and pointing along +x — the direction of travel, so
 * rotating it by the heading is all the drawing has to do.
 *
 * Everything is a fraction of the car, so it reads the same on a 4×4 as on an
 * 8×8: wheels poking out at the corners, a cabin between two windows, and lamps
 * at the nose.
 */
export function Car({
  length: L,
  width: W,
  body: paint = theme.car,
  edge = theme.carEdge,
}: {
  length: number;
  width: number;
  /** Body colour — the convoy paints each car differently. */
  body?: string;
  edge?: string;
}) {
  // The body is inset so the wheels have somewhere to poke out to, which is what
  // makes the silhouette read as a car rather than as a rounded box.
  const top = W * 0.13;
  const body = W * 0.74;
  const at = (f: number) => top + body * f;
  return (
    <Svg width={L} height={W}>
      {[0.15, 0.64].map((x) =>
        [0, W * 0.82].map((y) => (
          <Rect
            key={`${x}:${y}`}
            x={L * x}
            y={y}
            width={L * 0.2}
            height={W * 0.18}
            rx={W * 0.07}
            fill={theme.carGlass}
          />
        )),
      )}
      <Rect
        x={0}
        y={top}
        width={L}
        height={body}
        rx={body * 0.34}
        fill={paint}
        stroke={edge}
        strokeWidth={Math.max(1, W * 0.045)}
      />
      {/* windscreen at the front, rear window behind, roof between them */}
      <Rect
        x={L * 0.57}
        y={at(0.1)}
        width={L * 0.18}
        height={body * 0.8}
        rx={body * 0.2}
        fill={theme.carGlass}
      />
      <Rect
        x={L * 0.18}
        y={at(0.14)}
        width={L * 0.12}
        height={body * 0.72}
        rx={body * 0.18}
        fill={theme.carGlass}
        opacity={0.85}
      />
      <Rect
        x={L * 0.32}
        y={at(0.06)}
        width={L * 0.22}
        height={body * 0.88}
        rx={body * 0.18}
        fill="#FFFFFF"
        opacity={0.28}
      />
      {[0.08, 0.66].map((f) => (
        <Rect
          key={f}
          x={L * 0.89}
          y={at(f)}
          width={L * 0.07}
          height={body * 0.26}
          rx={body * 0.1}
          fill={theme.carLamp}
        />
      ))}
    </Svg>
  );
}
