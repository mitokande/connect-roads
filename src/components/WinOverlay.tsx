// The win card. Appears only after the car has finished its run — the ride is
// the reward, and a modal on top of it would be talking over the applause.

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from "react-native";

import { LEVEL_COUNT } from "../game/levels";
import { haptics } from "../haptics";
import type { Game } from "../state/useGame";
import { MAX_HEARTS } from "../state/useGame";
import { overlayLift, radius, shadow, theme } from "../theme";
import { Button } from "./Button";

export function WinOverlay({ game, onExit }: { game: Game; onExit: () => void }) {
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    haptics.win();
    Animated.spring(pop, {
      toValue: 1,
      friction: 6,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [pop]);

  const perfect = game.hearts === MAX_HEARTS && game.hintsUsed === 0;
  const last = game.level >= LEVEL_COUNT;

  return (
    <View style={styles.backdrop} pointerEvents="box-none">
      <Confetti />
      <Animated.View
        style={[
          styles.card,
          {
            opacity: pop,
            transform: [
              { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
            ],
          },
        ]}
      >
        <Text style={styles.title}>{perfect ? "Flawless!" : "Road laid!"}</Text>
        <Text style={styles.sub}>Level {game.level} complete</Text>

        <View style={styles.stats}>
          <Stat
            icon="heart"
            color={theme.danger}
            label={`${game.hearts}/${MAX_HEARTS}`}
            caption="hearts"
          />
          <Stat
            icon="bulb"
            color={theme.gold}
            label={`${game.hintsUsed}`}
            caption={game.hintsUsed === 1 ? "hint" : "hints"}
          />
          <Stat
            icon="grid"
            color={theme.accent}
            label={`${game.puzzle.path.length}`}
            caption="pieces"
          />
        </View>

        {!last ? (
          <Button label="Next level" size="lg" onPress={game.next} style={{ marginTop: 4 }} />
        ) : (
          <Text style={styles.done}>That's every level — more roads soon!</Text>
        )}
        <View style={styles.row}>
          <Button label="Replay" tone="ghost" onPress={game.retry} />
          <Button label="Levels" tone="ghost" onPress={onExit} />
        </View>
      </Animated.View>
    </View>
  );
}

function Stat({
  icon,
  color,
  label,
  caption,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  label: string;
  caption: string;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statCaption}>{caption}</Text>
    </View>
  );
}

const CONFETTI_COLORS = [theme.accent, theme.good, theme.gold, theme.danger, "#A971F5"];

/** Twenty scraps of paper, each with its own fall. Cosmetic and interruptible. */
function Confetti() {
  const { width, height } = Dimensions.get("window");
  const drift = useRef(new Animated.Value(0)).current;

  const bits = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        key: i,
        x: Math.random() * width,
        size: 7 + Math.random() * 7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 0.35,
        spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
        sway: (Math.random() - 0.5) * 90,
      })),
    [width],
  );

  useEffect(() => {
    Animated.timing(drift, {
      toValue: 1,
      duration: 2600,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [drift]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bits.map((b) => {
        const t = drift.interpolate({
          inputRange: [b.delay, 1],
          outputRange: [0, 1],
          extrapolate: "clamp",
        });
        return (
          <Animated.View
            key={b.key}
            style={{
              position: "absolute",
              left: b.x,
              top: -20,
              width: b.size,
              height: b.size * 0.5,
              borderRadius: 2,
              backgroundColor: b.color,
              opacity: t.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) },
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, b.sway] }) },
                {
                  rotate: t.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0deg", `${b.spin}deg`],
                  }),
                },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    ...overlayLift,
    backgroundColor: "rgba(34,54,75,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: theme.panel,
    borderRadius: radius.lg,
    paddingVertical: 26,
    paddingHorizontal: 24,
    alignItems: "center",
    alignSelf: "stretch",
    maxWidth: 380,
    ...shadow,
  },
  title: { fontSize: 30, fontWeight: "900", color: theme.goodDark },
  sub: { fontSize: 15, fontWeight: "600", color: theme.textDim, marginTop: 2 },
  stats: { flexDirection: "row", gap: 26, marginVertical: 20 },
  stat: { alignItems: "center", gap: 2 },
  statLabel: { fontSize: 17, fontWeight: "800", color: theme.text },
  statCaption: { fontSize: 11, fontWeight: "600", color: theme.textDim },
  row: { flexDirection: "row", gap: 10, marginTop: 12 },
  done: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.accentDark,
    textAlign: "center",
    marginTop: 4,
  },
});
