// Out of hearts. Sits low on the screen on purpose: the board behind it still
// holds every mark the player made, and covering that up to say "you lost" would
// throw away the only useful thing left in a loss. What it must *not* do is show
// the answer — see the note on `failed` in `useGame.ts`: a board that hands over
// its solution on a loss makes losing the fastest way to win.
//
// Once per board it also offers a video for a heart back (`REVIVE`). That is
// the one way on from here that keeps the board, so it leads — but it gives back
// one heart, not three, and nothing about the answer.

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { useRewardedVideo } from "../hooks/useRewardedVideo";
import type { Game } from "../state/useGame";
import { font, overlayLift, radius, shadow, theme } from "../theme";
import { Button } from "./Button";

export function FailOverlay({ game, onExit }: { game: Game; onExit: () => void }) {
  const video = useRewardedVideo("revive");
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(rise, { toValue: 1, friction: 7, tension: 60, delay: 350, useNativeDriver: true }).start();
  }, [rise]);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.card,
          { transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [260, 0] }) }] },
        ]}
      >
        <View style={styles.head}>
          <View style={styles.badge}>
            <Ionicons name="heart-dislike" size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Out of hearts</Text>
            <Text style={styles.body}>
              {game.canRevive
                ? "Watch a short video for a heart back and carry on — your marks are all still here."
                : "Your marks are still on the board — find the wrong one, then try again."}
            </Text>
          </View>
        </View>
        {game.canRevive ? (
          <>
            <Button
              label={video.busy ? "Loading video…" : "Watch video · +1 heart"}
              disabled={video.busy}
              // The level the video is for, so a reward landing late can't
              // revive some other board.
              onPress={() => {
                const { level, revive } = game;
                video.watch(() => revive(level));
              }}
              style={{ marginTop: 12 }}
              icon={<Ionicons name="play-circle" size={21} color={theme.onAccent} />}
            />
            {video.missed ? (
              <Text style={styles.missed}>No video right now — try again in a moment.</Text>
            ) : null}
          </>
        ) : null}
        <View style={styles.row}>
          <Button
            label="Try again"
            tone={game.canRevive ? "ghost" : "primary"}
            disabled={video.busy}
            onPress={game.retry}
            style={{ flex: 1 }}
            icon={<Ionicons name="refresh" size={20} color={game.canRevive ? theme.text : theme.onAccent} />}
          />
          <Button label="Map" tone="ghost" disabled={video.busy} onPress={onExit} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    ...overlayLift,
    justifyContent: "flex-end",
    padding: 12,
  },
  card: {
    backgroundColor: theme.panel,
    borderRadius: radius.lg,
    padding: 14,
    borderBottomWidth: 5,
    borderBottomColor: theme.panelEdge,
    ...shadow,
  },
  head: { flexDirection: "row", gap: 12 },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.danger,
    borderBottomWidth: 3,
    borderBottomColor: theme.dangerDark,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 22, fontFamily: font.bold, color: theme.text },
  body: { fontSize: 14.5, lineHeight: 20, color: theme.textDim, marginTop: 2, fontFamily: font.regular },
  row: { flexDirection: "row", gap: 10, marginTop: 12 },
  missed: { fontSize: 13.5, color: theme.textDim, fontFamily: font.medium, textAlign: "center", marginTop: 8 },
});
