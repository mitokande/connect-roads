import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { haptics } from "../haptics";
import { sound } from "../sound";
import type { Progress } from "../state/useGame";
import { overlayLift, radius, shadow, theme } from "../theme";
import { Button } from "./Button";

export function SettingsOverlay({
  progress,
  onPatch,
  onReset,
  onClose,
}: {
  progress: Progress;
  onPatch: (fields: Partial<Progress>) => void;
  onReset: () => void;
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

        <Row icon="school" label="Replay tutorial">
          <Switch
            value={!progress.tutorialSeen}
            onValueChange={(on) => onPatch({ tutorialSeen: !on })}
            trackColor={{ true: theme.good, false: theme.panelEdge }}
            thumbColor="#FFFFFF"
          />
        </Row>

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
            <Ionicons name="trash" size={16} color={theme.danger} />
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
      <Ionicons name={icon} size={19} color={theme.textDim} />
      <Text style={styles.settingLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    ...overlayLift,
    backgroundColor: "rgba(34,54,75,0.4)",
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
    ...shadow,
  },
  title: { fontSize: 21, fontWeight: "900", color: theme.text, textAlign: "center" },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.panelLine,
  },
  settingLabel: { flex: 1, fontSize: 15, fontWeight: "700", color: theme.text },
  reset: { flexDirection: "row", alignItems: "center", gap: 7, paddingTop: 16 },
  resetText: { color: theme.danger, fontWeight: "700", fontSize: 14 },
  confirm: { paddingTop: 16 },
  confirmText: { fontSize: 14, fontWeight: "600", color: theme.text, lineHeight: 20 },
  row: { flexDirection: "row", gap: 10, marginTop: 12 },
});
