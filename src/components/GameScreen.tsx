// The board screen: header, the hearts, the one instruction that matters right
// now, the board itself, and the tools under it.
//
// The banner is deliberately a *phase* line rather than a tip feed. There are
// only two things to know — claim the road squares, and draw the route through
// them — and although the road may be laid from the first move, the moment the
// last square is claimed is the moment the board changes character: nothing is
// left to deduce and the whole route is drawable. The banner earns its space by
// marking that transition.
//
// The hearts and the stars are the same three slots. A won board keeps exactly
// the hearts it still had, and those turn into its stars, one by one — so the
// score is never a new number to read, it is the thing the player was already
// watching all game, paid out.

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { foundTotal, roadTotal } from "../game/board";
import { haptics } from "../haptics";
import type { Game } from "../state/useGame";
import { MAX_HEARTS } from "../state/useGame";
import { useGameSounds } from "../state/useGameSounds";
import { sound } from "../sound";
import { font, radius, regionFor, shadow, theme } from "../theme";
import { Board } from "./Board";
import { IconButton } from "./Button";
import { FailOverlay } from "./FailOverlay";
import { HelpOverlay } from "./HelpOverlay";
import { Scenery } from "./Scenery";
import { WinActions, WinConfetti, WinTitle } from "./WinCelebration";

export function GameScreen({
  game,
  onExit,
  onSettings,
}: {
  game: Game;
  onExit: () => void;
  onSettings: () => void;
}) {
  const [help, setHelp] = useState(false);
  const { width, height } = useWindowDimensions();
  // Every noise the board makes, derived from what changed in it.
  useGameSounds(game);
  // Leave room for the header, banner and tools on a short phone.
  const boardWidth = Math.min(width - 20, 470, height - 300);
  const region = regionFor(game.puzzle.size);

  // --- shake on a refused claim --------------------------------------------
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!game.shake) return;
    haptics.wrong();
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.7, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -0.4, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  }, [game.shake, shake]);

  // --- the road's own tick -------------------------------------------------
  // Driven off the drawn length rather than the gesture, because a road step may
  // come from the reducer (a drag that claimed its way forward) or from the hint
  // button, and all three should feel the same under the thumb.
  const roadLen = useRef({ level: game.level, len: game.route.length });
  useEffect(() => {
    const was = roadLen.current;
    roadLen.current = { level: game.level, len: game.route.length };
    if (was.level === game.level && was.len !== game.route.length) haptics.road();
  }, [game.level, game.route.length]);

  // --- the board arriving ----------------------------------------------------
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    enter.setValue(0);
    Animated.spring(enter, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }).start();
  }, [game.level, enter]);

  const found = foundTotal(game.marks);
  const total = roadTotal(game.puzzle);

  return (
    <View style={styles.page}>
      <Scenery horizon={0.8} sun={false} decor={false} />

      <View style={styles.header}>
        <IconButton onPress={onExit}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </IconButton>
        <View style={[styles.plate, { backgroundColor: region.color, borderBottomColor: region.dark }]}>
          <Text style={styles.plateLevel}>Level {game.level}</Text>
          <Text style={styles.plateSub}>
            {region.name} · {game.puzzle.size}×{game.puzzle.size}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <IconButton onPress={() => setHelp(true)}>
            <Ionicons name="help" size={24} color={theme.text} />
          </IconButton>
          <IconButton onPress={onSettings}>
            <Ionicons name="settings-sharp" size={21} color={theme.text} />
          </IconButton>
        </View>
      </View>

      <View style={styles.hud}>
        <Hearts hearts={game.hearts} stars={game.celebrate} />
        <View style={styles.found}>
          <Ionicons name="construct" size={15} color={theme.accentDark} />
          <Text style={styles.foundText}>
            {found}/{total}
          </Text>
        </View>
      </View>

      <View style={styles.stage}>
        <View style={[styles.bannerWrap, { width: Math.min(boardWidth, 440) }]}>
          {game.celebrate ? (
            <WinTitle game={game} />
          ) : (
            <Banner
              phase={game.phase}
              found={found}
              total={total}
              drawn={game.route.length}
              failed={game.failed}
            />
          )}
        </View>

        <Animated.View
          style={{
            alignItems: "center",
            opacity: enter.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
            transform: [
              { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] }) },
              { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
              { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
            ],
          }}
        >
          <Board
            puzzle={game.puzzle}
            marks={game.marks}
            route={game.route}
            phase={game.phase}
            width={boardWidth}
            hint={game.hint}
            wrong={game.wrong}
            riding={game.riding}
            onRideDone={game.rideDone}
            onTap={(cell) => {
              haptics.tap();
              game.tap(cell);
            }}
            onClaim={(cell) => {
              haptics.claim();
              game.claim(cell);
            }}
            onPaint={game.paint}
            onRoute={game.setRoute}
            onPave={game.pave}
          />
        </Animated.View>

        <View style={styles.tools}>
          {game.celebrate ? (
            <WinActions game={game} onExit={onExit} />
          ) : (
            <>
              <IconButton
                size={52}
                disabled={game.phase === "won"}
                onPress={game.retry}
              >
                <Ionicons name="refresh" size={25} color={theme.text} />
              </IconButton>
              <IconButton
                size={66}
                tone="gold"
                badge={game.progress.hints}
                disabled={game.progress.hints <= 0 || game.failed || game.phase === "won"}
                onPress={() => game.useHint()}
              >
                <Ionicons name="bulb" size={32} color={theme.text} />
              </IconButton>
              <IconButton size={52} onPress={onExit}>
                <Ionicons name="map" size={23} color={theme.text} />
              </IconButton>
            </>
          )}
        </View>
      </View>

      {game.celebrate ? <WinConfetti /> : null}
      {game.failed ? <FailOverlay game={game} onExit={onExit} /> : null}

      {help ? <HelpOverlay onClose={() => setHelp(false)} /> : null}
    </View>
  );
}

