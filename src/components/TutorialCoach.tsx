// First-level coaching. Takes the banner's place rather than floating over the
// board, so nothing the player is being told about is hidden by the telling.
//
// Steps that describe an idea advance on a tap; steps that ask for an action
// advance when the player *does* it — the game state is the progress signal, so
// the coach can never be a step ahead of the board.

import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";

import { radius, shadow, theme } from "../theme";

type Step = {
  text: React.ReactNode;
  /** Waits for the player instead of showing "Next". */
  awaits?: "claim" | "connect";
};

const STEPS: Step[] = [
  {
    text: (
      <>
        Join all the track into <B>one route</B>, from the entry arrow to the exit arrow.
      </>
    ),
  },
  {
    text: (
      <>
        The numbers count how many squares of that <B>row or column</B> hold track.
      </>
    ),
  },
  {
    text: (
      <>
        A square that a rail already points into must hold track. <B>Double tap</B> one to claim it.
      </>
    ),
    awaits: "claim",
  },
  {
    text: (
      <>
        Nice. Squares you've ruled out get a <B>single tap</B> — or swipe across a run of them.
      </>
    ),
  },
  {
    text: (
      <>
        You can <B>drag</B> out from the entry at any time. Push the rail into a square you
        haven't claimed and it claims it — so a wrong push costs a heart, just like a double tap.
      </>
    ),
  },
  {
    text: (
      <>
        Every square found. Now <B>drag</B> from the entry through them to lay the rails.
      </>
    ),
    awaits: "connect",
  },
];

function B({ children }: { children: React.ReactNode }) {
  return <Text style={styles.strong}>{children}</Text>;
}

export function TutorialCoach({
  phase,
  found,
  onDone,
}: {
  phase: string;
  found: number;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const startFound = useRef(found);
  const fade = useRef(new Animated.Value(1)).current;

  // The player claimed a square — that was the ask on step 3.
  useEffect(() => {
    if (found > startFound.current) setStep((s) => (s === 2 ? 3 : s));
  }, [found]);

  // Deduction finished: skip straight to the last lesson whatever step we're on.
  useEffect(() => {
    if (phase === "connect") setStep(STEPS.length - 1);
    if (phase === "won") onDone();
  }, [phase, onDone]);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [step, fade]);

  const current = STEPS[Math.min(step, STEPS.length - 1)];
  const waiting = current.awaits !== undefined;

  return (
    <Animated.View style={[styles.card, { opacity: fade }]}>
      <Text style={styles.text}>{current.text}</Text>
      {waiting ? (
        <Pressable onPress={onDone} hitSlop={8}>
          <Text style={styles.skip}>Skip tutorial</Text>
        </Pressable>
      ) : (
        <Pressable
          style={styles.next}
          onPress={() => (step >= STEPS.length - 1 ? onDone() : setStep(step + 1))}
        >
          <Text style={styles.nextText}>Next</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.panel,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    gap: 10,
    marginHorizontal: 4,
    ...shadow,
  },
  text: {
    fontSize: 14.5,
    lineHeight: 20,
    fontWeight: "600",
    color: theme.text,
    textAlign: "center",
  },
  strong: { color: theme.accent, fontWeight: "900" },
  next: {
    backgroundColor: theme.accent,
    paddingHorizontal: 26,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  nextText: { color: theme.onAccent, fontWeight: "800", fontSize: 15 },
  skip: { color: theme.textDim, fontWeight: "700", fontSize: 12.5 },
});
