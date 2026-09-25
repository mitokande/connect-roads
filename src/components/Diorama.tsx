// The home screen's centrepiece: a little finished board in its wooden tray — a
// loop of road round a village — with toy cars driving round it forever.
//
// It is built from the game's own parts (the lawn, `RoadPiece`, the town art,
// the convoy's `Car`), so the front door shows exactly what a solved board looks
// like, and can't drift from it. The drive is the same trick as `CarRide`: the
// loop is flattened to a polyline, measured, and cumulative distance becomes the
// interpolation input, so the cars hold one speed through the bends. Two laps
// are laid end to end and each car reads them from its own offset, so the
// convoy is evenly spaced and one native-driver loop moves them all.

import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { dirBetween, hasDir, piece, type Coord, type Dir } from "../game/types";
import { theme } from "../theme";
import { Lawn } from "./Board";
import { Car } from "./CarRide";
import { TownArt } from "./Town";
import type { Paint } from "../game/garage";
import { RoadPiece } from "./RoadPiece";

const COLS = 6;
const LAP_MS = 14000;
const CARS = 3;

/** The loop, clockwise from the top-left corner. */
function loopCells(ROWS: number): Coord[] {
  const out: Coord[] = [];
  for (let c = 0; c < COLS; c++) out.push({ r: 0, c });
  for (let r = 1; r < ROWS; r++) out.push({ r, c: COLS - 1 });
  for (let c = COLS - 2; c >= 0; c--) out.push({ r: ROWS - 1, c });
  for (let r = ROWS - 2; r >= 1; r--) out.push({ r, c: 0 });
  return out;
}

const edgeMid = (d: Dir, s: number) =>
  d === 0 ? { x: s / 2, y: 0 } : d === 1 ? { x: s, y: s / 2 } : d === 2 ? { x: s / 2, y: s } : { x: 0, y: s / 2 };

function lapPoints(cells: Coord[], s: number) {
  const pts: { x: number; y: number }[] = [];
  const n = cells.length;
  for (let i = 0; i < n; i++) {
    const cell = cells[i];
    const back = dirBetween(cell, cells[(i - 1 + n) % n]);
    const fwd = dirBetween(cell, cells[(i + 1) % n]);
    const a = edgeMid(back, s);
    const b = edgeMid(fwd, s);
    const ox = cell.c * s;
    const oy = cell.r * s;
    if ((back + 2) % 4 === fwd) {
      pts.push({ x: ox + a.x, y: oy + a.y });
    } else {
      const mask = (1 << back) | (1 << fwd);
      const corner = { x: hasDir(mask, 1) ? s : 0, y: hasDir(mask, 0) ? 0 : s };
      const a1 = Math.atan2(a.y - corner.y, a.x - corner.x);
      const a2 = Math.atan2(b.y - corner.y, b.x - corner.x);
      let sweep = a2 - a1;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      for (let k = 0; k < 6; k++) {
        const ang = a1 + (sweep * k) / 6;
        pts.push({ x: ox + corner.x + (s / 2) * Math.cos(ang), y: oy + corner.y + (s / 2) * Math.sin(ang) });
      }
    }
  }
  return pts;
}

export function Diorama({
  width,
  rows: ROWS = 3,
  paints = theme.fleet,
}: {
  width: number;
  rows?: number;
  /** The garage's paint job, so the front door shows the player's own convoy. */
  paints?: readonly Paint[];
}) {
  const frame = 10;
  const cell = Math.floor((width - frame * 2) / COLS);
  const cells = useMemo(() => loopCells(ROWS), [ROWS]);

  const road = useMemo(() => {
    const lap = lapPoints(cells, cell);
    // Two laps, closed, so every car can read a full lap from its own offset.
    const pts = [...lap, ...lap, lap[0]];
    const dist = [0];
    for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = dist[dist.length - 1];
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
    return { t: dist.map((d) => (d / total) * 2), xs: pts.map((p) => p.x), ys: pts.map((p) => p.y), angles };
  }, [cells, cell]);

  const lap = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(lap, { toValue: 1, duration: LAP_MS, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [lap]);

  const pieces = cells.map((c, i) => {
    const n = cells.length;
    const back = dirBetween(c, cells[(i - 1 + n) % n]);
    const fwd = dirBetween(c, cells[(i + 1) % n]);
    return { c, p: piece(back, fwd) };
  });

  const inner: { r: number; c: number; kind: "house" | "trees" | "pond" | "garden"; h: number }[] = [];
  const kinds = ["house", "trees", "house", "pond", "trees", "garden", "house", "trees"] as const;
  let k = 0;
  for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) inner.push({ r, c, kind: kinds[k++ % kinds.length], h: (k * 0.37) % 1 });

  const len = cell * 0.6;
  const wide = cell * 0.38;

  return (
    <View style={[styles.tray, { padding: frame, borderRadius: frame + 8 }]} pointerEvents="none">
      <View style={{ width: cell * COLS, height: cell * ROWS, overflow: "hidden", borderRadius: 6 }}>
        <Lawn n={COLS} cell={cell} />
        {pieces.map(({ c, p }) => (
          <View key={`${c.r}:${c.c}`} style={{ position: "absolute", left: c.c * cell, top: c.r * cell }}>
            <RoadPiece size={cell} piece={p} />
          </View>
        ))}
        {inner.map((it) => (
          <View key={`t${it.r}:${it.c}`} style={{ position: "absolute", left: it.c * cell, top: it.r * cell }}>
            <TownArt size={cell} kind={it.kind} h={it.h} />
          </View>
        ))}
        {Array.from({ length: CARS }, (_, i) => {
          const at = Animated.add(lap, i / CARS);
          const common = { inputRange: road.t, extrapolate: "clamp" as const };
          const paint = paints[i % paints.length];
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
                  { translateX: at.interpolate({ ...common, outputRange: road.xs }) },
                  { translateY: at.interpolate({ ...common, outputRange: road.ys }) },
                  { rotate: at.interpolate({ ...common, outputRange: road.angles.map((a) => `${a}deg`) }) },
                ],
              }}
            >
              <Car length={len} width={wide} body={paint.body} edge={paint.edge} roof={paint.roof} />
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    backgroundColor: theme.wood,
    borderTopColor: theme.woodLight,
    borderBottomColor: theme.woodDark,
    borderTopWidth: 2,
    borderBottomWidth: 5,
    shadowColor: "#2E2A45",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
});