/**
 * Three slots. In play they are hearts, and a lost one bursts as it goes; on a
 * win the hearts still standing turn into stars, one after another, each with
 * its own note a step higher than the last.
 */
function Hearts({ hearts, stars }: { hearts: number; stars: boolean }) {
  return (
    <View style={styles.hearts}>
      {Array.from({ length: MAX_HEARTS }, (_, i) => (
        <Slot key={i} full={i < hearts} star={stars && i < hearts} index={i} />
      ))}
    </View>
  );
}

function Slot({ full, star, index }: { full: boolean; star: boolean; index: number }) {
  const pop = useRef(new Animated.Value(1)).current;
  const was = useRef({ full, star });

  useEffect(() => {
    const prev = was.current;
    was.current = { full, star };
    if (prev.full && !full) {
      // A heart lost: it swells and snaps away.
      pop.setValue(1.7);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    }
    if (!prev.star && star) {
      pop.setValue(0);
      const t = setTimeout(() => {
        sound.star(index + 1);
        haptics.tap();
        Animated.spring(pop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }).start();
      }, 650 + index * 330);
      return () => clearTimeout(t);
    }
    if (prev.star && !star) pop.setValue(1);
  }, [full, star, index, pop]);

  const name = star ? "star" : full ? "heart" : "heart-outline";
  const color = star ? theme.gold : full ? theme.danger : "rgba(46,42,69,0.3)";
  return (
    <Animated.View
      style={[
        styles.slot,
        star && styles.slotStar,
        {
          transform: [
            { scale: pop },
            { rotate: pop.interpolate({ inputRange: [0, 1, 1.7], outputRange: ["-90deg", "0deg", "12deg"] }) },
          ],
        },
      ]}
    >
      <Ionicons name={name} size={star ? 30 : 26} color={color} />
    </Animated.View>
  );
}

