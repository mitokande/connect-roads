// Every level, as a road trip. Each band is a region with its own name, colour,
// lawn and tray, and the levels are stops along one winding road through it —
// the bands are the difficulty curve, so drawing them as a journey shows the
// player exactly what they're climbing and how far they've come.
//
// Six hundred stops are too many to put on screen at once, so the map is a list
// of regions that draws only the ones near the screen. Every region's height is
// a sum of fixed parts (`regionHeight`), which is what lets the list open on the
// car's region without drawing everything above it first.
//
// Stops show what they have to show and nothing more: a cleared level carries
// its best star record, the current one pulses with the player's car on the road
// pulling into it, and the rest are locked. The screen opens scrolled to wherever
// the car is.
//
// **The map keeps the towns the player built.** Every cleared stop puts a piece
// of its region's town beside the road — a barn in the meadows, a tower in the
// city — and a three-star clear puts up a second across the road from it. A
// region starts as bare lawn and fills in as it is played, so the map shows how
// far the player has come *and* how well, without a number on it.

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import { BANDS, bandFor, bandLevels, LEVEL_COUNT, type Band } from "../game/levels";
import { haptics } from "../haptics";
import { sound } from "../sound";
import { font, LOOKS, radius, REGIONS, shadow, theme } from "../theme";
import { IconButton } from "./Button";
import { Car } from "./CarRide";
import { Scenery } from "./Scenery";
import { TownArt, townHash, townKind } from "./Town";
import type { Paint } from "../game/garage";

const PER_ROW = 4;
const ROW_H = 96;
const NODE = 58;
const XS = [0.14, 0.38, 0.62, 0.86];
/** The player's car on the map: short enough to fit the road between two stops. */
const CAR_L = 28;
const CAR_W = 18;
/** A piece of the map's town. */
const TOWN = 30;
/** Below the road, between two stops. */
const TOWN_BESIDE = 40;
/** Under a stop, beneath its stars. */
const TOWN_UNDER = 59;
/** A region's sign: fixed, so every region's height is known before it is drawn. */
const SIGN_H = 64;
/** The list's padding above the first region. */
const PAD = 14;

/** How tall a region is on the map — sign, field and the gap after it. */
const regionHeight = (count: number) => SIGN_H - 10 + Math.ceil(count / PER_ROW) * ROW_H + 40 + 8 + 22;

export function LevelsScreen({
  unlockedLevel,
  openAll = false,
  stars,
  paint,
  onPick,
  onBack,
}: {
  unlockedLevel: number;
  /** Debug only: every stop can be opened, wherever the car is (`src/debug.ts`). */
  openAll?: boolean;
  stars: Record<number, number>;
  /** The lead car of the player's convoy, parked at the current stop. */
  paint?: Paint;
  onPick: (level: number) => void;
  onBack: () => void;
}) {
  const { width } = useWindowDimensions();
  const mapW = Math.min(width - 36, 460);
  const list = useRef<FlatList<{ band: Band; levels: number[] }>>(null);
  const bands = useMemo(() => BANDS.map((band) => ({ band, levels: bandLevels(band) })), []);
  // Every region's top, worked out rather than measured: sixteen regions and six
  // hundred stops are too many to draw at once, so the list only draws the ones
  // near the screen, and it has to know where the rest are without drawing them.
  const tops = useMemo(() => {
    const out: number[] = [];
    let y = PAD;
    for (const { levels } of bands) {
      out.push(y);
      y += regionHeight(levels.length);
    }
    return out;
  }, [bands]);

  const current = Math.min(unlockedLevel, LEVEL_COUNT);
  const currentBand = bandFor(current);
  const total = Object.values(stars).reduce((a, b) => a + b, 0);

  // Open on the region the car is in, with its row of stops in view.
  const scrolled = useRef(false);
  const openOnCar = () => {
    if (scrolled.current) return;
    scrolled.current = true;
    const i = BANDS.indexOf(currentBand);
    const row = Math.floor(bands[i].levels.indexOf(current) / PER_ROW);
    const target = Math.max(0, tops[i] + 80 + row * ROW_H - 180);
    setTimeout(() => list.current?.scrollToOffset({ offset: target, animated: false }), 0);
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

      <FlatList
        ref={list}
        data={bands}
        keyExtractor={({ band }) => `${band.first}`}
        getItemLayout={(_, index) => ({
          length: regionHeight(bands[index].levels.length),
          offset: tops[index],
          index,
        })}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={5}
        onLayout={openOnCar}
        contentContainerStyle={[styles.scroll, { width: mapW + 36 }]}
        style={{ alignSelf: "center" }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: { band, levels } }) => (
          <Region
            band={band}
            levels={levels}
            width={mapW}
            unlockedLevel={unlockedLevel}
            openAll={openAll}
            stars={stars}
            paint={paint}
            onPick={onPick}
          />
        )}
        ListFooterComponent={<Text style={styles.footer}>More roads coming soon!</Text>}
      />
    </View>
  );
}

