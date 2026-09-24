// The tutorial's hand: a finger that performs the gesture it wants, on the very
// square it wants it on, over and over until the player copies it.
//
// It is drawn in the board's own coordinates (`Board`'s `overlay` slot), so it
// can never point at a square the board has drawn somewhere else. A press shows
// as a ripple under the fingertip; a stroke leaves a faint dotted guide behind,
// so the route is readable between loops and not only while the hand is on it.
//
// Everything animates translate, scale and opacity only — native driver
// throughout, so the hand keeps time however busy the JS thread is.

import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { G, Path, Polyline, Rect } from "react-native-svg";

import { theme } from "../theme";

export type HandMove =
  /** The tip goes to x,y; the ring (diameter `ring`) circles rx,ry. */
  | { kind: "point"; x: number; y: number; rx: number; ry: number; ring: number }
  | { kind: "tap"; x: number; y: number }
  | { kind: "double"; x: number; y: number }
  | { kind: "swipe"; pts: [number, number][] }
  | { kind: "drag"; pts: [number, number][] };

/** The fingertip, as a fraction of the hand's box (see `HandArt`). */
const TIP_X = 9 / 24;
const TIP_Y = 1.2 / 24;

export function GuideHand({
  move,
  size,
  visible,
  width,
  height,
}: {
  move: HandMove;
  /** Glyph size. */
  size: number;
  /** False while the player is busy — the hand steps out of the way. */
  visible: boolean;
  /** The board's box, for the stroke guide. */
  width: number;
  height: number;
}) {
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const press = useRef(new Animated.Value(0)).current;
  const alpha = useRef(new Animated.Value(0)).current;
  const show = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(show, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 120,
      useNativeDriver: true,
    }).start();
  }, [visible, show]);

  // One loop per gesture; a new gesture (or the same one re-asked) restarts it.
  const sig = JSON.stringify(move);
  useEffect(() => {
    const at = (x: number, y: number, ms: number, ease = Easing.inOut(Easing.quad)) =>
      Animated.timing(pos, { toValue: { x, y }, duration: ms, easing: ease, useNativeDriver: true });
    const to = (v: Animated.Value, value: number, ms: number) =>
      Animated.timing(v, { toValue: value, duration: ms, useNativeDriver: true });
    const tapOnce = [to(press, 1, 90), to(press, 0, 160)];
    const enter = (x: number, y: number) => [
      at(x + size * 0.55, y + size * 0.7, 0),
      Animated.parallel([to(alpha, 1, 220), at(x, y, 480, Easing.out(Easing.cubic))]),
    ];
    const leave = [Animated.delay(350), to(alpha, 0, 240), Animated.delay(450)];

    let seq: Animated.CompositeAnimation[];
    if (move.kind === "point") {
      const bob = [at(move.x, move.y + size * 0.14, 280), at(move.x, move.y, 280)];
      seq = [...enter(move.x, move.y), ...bob, ...bob, ...bob, ...leave];
    } else if (move.kind === "tap" || move.kind === "double") {
      seq = [
        ...enter(move.x, move.y),
        Animated.delay(120),
        ...tapOnce,
        ...(move.kind === "double" ? [Animated.delay(40), ...tapOnce] : []),
        Animated.delay(250),
        ...leave,
      ];
    } else {
      const [first, ...rest] = move.pts;
      seq = [
        ...enter(first[0], first[1]),
        to(press, 1, 120),
        ...rest.map(([x, y]) => at(x, y, 340, Easing.linear)),
        Animated.delay(160),
        to(press, 0, 160),
        ...leave,
      ];
    }
    alpha.setValue(0);
    press.setValue(0);
    const loop = Animated.loop(Animated.sequence(seq));
    loop.start();
    return () => loop.stop();
    // `sig` stands for `move`: a fresh object with the same gesture must not
    // restart the loop mid-demonstration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, size, pos, press, alpha]);

  const tipX = size * TIP_X;
  const tipY = size * TIP_Y;
  const ripple = size * 0.62;
  const opacity = Animated.multiply(alpha, show);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {move.kind === "swipe" || move.kind === "drag" ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: show }]}>
          <Svg width={width} height={height}>
            <Polyline
              points={move.pts.map(([x, y]) => `${x},${y}`).join(" ")}
              fill="none"
              stroke={theme.onDark}
              strokeOpacity={0.75}
              strokeWidth={Math.max(3, size * 0.09)}
              strokeDasharray={[1, size * 0.22]}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Animated.View>
      ) : null}

      {move.kind === "point" ? <Ring x={move.rx} y={move.ry} d={move.ring} show={show} /> : null}

      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: size,
          height: size,
          opacity,
          transform: [
            { translateX: Animated.add(pos.x, -tipX) },
            { translateY: Animated.add(pos.y, -tipY) },
          ],
        }}
      >
        <Animated.View
          style={{
            position: "absolute",
            left: tipX - ripple / 2,
            top: tipY - ripple / 2,
            width: ripple,
            height: ripple,
            borderRadius: ripple / 2,
            backgroundColor: theme.onDark,
            opacity: press.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] }),
            transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
          }}
        />
        <Animated.View
          style={{
            width: size,
            height: size,
            transform: [
              { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] }) },
            ],
          }}
        >
          <HandArt size={size} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/**
 * A pointing hand, drawn rather than taken from an icon font — one less font
 * file to load, and the fingertip sits exactly where `TIP_X`/`TIP_Y` say.
 *
 * The parts are drawn twice: once dark and stroked wide, then white on top, so
 * the outline runs round the silhouette of the whole hand and not every piece.
 */
function HandArt({ size }: { size: number }) {
  const parts = (
    <>
      {/* index finger */}
      <Rect x={7.5} y={1.2} width={3} height={12} rx={1.5} />
      {/* the other three, curled */}
      <Rect x={10.3} y={9} width={2.7} height={5.5} rx={1.35} />
      <Rect x={12.8} y={9.8} width={2.6} height={5} rx={1.3} />
      <Rect x={15.2} y={10.8} width={2.4} height={4.4} rx={1.2} />
      {/* palm */}
      <Rect x={7.5} y={11.5} width={10.1} height={8.5} rx={3} />
      {/* thumb */}
      <Path d="M 8.5,13 L 5.6,11.4 C 4.6,10.9 3.6,11.9 4.1,12.9 L 6.6,17.5 L 8.5,17.5 Z" />
      {/* cuff */}
      <Rect x={8} y={19.6} width={9.2} height={3.4} rx={1} />
    </>
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G opacity={0.28} transform="translate(0.7,0.9)" fill={theme.text} stroke={theme.text} strokeWidth={2.4} strokeLinejoin="round">
        {parts}
      </G>
      <G fill={theme.text} stroke={theme.text} strokeWidth={2.2} strokeLinejoin="round">
        {parts}
      </G>
      <G fill={theme.onDark}>{parts}</G>
      {/* creases between the curled fingers, and the cuff's seam */}
      <Path
        d="M 13,11.2 L 13,14 M 15.4,12 L 15.4,14.2 M 8.1,19.6 L 17.1,19.6"
        stroke={theme.text}
        strokeOpacity={0.35}
        strokeWidth={0.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** A ring breathing round a clue the lesson is talking about. */
function Ring({ x, y, d, show }: { x: number; y: number; d: number; show: Animated.Value }) {
  const beat = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [beat]);
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: x - d / 2,
        top: y - d / 2,
        width: d,
        height: d,
        borderRadius: d / 2,
        borderWidth: 3,
        borderColor: theme.accent,
        opacity: show,
        transform: [{ scale: beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }],
      }}
    />
  );
}

