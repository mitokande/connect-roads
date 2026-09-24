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
import { HelpOverlay } from "./src/components/HelpOverlay";
import { HomeScreen } from "./src/components/HomeScreen";
import { LevelsScreen } from "./src/components/LevelsScreen";
import { SettingsOverlay } from "./src/components/SettingsOverlay";
import { SplashScreen } from "./src/components/SplashScreen";
import { TutorialScreen } from "./src/components/TutorialScreen";
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

  const play = useCallback(
    (level: number) => {
      game.start(level);
      setScreen("game");
    },
    [game],
  );

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
      if (settings) {
        setSettings(false);
        return true;
      }
      if (screen !== "home") {
        setScreen("home");
        return true;
      }
      return false;
    }, [splash, help, settings, screen]),
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
                  ? setScreen("tutorial")
                  : play(game.progress.unlockedLevel)
              }
              onLevels={() => setScreen("levels")}
              onSettings={() => setSettings(true)}
              onHelp={() => setHelp(true)}
            />
          ) : screen === "levels" ? (
            <LevelsScreen
              unlockedLevel={game.progress.unlockedLevel}
              stars={game.progress.stars}
              onPick={play}
              onBack={() => setScreen("home")}
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
              onExit={() => setScreen("levels")}
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
              setScreen("tutorial");
            }}
            onClose={() => setSettings(false)}
          />
        ) : null}
        {help ? (
          <HelpOverlay
            onClose={() => setHelp(false)}
            onTutorial={() => {
              setHelp(false);
              setScreen("tutorial");
            }}
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
