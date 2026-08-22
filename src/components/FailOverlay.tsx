// Out of hearts. Sits low on the screen on purpose: the board behind it still
// holds every mark the player made, and covering that up to say "you lost" would
// throw away the only useful thing left in a loss. What it must *not* do is show
// the answer — see the note on `failed` in `useGame.ts`: a board that hands over
// its solution on a loss makes losing the fastest way to win.

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Game } from "../state/useGame";
import { overlayLift, radius, shadow, theme } from "../theme";
import { Button } from "./Button";

export function FailOverlay({ game, onExit }: { game: Game; onExit: () => void }) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.card}>
        <View style={styles.head}>
          <Ionicons name="heart-dislike" size={22} color={theme.danger} />
          <Text style={styles.title}>Out of hearts</Text>
        </View>
        <Text style={styles.body}>
          Your marks are still on the board behind — read them back against the clues to find the
          one that was wrong, then take another run at it.
        </Text>
        <View style={styles.row}>
          <Button label="Try again" onPress={game.retry} />
          <Button label="Levels" tone="ghost" onPress={onExit} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    ...overlayLift,
    justifyContent: "flex-end",
    padding: 16,
  },
  card: {
    backgroundColor: theme.panel,
    borderRadius: radius.lg,
    padding: 20,
    ...shadow,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 19, fontWeight: "800", color: theme.text },
  body: { fontSize: 14, lineHeight: 20, color: theme.textDim, marginTop: 8, fontWeight: "500" },
  row: { flexDirection: "row", gap: 10, marginTop: 16 },
});
