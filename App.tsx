import {
  Fredoka_400Regular,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
  useFonts,
} from "@expo-google-fonts/fredoka";
import * as NativeSplash from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { GameScreen } from "./src/components/GameScreen";
import { GarageOverlay } from "./src/components/GarageOverlay";
import { HelpOverlay } from "./src/components/HelpOverlay";
import { HomeScreen } from "./src/components/HomeScreen";
import { LevelsScreen } from "./src/components/LevelsScreen";
import { SettingsOverlay } from "./src/components/SettingsOverlay";
import { SplashScreen } from "./src/components/SplashScreen";
import { TutorialScreen } from "./src/components/TutorialScreen";
import { dailyId, dailyPuzzle, dayOf, isDaily, tierNeeded, today } from "./src/game/daily";
import { fleetById } from "./src/game/garage";
import { LEVEL_COUNT } from "./src/game/levels";
import { TECHNIQUES, techniqueDue, techniqueFor, type Technique } from "./src/game/tutorial";
import { haptics } from "./src/haptics";
import { sound } from "./src/sound";
import { useBackHandler } from "./src/hooks/useBackHandler";
import { useGame } from "./src/state/useGame";
import { theme } from "./src/theme";

// The native splash holds until the fonts are in, so the first frame the player
// sees is already set in the game's own type rather than a system fallback.
NativeSplash.preventAutoHideAsync().catch(() => {});

type Screen = "home" | "levels" | "game" | "tutorial";

