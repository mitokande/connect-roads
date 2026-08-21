// The app's buttons: a flat face sitting on a thicker bottom edge, which drops
// by the edge's height when pressed. One component, three weights.

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { haptics } from "../haptics";
import { sound } from "../sound";
import { radius, theme } from "../theme";

export type ButtonProps = {
  label: string;
  onPress: () => void;
  tone?: "primary" | "ghost" | "danger";
  size?: "md" | "lg";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
};

const TONES = {
  primary: { face: theme.accent, edge: theme.accentDark, ink: theme.onAccent },
  danger: { face: theme.danger, edge: theme.dangerDark, ink: "#FFFFFF" },
  ghost: { face: theme.panel, edge: theme.panelEdge, ink: theme.text },
} as const;

export const DEPTH = 4;

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
      <View style={{ paddingBottom: down ? 0 : DEPTH, paddingTop: down ? DEPTH : 0 }}>
        <View
          style={[
            styles.face,
            {
              backgroundColor: c.face,
              borderBottomColor: c.edge,
              borderBottomWidth: down ? 0 : DEPTH,
              paddingVertical: tall ? 16 : 11,
              paddingHorizontal: tall ? 34 : 20,
            },
          ]}
        >
          {icon}
          <Text style={[styles.label, { color: c.ink, fontSize: tall ? 21 : 16 }]}>{label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** A round icon button — the header's back / help / settings controls. */
export function IconButton({
  children,
  onPress,
  size = 42,
  badge,
  disabled,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  size?: number;
  badge?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [down, setDown] = useState(false);
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
      style={[
        styles.icon,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ scale: down ? 0.94 : 1 }],
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {children}
      {badge !== undefined ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  face: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  label: { fontWeight: "800", letterSpacing: 0.2 },
  icon: {
    backgroundColor: theme.panel,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.frame,
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: theme.good,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.bg,
  },
  badgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
});
