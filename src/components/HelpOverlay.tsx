// The rules, in the order you need them.

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { HORZ, NE, SW } from "../game/types";
import { overlayLift, radius, shadow, theme } from "../theme";
import { Button } from "./Button";
import { RoadPiece } from "./RoadPiece";

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.card} onPress={() => {}}>
        <Text style={styles.title}>How to play</Text>

        <View style={styles.pieces}>
          <RoadPiece size={44} piece={HORZ} />
          <RoadPiece size={44} piece={NE} />
          <RoadPiece size={44} piece={SW} />
        </View>

        {/* The list is taller than the card on a small phone, so the scrollbar
            stays on: a rule clipped mid-sentence with no indicator reads as a
            layout bug rather than as "there is more". */}
        <ScrollView style={{ maxHeight: 330 }} showsVerticalScrollIndicator>
          <Rule icon="flag" title="One route, end to end">
            Lay a single unbroken road from the start line to the chequered flag. It never branches and
            never crosses itself.
          </Rule>
          <Rule icon="calculator" title="The numbers are counts">
            Each number says how many squares in that row or column hold road — not where. A count
            turns green once you've found them all.
          </Rule>
          <Rule icon="finger-print" title="Double tap to claim">
            Double tap a square you're sure carries road. Get it wrong and it costs a heart, so
            claim what you can prove.
          </Rule>
          <Rule icon="close" title="Tap or swipe to rule out">
            A single tap crosses a square out, and dragging crosses out a whole run. Crosses are
            free notes — they cost nothing and are never checked. Once a row's count is complete,
            sweep the rest of it out yourself.
          </Rule>
          <Rule icon="git-branch" title="Drag to lay the road">
            Drag out from the entry — the lit square — to lay real road. You can do this at any
            time, not just at the end. Dragging back along the road rubs it out.
          </Rule>
          <Rule icon="add-circle" title="The road can claim as it goes">
            Push the road into a square you haven't claimed and it claims it for you — the same bet
            as a double tap, so a wrong push costs a heart. Squares you've crossed out turn the road
            away for nothing. Once you've found every road square, pushing costs nothing at all.
          </Rule>
        </ScrollView>

        <Button label="Got it" onPress={onClose} style={{ marginTop: 14 }} />
      </Pressable>
    </Pressable>
  );
}

function Rule({
  icon,
  title,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.rule}>
      <View style={styles.bullet}>
        <Ionicons name={icon} size={16} color={theme.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.ruleTitle}>{title}</Text>
        <Text style={styles.ruleBody}>{children}</Text>
      </View>
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
    padding: 20,
  },
  card: {
    backgroundColor: theme.panel,
    borderRadius: radius.lg,
    padding: 22,
    width: "100%",
    maxWidth: 420,
    ...shadow,
  },
  title: { fontSize: 22, fontWeight: "900", color: theme.text, textAlign: "center" },
  pieces: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginVertical: 14,
    backgroundColor: theme.cellRoad,
    borderRadius: radius.sm,
    paddingVertical: 6,
    alignSelf: "center",
    paddingHorizontal: 10,
  },
  rule: { flexDirection: "row", gap: 12, marginBottom: 16 },
  bullet: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E8F2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  ruleTitle: { fontSize: 15, fontWeight: "800", color: theme.text, marginBottom: 2 },
  ruleBody: { fontSize: 13.5, lineHeight: 19, color: theme.textDim, fontWeight: "500" },
});
