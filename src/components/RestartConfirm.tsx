// "Start this board again?" — asked only when there is something to lose.
//
// The restart button sits right beside the hint, under the thumb, and it is the
// one button left on the board that destroys work: leaving no longer does (the
// board is kept, see `useGame`), but starting again still wipes every mark to buy
// back three hearts. One mis-tap there used to cost an 8×8's worth of reasoning
// with no way back, so it asks first — and says plainly what the trade is.
//
// Low on the screen like the loss card, so the board it is asking about stays in
// view. The backdrop takes the touches while it is up (a board can't be played
// under a question about it), and tapping it is the same as *Keep going*.

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { font, overlayLift, radius, shadow, theme } from "../theme";
import { Button } from "./Button";

export function RestartConfirm({ onRestart, onCancel }: { onRestart: () => void; onCancel: () => void }) {
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(rise, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true }).start();
  }, [rise]);

  return (
    <Pressable style={styles.wrap} onPress={onCancel}>
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
              <Ionicons name="refresh" size={24} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Start this board again?</Text>
              <Text style={styles.body}>
                Every mark and all the road you've laid will be cleared, and your hearts refilled.
              </Text>
            </View>
          </View>
          <View style={styles.row}>
            <Button
              label="Keep going"
              onPress={onCancel}
              style={{ flex: 1 }}
              icon={<Ionicons name="car-sport" size={20} color={theme.onAccent} />}
            />
            <Button label="Start again" tone="ghost" onPress={onRestart} />
          </View>
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
    backgroundColor: theme.teal,
    borderBottomWidth: 3,
    borderBottomColor: theme.tealDark,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontFamily: font.bold, color: theme.text },
  body: { fontSize: 14.5, lineHeight: 20, color: theme.textDim, marginTop: 2, fontFamily: font.regular },
  row: { flexDirection: "row", gap: 10, marginTop: 12 },
});
