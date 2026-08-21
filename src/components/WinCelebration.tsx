// The win, and why it is not a card.
//
// It used to be a modal: a panel in the middle of the screen with the score on
// it, over a dimmed board. That covered the one thing the player had just spent
// several minutes making. The road they drew *is* the reward — the car drives it
// first, and then it stays lit (`LitRoad`, in `Board`) with the rest of the grid
// faded back behind it — so the celebration has to be built around the board
// rather than on top of it.
//
// So it comes in three pieces, each dropped into a slot `GameScreen` already
// has: the congratulation goes where the instruction banner was (it is the last
// thing the board has to say), the buttons go where the hint button was (there
// is nothing left to hint at), and the confetti is the only part that is an
// overlay — it belongs to the whole screen and touches nothing.
//
// Nothing here reports the score any more. Hearts are already along the top and
// the hint stock is already on the button that spends it, so a panel restating
// both was a panel restating the screen behind it.

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from "react-native";

import { LEVEL_COUNT } from "../game/levels";
import { haptics } from "../haptics";
import type { Game } from "../state/useGame";
import { MAX_HEARTS } from "../state/useGame";
import { overlayLift, theme } from "../theme";
import { Button, IconButton } from "./Button";

/** How long the letters take to land, all of them, end to end. */
const INTRO_MS = 820;
/** The share of that run given over to the stagger between letters. */
const STAGGER = 0.45;

/**
 * The congratulation, arched over the board.
 *
 * Two words, picked by how the board went: a clean sheet gets its own, because
 * "no hearts lost and no hints spent" is the only thing here the player can't
 * already read off the screen.
 */
