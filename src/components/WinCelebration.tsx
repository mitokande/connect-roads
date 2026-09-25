// The win, built around the board rather than over it.
//
// The road the player drew *is* the reward: the convoy drives it, the light
// runs down it, and the squares it missed grow into a town round it (`Cell`'s
// `town`). A modal card over the top would cover all of that, so the
// celebration comes in pieces dropped into slots `GameScreen` already has — the
// congratulation where the instruction was, the next-level button where the
// tools were, the hearts turning to stars where the hearts already were — and
// only the confetti is an overlay, because it belongs to the whole screen and
// touches nothing.

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";

import { currentStreak, isDaily, today } from "../game/daily";
import { LEVEL_COUNT } from "../game/levels";
import { haptics } from "../haptics";
import type { Game } from "../state/useGame";
import { MAX_HEARTS } from "../state/useGame";
import { font, overlayLift, theme } from "../theme";
import { Button, IconButton } from "./Button";
import { Display } from "./Display";

/**
 * The congratulation, picked by how the board went. A clean sheet gets its own
 * word, because "no hearts lost and no hints spent" is the only thing here the
 * player can't already read off the screen; a board won on its last heart gets
 * the word the player is already thinking.
 */
export function WinTitle({ game }: { game: Game }) {
  const intro = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();

  useEffect(() => {
    haptics.win();
    Animated.spring(intro, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }).start();
  }, [intro]);

  const perfect = game.hearts === MAX_HEARTS && game.hintsUsed === 0;
  const daily = isDaily(game.level);
  const last = !daily && game.level >= LEVEL_COUNT;
  const word = perfect ? "FLAWLESS!" : game.hearts === 1 ? "PHEW!" : "WELL DONE!";
  // The streak is the daily's whole point, so its line under the title is that.
  const streak = currentStreak(game.progress.daily, today());
  // One line under the title: the news, if this win brought any, else what it was.
  let sub: string;
  if (game.newFleet) sub = `New paint job: ${game.newFleet.name}!`;
  else if (daily) sub = streak > 1 ? `${streak} days in a row!` : "Today's road is built";
  else sub = last ? "That's every road built — more soon!" : `Level ${game.level} complete`;

  return (
    // Absolute and centred on the banner's own box, so a title taller than the
    // instruction it replaces never re-centres the stage and jogs the board.
    <View pointerEvents="none" style={styles.titleSlot}>
      <Animated.View
        style={{
          opacity: intro.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
          transform: [
            { scale: intro.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
            { rotate: intro.interpolate({ inputRange: [0, 1], outputRange: ["-8deg", "-2deg"] }) },
          ],
        }}
      >
        <Display size={Math.min(44, width * 0.1)} color={theme.gold}>
          {word}
        </Display>
      </Animated.View>
      <Animated.Text
        style={[
          styles.sub,
          { opacity: intro.interpolate({ inputRange: [0.6, 1], outputRange: [0, 1], extrapolate: "clamp" }) },
        ]}
      >
        {sub}
      </Animated.Text>
    </View>
  );
}

/**
 * What to do next, in the slot the tools were using. The next level is the big
 * one and it is named rather than labelled "Next" — a number is a place, and the
 * ladder is the thing the player is climbing. Replay and the map sit either side:
 * available, not offered.
 */
export function WinActions({
  game,
  onExit,
  onNext,
}: {
  game: Game;
  onExit: () => void;
  /** Open the next level — through the app, which may have a trick to show first. */
  onNext: () => void;
}) {
  // After a daily, the next board is wherever the road trip was left.
  const daily = isDaily(game.level);
  const nextLevel = daily ? game.progress.unlockedLevel : game.level + 1;
  const last = !daily && game.level >= LEVEL_COUNT;
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(rise, { toValue: 1, friction: 6, tension: 80, delay: 500, useNativeDriver: true }).start();
  }, [rise]);
  return (
    <Animated.View
      style={[
        styles.actions,
        {
          opacity: rise,
          transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
        },
      ]}
    >
      <IconButton size={52} onPress={game.retry}>
        <Ionicons name="refresh" size={25} color={theme.text} />
      </IconButton>
      {last ? (
        <Button label="Road trip" size="lg" onPress={onExit} />
      ) : (
        <Button
          label={`Level ${nextLevel}`}
          size="lg"
          onPress={onNext}
          icon={<Ionicons name="car-sport" size={24} color={theme.onAccent} />}
        />
      )}
      <IconButton size={52} onPress={onExit}>
        <Ionicons name="map" size={23} color={theme.text} />
      </IconButton>
    </Animated.View>
  );
}

const CONFETTI_COLORS = [theme.accent, theme.good, theme.gold, theme.danger, "#8E6CF0", "#3FA7F5"];
const BITS = 34;

/**
 * Scraps of paper falling over the whole screen, on a loop. It sits above
 * everything and takes no touches, so the board underneath is still readable and
 * the buttons still press. The loop matters: a single burst ends in a bare
 * screen a couple of seconds later, which reads as the celebration breaking
 * rather than finishing. Each scrap has faded out by the end of its fall, so the
 * restart has nothing to jump.
 */
export function WinConfetti() {
  const { width, height } = useWindowDimensions();
  const drift = useRef(new Animated.Value(0)).current;

  const bits = useMemo(
    () =>
      Array.from({ length: BITS }, (_, i) => ({
        key: i,
        x: Math.random() * width,
        size: 7 + Math.random() * 8,
        round: i % 4 === 0,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 0.45,
        spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
        sway: (Math.random() - 0.5) * 100,
      })),
    [width],
  );

  useEffect(() => {
    const fall = Animated.loop(
      Animated.timing(drift, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }),
    );
    fall.start();
    return () => fall.stop();
  }, [drift]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, overlayLift]}>
      {bits.map((b) => {
        const t = drift.interpolate({ inputRange: [b.delay, 1], outputRange: [0, 1], extrapolate: "clamp" });
        return (
          <Animated.View
            key={b.key}
            style={{
              position: "absolute",
              left: b.x,
              top: -20,
              width: b.size,
              height: b.round ? b.size : b.size * 0.5,
              borderRadius: b.round ? b.size / 2 : 2,
              backgroundColor: b.color,
              opacity: t.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) },
                { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, b.sway] }) },
                { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${b.spin}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  titleSlot: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  sub: {
    fontSize: 15,
    fontFamily: font.semi,
    color: theme.text,
    textAlign: "center",
    marginTop: -6,
    backgroundColor: "rgba(255,249,238,0.9)",
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 18 },
});
