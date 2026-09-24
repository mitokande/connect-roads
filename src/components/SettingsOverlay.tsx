import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { haptics } from "../haptics";
import { sound } from "../sound";
import type { Progress } from "../state/useGame";
import { font, overlayLift, radius, shadow, theme } from "../theme";
import { Button } from "./Button";

export function SettingsOverlay({
  progress,
  onPatch,
  onReset,
  onTutorial,
  onClose,
}: {
  progress: Progress;
  onPatch: (fields: Partial<Progress>) => void;
  onReset: () => void;
  /** Play the hand-guided tutorial again. */
  onTutorial: () => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.card} onPress={() => {}}>
        <Text style={styles.title}>Settings</Text>

        <Row icon="phone-portrait" label="Vibration">
          <Switch
            value={progress.haptics}
            onValueChange={(on) => {
              haptics.setEnabled(on);
              if (on) haptics.tap();
              onPatch({ haptics: on });
            }}
            trackColor={{ true: theme.good, false: theme.panelEdge }}
            thumbColor="#FFFFFF"
          />
        </Row>

        <Row icon="volume-high" label="Sound">
          <Switch
            value={progress.sound}
            onValueChange={(on) => {
              sound.setEnabled(on);
              // Play the toggle's own click, so "on" proves itself immediately.
              if (on) sound.press();
              onPatch({ sound: on });
            }}
            trackColor={{ true: theme.good, false: theme.panelEdge }}
            thumbColor="#FFFFFF"
          />
        </Row>

        <Row icon="musical-notes" label="Music">
          <Switch
            value={progress.music}
            onValueChange={(on) => {
              sound.setMusic(on);
              onPatch({ music: on });
            }}
            trackColor={{ true: theme.good, false: theme.panelEdge }}
            thumbColor="#FFFFFF"
          />
        </Row>

        <Pressable
          onPress={() => {
            sound.press();
            onTutorial();
          }}
        >
          <Row icon="school" label="How to play">
            <Ionicons name="play-circle" size={30} color={theme.accent} />
          </Row>
        </Pressable>

        {confirming ? (
          <View style={styles.confirm}>
            <Text style={styles.confirmText}>
              Erase all progress and start again from level 1?
            </Text>
            <View style={styles.row}>
              <Button
                label="Erase"
                tone="danger"
                onPress={() => {
                  onReset();
                  setConfirming(false);
                  onClose();
                }}
              />
              <Button label="Keep" tone="ghost" onPress={() => setConfirming(false)} />
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setConfirming(true)} style={styles.reset}>
            <Ionicons name="trash" size={17} color={theme.danger} />
            <Text style={styles.resetText}>Reset progress</Text>
          </Pressable>
        )}

        <Button label="Close" onPress={onClose} style={{ marginTop: 18 }} />
      </Pressable>
    </Pressable>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={theme.onAccent} />
      </View>
      <Text style={styles.settingLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    ...overlayLift,
    backgroundColor: "rgba(46,42,69,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  card: {
    backgroundColor: theme.panel,
    borderRadius: radius.lg,
    padding: 22,
    width: "100%",
    maxWidth: 380,
    borderBottomWidth: 6,
    borderBottomColor: theme.panelEdge,
    ...shadow,
  },
  title: { fontSize: 28, fontFamily: font.bold, color: theme.text, textAlign: "center", marginBottom: 6 },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1.5,
    borderBottomColor: theme.panelLine,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  settingLabel: { flex: 1, fontSize: 17, fontFamily: font.semi, color: theme.text },
  reset: { flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 16 },
  resetText: { color: theme.danger, fontFamily: font.semi, fontSize: 15 },
  confirm: { paddingTop: 16 },
  confirmText: { fontSize: 15, fontFamily: font.medium, color: theme.text, lineHeight: 21 },
  row: { flexDirection: "row", gap: 10, marginTop: 12 },
});
