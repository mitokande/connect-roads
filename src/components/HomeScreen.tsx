// The front door. A painted landscape with the game's own furniture set on top:
// the title's O is a roundabout drawn from the same parts as the board, and the
// emblem between the two bottom chips is two real road pieces crossed.
//
// The photograph stops before the bottom of the screen — a rounded sheet in the
// app's paper colour rises over it, so the card and the chips sit on the same
// background every other screen uses and never have to fight the grass for
// contrast.

import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { LEVEL_COUNT, sizeForLevel } from "../game/levels";
import { HORZ, VERT } from "../game/types";
import type { Progress } from "../state/useGame";
import { haptics } from "../haptics";
import { sound } from "../sound";
import { radius, shadow, theme } from "../theme";
import { DEPTH, IconButton } from "./Button";
import { RoadPiece } from "./RoadPiece";

const BG = require("../../assets/images/home-bg.png");

/** What a band of grid sizes is called on the card. */
const DIFFICULTY: Record<number, string> = {
  4: "Easy",
  5: "Medium",
  6: "Tricky",
  7: "Hard",
  8: "Expert",
};

export function HomeScreen({
  progress,
  onPlay,
  onLevels,
  onSettings,
  onHelp,
}: {
  progress: Progress;
  onPlay: () => void;
  onLevels: () => void;
  onSettings: () => void;
  onHelp: () => void;
}) {
  const level = Math.min(progress.unlockedLevel, LEVEL_COUNT);
  const size = sizeForLevel(level);
  const done = progress.unlockedLevel - 1;
  const pct = Math.min(100, (done / LEVEL_COUNT) * 100);

  return (
    <View style={styles.page}>
      <Image source={BG} style={styles.bg} resizeMode="cover" />
      <View style={styles.sheet} />

      <View style={styles.content}>
        <View style={styles.topBar}>
          <View style={styles.starChip}>
            <Ionicons name="star" size={17} color={theme.gold} />
            <Text style={styles.starText}>{done}</Text>
          </View>
          <View style={styles.topRight}>
            <IconButton onPress={onHelp}>
              <Ionicons name="help" size={22} color={theme.text} />
            </IconButton>
            <IconButton onPress={onSettings}>
              <Ionicons name="settings-sharp" size={20} color={theme.text} />
            </IconButton>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.title}>CONNECT</Text>
          <View style={styles.titleRow}>
            <Leaf side="left" />
            <Text style={styles.title}>R</Text>
            <Roundabout size={44} />
            <Text style={styles.title}>ADS</Text>
            <Leaf side="right" />
          </View>
          <Underline />
          <Text style={styles.tagline}>Count the clues. Lay the road.</Text>
        </View>

        {/* One way in. The button and the progress card used to be separate, which
            put two controls saying the same thing one above the other; the level
            it resumes and how far the ladder has got are what the button is for. */}
        <View style={styles.playWrap}>
          <PlayCard
            level={level}
            size={size}
            done={done}
            pct={pct}
            onPress={onPlay}
          />
        </View>

        <View style={styles.bottom}>
          <Pressable
            onPress={onLevels}
            style={({ pressed }) => [styles.chip, pressed && { transform: [{ scale: 0.96 }] }]}
          >
            <Ionicons name="grid" size={16} color={theme.gold} />
            <Text style={styles.chipText}>All Levels</Text>
          </Pressable>

          <Junction size={62} />

          <View style={styles.chip}>
            <Ionicons name="bulb" size={16} color={theme.gold} />
            <Text style={styles.chipText}>{progress.hints}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * The single call to action: what pressing it starts, and where that sits on the
 * ladder, on one raised face. It is the app's button idiom — a flat face on a
 * thicker bottom edge that drops when pressed — grown to hold three lines.
 */
function PlayCard({
  level,
  size,
  done,
  pct,
  onPress,
}: {
  level: number;
  size: number;
  done: number;
  pct: number;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      onPress={() => {
        haptics.tap();
        sound.press();
        onPress();
      }}
      style={styles.playCardWrap}
    >
      <View style={{ paddingBottom: down ? 0 : DEPTH, paddingTop: down ? DEPTH : 0 }}>
        <View style={[styles.playCard, { borderBottomWidth: down ? 0 : DEPTH }]}>
          <View style={styles.playRow}>
            <View style={styles.playGlyph}>
              <Ionicons name="play" size={24} color={theme.accent} />
            </View>
            <View style={styles.playText}>
              <Text style={styles.playLabel}>{done > 0 ? "Continue" : "Play"}</Text>
              <Text style={styles.playSub}>
                Level {level} · {size}×{size} · {DIFFICULTY[size] ?? "Expert"}
              </Text>
            </View>
          </View>

          <View style={styles.playProgress}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.progressCount}>
              {done} / {LEVEL_COUNT}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * The O of ROADS, built the way the board builds a road: a dark ring of tarmac
 * with the dashed centre line running round it and grass in the middle.
 */
function Roundabout({ size: s }: { size: number }) {
  const c = s / 2;
  const ring = s * 0.19;
  return (
    <Svg width={s} height={s} style={{ marginHorizontal: 1 }}>
      <Circle cx={c} cy={c} r={c - 1} fill={theme.text} />
      <Circle cx={c} cy={c} r={c - 1 - ring} fill={theme.verge} />
      <Circle
        cx={c}
        cy={c}
        r={c - 1 - ring / 2}
        stroke={theme.roadLine}
        strokeWidth={s * 0.05}
        strokeDasharray={`${s * 0.1} ${s * 0.13}`}
        fill="none"
      />
    </Svg>
  );
}

/** A leaf either side of the title — the verge, growing up onto the wordmark. */
function Leaf({ side }: { side: "left" | "right" }) {
  return (
    <Svg
      width={26}
      height={18}
      style={[styles.leaf, side === "left" ? { left: -26 } : { right: -26 }]}
    >
      <Path
        d={side === "left" ? "M25 3 C10 1 1 8 1 15 C14 17 24 11 25 3 Z" : "M1 3 C16 1 25 8 25 15 C12 17 2 11 1 3 Z"}
        fill={theme.verge}
      />
      <Path
        d={side === "left" ? "M25 3 C16 6 8 11 1 15" : "M1 3 C10 6 18 11 25 15"}
        stroke={theme.bush}
        strokeWidth={1.4}
        fill="none"
      />
    </Svg>
  );
}

/** The rule under the wordmark: a verge with the road's own dashes down it. */
function Underline() {
  return (
    <View style={styles.underline}>
      <Svg width={210} height={8}>
        <Line
          x1={12}
          y1={4}
          x2={198}
          y2={4}
          stroke={theme.roadLine}
          strokeWidth={2.5}
          strokeDasharray="10 9"
        />
      </Svg>
    </View>
  );
}

/**
 * The emblem between the bottom chips: two real pieces laid across each other,
 * clipped to a disc. Drawing it from `RoadPiece` rather than an icon means it
 * cannot drift from the road the game actually paints.
 */
function Junction({ size: s }: { size: number }) {
  return (
    <View style={[styles.junction, { width: s, height: s, borderRadius: s / 2 }]}>
      <RoadPiece size={s} piece={HORZ} />
      <View style={StyleSheet.absoluteFill}>
        <RoadPiece size={s} piece={VERT} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  bg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  // The paper the card and chips stand on, curved so the landscape reads as a
  // hill dropping behind it rather than a photograph cropped off square.
  sheet: {
    position: "absolute",
    left: -40,
    right: -40,
    bottom: 0,
    height: "32%",
    backgroundColor: theme.bg,
    borderTopLeftRadius: 260,
    borderTopRightRadius: 260,
  },
  content: { flex: 1, paddingHorizontal: 22, paddingTop: 8 },

  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topRight: { flexDirection: "row", gap: 8 },
  starChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.panel,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    ...shadow,
  },
  starText: { fontWeight: "800", color: theme.text, fontSize: 15 },

  hero: { alignItems: "center", marginTop: 22 },
  title: {
    fontSize: 46,
    lineHeight: 52,
    fontWeight: "900",
    color: theme.text,
    letterSpacing: 1.2,
  },
  titleRow: { flexDirection: "row", alignItems: "center" },
  leaf: { position: "absolute", top: 6 },
  underline: { marginTop: 10 },
  tagline: { marginTop: 12, fontSize: 15, fontWeight: "600", color: theme.textDim },

  // The auto margin floats the button down to the landscape; the padding sits
  // on top of that, so it drops clear of the wordmark and onto the road.
  // All the slack goes above the button, so it settles at the foot of the screen
  // and lands on the paper sheet rising over the landscape — the one control and
  // the two chips read as one piece of furniture there, and the whole middle of
  // the picture is left to be looked at.
  playWrap: { marginTop: "auto" },
  playCardWrap: { alignSelf: "stretch" },
  playCard: {
    backgroundColor: theme.accent,
    borderBottomColor: theme.accentDark,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
  },
  playRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  playGlyph: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.onAccent,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 3,
  },
  playText: { flex: 1 },
  playLabel: { fontSize: 24, fontWeight: "900", color: theme.onAccent, letterSpacing: 0.2 },
  playSub: { fontSize: 13.5, fontWeight: "700", color: "rgba(255,255,255,0.82)", marginTop: 2 },
  playProgress: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  progressTrack: {
    flex: 1,
    height: 9,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.32)",
    overflow: "hidden",
  },
  progressFill: { height: 9, borderRadius: 5, backgroundColor: theme.onAccent },
  progressCount: { fontSize: 13, fontWeight: "900", color: theme.onAccent },

  bottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 20,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: theme.panel,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: radius.pill,
    ...shadow,
  },
  chipText: { fontWeight: "800", color: theme.text, fontSize: 15 },
  junction: {
    overflow: "hidden",
    backgroundColor: theme.verge,
    alignItems: "center",
    justifyContent: "center",
    ...shadow,
  },
});
