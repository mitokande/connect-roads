import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { LEVEL_COUNT, sizeForLevel } from "../game/levels";
import { HORZ } from "../game/types";
import type { Progress } from "../state/useGame";
import { radius, shadow, theme } from "../theme";
import { Button, IconButton } from "./Button";
import { RoadPiece } from "./RoadPiece";

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
  const done = progress.unlockedLevel - 1;

  return (
    <View style={styles.page}>
      <View style={styles.topBar}>
        <IconButton onPress={onHelp}>
          <Ionicons name="help" size={22} color={theme.text} />
        </IconButton>
        <IconButton onPress={onSettings}>
          <Ionicons name="settings-sharp" size={20} color={theme.text} />
        </IconButton>
      </View>

      <View style={styles.hero}>
        <Text style={styles.title}>CONNECT</Text>
        <Text style={styles.title}>ROADS</Text>
        <View style={styles.strip}>
          {Array.from({ length: 5 }, (_, i) => (
            <RoadPiece key={i} size={38} piece={HORZ} />
          ))}
        </View>
        <Text style={styles.tagline}>Count the clues. Lay the road.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>{done > 0 ? "Continue" : "Start here"}</Text>
        <Text style={styles.cardLevel}>
          Level {level} · {sizeForLevel(level)}×{sizeForLevel(level)}
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.min(100, (done / LEVEL_COUNT) * 100)}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {done} of {LEVEL_COUNT} cleared
        </Text>
        <Button label="Play" size="lg" onPress={onPlay} style={{ marginTop: 16 }} />
      </View>

      <View style={styles.bottom}>
        <Button label="All levels" tone="ghost" onPress={onLevels} />
        <View style={styles.hintChip}>
          <Ionicons name="bulb" size={16} color={theme.gold} />
          <Text style={styles.hintText}>{progress.hints}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 22, paddingTop: 8 },
  topBar: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  hero: { alignItems: "center", marginTop: 26 },
  title: {
    fontSize: 42,
    lineHeight: 46,
    fontWeight: "900",
    color: theme.text,
    letterSpacing: 1.5,
  },
  // No plate behind the road: the piece draws its own verges, and a panel
  // showing above and below them reads as a strip of something else.
  strip: { flexDirection: "row", marginTop: 16 },
  tagline: { marginTop: 14, fontSize: 15, fontWeight: "600", color: theme.textDim },
  card: {
    backgroundColor: theme.panel,
    borderRadius: radius.lg,
    padding: 22,
    marginTop: 36,
    alignItems: "center",
    ...shadow,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.textDim,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  cardLevel: { fontSize: 24, fontWeight: "900", color: theme.text, marginTop: 4 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.bgDeep,
    alignSelf: "stretch",
    marginTop: 16,
    overflow: "hidden",
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: theme.good },
  progressText: { fontSize: 12.5, fontWeight: "700", color: theme.textDim, marginTop: 8 },
  bottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: "auto",
    marginBottom: 24,
  },
  hintChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.panel,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    ...shadow,
  },
  hintText: { fontWeight: "800", color: theme.text, fontSize: 15 },
});
