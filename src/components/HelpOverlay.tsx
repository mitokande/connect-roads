// The rules, in the order you need them, each illustrated with the very glyph
// the board draws for it — so the help can't describe a board the player never
// sees.

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import type { Technique } from "../game/tutorial";
import { HORZ, NE, SW } from "../game/types";
import { font, overlayLift, radius, shadow, theme } from "../theme";
import { Button } from "./Button";
import { Car } from "./CarRide";
import { ClaimGlyph, CrossGlyph } from "./Cell";
import { RoadPiece } from "./RoadPiece";

const T = 46;

export function HelpOverlay({
  onClose,
  onTutorial,
  techniques = [],
  onTechnique,
}: {
  onClose: () => void;
  /** Offered where there is somewhere to go: the guided tutorial. */
  onTutorial?: () => void;
  /**
   * The tricks this player has been shown, each replayable. Only those: the help
   * is a reference, not a preview of what the ladder will ask for later.
   */
  techniques?: Technique[];
  onTechnique?: (technique: Technique) => void;
}) {
  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.card} onPress={() => {}}>
        <Text style={styles.title}>How to play</Text>

        {/* The list is taller than the card on a small phone, so the scrollbar
            stays on: a rule clipped mid-sentence with no indicator reads as a
            layout bug rather than as "there is more". */}
        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator>
          <Rule
            art={
              <Tile>
                <RoadPiece size={T} piece={NE} />
              </Tile>
            }
            title="One road, end to end"
          >
            Build a single unbroken road from the start line to the chequered flag. It never
            branches and never crosses itself.
          </Rule>
          <Rule art={<ClueArt />} title="The numbers are counts">
            Each number says how many squares in that row or column hold road — not which ones. It
            turns green once you've found them all, and into a red warning sign if you've ruled out
            too many.
          </Rule>
          <Rule
            art={
              <Tile>
                <ClaimGlyph size={T} />
              </Tile>
            }
            title="Double tap to claim"
          >
            Double tap a square you're sure carries road. A wrong claim costs a heart, so claim what
            you can prove.
          </Rule>
          <Rule
            art={
              <Tile>
                <CrossGlyph size={T} />
              </Tile>
            }
            title="Tap or swipe to rule out"
          >
            A single tap crosses a square out; drag to cross out a run. Crosses are free notes —
            never checked. Once a row's count is complete, sweep the rest of it out yourself.
          </Rule>
          <Rule
            art={
              <Tile>
                <RoadPiece size={T} piece={HORZ} />
              </Tile>
            }
            title="Drag to lay the road"
          >
            Drag from the glowing square at the start to lay real road — any time, not just at the
            end. Drag back along it to rub it out.
          </Rule>
          <Rule
            art={
              <Tile>
                <RoadPiece size={T} piece={SW} />
              </Tile>
            }
            title="The road claims as it goes"
          >
            Push the road into a square you haven't claimed and it claims it for you — the same bet
            as a double tap, so a wrong push costs a heart. Your own crosses turn it away for free,
            and once every road square is found, pushing costs nothing at all.
          </Rule>
          <Rule
            art={
              <Tile>
                <Car length={T * 0.7} width={T * 0.44} />
              </Tile>
            }
            title="Hearts become stars"
          >
            You have three hearts. Finish the road and the hearts you still have become the level's
            stars — then watch the traffic roll and the town grow round your road.
          </Rule>
          <Rule
            art={
              <Tile tone={theme.gold}>
                <Ionicons name="bulb" size={26} color={theme.text} />
              </Tile>
            }
            title="Hints"
          >
            Stuck? A hint shows the next thing you can work out, and why — and points out a square
            you've crossed out by mistake. Every new level you clear earns another.
          </Rule>
          <Rule
            art={
              <Tile tone={theme.accent}>
                <Ionicons name="calendar" size={24} color={theme.onAccent} />
              </Tile>
            }
            title="Daily road"
          >
            A new board every day, the same for everyone — small on Monday, big by Sunday. Build it
            on days in a row to grow your streak; each day's first build earns a hint.
          </Rule>
          {techniques.length ? <Text style={styles.section}>Tricks you've learned</Text> : null}
          {techniques.map((t) => (
            <Rule
              key={t.id}
              art={
                <Tile tone={theme.gold}>
                  <Ionicons name="sparkles" size={24} color={theme.text} />
                </Tile>
              }
              title={t.name}
            >
              {t.rule.replace(/\*/g, "")}
              {onTechnique ? (
                <Text style={styles.replay} onPress={() => onTechnique(t)}>
                  {"  "}Show me ›
                </Text>
              ) : null}
            </Rule>
          ))}
        </ScrollView>

        {onTutorial ? (
          <Button
            label="Show me"
            tone="teal"
            icon={<Ionicons name="hand-left" size={20} color={theme.onAccent} />}
            onPress={onTutorial}
            style={{ marginTop: 14 }}
          />
        ) : null}
        <Button label="Let's build!" onPress={onClose} style={{ marginTop: 10 }} />
      </Pressable>
    </Pressable>
  );
}

function Tile({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return <View style={[styles.tile, tone ? { backgroundColor: tone } : null]}>{children}</View>;
}

function ClueArt() {
  return (
    <View style={[styles.tile, { backgroundColor: theme.panelLine }]}>
      <View style={styles.clue}>
        <Text style={styles.clueText}>3</Text>
      </View>
      <Svg width={14} height={10} style={{ position: "absolute", bottom: 5 }}>
        <Path d="M 1,1 L 7,8 L 13,1" stroke={theme.textDim} strokeWidth={2} fill="none" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

function Rule({ art, title, children }: { art: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.rule}>
      {art}
      <View style={{ flex: 1 }}>
        <Text style={styles.ruleTitle}>{title}</Text>
        <Text style={styles.ruleBody}>{children}</Text>
      </View>
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
    maxWidth: 440,
    borderBottomWidth: 6,
    borderBottomColor: theme.panelEdge,
    ...shadow,
  },
  title: { fontSize: 28, fontFamily: font.bold, color: theme.text, textAlign: "center", marginBottom: 12 },
  rule: { flexDirection: "row", gap: 14, marginBottom: 16, alignItems: "flex-start" },
  tile: {
    width: T,
    height: T,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: theme.lawnA,
    alignItems: "center",
    justifyContent: "center",
  },
  clue: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.good,
    borderBottomWidth: 2.5,
    borderColor: theme.goodDark,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  clueText: { fontFamily: font.bold, fontSize: 18, color: "#FFFFFF", includeFontPadding: false },
  ruleTitle: { fontSize: 17, fontFamily: font.bold, color: theme.text, marginBottom: 1 },
  ruleBody: { fontSize: 14, lineHeight: 19.5, color: theme.textDim, fontFamily: font.regular },
  section: {
    fontSize: 13,
    fontFamily: font.semi,
    color: theme.textDim,
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginTop: 4,
    marginBottom: 10,
  },
  replay: { fontFamily: font.bold, color: theme.accentDark },
});
