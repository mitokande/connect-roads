// Out of hearts. Sits low on the screen on purpose: the board behind it is now
// showing the real route dimmed under the player's own marks, and covering that
// up to say "you lost" would throw away the only useful moment in a loss.

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Game } from "../state/useGame";
import { radius, shadow, theme } from "../theme";
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
          The solution is on the board behind — compare it with your crosses, then take another run
          at it.
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
