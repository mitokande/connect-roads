// The ad SDK, loaded on demand. Called only once `src/ads.ts` has ruled out
// Expo Go: loading the package looks up its native module, and throws where
// there isn't one. The web has its own twin (`adsSdk.ts`) because the package
// can't even be bundled there.

export type AdSdk = typeof import("react-native-google-mobile-ads");

export function loadAdSdk(): AdSdk | null {
  return require("react-native-google-mobile-ads") as AdSdk;
}
