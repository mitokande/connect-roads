// The world the board sits in: sky, sun, clouds drifting past, and rolling
// hills. Drawn, not photographed, so it scales to any screen and shares its
// palette with the board exactly.
//
// Only the clouds move, and slowly — the backdrop is there to make the board
// feel like an object in a place, and anything busier would compete with the
// puzzle. Every motion is a native-driver translate, so the scenery costs the
// JS thread nothing while the player is dragging road.

import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { theme } from "../theme";

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

export function Scenery({
  horizon = 0.62,
  sun = true,
  decor = true,
}: {
  /** Where the far hills start, as a fraction of the screen height. */
  horizon?: number;
  sun?: boolean;
  /** Trees and cottages on the hills. */
  decor?: boolean;
}) {
  const { width: w, height: h } = useWindowDimensions();
  const base = h * horizon;

  const hills = useMemo(
    () => ({
      far: hillPath(w, h, base, h * 0.035, 2.2, 0.4),
      mid: hillPath(w, h, base + h * 0.07, h * 0.04, 1.6, 2.1),
      near: hillPath(w, h, base + h * 0.15, h * 0.03, 2.6, 4.2),
    }),
    [w, h, base],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={theme.skyTop} />
            <Stop offset="1" stopColor={theme.skyLow} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} fill="url(#sky)" />
        {sun ? (
          <G>
            <Circle cx={w * 0.84} cy={h * 0.1} r={w * 0.2} fill={theme.sun} opacity={0.18} />
            <Circle cx={w * 0.84} cy={h * 0.1} r={w * 0.13} fill={theme.sun} opacity={0.3} />
            <Circle cx={w * 0.84} cy={h * 0.1} r={w * 0.075} fill={theme.sun} />
          </G>
        ) : null}
        <Path d={hills.far} fill={theme.hillFar} />
        {decor ? <HillDecor w={w} y={base + h * 0.02} /> : null}
        <Path d={hills.mid} fill={theme.hillMid} />
        <Path d={hills.near} fill={theme.hillNear} />
      </Svg>
      <Cloud y={h * 0.08} size={w * 0.3} ms={70000} offset={0.1} />
      <Cloud y={h * 0.2} size={w * 0.2} ms={95000} offset={0.6} />
      <Cloud y={h * 0.32} size={w * 0.24} ms={120000} offset={0.35} />
    </View>
  );
}

/** A few cottages and trees along the far ridge — side-on, because it is far away. */
function HillDecor({ w, y }: { w: number; y: number }) {
  const s = Math.max(10, w * 0.035);
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
        const yy = y - Math.sin(it.x * Math.PI * 2.2 + 0.4) * w * 0.04;
        if (it.k === "tree")
          return (
            <G key={i}>
              <Rect x={x - s * 0.08} y={yy - s * 0.5} width={s * 0.16} height={s * 0.6} fill={theme.trunk} />
              <Circle cx={x} cy={yy - s * 0.8} r={s * 0.45} fill={theme.bush} />
              <Circle cx={x - s * 0.12} cy={yy - s * 0.92} r={s * 0.22} fill={theme.bushLight} />
            </G>
          );
        return (
          <G key={i}>
            <Rect x={x - s * 0.45} y={yy - s * 0.7} width={s * 0.9} height={s * 0.75} fill={theme.walls[i % theme.walls.length]} />
            <Path d={`M ${x - s * 0.6},${yy - s * 0.66} L ${x},${yy - s * 1.2} L ${x + s * 0.6},${yy - s * 0.66} Z`} fill={it.roof} />
            <Rect x={x - s * 0.12} y={yy - s * 0.35} width={s * 0.24} height={s * 0.4} fill={theme.woodDark} />
          </G>
        );
      })}
    </G>
  );
}

/** One puffy cloud, drifting left to right forever. */
function Cloud({ y, size, ms, offset }: { y: number; size: number; ms: number; offset: number }) {
  const { width } = useWindowDimensions();
  const t = useRef(new Animated.Value(offset)).current;
  useEffect(() => {
    // Start part-way across so the sky is populated from the first frame, then
    // loop full crossings.
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

  const h = size * 0.5;
  return (
    <Animated.View
      style={{
        position: "absolute",
        top: y,
        left: 0,
        transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-size, width + size * 0.2] }) }],
      }}
    >
      <Svg width={size} height={h}>
        <Ellipse cx={size * 0.5} cy={h * 0.72} rx={size * 0.46} ry={h * 0.26} fill={theme.cloud} opacity={0.95} />
        <Circle cx={size * 0.34} cy={h * 0.56} r={h * 0.3} fill={theme.cloud} />
        <Circle cx={size * 0.58} cy={h * 0.44} r={h * 0.38} fill={theme.cloud} />
        <Circle cx={size * 0.76} cy={h * 0.62} r={h * 0.24} fill={theme.cloud} />
      </Svg>
    </Animated.View>
  );
}
