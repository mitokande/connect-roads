// Every level, as a road trip. Each grid size is a region with its own name and
// colour, and the levels are stops along one winding road through it — the
// bands are the difficulty curve, so drawing them as a journey shows the player
// exactly what they're climbing and how far they've come.
//
// Stops show what they have to show and nothing more: a cleared level carries
// its best star record, the current one pulses with a car parked on it, and the
// rest are locked. The screen opens scrolled to wherever the car is.

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import { LEVEL_COUNT, sizeForLevel } from "../game/levels";
import { haptics } from "../haptics";
import { sound } from "../sound";
import { font, radius, regionFor, shadow, theme } from "../theme";
import { IconButton } from "./Button";
import { Car } from "./CarRide";
import { Scenery } from "./Scenery";

const PER_ROW = 4;
const ROW_H = 96;
const NODE = 58;
const XS = [0.14, 0.38, 0.62, 0.86];

export function LevelsScreen({
  unlockedLevel,
  stars,
  onPick,
  onBack,
}: {
  unlockedLevel: number;
  stars: Record<number, number>;
  onPick: (level: number) => void;
  onBack: () => void;
}) {
  const { width } = useWindowDimensions();
  const mapW = Math.min(width - 36, 460);
  const scroll = useRef<ScrollView>(null);
  const bandY = useRef<Record<number, number>>({});

  const bands = useMemo(() => {
    const out: { size: number; levels: number[] }[] = [];
    for (let l = 1; l <= LEVEL_COUNT; l++) {
      const size = sizeForLevel(l);
      const last = out[out.length - 1];
      if (last && last.size === size) last.levels.push(l);
      else out.push({ size, levels: [l] });
    }
    return out;
  }, []);

  const current = Math.min(unlockedLevel, LEVEL_COUNT);
  const currentSize = sizeForLevel(current);
  const total = Object.values(stars).reduce((a, b) => a + b, 0);

  // Open on the region the car is in, with its row of stops in view.
  const scrolled = useRef(false);
  const onBandLayout = (size: number, y: number) => {
    bandY.current[size] = y;
    if (scrolled.current || size !== currentSize) return;
    scrolled.current = true;
    const band = bands.find((b) => b.size === size)!;
    const row = Math.floor(band.levels.indexOf(current) / PER_ROW);
    const target = Math.max(0, y + 80 + row * ROW_H - 180);
    setTimeout(() => scroll.current?.scrollTo({ y: target, animated: false }), 0);
  };

  return (
    <View style={styles.page}>
      <Scenery horizon={0.55} decor={false} />
      <View style={styles.header}>
        <IconButton onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </IconButton>
        <Text style={styles.title}>Road Trip</Text>
        <View style={styles.starChip}>
          <Ionicons name="star" size={17} color={theme.gold} />
          <Text style={styles.starText}>{total}</Text>
        </View>
      </View>

      <ScrollView
        ref={scroll}
        contentContainerStyle={[styles.scroll, { width: mapW + 36 }]}
        style={{ alignSelf: "center" }}
        showsVerticalScrollIndicator={false}
      >
        {bands.map((band) => (
          <View key={band.size} onLayout={(e) => onBandLayout(band.size, e.nativeEvent.layout.y)}>
            <Region
              size={band.size}
              levels={band.levels}
              width={mapW}
              unlockedLevel={unlockedLevel}
              stars={stars}
              onPick={onPick}
            />
          </View>
        ))}
        <Text style={styles.footer}>More roads coming soon!</Text>
      </ScrollView>
    </View>
  );
}

