// Display type: big rounded letters with a thick outline and a drop shadow, the
// way a toy box prints its name.
//
// React Native has no text stroke, so the outline is the word drawn eight times
// in the outline colour, nudged one stroke-width in each compass direction, with
// the fill drawn once on top. It is crude and it is exact: the copies are laid
// out by the same text engine as the fill, so the outline can never drift off
// the glyphs — which is the problem with every approach that measures text.

import React from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { font, theme } from "../theme";

const DIRS: [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

export function Display({
  children,
  size,
  color = "#FFFFFF",
  outline = theme.text,
  stroke,
  depth,
  style,
  textStyle,
}: {
  children: string;
  size: number;
  color?: string;
  outline?: string;
  /** Outline thickness; defaults to a fraction of the size. */
  stroke?: number;
  /** How far the drop shadow falls; defaults to a fraction of the size. */
  depth?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const k = stroke ?? Math.max(1.5, size * 0.055);
  const d = depth ?? Math.max(2, size * 0.09);
  const base: TextStyle = {
    fontFamily: font.bold,
    fontSize: size,
    lineHeight: size * 1.15,
    includeFontPadding: false,
    textAlign: "center",
  };
  return (
    <View style={[{ paddingHorizontal: k, paddingTop: k, paddingBottom: k + d }, style]}>
      {/* drop shadow: the outline again, lower */}
      {DIRS.map(([x, y], i) => (
        <Text
          key={`d${i}`}
          style={[base, textStyle, styles.layer, { color: outline, left: k + x * k, right: k - x * k, top: k + d + y * k }]}
        >
          {children}
        </Text>
      ))}
      {DIRS.map(([x, y], i) => (
        <Text
          key={`o${i}`}
          style={[base, textStyle, styles.layer, { color: outline, left: k + x * k, right: k - x * k, top: k + y * k }]}
        >
          {children}
        </Text>
      ))}
      <Text style={[base, textStyle, { color }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: "absolute" },
});
