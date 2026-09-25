// The front door: a sunny landscape, the wordmark, and a finished little board
// with toy cars going round it — what the game *is*, running, before a word of
// instruction. Below it, one way in.

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { currentStreak, DAILY_UNLOCK, today, WEEK, WEEKDAYS, weekday } from "../game/daily";
import { fleetById } from "../game/garage";
import { LEVEL_COUNT, sizeForLevel } from "../game/levels";
import { haptics } from "../haptics";
import type { Progress } from "../state/useGame";
import { sound } from "../sound";
import { font, radius, regionForLevel, shadow, theme } from "../theme";
import { Button, IconButton } from "./Button";
import { Diorama } from "./Diorama";
import { Logo } from "./Logo";
import { Scenery } from "./Scenery";

export function HomeScreen({
  progress,
  onPlay,
  onLevels,
  onDaily,
  onGarage,
  onSettings,
  onHelp,
}: {
  progress: Progress;
  onPlay: () => void;
  onLevels: () => void;
  onDaily: () => void;
  /** The star count opens the garage — somewhere for the stars to go. */
  onGarage: () => void;
  onSettings: () => void;
  onHelp: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const level = Math.min(progress.unlockedLevel, LEVEL_COUNT);
  const size = sizeForLevel(level);
  const done = progress.unlockedLevel - 1;
  const stars = Object.values(progress.stars).reduce((a, b) => a + b, 0);
  const compact = height < 700;

  // The wordmark floats, very gently: the only thing on the page besides the
  // traffic that moves, and it says "this is a toy" before anything else does.
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  return (
    <View style={styles.page}>
      <Scenery horizon={0.36} />

      <View style={styles.content}>
        <View style={styles.topBar}>
          <View style={styles.chips}>
            <Pressable
              hitSlop={6}
              onPress={() => {
                haptics.tap();
                sound.press();
                onGarage();
              }}
            >
              <View style={styles.chip}>
                <Ionicons name="star" size={18} color={theme.gold} />
                <Text style={styles.chipText}>{stars}</Text>
                <Ionicons name="car-sport" size={16} color={theme.textDim} />
              </View>
            </Pressable>
            <Chip icon="bulb" color={theme.accent} value={`${progress.hints}`} />
          </View>
          <View style={styles.topRight}>
            <IconButton onPress={onHelp}>
              <Ionicons name="help" size={24} color={theme.text} />
            </IconButton>
            <IconButton onPress={onSettings}>
              <Ionicons name="settings-sharp" size={21} color={theme.text} />
            </IconButton>
          </View>
        </View>

        <Animated.View
          style={[
            styles.hero,
            { marginTop: compact ? 4 : 18 },
            { transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] },
          ]}
        >
          <Logo size={Math.min(76, width * 0.17)} />
          <Text style={styles.tagline}>Count the clues · Lay the road</Text>
        </Animated.View>

        <View style={styles.dioramaWrap}>
          <Diorama
            width={Math.min(width - 44, 380)}
            rows={height > 800 ? 4 : 3}
            paints={fleetById(progress.fleet).paints}
          />
        </View>

        <View style={styles.bottom}>
          <PlayCard level={level} size={size} done={done} onPress={onPlay} />
          <View style={styles.pair}>
            <Button
              label="All levels"
              tone="teal"
              onPress={onLevels}
              icon={<Ionicons name="map" size={20} color={theme.onAccent} />}
              style={{ flex: 1 }}
            />
            <DailyButton progress={progress} onPress={onDaily} />
          </View>
        </View>
      </View>
    </View>
  );
}

function Chip({ icon, color, value }: { icon: React.ComponentProps<typeof Ionicons>["name"]; color: string; value: string }) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.chipText}>{value}</Text>
    </View>
  );
}

/**
 * The single call to action: what pressing it starts, and where that sits on the
 * ladder, on one raised face. The app's button idiom — a face on a thicker
 * bottom edge that drops when pressed — grown to hold three lines.
 */
function PlayCard({ level, size, done, onPress }: { level: number; size: number; done: number; onPress: () => void }) {
  const [down, setDown] = useState(false);
  const region = regionForLevel(level);
  const pct = Math.min(100, (done / LEVEL_COUNT) * 100);
  const DEPTH = 6;
  return (
    <Pressable
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      onPress={() => {
        haptics.tap();
        sound.press();
        onPress();
      }}
    >
      <View style={{ paddingTop: down ? DEPTH : 0 }}>
        <View style={[styles.playCard, { borderBottomWidth: down ? 0 : DEPTH }]}>
          <View style={styles.playShine} />
          <View style={styles.playRow}>
            <View style={styles.playGlyph}>
              <Ionicons name="play" size={28} color={theme.accent} style={{ marginLeft: 4 }} />
            </View>
            <View style={styles.playText}>
              <Text style={styles.playLabel}>{done > 0 ? "Continue" : "Play"}</Text>
              <Text style={styles.playSub}>
                Level {level} · {region.name} · {size}×{size}
              </Text>
            </View>
          </View>
          <View style={styles.playProgress}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.progressCount}>
              {done}/{LEVEL_COUNT}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Today's road, beside the map: what kind of day it is (the weekday says how hard,
 * the size says it at a glance), the streak riding on it, and — once built — that
 * there is nothing more until tomorrow. Locked until the first region is cleared,
 * and says so, so it is something to look forward to rather than a mystery.
 */