function Region({
  size,
  levels,
  width,
  unlockedLevel,
  stars,
  onPick,
}: {
  size: number;
  levels: number[];
  width: number;
  unlockedLevel: number;
  stars: Record<number, number>;
  onPick: (level: number) => void;
}) {
  const region = regionFor(size);
  const locked = levels[0] > unlockedLevel;
  const earned = levels.reduce((a, l) => a + (stars[l] ?? 0), 0);
  const rows = Math.ceil(levels.length / PER_ROW);
  const height = rows * ROW_H + 14;

  // Serpentine: left→right, then right→left, turning at the ends of each row.
  const pos = (i: number) => {
    const row = Math.floor(i / PER_ROW);
    const k = i % PER_ROW;
    const col = row % 2 === 0 ? k : PER_ROW - 1 - k;
    // +10 clears the region's sign, which overlaps the top of the field.
    return { x: XS[col] * width, y: row * ROW_H + ROW_H / 2 + 10 };
  };

  let d = "";
  for (let i = 0; i < levels.length; i++) {
    const p = pos(i);
    if (i === 0) {
      d = `M ${p.x - width * 0.1},${p.y} L ${p.x},${p.y}`;
      continue;
    }
    const q = pos(i - 1);
    if (Math.abs(q.y - p.y) < 1) d += ` L ${p.x},${p.y}`;
    else {
      const bulge = (q.x > width / 2 ? 1 : -1) * width * 0.13;
      d += ` C ${q.x + bulge},${q.y} ${p.x + bulge},${p.y} ${p.x},${p.y}`;
    }
  }

  return (
    <View style={styles.region}>
      <View style={[styles.sign, { backgroundColor: region.color, borderBottomColor: region.dark }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.signTitle}>{region.name}</Text>
          <Text style={styles.signSub}>
            {size}×{size} · {region.tag} · Levels {levels[0]}–{levels[levels.length - 1]}
          </Text>
        </View>
        {locked ? (
          <Ionicons name="lock-closed" size={20} color="rgba(255,255,255,0.9)" />
        ) : (
          <View style={styles.signStars}>
            <Ionicons name="star" size={15} color={theme.gold} />
            <Text style={styles.signStarText}>
              {earned}/{levels.length * 3}
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.field, { width: width + 8, height: height + 8, opacity: locked ? 0.75 : 1 }]}>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Path d={d} stroke={theme.kerbDark} strokeWidth={30} fill="none" strokeLinejoin="round" />
          <Path d={d} stroke={theme.kerb} strokeWidth={27} fill="none" strokeLinejoin="round" />
          <Path d={d} stroke={theme.asphalt} strokeWidth={21} fill="none" strokeLinejoin="round" />
          <Path d={d} stroke={theme.roadLine} strokeWidth={2.5} strokeDasharray="9 8" fill="none" />
        </Svg>
        {levels.map((level, i) => {
          const p = pos(i);
          return (
            <Stop
              key={level}
              level={level}
              x={p.x}
              y={p.y}
              color={region.color}
              dark={region.dark}
              locked={level > unlockedLevel}
              current={level === unlockedLevel}
              stars={stars[level] ?? 0}
              onPick={onPick}
            />
          );
        })}
      </View>
    </View>
  );
}

function Stop({
  level,
  x,
  y,
  color,
  dark,
  locked,
  current,
  stars,
  onPick,
}: {
  level: number;
  x: number;
  y: number;
  color: string;
  dark: string;
  locked: boolean;
  current: boolean;
  stars: number;
  onPick: (level: number) => void;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!current) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [current, pulse]);

  const face = locked ? "#D9D4E4" : current ? theme.accent : color;
  const edge = locked ? theme.locked : current ? theme.accentDark : dark;

  return (
    <View style={{ position: "absolute", left: x - NODE / 2, top: y - NODE / 2, width: NODE, alignItems: "center" }}>
      {current ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }],
            },
          ]}
        />
      ) : null}
      <Pressable
        disabled={locked}
        onPress={() => {
          haptics.tap();
          sound.press();
          onPick(level);
        }}
        style={({ pressed }) => [
          styles.node,
          { backgroundColor: face, borderBottomColor: edge, transform: [{ translateY: pressed ? 3 : 0 }] },
          pressed && { borderBottomWidth: 2 },
        ]}
      >
        {locked ? (
          <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
        ) : (
          <Text style={styles.nodeText}>{level}</Text>
        )}
      </Pressable>
      {stars > 0 ? (
        <View style={styles.stars}>
          {[1, 2, 3].map((k) => (
            <Ionicons
              key={k}
              name="star"
              size={k === 2 ? 15 : 13}
              color={k <= stars ? theme.gold : "rgba(46,42,69,0.25)"}
              style={k === 2 ? { marginTop: -3 } : undefined}
            />
          ))}
        </View>
      ) : null}
      {current ? (
        <View pointerEvents="none" style={styles.car}>
          <Car length={30} width={19} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  title: { fontSize: 26, fontFamily: font.bold, color: theme.text },
  starChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.panel,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: radius.pill,
    borderBottomWidth: 3,
    borderBottomColor: theme.panelEdge,
  },
  starText: { fontFamily: font.bold, color: theme.text, fontSize: 17 },
  scroll: { padding: 14, paddingBottom: 60 },
  region: { marginBottom: 22 },
  sign: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md + 4,
    borderBottomWidth: 5,
    marginBottom: -10,
    zIndex: 2,
    ...shadow,
  },
  signTitle: { fontFamily: font.bold, fontSize: 20, color: "#FFFFFF" },
  signSub: { fontFamily: font.medium, fontSize: 13.5, color: "rgba(255,255,255,0.92)" },
  signStars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(0,0,0,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  signStarText: { fontFamily: font.bold, color: "#FFFFFF", fontSize: 14 },
  field: {
    backgroundColor: theme.lawnA,
    borderRadius: radius.lg,
    borderWidth: 4,
    borderColor: theme.wood,
    overflow: "hidden",
  },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    borderBottomWidth: 6,
  },
  nodeText: { fontFamily: font.bold, fontSize: 21, color: "#FFFFFF", includeFontPadding: false },
  ring: {
    position: "absolute",
    top: 0,
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 4,
    borderColor: theme.accent,
  },
  stars: { flexDirection: "row", marginTop: -8, backgroundColor: "rgba(255,249,238,0.9)", borderRadius: 10, paddingHorizontal: 3 },
  car: { position: "absolute", top: -16, right: -16, transform: [{ rotate: "-20deg" }] },
  footer: { textAlign: "center", fontFamily: font.semi, fontSize: 15, color: theme.textDim, marginTop: 4 },
});
