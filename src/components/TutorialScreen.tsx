// The tutorial: four tiny boards, one line of text at a time, and a hand that
// does each gesture on the exact square it wants before the player does.
//
// The lessons are data (`src/game/tutorial.ts`); this screen plays them through
// the game's own reducer, so what it teaches is what the game does. What it adds
// is a **gate**: each step accepts only the moves its goal is about, and a move it
// doesn't want is ignored and answered by the hand showing it again. Nothing can
// be skipped by accident, and nothing can knock a lesson off its script.
//
// Two of the game's rules are softened here, and only here, because a lesson is
// not the place to be punished for learning:
//
//  - **A wrong claim costs no heart.** It is still refused — the square flashes,
//    the board shakes, the same sound plays — and the line says what it *would*
//    have cost, which is how the hearts get taught without taking one.
//  - **A road square can't be crossed out.** That keeps the lesson on its rails,
//    and it is also what lets a lone tap on a square that should be double-tapped
//    be caught and answered with "twice, quickly".

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import {
  isRoadCell,
  MARK_BLOCKED,
  MARK_NONE,
  MARK_ROAD,
  markAt,
  withMark,
} from "../game/board";
import { LESSONS, lessonPuzzle, type Goal, type TutorialStep } from "../game/tutorial";
import { same, type Coord } from "../game/types";
import { haptics } from "../haptics";
import { boardFor, reduce, type Action, type GameState } from "../state/useGame";
import { useGameSounds } from "../state/useGameSounds";
import { sound } from "../sound";
import { font, radius, shadow, theme } from "../theme";
import { Board, type BoardGeometry } from "./Board";
import { Button } from "./Button";
import { ClaimGlyph, CrossGlyph } from "./Cell";
import { GuideHand, type HandMove } from "./GuideHand";
import { Scenery } from "./Scenery";

/** Lesson boards get level ids past the ladder, so each one "opens" for sound. */
const LESSON_ID = 1000;
/** How long the hand keeps out of the way after the player moves. */
const REST_MS = 1400;
/** On a your-turn step, how long the player is left alone before a nudge. */
const IDLE_MS = 4000;

function openLesson(index: number): GameState {
  const puzzle = lessonPuzzle(index);
  let marks: Uint8Array | undefined;
  if (LESSONS[index].claimed) {
    marks = new Uint8Array(puzzle.size * puzzle.size);
    for (const { r, c } of puzzle.path) marks[r * puzzle.size + c] = MARK_ROAD;
  }
  return boardFor(puzzle, LESSON_ID + index, marks);
}

const mark = (s: GameState, c: Coord) => markAt(s.marks, s.puzzle.size, c.r, c.c);

/** The goal's squares still to do, in the order the lesson lists them. */
function remaining(goal: Goal, s: GameState): Coord[] {
  if (goal.kind === "claim") return goal.cells.filter((c) => mark(s, c) !== MARK_ROAD);
  if (goal.kind === "cross") return goal.cells.filter((c) => mark(s, c) !== MARK_BLOCKED);
  if (goal.kind === "solve") return s.puzzle.path.filter((c) => mark(s, c) !== MARK_ROAD);
  return [];
}

function isDone(goal: Goal, s: GameState): boolean {
  switch (goal.kind) {
    case "claim":
    case "cross":
      return remaining(goal, s).length === 0;
    case "solve":
      return s.phase !== "deduce";
    case "drive":
      return s.celebrate;
    default:
      return false;
  }
}

/** Does this step want this move at all? */
function wants(goal: Goal, a: Action): boolean {
  const on = (cells: Coord[]) => "cell" in a && cells.some((c) => same(c, a.cell));
  switch (goal.kind) {
    case "claim":
      return (a.type === "TAP" || a.type === "CLAIM") && on(goal.cells);
    case "cross":
      return (a.type === "TAP" || a.type === "PAINT") && on(goal.cells);
    case "solve":
      return a.type === "TAP" || a.type === "PAINT" || a.type === "CLAIM";
    case "drive":
      return a.type === "ROUTE" || a.type === "PAVE";
    default:
      return false;
  }
}

