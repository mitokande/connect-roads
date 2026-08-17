// Every level, grouped by grid size — the bands are the difficulty curve, so
// showing them is showing the player what they're climbing.

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { LEVEL_COUNT, sizeForLevel } from "../game/levels";
import { haptics } from "../haptics";
import { sound } from "../sound";
import { radius, shadow, theme } from "../theme";
import { IconButton } from "./Button";

export function LevelsScreen({
  unlockedLevel,
  onPick,
  onBack,
}: {
  unlockedLevel: number;
  onPick: (level: number) => void;
  onBack: () => void;
}) {
  const bands: { size: number; levels: number[] }[] = [];
  for (let l = 1; l <= LEVEL_COUNT; l++) {
    const size = sizeForLevel(l);
    const last = bands[bands.length - 1];
    if (last && last.size === size) last.levels.push(l);
    else bands.push({ size, levels: [l] });
  }

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <IconButton onPress={onBack}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </IconButton>
        <Text style={styles.title}>Levels</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {bands.map((band) => (
          <View key={band.size} style={styles.band}>
            <View style={styles.bandHead}>
              <Text style={styles.bandTitle}>
                {band.size}×{band.size}
              </Text>
              <View style={styles.bandRule} />
            </View>
            <View style={styles.grid}>
              {band.levels.map((level) => {
                const locked = level > unlockedLevel;
                const cleared = level < unlockedLevel;
                return (
                  <Pressable
                    key={level}
                    disabled={locked}
                    onPress={() => {
                      haptics.tap();
                      sound.press();
                      onPick(level);
                    }}
                    style={({ pressed }) => [
                      styles.tile,
                      cleared && styles.tileDone,
                      locked && styles.tileLocked,
                      pressed && { transform: [{ scale: 0.95 }] },
                    ]}
                  >
                    {locked ? (
                      <Ionicons name="lock-closed" size={15} color={theme.locked} />
                    ) : (
                      <>
                        <Text style={[styles.tileText, cleared && { color: "#FFFFFF" }]}>
                          {level}
                        </Text>
                        {cleared ? (
                          <Ionicons
                            name="checkmark"
                            size={11}
                            color="#FFFFFF"
                            style={styles.tick}
                          />
                        ) : null}
                      </>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  title: { fontSize: 20, fontWeight: "900", color: theme.text },
  scroll: { padding: 18, paddingBottom: 40 },
  band: { marginBottom: 22 },
  bandHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  bandTitle: { fontSize: 15, fontWeight: "900", color: theme.textDim, letterSpacing: 0.6 },
  bandRule: { flex: 1, height: 2, backgroundColor: theme.panelLine, borderRadius: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: theme.panel,
    alignItems: "center",
    justifyContent: "center",
    ...shadow,
  },
  tileDone: { backgroundColor: theme.good },
  tileLocked: { backgroundColor: theme.bgDeep, shadowOpacity: 0, elevation: 0 },
  tileText: { fontSize: 17, fontWeight: "800", color: theme.text },
  tick: { position: "absolute", bottom: 5 },
});
