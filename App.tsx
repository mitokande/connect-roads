import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useState } from "react";
import { Platform, SafeAreaView, StatusBar as RNStatusBar, StyleSheet, View } from "react-native";

import { GameScreen } from "./src/components/GameScreen";
import { HelpOverlay } from "./src/components/HelpOverlay";
import { HomeScreen } from "./src/components/HomeScreen";
import { LevelsScreen } from "./src/components/LevelsScreen";
import { SettingsOverlay } from "./src/components/SettingsOverlay";
import { haptics } from "./src/haptics";
import { useBackHandler } from "./src/hooks/useBackHandler";
import { useGame } from "./src/state/useGame";
import { theme } from "./src/theme";

type Screen = "home" | "levels" | "game";

export default function App() {
  const game = useGame();
  const [screen, setScreen] = useState<Screen>("home");
  const [settings, setSettings] = useState(false);
  const [help, setHelp] = useState(false);

  // The stored preference owns the haptics switch from the moment it loads.
  useEffect(() => {
    haptics.setEnabled(game.progress.haptics);
  }, [game.progress.haptics]);

  const play = useCallback(
    (level: number) => {
      game.start(level);
      setScreen("game");
    },
    [game],
  );

  useBackHandler(
    useCallback(() => {
      if (help) {
        setHelp(false);
        return true;
      }
      if (settings) {
        setSettings(false);
        return true;
      }
      if (screen === "game") {
        setScreen("home");
        return true;
      }
      if (screen === "levels") {
        setScreen("home");
        return true;
      }
      return false;
    }, [help, settings, screen]),
  );

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe}>
        {screen === "home" ? (
          <HomeScreen
            progress={game.progress}
            onPlay={() => play(game.progress.unlockedLevel)}
            onLevels={() => setScreen("levels")}
            onSettings={() => setSettings(true)}
            onHelp={() => setHelp(true)}
          />
        ) : screen === "levels" ? (
          <LevelsScreen
            unlockedLevel={game.progress.unlockedLevel}
            onPick={play}
            onBack={() => setScreen("home")}
          />
        ) : (
          <GameScreen
            game={game}
            onExit={() => setScreen("home")}
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
          onClose={() => setSettings(false)}
        />
      ) : null}
      {help ? <HelpOverlay onClose={() => setHelp(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  safe: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) : 0,
  },
});
