// The payoff: a train drives the finished route.
//
// The rails are already on screen, so the animation only has to follow them
// exactly — anything that visibly cuts a corner would read as a bug in the
// track rather than as a flourish. So the route is flattened into a polyline
// (curves sampled around their arc, straights taken as-is), the polyline is
// measured, and cumulative distance becomes the interpolation input. That gives
// constant speed through corners for free, which is the thing the eye actually
// notices.
//
// Carriages are the same interpolation with the input range slid forward by a
// fixed *distance* — so they trail the locomotive by a constant gap rather than
// a constant time, and the whole train bends through a curve together. Both the
// entry and the exit are extended off the board so the train arrives out of the
// tunnel mouth and leaves through the other one; the grid's own clipping does
// the rest.
//
// Everything runs on the native driver: translate and rotate only.

import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { DC, DR, dirBetween, hasDir, type Dir, type Puzzle } from "../game/types";
import { theme } from "../theme";

const CARS = 4;
/**
 * Ride pace. The duration scales with the route's length so a long board takes
 * proportionally longer to travel — the train runs at one speed, not one
 * duration, which is what stops an 8×8 from looking like it is being
 * fast-forwarded.
 */
const MS_PER_CELL = 330;
const MIN_MS = 3000;
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

  // Approach: a cell and a half outside the entry terminal.
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

  // Departure: far enough past the exit for the last carriage to clear it.
  const exitMid = edgeMid(exit.dir, s);
  push({
    x: exit.c * s + exitMid.x + DC[exit.dir] * s * 3.2,
    y: exit.r * s + exitMid.y + DR[exit.dir] * s * 3.2,
  });
  return pts;
}

export function TrainRide({
  puzzle,
  cell,
  onDone,
}: {
  puzzle: Puzzle;
  cell: number;
  onDone?: () => void;
}) {
  const ride = useRef(new Animated.Value(0)).current;

  const track = useMemo(() => {
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
      gap: (cell * 0.82) / total,
    };
  }, [puzzle, cell]);

  const end = 1 + track.gap * (CARS - 1);

  useEffect(() => {
    ride.setValue(0);
    const anim = Animated.timing(ride, {
      toValue: end,
      duration: Math.max(MIN_MS, puzzle.path.length * MS_PER_CELL),
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished) onDone?.();
    });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track, end]);

  const carL = cell * 0.66;
  const carW = cell * 0.44;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: CARS }, (_, i) => {
        // Slide this car's input range forward by i gaps: at ride = T it sits
        // where the locomotive was T − i·gap ago.
        const shift = track.gap * i;
        const input = track.t.map((t) => t + shift);
        const common = { inputRange: input, extrapolate: "clamp" as const };
        return (
          <Animated.View
            key={i}
            style={[
              styles.car,
              {
                width: carL,
                height: carW,
                marginLeft: -carL / 2,
                marginTop: -carW / 2,
                transform: [
                  { translateX: ride.interpolate({ ...common, outputRange: track.xs }) },
                  { translateY: ride.interpolate({ ...common, outputRange: track.ys }) },
                  {
                    rotate: ride.interpolate({
                      ...common,
                      outputRange: track.angles.map((a) => `${a}deg`),
                    }),
                  },
                ],
              },
            ]}
          >
            {i === 0 ? <Locomotive length={carL} width={carW} /> : <Wagon length={carL} width={carW} />}
          </Animated.View>
        );
      })}
    </View>
  );
}

function Locomotive({ length, width }: { length: number; width: number }) {
  return (
    <View style={[styles.body, { borderRadius: width * 0.28, backgroundColor: "#D8382F" }]}>
      {/* nose, pointing along +x — the direction of travel */}
      <View
        style={{
          position: "absolute",
          right: 0,
          top: width * 0.12,
          width: length * 0.26,
          height: width * 0.76,
          borderRadius: width * 0.24,
          backgroundColor: "#2A2F36",
        }}
      />
      <View
        style={{
          position: "absolute",
          right: length * 0.06,
          top: width * 0.34,
          width: width * 0.2,
          height: width * 0.2,
          borderRadius: width * 0.1,
          backgroundColor: "#FFE9A8",
        }}
      />
      <View
        style={{
          position: "absolute",
          left: length * 0.16,
          top: width * 0.18,
          width: length * 0.3,
          height: width * 0.3,
          borderRadius: width * 0.08,
          backgroundColor: "#F5F7FA",
          opacity: 0.85,
        }}
      />
    </View>
  );
}

function Wagon({ length, width }: { length: number; width: number }) {
  return (
    <View style={[styles.body, { borderRadius: width * 0.24, backgroundColor: "#E1483F" }]}>
      <View
        style={{
          position: "absolute",
          left: length * 0.12,
          right: length * 0.12,
          top: width * 0.16,
          height: width * 0.22,
          borderRadius: width * 0.11,
          backgroundColor: "#F2837B",
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  car: { position: "absolute", left: 0, top: 0 },
  body: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#8E1E18",
    shadowColor: theme.rail,
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