function Banner({
  phase,
  found,
  total,
  drawn,
  failed,
}: {
  phase: string;
  found: number;
  total: number;
  /** Cells of road already laid — the player may have started early. */
  drawn: number;
  failed: boolean;
}) {
  // A new line gets a small hop, so a change of instruction is noticed.
  const hop = useRef(new Animated.Value(1)).current;
  const key = failed ? "failed" : phase;
  useEffect(() => {
    hop.setValue(0.9);
    Animated.spring(hop, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }).start();
  }, [key, hop]);

  let body: React.ReactNode;
  if (failed) {
    body = <Text style={[styles.banner, { color: theme.dangerDark }]}>Out of hearts — your marks are still here</Text>;
  } else if (phase === "connect") {
    body = (
      <Text style={styles.banner}>
        Every piece found! <Text style={styles.bannerStrong}>Drag</Text>{" "}
        {drawn > 0 ? "the road on to the flag" : "from the start line to lay the road"}
      </Text>
    );
  } else if (phase === "won") {
    body = <Text style={[styles.banner, { color: theme.goodDark }]}>Green light — go!</Text>;
  } else {
    body = (
      <Text style={styles.banner}>
        <Text style={styles.bannerStrong}>Double tap</Text> where road must go · <Text style={styles.bannerStrong}>tap</Text> or{" "}
        <Text style={styles.bannerStrong}>swipe</Text> to rule out
      </Text>
    );
  }
  return (
    <Animated.View style={[styles.bubble, { transform: [{ scale: hop }] }]}>
      {body}
      {!failed && phase === "deduce" && total > 0 ? (
        <View style={styles.meter}>
          <View style={[styles.meterFill, { width: `${(found / total) * 100}%` }]} />
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", paddingTop: 6 },
  header: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  headerRight: { flexDirection: "row", gap: 8 },
  plate: {
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 4,
    borderRadius: radius.md + 2,
    borderBottomWidth: 4,
    marginHorizontal: 6,
    ...shadow,
  },
  plateLevel: { fontSize: 21, fontFamily: font.bold, color: "#FFFFFF", lineHeight: 25 },
  plateSub: { fontSize: 12, fontFamily: font.semi, color: "rgba(255,255,255,0.92)" },
  hud: {
    width: "100%",
    maxWidth: 480,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    marginTop: 8,
  },
  hearts: {
    flexDirection: "row",
    gap: 4,
    backgroundColor: theme.panel,
    paddingHorizontal: 10,
    height: 42,
    alignItems: "center",
    borderRadius: radius.pill,
    borderBottomWidth: 3,
    borderBottomColor: theme.panelEdge,
  },
  slot: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  slotStar: {},
  found: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.panel,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: radius.pill,
    borderBottomWidth: 3,
    borderBottomColor: theme.panelEdge,
  },
  foundText: { fontFamily: font.bold, color: theme.text, fontSize: 17 },
  bannerWrap: {
    minHeight: 70,
    justifyContent: "center",
  },
  bubble: {
    backgroundColor: theme.panel,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 4,
    borderBottomColor: theme.panelEdge,
    alignItems: "center",
  },
  banner: {
    fontSize: 15.5,
    lineHeight: 21,
    fontFamily: font.medium,
    color: theme.text,
    textAlign: "center",
  },
  bannerStrong: { fontFamily: font.bold, color: theme.accentDark },
  meter: {
    alignSelf: "stretch",
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.panelLine,
    marginTop: 7,
    overflow: "hidden",
  },
  meterFill: { height: 7, borderRadius: 4, backgroundColor: theme.accent },
  // Banner, board and tools are one block, centred in whatever height is left
  // under the header — the block's own height swings between a 4×4 and an 8×8,
  // and centring absorbs that. The nudge up off dead centre leaves the slack
  // under the board, where the thumb is.
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingBottom: 30,
  },
  tools: {
    flexDirection: "row",
    gap: 22,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 76,
  },
});