/** Where the hand goes, in the board's coordinates. */
function handFor(step: TutorialStep, s: GameState, g: BoardGeometry): HandMove | null {
  const gesture = step.gesture;
  if (!gesture) return null;
  const mid = (c: Coord): [number, number] => [
    g.gridX + c.c * g.cell + g.cell / 2,
    g.gridY + c.r * g.cell + g.cell / 2,
  ];

  if (gesture.kind === "point") {
    const col = gesture.axis === "col";
    const rx = col ? g.gridX + gesture.index * g.cell + g.cell / 2 : g.gutter / 2;
    const ry = col ? g.gutter / 2 : g.gridY + gesture.index * g.cell + g.cell / 2;
    return { kind: "point", x: rx, y: ry + g.clue / 2 + 2, rx, ry, ring: g.clue + 14 };
  }

  if (gesture.kind === "drag") {
    const { path } = s.puzzle;
    if (s.phase === "won") return null;
    const onTrack = s.route.every((c, i) => same(c, path[i]));
    const from = onTrack ? Math.max(0, s.route.length - 1) : 0;
    const pts = path.slice(from).map(mid);
    return pts.length > 1 ? { kind: "drag", pts } : null;
  }

  const todo = remaining(step.goal, s);
  if (todo.length === 0) return null;
  if (gesture.kind === "swipe" && todo.length > 1) return { kind: "swipe", pts: todo.map(mid) };
  const [x, y] = mid(todo[0]);
  return gesture.kind === "double" ? { kind: "double", x, y } : { kind: "tap", x, y };
}