function DailyButton({ progress, onPress }: { progress: Progress; onPress: () => void }) {
  const [down, setDown] = useState(false);
  const now = today();
  const locked = progress.unlockedLevel < DAILY_UNLOCK;
  const built = progress.daily.stars[now] !== undefined;
  const streak = currentStreak(progress.daily, now);
  const { size } = WEEK[weekday(now)];
  const DEPTH = 5;
  const sub = locked
    ? `Clear level ${DAILY_UNLOCK - 1}`
    : built
      ? "Built! Back tomorrow"
      : `${WEEKDAYS[weekday(now)]} · ${size}×${size}`;
  return (
    <Pressable
      disabled={locked}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      onPress={() => {
        haptics.tap();
        sound.press();
        onPress();
      }}
      style={{ flex: 1, opacity: locked ? 0.6 : 1 }}
    >
      <View style={{ paddingTop: down ? DEPTH : 0 }}>
        <View style={[styles.daily, { borderBottomWidth: down ? 0 : DEPTH }]}>
          <View style={styles.dailyShine} />
          <Ionicons
            name={locked ? "lock-closed" : built ? "checkmark-circle" : "calendar"}
            size={22}
            color={theme.text}
          />
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.dailyLabel}>Daily road</Text>
            <Text style={styles.dailySub} numberOfLines={1}>
              {sub}
            </Text>
          </View>
        </View>
      </View>
      {streak > 0 && !locked ? (
        <View style={[styles.streak, { top: down ? DEPTH - 8 : -8 }]}>
          <Ionicons name="flame" size={13} color="#FFFFFF" />
          <Text style={styles.streakText}>{streak}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pair: { flexDirection: "row", gap: 10, marginTop: 12, alignItems: "flex-end" },
  daily: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.gold,
    borderBottomColor: theme.goldDark,
    borderRadius: radius.md + 2,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 48,
    overflow: "hidden",
  },
  dailyShine: {
    position: "absolute",
    left: 8,
    right: 8,
    top: 4,
    height: "38%",
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  dailyLabel: { fontFamily: font.bold, fontSize: 16, color: theme.text, lineHeight: 19 },
  dailySub: { fontFamily: font.semi, fontSize: 12, color: "rgba(46,42,69,0.75)", lineHeight: 15 },
  streak: {
    position: "absolute",
    right: -4,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: theme.danger,
    borderRadius: 11,
    paddingHorizontal: 6,
    height: 22,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  streakText: { color: "#FFFFFF", fontSize: 12, fontFamily: font.bold, includeFontPadding: false },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },

  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chips: { flexDirection: "row", gap: 8 },
  topRight: { flexDirection: "row", gap: 10 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.panel,
    paddingHorizontal: 13,
    height: 38,
    borderRadius: radius.pill,
    borderBottomWidth: 3,
    borderBottomColor: theme.panelEdge,
  },
  chipText: { fontFamily: font.bold, color: theme.text, fontSize: 17 },

  hero: { alignItems: "center" },
  tagline: {
    marginTop: 2,
    fontSize: 16,
    fontFamily: font.semi,
    color: theme.text,
    backgroundColor: "rgba(255,249,238,0.85)",
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
  },

  dioramaWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8 },

  bottom: { marginBottom: 18 },
  playCard: {
    backgroundColor: theme.accent,
    borderBottomColor: theme.accentDark,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    overflow: "hidden",
    ...shadow,
  },
  playShine: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 5,
    height: 34,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  playRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  playGlyph: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.onAccent,
    alignItems: "center",
    justifyContent: "center",
  },
  playText: { flex: 1 },
  playLabel: { fontSize: 28, fontFamily: font.bold, color: theme.onAccent, letterSpacing: 0.3, lineHeight: 32 },
  playSub: { fontSize: 14.5, fontFamily: font.semi, color: "rgba(255,255,255,0.9)", marginTop: 1 },
  playProgress: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  progressTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.16)",
    overflow: "hidden",
  },
  progressFill: { height: 12, borderRadius: 6, backgroundColor: theme.gold },
  progressCount: { fontSize: 15, fontFamily: font.bold, color: theme.onAccent },
});
