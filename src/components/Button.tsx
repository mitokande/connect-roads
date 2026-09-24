// The app's buttons: a chunky face sitting on a thicker bottom edge, like a toy
// block, which drops by the edge's height when pressed. One component, several
// paints; and a round version for icons.

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { haptics } from "../haptics";
import { sound } from "../sound";
import { font, radius, theme } from "../theme";

export type Tone = "primary" | "teal" | "ghost" | "danger" | "gold";

export type ButtonProps = {
  label: string;
  onPress: () => void;
  tone?: Tone;
  size?: "md" | "lg";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
};

export const TONES: Record<Tone, { face: string; edge: string; ink: string }> = {
  primary: { face: theme.accent, edge: theme.accentDark, ink: theme.onAccent },
  teal: { face: theme.teal, edge: theme.tealDark, ink: theme.onAccent },
  danger: { face: theme.danger, edge: theme.dangerDark, ink: "#FFFFFF" },
  gold: { face: theme.gold, edge: theme.goldDark, ink: theme.text },
  ghost: { face: theme.panel, edge: theme.panelEdge, ink: theme.text },
};

export const DEPTH = 5;

export function Button({ label, onPress, tone = "primary", size = "md", disabled, style, icon }: ButtonProps) {
  const [down, setDown] = useState(false);
  const c = TONES[tone];
  const tall = size === "lg";

  return (
    <Pressable
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      onPress={() => {
        if (disabled) return;
        haptics.tap();
        sound.press();
        onPress();
      }}
      disabled={disabled}
      style={[{ opacity: disabled ? 0.45 : 1 }, style]}
    >
      {/* Pressed, the edge folds away and the face drops by exactly its height,
          so the button's outer box never changes size under the finger. */}
      <View style={{ paddingTop: down ? DEPTH : 0 }}>
        <View
          style={[
            styles.face,
            {
              backgroundColor: c.face,
              borderBottomColor: c.edge,
              borderBottomWidth: down ? 0 : DEPTH,
              paddingVertical: tall ? 15 : 11,
              paddingHorizontal: tall ? 30 : 20,
            },
          ]}
        >
          <View style={styles.shine} />
          {icon}
          <Text style={[styles.label, { color: c.ink, fontSize: tall ? 22 : 17 }]}>{label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** A round icon button — the header's back / help / settings controls. */
export function IconButton({
  children,
  onPress,
  size = 44,
  badge,
  disabled,
  tone = "ghost",
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  size?: number;
  badge?: number;
  disabled?: boolean;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}) {
  const [down, setDown] = useState(false);
  const c = TONES[tone];
  const depth = Math.round(size * 0.09);
  return (
    <Pressable
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      onPress={() => {
        if (disabled) return;
        haptics.tap();
        sound.press();
        onPress();
      }}
      disabled={disabled}
      hitSlop={4}
      style={[{ width: size, height: size + depth, opacity: disabled ? 0.45 : 1 }, style]}
    >
      <View
        style={[
          styles.icon,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: c.edge,
            top: depth,
          },
        ]}
      />
      <View
        style={[
          styles.icon,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: c.face,
            top: down ? depth : 0,
          },
        ]}
      >
        {children}
      </View>
      {badge !== undefined ? (
        <View style={[styles.badge, { top: down ? depth - 4 : -4 }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  face: {
    borderRadius: radius.md + 2,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    overflow: "hidden",
  },
  shine: {
    position: "absolute",
    left: 8,
    right: 8,
    top: 4,
    height: "38%",
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  label: { fontFamily: font.bold, letterSpacing: 0.3 },
  icon: {
    position: "absolute",
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    right: -5,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: theme.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  badgeText: { color: "#FFFFFF", fontSize: 12, fontFamily: font.bold, includeFontPadding: false },
});