export function TutorialScreen({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const boardWidth = Math.min(width - 28, 380, height - 330);

  const [lesson, setLesson] = useState(0);
  const [stepIx, setStepIx] = useState(0);
  const [finished, setFinished] = useState(false);
  const [game, setGame] = useState<GameState>(() => openLesson(0));
  const live = useRef(game);
  const commit = useCallback((s: GameState) => {
    live.current = s;
    setGame(s);
  }, []);

  const step = LESSONS[lesson].steps[stepIx];
  const stepRef = useRef(step);
  stepRef.current = step;

  useGameSounds(game);

  // --- the line of text, and the short-lived one that answers a slip --------
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((text: string) => {
    setNote(text);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 2200);
  }, []);

  // --- when the hand is shown -----------------------------------------------
  // At the start of a step straight away (it is the instruction), then out of
  // the way whenever the player moves, back once they pause. A your-turn step
  // holds it back until the player has been stuck for a while.
  const [handOn, setHandOn] = useState(true);
  const handTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [replay, setReplay] = useState(0);
  const rest = useCallback((ms: number) => {
    setHandOn(false);
    if (handTimer.current) clearTimeout(handTimer.current);
    handTimer.current = setTimeout(() => setHandOn(true), ms);
  }, []);
  useEffect(() => {
    setNote(null);
    if (step.idle) rest(IDLE_MS);
    else {
      if (handTimer.current) clearTimeout(handTimer.current);
      setHandOn(true);
    }
  }, [lesson, stepIx, step.idle, rest]);

  /** An off-script move: show the gesture again, right now. */
  // Throttled, because a stroke reports every square it crosses.
  const lastNudge = useRef(0);
  const nudge = useCallback(() => {
    const now = Date.now();
    if (now - lastNudge.current < 1200) return;
    lastNudge.current = now;
    if (handTimer.current) clearTimeout(handTimer.current);
    setHandOn(true);
    setReplay((n) => n + 1);
  }, []);

  // A lone tap on a square the lesson wants double-tapped. The board can't tell
  // a single tap from the first half of a double until the window has passed.
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- the gate ---------------------------------------------------------------
  const act = useCallback(
    (a: Action) => {
      const s = live.current;
      const goal = stepRef.current.goal;
      if (!wants(goal, a)) {
        nudge();
        return;
      }
      if ("cell" in a) {
        const road = isRoadCell(s.puzzle, a.cell.r, a.cell.c);
        const m = mark(s, a.cell);
        if (a.type === "TAP" && road && m === MARK_NONE) {
          if (tapTimer.current) clearTimeout(tapTimer.current);
          tapTimer.current = setTimeout(() => say("Tap *twice*, quickly!"), 380);
          return;
        }
        if (a.type === "PAINT" && road && a.value === MARK_BLOCKED) return;
      }
      if (a.type === "CLAIM" && tapTimer.current) clearTimeout(tapTimer.current);

      const next = reduce(s, a);
      if (next.hearts < s.hearts) {
        // Refused exactly as the game refuses it — but the heart stays.
        // Whatever road the same stroke laid before the bad push stands, as it
        // would in the game; only the heart and the refusal's ✕ are given back.
        const w = next.wrong;
        commit({
          ...next,
          hearts: s.hearts,
          failed: false,
          marks: w ? withMark(next.marks, s.puzzle.size, w.r, w.c, mark(s, w)) : next.marks,
        });
        say("No road there — that would cost a heart");
        rest(REST_MS);
        return;
      }
      if (a.type === "TAP" || a.type === "PAINT") haptics.tap();
      if (a.type === "CLAIM") haptics.claim();
      commit(next);
      rest(stepRef.current.idle ? IDLE_MS : REST_MS);
    },
    [commit, nudge, rest, say],
  );

  // --- progress ---------------------------------------------------------------
  const advance = useCallback(() => {
    const steps = LESSONS[lesson].steps;
    if (stepIx + 1 < steps.length) {
      setStepIx(stepIx + 1);
    } else if (lesson + 1 < LESSONS.length) {
      setLesson(lesson + 1);
      setStepIx(0);
      commit(openLesson(lesson + 1));
    } else {
      setFinished(true);
    }
  }, [lesson, stepIx, commit]);

  useEffect(() => {
    if (!isDone(step.goal, game)) return;
    const wait = step.goal.kind === "drive" ? 1700 : 650;
    const t = setTimeout(advance, wait);
    return () => clearTimeout(t);
  }, [game, step, advance]);

  // Flashes are transient, as in the game.
  useEffect(() => {
    if (!game.wrong && !game.hint) return;
    const t = setTimeout(() => commit(reduce(live.current, { type: "CLEAR_FLASH" })), 700);
    return () => clearTimeout(t);
  }, [game.wrong, game.hint, commit]);

  useEffect(
    () => () => {
      for (const t of [noteTimer, handTimer, tapTimer]) if (t.current) clearTimeout(t.current);
    },
    [],
  );

  // --- feel -----------------------------------------------------------------
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!game.shake) return;
    haptics.wrong();
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.6, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [game.shake, shake]);

  const roadLen = useRef(game.route.length);
  useEffect(() => {
    if (roadLen.current !== game.route.length) haptics.road();
    roadLen.current = game.route.length;
  }, [game.route.length]);

  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    enter.setValue(0);
    Animated.spring(enter, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }).start();
  }, [lesson, finished, enter]);

  // The square a claim step is about stays lit even while the hand is away.
  const target = step.goal.kind === "claim" ? remaining(step.goal, game)[0] ?? null : null;
  const handSize = Math.max(40, Math.min(64, (boardWidth / game.puzzle.size) * 0.62));

  return (
    <View style={styles.page}>
      <Scenery horizon={0.8} sun={false} decor={false} />

      <View style={styles.header}>
        <View style={{ width: 70 }} />
        <View style={styles.dots}>
          {[...LESSONS, null].map((_, i) => {
            const at = finished ? LESSONS.length : lesson;
            return <View key={i} style={[styles.dot, i < at && styles.dotDone, i === at && styles.dotNow]} />;
          })}
        </View>
        {finished ? (
          <View style={styles.skip} />
        ) : (
          <Pressable
            style={styles.skip}
            hitSlop={10}
            onPress={() => {
              sound.press();
              onDone();
            }}
          >
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        )}
      </View>

      {finished ? (
        <Animated.View
          style={[
            styles.stage,
            { opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] },
          ]}
        >
          <Recap
            onPlay={onDone}
            onAgain={() => {
              setFinished(false);
              setLesson(0);
              setStepIx(0);
              commit(openLesson(0));
            }}
          />
        </Animated.View>
      ) : (
        <View style={styles.stage}>
          <Caption text={note ?? step.say} warn={note !== null} bump={`${lesson}.${stepIx}.${note}`} />

          <Animated.View
            style={{
              alignItems: "center",
              opacity: enter.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
              transform: [
                { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] }) },
                { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
              ],
            }}
          >
            <Board
              puzzle={game.puzzle}
              marks={game.marks}
              route={game.route}
              phase={game.phase}
              width={boardWidth}
              hint={target}
              wrong={game.wrong}
              riding={game.riding}
              onRideDone={() => commit(reduce(live.current, { type: "RIDE_DONE" }))}
              onTap={(cell) => act({ type: "TAP", cell })}
              onClaim={(cell) => act({ type: "CLAIM", cell })}
              onPaint={(cell, value) => act({ type: "PAINT", cell, value })}
              onRoute={(route) => act({ type: "ROUTE", route })}
              onPave={(t) => act({ type: "PAVE", target: t })}
              overlay={(geo) => {
                const move = handFor(step, game, geo);
                if (!move) return null;
                const w = geo.gridX * 2 + geo.cell * game.puzzle.size;
                return (
                  <GuideHand
                    key={`${lesson}.${stepIx}.${replay}`}
                    move={move}
                    size={handSize}
                    visible={handOn && !game.riding}
                    width={w}
                    height={geo.gridY + geo.cell * game.puzzle.size + geo.gridX}
                  />
                );
              }}
            />
          </Animated.View>

          <View style={styles.under}>
            {step.goal.kind === "next" ? (
              <Button label="Got it" onPress={advance} />
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}

/** One line; `*word*` in bold. A slip's answer is shown in red. */
function Caption({ text, warn, bump }: { text: string; warn: boolean; bump: string }) {
  const hop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    hop.setValue(0.88);
    Animated.spring(hop, { toValue: 1, friction: 5, tension: 170, useNativeDriver: true }).start();
  }, [bump, hop]);
  const parts = text.split("*");
  return (
    <Animated.View style={[styles.bubble, warn && styles.bubbleWarn, { transform: [{ scale: hop }] }]}>
      <Text style={[styles.caption, warn && { color: theme.dangerDark }]}>
        {parts.map((p, i) =>
          i % 2 ? (
            <Text key={i} style={[styles.strong, warn && { color: theme.dangerDark }]}>
              {p}
            </Text>
          ) : (
            p
          ),
        )}
      </Text>
    </Animated.View>
  );
}

