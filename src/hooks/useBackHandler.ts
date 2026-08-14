import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";

/**
 * Android's system back button. `onBack` returns true when it handled the press
 * (closing an overlay, leaving a board); returning false lets the app exit.
 */
export function useBackHandler(onBack: () => boolean) {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [onBack]);
}
