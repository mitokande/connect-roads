// The wordmark. CONNECT sits small over ROADS, and the O of ROADS is a
// roundabout drawn from the board's own parts — tarmac, the yellow centre dashes,
// kerb stones, a tree on the island — outlined in the same ink as the letters so
// it reads as one of them.

import React from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { theme } from "../theme";
import { Display } from "./Display";

export function Logo({ size = 64 }: { size?: number }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Display size={size * 0.46} color={theme.gold} style={{ marginBottom: -size * 0.16 }}>
        CONNECT
      </Display>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Display size={size} color={theme.accent}>R</Display>
        <Roundabout size={size * 0.86} />
        <Display size={size} color={theme.accent}>ADS</Display>
      </View>
    </View>
  );
}

export function Roundabout({ size: s }: { size: number }) {
  const c = s / 2;
  const edge = Math.max(1.5, s * 0.06);
  const ring = s * 0.2;
  const outer = c - edge;
  const road = outer - s * 0.04;
  return (
    <Svg width={s} height={s + s * 0.1} style={{ marginHorizontal: s * 0.02, marginTop: -s * 0.05 }}>
      <Circle cx={c} cy={c + s * 0.1} r={outer} fill={theme.text} />
      <Circle cx={c} cy={c} r={outer + edge * 0.5} fill={theme.text} />
      <Circle cx={c} cy={c} r={outer} fill={theme.kerb} />
      <Circle cx={c} cy={c} r={road} fill={theme.asphalt} />
      <Circle cx={c} cy={c} r={road - ring} fill={theme.kerb} />
      <Circle cx={c} cy={c} r={road - ring - s * 0.03} fill={theme.lawnA} />
      <Circle
        cx={c}
        cy={c}
        r={road - ring / 2}
        stroke={theme.roadLine}
        strokeWidth={s * 0.04}
        strokeDasharray={`${s * 0.09} ${s * 0.08}`}
        fill="none"
      />
      <Circle cx={c} cy={c} r={s * 0.1} fill={theme.bush} />
      <Circle cx={c - s * 0.03} cy={c - s * 0.03} r={s * 0.055} fill={theme.bushLight} />
    </Svg>
  );
}
