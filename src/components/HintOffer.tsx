// "Out of hints" — the bulb pressed with none left in stock, offering a short
// video for one.
//
// Asked rather than played on the press: a rewarded video is something the
// player opts into knowing what it pays, and the bulb is pressed on reflex.
// Offered only when the board has a hint to give (`hintToGive`), and the hint
// lands the moment the video is done — the player wanted it now, not in stock.
//
// Low on the screen like the restart question, with the same backdrop: the board
// can't be played under a question about it, and tapping outside is *Not now*.

import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { useRewardedVideo } from "../hooks/useRewardedVideo";
import { font, overlayLift, radius, shadow, sheet, theme } from "../theme";
import { Button } from "./Button";

export function HintOffer({ onReward, onClose }: { onReward: () => void; onClose: () => void }) {
  const video = useRewardedVideo("hint");
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(rise, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true }).start();
  }, [rise]);

  return (
    <Pressable style={styles.wrap} onPress={video.busy ? undefined : onClose}>
      <Animated.View
        style={[
          styles.card,
          { transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [260, 0] }) }] },
        ]}
      >
        {/* Swallows taps on the card itself, so only the backdrop cancels. */}
        <Pressable onPress={() => {}}>
          <View style={styles.head}>
            <View style={styles.badge}>
              <Ionicons name="bulb" size={24} color={theme.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Out of hints</Text>
              <Text style={styles.body}>Watch a short video and get a hint for this board.</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Button
              label={video.busy ? "Loading video…" : "Watch video"}
              disabled={video.busy}
              onPress={() =>
                video.watch(() => {
                  onReward();
                  onClose();
                })
              }
              style={{ flex: 1 }}
              icon={<Ionicons name="play-circle" size={21} color={theme.onAccent} />}
            />
            <Button label="Not now" tone="soft" disabled={video.busy} onPress={onClose} />
          </View>
          {video.missed ? <Text style={styles.missed}>No video right now — try again in a moment.</Text> : null}
        </Pressable>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    ...overlayLift,
    backgroundColor: "rgba(46,42,69,0.28)",
    justifyContent: "flex-end",
    padding: 12,
  },
  card: {
    ...sheet,
    backgroundColor: theme.panel,
    borderRadius: radius.lg,
    padding: 14,
    borderBottomWidth: 5,
    borderBottomColor: theme.panelEdge,
    ...shadow,
  },
  head: { flexDirection: "row", gap: 12 },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.gold,
    borderBottomWidth: 3,
    borderBottomColor: theme.goldDark,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontFamily: font.bold, color: theme.text },
  body: { fontSize: 14.5, lineHeight: 20, color: theme.textDim, marginTop: 2, fontFamily: font.regular },
  row: { flexDirection: "row", gap: 10, marginTop: 12 },
  missed: { fontSize: 13.5, color: theme.textDim, fontFamily: font.medium, textAlign: "center", marginTop: 8 },
});
