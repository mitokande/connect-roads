// The ad SDK on the web: there isn't one, and the package can't be bundled
// there at all (it imports native-only React Native internals). The native
// builds get `adsSdk.native.ts` instead.

export type AdSdk = typeof import("react-native-google-mobile-ads");

export function loadAdSdk(): AdSdk | null {
  return null;
}