/** The whole rulebook, one glance: three gestures and what a slip costs. */
function Recap({ onPlay, onAgain }: { onPlay: () => void; onAgain: () => void }) {
  const T = 44;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>You're ready!</Text>
      <RecapRow art={<ClaimGlyph size={T} />} strong="Double tap" rest=" — road goes here" />
      <RecapRow art={<CrossGlyph size={T} />} strong="Tap / swipe" rest=" — no road (free)" />
      <RecapRow
        art={<Ionicons name="heart" size={28} color={theme.danger} />}
        strong="Wrong road"
        rest=" — costs a heart"
        plain
      />
      <RecapRow
        art={<Ionicons name="car-sport" size={28} color={theme.accent} />}
        strong="Drag"
        rest=" — start to flag"
        plain
      />
      <Button label="Let's play!" size="lg" onPress={onPlay} style={{ marginTop: 10 }} />
      <Pressable hitSlop={8} onPress={onAgain} style={{ marginTop: 12 }}>
        <Text style={styles.again}>Watch again</Text>
      </Pressable>
    </View>
  );
}

function RecapRow({
  art,
  strong,
  rest,
  plain,
}: {
  art: React.ReactNode;
  strong: string;
  rest: string;
  /** An icon rather than a board square — no lawn behind it. */
  plain?: boolean;
}) {
  return (
    <View style={styles.recapRow}>
      <View style={[styles.tile, plain && styles.tilePlain]}>{art}</View>
      <Text style={styles.recapText}>
        <Text style={styles.strong}>{strong}</Text>
        {rest}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", paddingTop: 6 },
  header: {
    width: "100%",
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  dots: { flexDirection: "row", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.6)" },
  dotDone: { backgroundColor: theme.good },
  dotNow: { backgroundColor: theme.accent, width: 26 },
  skip: {
    width: 70,
    height: 36,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  skipText: { fontFamily: font.semi, fontSize: 16, color: theme.text },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingBottom: 30,
    paddingHorizontal: 14,
  },
  bubble: {
    backgroundColor: theme.panel,
    borderRadius: radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 4,
    borderBottomColor: theme.panelEdge,
    maxWidth: 400,
    minHeight: 52,
    justifyContent: "center",
    ...shadow,
  },
  bubbleWarn: { borderBottomColor: theme.danger },
  caption: {
    fontSize: 18,
    lineHeight: 24,
    fontFamily: font.medium,
    color: theme.text,
    textAlign: "center",
  },
  strong: { fontFamily: font.bold, color: theme.accentDark },
  under: { minHeight: 60, justifyContent: "center" },
  card: {
    backgroundColor: theme.panel,
    borderRadius: radius.lg,
    padding: 22,
    width: "100%",
    maxWidth: 380,
    alignItems: "stretch",
    borderBottomWidth: 6,
    borderBottomColor: theme.panelEdge,
    ...shadow,
  },
  cardTitle: {
    fontSize: 28,
    fontFamily: font.bold,
    color: theme.text,
    textAlign: "center",
    marginBottom: 14,
  },
  recapRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 12 },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: theme.lawnA,
    alignItems: "center",
    justifyContent: "center",
  },
  tilePlain: { backgroundColor: theme.panelLine },
  recapText: { flex: 1, fontSize: 17, fontFamily: font.medium, color: theme.text },
  again: { textAlign: "center", fontFamily: font.semi, fontSize: 15, color: theme.textDim },
});