export default function App() {
  const game = useGame();
  const [fonts, fontError] = useFonts({
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });
  const ready = fonts || !!fontError;
  const [screen, setScreen] = useState<Screen>("home");
  const [settings, setSettings] = useState(false);
  // The title scene owns the screen until it bows out; nothing behind it needs
  // to know, so it is an overlay rather than a fourth `Screen`.
  const [splash, setSplash] = useState(true);
  const [help, setHelp] = useState(false);
  const [garage, setGarage] = useState(false);
  /**
   * The tutorial screen shows the basics unless this is set: a technique's
   * course, and the level it is on the way to (none when replayed from the help).
   */
  const [course, setCourse] = useState<{ technique: Technique; level?: number } | null>(null);

  useEffect(() => {
    if (ready) NativeSplash.hideAsync().catch(() => {});
  }, [ready]);

  // The stored preferences own the switches from the moment they load.
  useEffect(() => {
    haptics.setEnabled(game.progress.haptics);
  }, [game.progress.haptics]);

  useEffect(() => {
    sound.setEnabled(game.progress.sound);
  }, [game.progress.sound]);

  // Music waits for the stored preference, so a player who turned it off never
  // hears a bar of it on launch. Browsers refuse to start audio before the page has been touched (and throw
  // for asking), so on the web the loop waits for the first touch instead.
  const touched = useRef(Platform.OS !== "web");
  useEffect(() => {
    if (game.loaded && touched.current) sound.setMusic(game.progress.music);
  }, [game.loaded, game.progress.music]);

  const firstTouch = useCallback(() => {
    if (touched.current) return;
    touched.current = true;
    sound.setMusic(game.progress.music);
  }, [game.progress.music]);

  /**
   * Open a board — a ladder level, or a daily — unless it needs a trick the
   * player hasn't been shown, in which case the trick comes first and the board
   * after it. The ladder knows its tricks by level; a daily is asked what its own
   * board needs. `learned` is passed in rather than read from progress, because
   * straight after a course the progress that records it hasn't rendered yet.
   */
  const open = useCallback(
    (level: number, learned: readonly string[]) => {
      const due = isDaily(level)
        ? techniqueFor(tierNeeded(dailyPuzzle(dayOf(level))), learned)
        : techniqueDue(level, learned);
      if (due) {
        setCourse({ technique: due, level });
        setScreen("tutorial");
        return;
      }
      setCourse(null);
      game.start(level);
      setScreen("game");
    },
    [game],
  );

  const play = useCallback(
    (level: number) => open(level, game.progress.learned),
    [open, game.progress.learned],
  );

  const basics = useCallback(() => {
    setCourse(null);
    setScreen("tutorial");
  }, []);

  useBackHandler(
    useCallback(() => {
      if (splash) {
        setSplash(false);
        return true;
      }
      if (help) {
        setHelp(false);
        return true;
      }
      if (garage) {
        setGarage(false);
        return true;
      }
      if (settings) {
        setSettings(false);
        return true;
      }
      if (screen !== "home") {
        setScreen("home");
        return true;
      }
      return false;
    }, [splash, help, garage, settings, screen]),
  );

  if (!ready) return <View style={styles.root} />;

  return (
    <SafeAreaProvider>
      <View style={styles.root} onTouchStart={firstTouch}>
        <StatusBar style="dark" />
        {/* Behind the insets: sky above, grass below, so the scenery runs on
            under the home indicator instead of stopping at a blue band. */}
        <View pointerEvents="none" style={styles.ground} />
        {/* Every platform draws edge to edge now, so the insets come from one
          place on both — the status bar and notch above, the home indicator or
          Android's navigation bar below. */}
        <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
          {screen === "home" ? (
            <HomeScreen
              progress={game.progress}
              // A first-time player is walked through the rules before the
              // first board; anyone past level 1 already knows them.
              onPlay={() =>
                !game.progress.tutorialSeen && game.progress.unlockedLevel === 1
                  ? basics()
                  : play(game.progress.unlockedLevel)
              }
              onLevels={() => setScreen("levels")}
              onDaily={() => play(dailyId(today()))}
              onGarage={() => setGarage(true)}
              onSettings={() => setSettings(true)}
              onHelp={() => setHelp(true)}
            />
          ) : screen === "levels" ? (
            <LevelsScreen
              unlockedLevel={game.progress.unlockedLevel}
              stars={game.progress.stars}
              paint={fleetById(game.progress.fleet).paints[0]}
              onPick={play}
              onBack={() => setScreen("home")}
            />
          ) : screen === "tutorial" && course ? (
            <TutorialScreen
              // A fresh screen per course, so one course running straight into
              // the next (a player owed two) starts from its own first step.
              key={course.technique.id}
              technique={course.technique}
              next={
                course.level === undefined
                  ? undefined
                  : isDaily(course.level)
                    ? "Play today's road"
                    : `Play level ${course.level}`
              }
              onDone={() => {
                // Skipped counts as shown: it was offered, and it stays in the help.
                const { id } = course.technique;
                const learned = game.progress.learned.includes(id)
                  ? game.progress.learned
                  : [...game.progress.learned, id];
                game.patch({ learned });
                if (course.level) {
                  open(course.level, learned);
                } else {
                  setCourse(null);
                  setScreen("home");
                }
              }}
            />
          ) : screen === "tutorial" ? (
            <TutorialScreen
              onDone={() => {
                game.patch({ tutorialSeen: true });
                play(game.progress.unlockedLevel);
              }}
            />
          ) : (
            <GameScreen
              game={game}
              // A daily belongs to the home screen, where it was opened from.
              onExit={() => setScreen(isDaily(game.level) ? "home" : "levels")}
              // After a daily, "next" is back on the road trip, where the player left it.
              onNext={() =>
                play(isDaily(game.level) ? game.progress.unlockedLevel : Math.min(LEVEL_COUNT, game.level + 1))
              }
              onSettings={() => setSettings(true)}
            />
          )}
        </SafeAreaView>

        {settings ? (
          <SettingsOverlay
            progress={game.progress}
            onPatch={game.patch}
            onReset={() => {
              game.reset();
              setScreen("home");
            }}
            onTutorial={() => {
              setSettings(false);
              basics();
            }}
            onClose={() => setSettings(false)}
          />
        ) : null}
        {help ? (
          <HelpOverlay
            onClose={() => setHelp(false)}
            onTutorial={() => {
              setHelp(false);
              basics();
            }}
            techniques={TECHNIQUES.filter((t) => game.progress.learned.includes(t.id))}
            onTechnique={(technique) => {
              setHelp(false);
              setCourse({ technique });
              setScreen("tutorial");
            }}
          />
        ) : null}
        {garage ? (
          <GarageOverlay
            progress={game.progress}
            onPick={(fleet) => game.patch({ fleet })}
            onClose={() => setGarage(false)}
          />
        ) : null}
        {splash ? <SplashScreen onDone={() => setSplash(false)} /> : null}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.skyTop },
  safe: { flex: 1 },
  ground: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "50%",
    backgroundColor: theme.hillNear,
  },
});
