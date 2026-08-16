// The board screen: header, the board itself, and the one instruction that
// matters right now.
//
// The banner is deliberately a *phase* line rather than a tip feed. There are
// only two things to know — claim the road cells, and draw the route through
// them — and although the road may be laid from the first move, the moment the
// last cell is claimed is the moment the board changes character: nothing is
// left to deduce and the whole route is drawable. The banner earns its space by
// marking that transition.

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, StyleSheet, Text, View } from "react-native";

import { foundTotal, roadTotal } from "../game/board";
import { haptics } from "../haptics";
import type { Game } from "../state/useGame";
import { MAX_HEARTS } from "../state/useGame";
import { useGameSounds } from "../state/useGameSounds";
import { theme } from "../theme";
import { Board } from "./Board";
import { IconButton } from "./Button";
import { FailOverlay } from "./FailOverlay";
import { HelpOverlay } from "./HelpOverlay";
import { TutorialCoach } from "./TutorialCoach";
import { WinOverlay } from "./WinOverlay";

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
  const width = Dimensions.get("window").width;
  // Every noise the board makes, derived from what changed in it.
  useGameSounds(game);
  const boardWidth = Math.min(width - 22, 460);

  // --- shake on a refused claim --------------------------------------------
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!game.shake) return;
    haptics.wrong();
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.6, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  }, [game.shake, shake]);

  // --- the road's own tick -------------------------------------------------
  // Driven off the drawn length rather than the gesture, because a road step may
  // now come from the reducer (a drag that claimed its way forward) or from the
  // hint button, and all three should feel the same under the thumb.
  const roadLen = useRef({ level: game.level, len: game.route.length });
  useEffect(() => {
    const was = roadLen.current;
    roadLen.current = { level: game.level, len: game.route.length };
    if (was.level === game.level && was.len !== game.route.length) haptics.road();
  }, [game.level, game.route.length]);

  const found = foundTotal(game.marks);
  const total = roadTotal(game.puzzle);

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <IconButton onPress={onExit}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </IconButton>
        <View style={styles.title}>
          <Text style={styles.level}>Level {game.level}</Text>
          <Text style={styles.size}>
            {game.puzzle.size}×{game.puzzle.size}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <IconButton onPress={() => setHelp(true)}>
            <Ionicons name="help" size={22} color={theme.text} />
          </IconButton>
          <IconButton onPress={onSettings}>
            <Ionicons name="settings-sharp" size={20} color={theme.text} />
          </IconButton>
        </View>
      </View>

      <Hearts hearts={game.hearts} />

      <View style={styles.stage}>
        <View style={[styles.bannerWrap, { width: boardWidth }]}>
          {game.level === 1 && !game.progress.tutorialSeen && !game.failed ? (
            <TutorialCoach
              phase={game.phase}
              found={found}
              onDone={() => game.patch({ tutorialSeen: true })}
            />
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
            transform: [
              { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] }) },
            ],
          }}
        >
          <Board
            puzzle={game.puzzle}
            marks={game.marks}
            route={game.route}
            phase={game.phase}
            width={boardWidth}
            ghosts={game.ghosts}
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
          <IconButton
            size={62}
            badge={game.progress.hints}
            disabled={game.progress.hints <= 0 || game.failed || game.phase === "won"}
            onPress={() => game.useHint()}
          >
            <Ionicons name="bulb" size={30} color={theme.gold} />
          </IconButton>
        </View>
      </View>

      {game.celebrate ? (
        <WinOverlay game={game} onExit={onExit} />
      ) : game.failed ? (
        <FailOverlay game={game} onExit={onExit} />
      ) : null}

      {help ? <HelpOverlay onClose={() => setHelp(false)} /> : null}
    </View>
  );
}

function Hearts({ hearts }: { hearts: number }) {
  return (
    <View style={styles.hearts}>
      {Array.from({ length: MAX_HEARTS }, (_, i) => (
        <Ionicons
          key={i}
          name={i < hearts ? "heart" : "heart-outline"}
          size={22}
          color={i < hearts ? theme.danger : theme.panelEdge}
        />
      ))}
    </View>
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
  if (failed) {
    return (
      <Text style={[styles.banner, { color: theme.dangerDark }]}>
        Out of hearts — the route is shown below
      </Text>
    );
  }
  if (phase === "connect") {
    return (
      <Text style={[styles.banner, { color: theme.accentDark }]}>
        Every piece found — now <Text style={styles.bannerStrong}>drag</Text>{" "}
        {drawn > 0 ? "the road on to the exit" : "from the entry to lay the road"}
      </Text>
    );
  }
  if (phase === "won") {
    return <Text style={[styles.banner, { color: theme.goodDark }]}>Green light — go!</Text>;
  }
  return (
    <Text style={styles.banner}>
      <Text style={styles.bannerStrong}>Double tap</Text> where road must go · tap or swipe to rule
      out{"  "}
      <Text style={{ color: theme.textDim }}>
        {found}/{total}
      </Text>
    </Text>
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
  title: { alignItems: "center" },
  level: { fontSize: 20, fontWeight: "800", color: theme.text },
  size: { fontSize: 13, fontWeight: "700", color: theme.textDim, marginTop: 1 },
  hearts: { flexDirection: "row", gap: 6, marginTop: 8 },
  bannerWrap: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    minHeight: 62,
    justifyContent: "center",
  },
  banner: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
    color: theme.text,
    textAlign: "center",
  },
  bannerStrong: { fontWeight: "900", color: theme.accent },
  // Banner, board and tools are one block, centred in whatever height is left
  // under the header — the block's own height swings by a couple of hundred
  // points between a 4×4 and an 8×8, and centring absorbs that.
  // The nudge up off dead centre is deliberate: a square board on a tall phone
  // leaves slack above and below, and slack reads better under the board (where
  // the thumb is) than above it.
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingBottom: 64,
  },
  tools: {
    flexDirection: "row",
    gap: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
