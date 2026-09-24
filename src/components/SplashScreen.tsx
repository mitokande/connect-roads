// The opening title: the landscape, the wordmark bouncing in, and traffic
// crossing a road along the bottom — "this game is about roads" before a single
// clue has been read.
//
// It gets out of the way on its own after `SHOW_MS`, and on a tap before that —
// a splash that can't be skipped is a toll, and this one is paid every launch.
// Every motion is a native-driver translate, scale or fade, so the JS thread is
// free for whatever is still loading behind it.

import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";

import { font, overlayLift, theme } from "../theme";
import { Car } from "./CarRide";
import { Logo } from "./Logo";
import { Scenery } from "./Scenery";

const SHOW_MS = 2100;
const FADE_MS = 300;

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const fade = useRef(new Animated.Value(1)).current;
  const logo = useRef(new Animated.Value(0)).current;
  const east = useRef(new Animated.Value(0)).current;
  const west = useRef(new Animated.Value(0)).current;
  const leaving = useRef(false);

  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => onDone());
  };

  useEffect(() => {
    Animated.spring(logo, { toValue: 1, friction: 5, tension: 60, delay: 150, useNativeDriver: true }).start();
    Animated.timing(east, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
    Animated.timing(west, { toValue: 1, duration: 1700, delay: 300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
    const t = setTimeout(leave, SHOW_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roadY = height * 0.74;
  const roadH = 64;
  const carL = 70;
  const carW = 42;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, overlayLift, { opacity: fade }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={leave}>
        <Scenery horizon={0.5} />

        <View style={[styles.center, { top: height * 0.2 }]}>
          <Animated.View
            style={{
              opacity: logo.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
              transform: [
                { scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
                { translateY: logo.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }) },
              ],
            }}
          >
            <Logo size={Math.min(88, width * 0.19)} />
          </Animated.View>
        </View>

        <View style={{ position: "absolute", left: 0, top: roadY, width, height: roadH }}>
          <Svg width={width} height={roadH}>
            <Rect x={0} y={0} width={width} height={roadH} fill={theme.kerb} />
            <Rect x={0} y={5} width={width} height={roadH - 10} fill={theme.asphalt} />
            <Line x1={0} y1={11} x2={width} y2={11} stroke={theme.roadEdgeLine} strokeWidth={2} />
            <Line x1={0} y1={roadH - 11} x2={width} y2={roadH - 11} stroke={theme.roadEdgeLine} strokeWidth={2} />
            <Line x1={0} y1={roadH / 2} x2={width} y2={roadH / 2} stroke={theme.roadLine} strokeWidth={3} strokeDasharray="18 14" />
          </Svg>
          <Animated.View
            style={{
              position: "absolute",
              top: roadH * 0.52,
              left: 0,
              transform: [{ translateX: east.interpolate({ inputRange: [0, 1], outputRange: [-carL * 1.5, width + carL] }) }],
            }}
          >
            <Car length={carL} width={carW * 0.62} />
          </Animated.View>
          <Animated.View
            style={{
              position: "absolute",
              top: roadH * 0.12,
              left: 0,
              transform: [
                { translateX: west.interpolate({ inputRange: [0, 1], outputRange: [width + carL, -carL * 1.5] }) },
                { rotate: "180deg" },
              ],
            }}
          >
            <Car length={carL} width={carW * 0.62} body={theme.fleet[1].body} edge={theme.fleet[1].edge} roof={theme.fleet[1].roof} />
          </Animated.View>
        </View>

        <Text style={[styles.tap, { top: roadY + roadH + 24 }]}>Tap to start</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  tap: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontFamily: font.semi,
    fontSize: 16,
    color: "#FFFFFF",
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
});