function Region({
  band,
  levels,
  width,
  unlockedLevel,
  openAll,
  stars,
  paint,
  onPick,
}: {
  band: Band;
  levels: number[];
  width: number;
  unlockedLevel: number;
  openAll: boolean;
  stars: Record<number, number>;
  paint?: Paint;
  onPick: (level: number) => void;
}) {
  const region = REGIONS[band.region];
  const look = LOOKS[band.region];
  const { size } = band;
  const locked = !openAll && levels[0] > unlockedLevel;
  const earned = levels.reduce((a, l) => a + (stars[l] ?? 0), 0);
  const rows = Math.ceil(levels.length / PER_ROW);
  // Room under the last row for the town that grows beneath its stops.
  const height = rows * ROW_H + 40;

  // Serpentine: left→right, then right→left, turning at the ends of each row.
  const pos = (i: number) => {
    const row = Math.floor(i / PER_ROW);
    const k = i % PER_ROW;
    const col = row % 2 === 0 ? k : PER_ROW - 1 - k;
    // +10 clears the region's sign, which overlaps the top of the field.
    return { x: XS[col] * width, y: row * ROW_H + ROW_H / 2 + 10 };
  };

  // How far a turn between rows swings out past the end stops.
  const bulgeAt = (q: { x: number }) => (q.x > width / 2 ? 1 : -1) * width * 0.13;

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
      const bulge = bulgeAt(q);
      d += ` C ${q.x + bulge},${q.y} ${p.x + bulge},${p.y} ${p.x},${p.y}`;
    }
  }

  // The car is on the road into the current stop, nose towards it: halfway along
  // the straight from the stop before, or at the apex of the turn that leads in.
  // It used to be parked off the road at the stop's shoulder, on the lawn where
  // the row above builds its town, and sat on top of whatever had grown there.
  // A region's first stop has no road behind it worth the name, so the car
  // waits beside that one instead.
  const here = unlockedLevel <= LEVEL_COUNT ? levels.indexOf(unlockedLevel) : -1;
  const car = (() => {
    if (here < 0) return null;
    const p = pos(here);
    if (here === 0) return { x: p.x + NODE / 2 + 2, y: p.y - NODE / 2 - 6, angle: -20 };
    const q = pos(here - 1);
    if (Math.abs(q.y - p.y) < 1) return { x: (q.x + p.x) / 2, y: p.y, angle: p.x > q.x ? 0 : 180 };
    // The turn's midpoint: three quarters of the bulge out, heading down the page.
    return { x: q.x + bulgeAt(q) * 0.75, y: (q.y + p.y) / 2, angle: 90 };
  })();

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

      <View
        style={[
          styles.field,
          {
            width: width + 8,
            height: height + 8,
            opacity: locked ? 0.75 : 1,
            backgroundColor: look.lawn[0],
            borderColor: look.wood[0],
          },
        ]}
      >
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Path d={d} stroke={theme.kerbDark} strokeWidth={30} fill="none" strokeLinejoin="round" />
          <Path d={d} stroke={theme.kerb} strokeWidth={27} fill="none" strokeLinejoin="round" />
          <Path d={d} stroke={theme.asphalt} strokeWidth={21} fill="none" strokeLinejoin="round" />
          <Path d={d} stroke={theme.roadLine} strokeWidth={2.5} strokeDasharray="9 8" fill="none" />
        </Svg>
        {levels.flatMap((level, i) => {
          if (level >= unlockedLevel) return [];
          // Every spot is below the road it belongs to, so no two rows ever
          // reach for the same patch of lawn between them. A stop builds beside
          // the road on the way to the next one — or, where the road turns into
          // the next row, under the stop itself, inside the bend. A three-star
          // clear adds a second piece under the stop, beneath its stars.
          const p = pos(i);
          const q = i + 1 < levels.length ? pos(i + 1) : null;
          const straight = q !== null && Math.abs(q.y - p.y) < 1;
          const spots = straight
            ? [{ x: (p.x + q.x) / 2, y: p.y + TOWN_BESIDE }]
            : [{ x: p.x, y: p.y + TOWN_UNDER }];
          if (straight && (stars[level] ?? 0) >= 3) spots.push({ x: p.x, y: p.y + TOWN_UNDER });
          return spots.map((spot, k) => (
            <View
              key={`t${level}:${k}`}
              pointerEvents="none"
              style={{ position: "absolute", left: spot.x - TOWN / 2, top: spot.y - TOWN / 2 }}
            >
              <TownArt
                size={TOWN}
                kind={townKind(band.region, townHash(level, k, size * 31))}
                h={townHash(k, level, size)}
              />
            </View>
          ));
        })}
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
              locked={!openAll && level > unlockedLevel}
              current={level === unlockedLevel}
              stars={stars[level] ?? 0}
              onPick={onPick}
            />
          );
        })}
        {car ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: car.x - CAR_L / 2,
              top: car.y - CAR_W / 2,
              transform: [{ rotate: `${car.angle}deg` }],
            }}
          >
            <Car length={CAR_L} width={CAR_W} body={paint?.body} edge={paint?.edge} roof={paint?.roof} />
          </View>
        ) : null}
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

  const face = locked ? theme.lockedFace : current ? theme.accent : color;
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
  scroll: { paddingHorizontal: PAD, paddingTop: PAD, paddingBottom: 60 },
  region: { marginBottom: 22 },
  sign: {
    flexDirection: "row",
    alignItems: "center",
    height: SIGN_H,
    paddingHorizontal: 16,
    borderRadius: radius.md + 4,
    borderBottomWidth: 5,
    marginBottom: -10,
    zIndex: 2,
    ...shadow,
  },
  signTitle: { fontFamily: font.bold, fontSize: 20, lineHeight: 25, color: "#FFFFFF" },
  signSub: { fontFamily: font.medium, fontSize: 13.5, lineHeight: 18, color: "rgba(255,255,255,0.92)" },
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
  footer: { textAlign: "center", fontFamily: font.semi, fontSize: 15, color: theme.textDim, marginTop: 4 },
});
