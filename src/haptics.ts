// Haptics, in one place so the setting toggle has a single switch to flip and
// call sites never have to care that the web build has no haptics at all.

import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

let enabled = true;
const available = Platform.OS === "ios" || Platform.OS === "android";

const fire = (run: () => Promise<unknown>) => {
  if (!enabled || !available) return;
  run().catch(() => {});
};

export const haptics = {
  setEnabled(on: boolean) {
    enabled = on;
  },
  /** A mark going down. */
  tap: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A claim — the committing move, so it lands harder. */
  claim: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** One more cell of road. */
  road: () => fire(() => Haptics.selectionAsync()),
  wrong: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  win: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
