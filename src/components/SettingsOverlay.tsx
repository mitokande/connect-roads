import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Switch, Text, View } from "react-native";

import appConfig from "../../app.json";
import { privacyOptionsRequired, showPrivacyOptions } from "../ads";
import { DEBUG_TOOLS } from "../debug";
import { haptics } from "../haptics";
import { sound } from "../sound";
import type { Progress } from "../state/useGame";
import { font, overlayLift, radius, shadow, theme } from "../theme";
import { Button } from "./Button";

/**
 * Hosted with the support page beside it, which is also the store's support URL.
 * App Review wants the policy reachable from inside the app, not only the listing.
 */
const PRIVACY_POLICY_URL = "https://mithatck.com/apps/connectroads/privacy-policy.html";

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
  // Only where the law owes the player a way back to their ad consent, and only
  // once Google has said so — see `src/ads.ts`.
  const [privacy, setPrivacy] = useState(false);
  useEffect(() => {
    let live = true;
    privacyOptionsRequired().then((on) => live && setPrivacy(on));
    return () => {
      live = false;
    };
  }, []);

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

        <Pressable
          onPress={() => {
            sound.press();
            Linking.openURL(PRIVACY_POLICY_URL).catch(() => {});
          }}
        >
          <Row icon="document-text" label="Privacy policy">
            <Ionicons name="open-outline" size={26} color={theme.accent} />
          </Row>
        </Pressable>

        {privacy ? (
          <Pressable
            onPress={() => {
              sound.press();
              showPrivacyOptions();
            }}
          >
            <Row icon="shield-checkmark" label="Privacy options">
              <Ionicons name="chevron-forward-circle" size={30} color={theme.accent} />
            </Row>
          </Pressable>
        ) : null}

        {DEBUG_TOOLS ? (
          <View>
            <Text style={styles.debugTitle}>Debug</Text>
            <Row icon="bug" label="Open every level" tone={theme.danger}>
              <Switch
                value={!!progress.openAll}
                onValueChange={(on) => onPatch({ openAll: on })}
                trackColor={{ true: theme.danger, false: theme.panelEdge }}
                thumbColor="#FFFFFF"
              />
            </Row>
          </View>
        ) : null}

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
              <Button label="Keep" tone="soft" onPress={() => setConfirming(false)} />
            </View>
          </View>
        ) : (
          <View style={styles.footer}>
            <Pressable onPress={() => setConfirming(true)} style={styles.reset}>
              <Ionicons name="trash" size={17} color={theme.danger} />
              <Text style={styles.resetText}>Reset progress</Text>
            </Pressable>
            {/* The first thing a support email needs to know. */}
            <Text style={styles.version}>Version {appConfig.expo.version}</Text>
          </View>
        )}

        <Button label="Close" onPress={onClose} style={{ marginTop: 18 }} />
      </Pressable>
    </Pressable>
  );
}

function Row({
  icon,
  label,
  tone,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  /** The icon's disc, where it isn't the usual teal. */
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={[styles.rowIcon, tone ? { backgroundColor: tone } : null]}>
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
  debugTitle: {
    marginTop: 14,
    fontSize: 12,
    fontFamily: font.bold,
    color: theme.danger,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 16 },
  reset: { flexDirection: "row", alignItems: "center", gap: 7 },
  version: { color: theme.textDim, fontFamily: font.medium, fontSize: 13 },
  resetText: { color: theme.danger, fontFamily: font.semi, fontSize: 15 },
  confirm: { paddingTop: 16 },
  confirmText: { fontSize: 15, fontFamily: font.medium, color: theme.text, lineHeight: 21 },
  row: { flexDirection: "row", gap: 10, marginTop: 12 },
});