export function WinTitle({ game }: { game: Game }) {
  const intro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    haptics.win();
    Animated.timing(intro, {
      toValue: 1,
      duration: INTRO_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [intro]);

  const perfect = game.hearts === MAX_HEARTS && game.hintsUsed === 0;
  const last = game.level >= LEVEL_COUNT;
  const word = perfect ? "FLAWLESS!" : "WELL DONE!";

  return (
    // Absolute, and centred on the banner's own box: the banner is 62pt tall and
    // the title is half as tall again, so laying it out in flow would re-centre
    // the whole stage and jog the board down at the exact moment the player is
    // looking at it. Overflowing a slot nothing else occupies costs nothing.
    <View pointerEvents="none" style={styles.titleSlot}>
      <ArchedWord word={word} intro={intro} />
      <Animated.Text
        style={[
          styles.sub,
          {
            opacity: intro.interpolate({
              inputRange: [0.55, 0.9],
              outputRange: [0, 1],
              extrapolate: "clamp",
            }),
          },
        ]}
      >
        {last ? "That's every level — more roads soon!" : `Level ${game.level} complete`}
      </Animated.Text>
    </View>
  );
}

/**
 * The word, bent into an arch.
 *
 * Each letter is its own `Text` in a row, so the text engine still measures the
 * spacing — the arch is applied on top as a per-letter rotation plus the drop
 * that rotation implies on a circle of radius `R`. Bending a single string would
 * mean guessing every glyph's width, and "I" and "!" are not "W".
 *
 * There is no outline. A dark ring round each letter made the word read as a
 * sticker pasted on the screen rather than as the board's own voice, and it is
 * the only black on a page that is otherwise paper and ink. The letters carry
 * themselves instead: big, heavy, in the one warm colour the game keeps for
 * winning, lifted off the pale background by a glow of their own colour rather
 * than a border of somebody else's.
 */
function ArchedWord({ word, intro }: { word: string; intro: Animated.Value }) {
  const screen = Dimensions.get("window").width;
  const chars = useMemo(() => [...word], [word]);
  // Big, but never wider than the screen it has to sit on — and never so tall
  // that the block stops fitting the banner's slot with room for the arch's own
  // overhang, since the slot is only 62pt and the overflow is what pays for it.
  const size = Math.min(40, Math.max(22, (screen - 44) / (chars.length * 0.68)));
  const arc = Math.min(54, chars.length * 6);
  const radius = size * 3.4;

  return (
    <View style={styles.word}>
      {chars.map((ch, i) => {
        const t = chars.length > 1 ? (i / (chars.length - 1)) * 2 - 1 : 0;
        const angle = (t * arc) / 2;
        const drop = radius * (1 - Math.cos((angle * Math.PI) / 180));
        const from = (i / chars.length) * STAGGER;

        if (ch === " ") return <View key={i} style={{ width: size * 0.26 }} />;
        return (
          <Animated.View
            key={i}
            style={{
              transform: [
                { translateY: drop },
                { rotate: `${angle}deg` },
                {
                  scale: intro.interpolate({
                    inputRange: [from, from + 0.28, from + 0.45, 1],
                    outputRange: [0.3, 1.18, 1, 1],
                    extrapolate: "clamp",
                  }),
                },
              ],
              opacity: intro.interpolate({
                inputRange: [from, from + 0.1, 1],
                outputRange: [0, 1, 1],
                extrapolate: "clamp",
              }),
            }}
          >
            <Text style={letterStyle(size)}>{ch}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * One letter, doing all its own work.
 *
 * The glow is the letter's own colour deepened, thrown a little downward and
 * blurred wide — it separates the glyph from the pale board behind it the way a
 * lamp does, where a hard border does it the way a cut-out does.
 */
function letterStyle(size: number) {
  return {
    fontSize: size,
    lineHeight: size * 1.18,
    fontWeight: "900" as const,
    textAlign: "center" as const,
    color: theme.gold,
    letterSpacing: size * 0.01,
    textShadowColor: "rgba(176,110,6,0.5)",
    textShadowOffset: { width: 0, height: size * 0.07 },
    textShadowRadius: size * 0.28,
  };
}

/**
 * What to do next, in the slot the hint button was using.
 *
 * The next level is the big one and it is named rather than labelled "Next" —
 * a number is a place, and the ladder is the thing the player is climbing.
 * Replay and the level list are icons either side: available, not offered.
 */
export function WinActions({ game, onExit }: { game: Game; onExit: () => void }) {
  const last = game.level >= LEVEL_COUNT;
  return (
    <>
      <IconButton onPress={game.retry}>
        <Ionicons name="refresh" size={22} color={theme.text} />
      </IconButton>
      {last ? (
        <Button label="Levels" size="lg" onPress={onExit} />
      ) : (
        <Button label={`Level ${game.level + 1}`} size="lg" onPress={game.next} />
      )}
      <IconButton onPress={onExit}>
        <Ionicons name="grid" size={20} color={theme.text} />
      </IconButton>
    </>
  );
}

const CONFETTI_COLORS = [theme.accent, theme.good, theme.gold, theme.danger, "#A971F5"];
const BITS = 28;

/**
 * Scraps of paper falling over the whole screen, on a loop.
 *
 * It sits above everything and takes no touches, so the board underneath is
 * still readable and the buttons still press. The loop matters: a single burst
 * ends in a bare screen a couple of seconds after the player has stopped
 * reading, which looks like the celebration broke rather than finished. Each
 * scrap has faded out by the end of its fall, so the restart has nothing to
 * jump.
 */
export function WinConfetti() {
  const { width, height } = Dimensions.get("window");
  const drift = useRef(new Animated.Value(0)).current;

  const bits = useMemo(
    () =>
      Array.from({ length: BITS }, (_, i) => ({
        key: i,
        x: Math.random() * width,
        size: 7 + Math.random() * 7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        delay: Math.random() * 0.45,
        spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
        sway: (Math.random() - 0.5) * 90,
      })),
    [width],
  );

  useEffect(() => {
    const fall = Animated.loop(
      Animated.timing(drift, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    fall.start();
    return () => fall.stop();
  }, [drift]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, overlayLift]}>
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
              opacity: t.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
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
  titleSlot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  word: { flexDirection: "row", alignItems: "flex-start" },
  sub: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.textDim,
    textAlign: "center",
    // Clear of the arch: rotation and the drop are transforms, so the letters at
    // the ends of the word hang below the row's layout box without widening it.
    marginTop: 14,
  },
});
