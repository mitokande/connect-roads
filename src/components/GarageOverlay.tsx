// The garage: the convoy's paint jobs, opened by stars (`src/game/garage.ts`).
//
// Reached by tapping the star count on the home screen — the number the stars
// were always shown as, finally somewhere to go. Every fleet is shown, locked
// ones too and in their own colours, because a paint job you can see is one you
// can want; the locked ones say how many stars are still to go rather than the
// bare threshold, which is the number a player can do something about.

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FLEETS, fleetById, isUnlocked, totalStars, type Paint } from "../game/garage";
import { haptics } from "../haptics";
import { sound } from "../sound";
import type { Progress } from "../state/useGame";
import { font, overlayLift, radius, shadow, theme } from "../theme";
import { Button } from "./Button";
import { Car } from "./CarRide";

export function GarageOverlay({
  progress,
  onPick,
  onClose,
}: {
  progress: Progress;
  onPick: (fleet: string) => void;
  onClose: () => void;
}) {
  const stars = totalStars(progress.stars);
  const chosen = fleetById(progress.fleet);
  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.card} onPress={() => {}}>
        <Text style={styles.title}>Garage</Text>
        <View style={styles.stars}>
          <Ionicons name="star" size={18} color={theme.gold} />
          <Text style={styles.starsText}>{stars} stars</Text>
        </View>
        <ScrollView style={{ maxHeight: 430 }} showsVerticalScrollIndicator>
          {FLEETS.map((fleet) => {
            const open = isUnlocked(fleet, stars);
            const on = fleet.id === chosen.id;
            return (
              <Pressable
                key={fleet.id}
                disabled={!open || on}
                onPress={() => {
                  haptics.tap();
                  sound.press();
                  onPick(fleet.id);
                }}
                style={[styles.row, on && styles.rowOn]}
              >
                <View style={{ opacity: open ? 1 : 0.45 }}>
                  <Convoy paints={fleet.paints} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, !open && { color: theme.textDim }]}>{fleet.name}</Text>
                  <Text style={styles.status}>
                    {on ? "Driving" : open ? "Tap to drive" : `${fleet.stars - stars} more ★ to unlock`}
                  </Text>
                </View>
                {on ? (
                  <Ionicons name="checkmark-circle" size={26} color={theme.good} />
                ) : open ? null : (
                  <Ionicons name="lock-closed" size={20} color={theme.locked} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
        <Button label="Close" onPress={onClose} style={{ marginTop: 14 }} />
      </Pressable>
    </Pressable>
  );
}

/** Three cars of the fleet nose to tail — enough to read as a convoy. */
function Convoy({ paints }: { paints: readonly Paint[] }) {
  return (
    <View style={styles.convoy}>
      {paints.slice(0, 3).map((p, i) => (
        <View key={i} style={{ position: "absolute", left: 3 + (2 - i) * 26, top: 8 }}>
          <Car length={23} width={15} body={p.body} edge={p.edge} roof={p.roof} />
        </View>
      ))}
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
    padding: 18,
  },
  card: {
    backgroundColor: theme.panel,
    borderRadius: radius.lg,
    padding: 20,
    width: "100%",
    maxWidth: 420,
    borderBottomWidth: 6,
    borderBottomColor: theme.panelEdge,
    ...shadow,
  },
  title: { fontSize: 28, fontFamily: font.bold, color: theme.text, textAlign: "center" },
  stars: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 12 },
  starsText: { fontFamily: font.semi, fontSize: 16, color: theme.textDim },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    marginBottom: 6,
    backgroundColor: theme.panelLine,
  },
  rowOn: { backgroundColor: "#E4F5DF", borderWidth: 2, borderColor: theme.good },
  convoy: { width: 80, height: 31, backgroundColor: theme.asphalt, borderRadius: 8 },
  name: { fontFamily: font.bold, fontSize: 16.5, color: theme.text },
  status: { fontFamily: font.medium, fontSize: 13, color: theme.textDim, marginTop: 1 },
});
