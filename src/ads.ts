// Rewarded video: the two things a short ad buys — a heart back on a lost board,
// and a hint once the stock has run dry. Shaped like `sound.ts` and `haptics.ts`:
// plain verbs, safe to call from anywhere, and nothing here ever throws into the
// app. An ad that can't be shown is a button that says so, not a crash.
//
// **Expo Go has no ad SDK** — it is native code, and Expo Go only carries its
// own modules — and nor does the web build. There the video is skipped and the
// reward paid on the spot (`adsSimulated`), so both flows can be played through
// in Expo Go with nothing on screen but the reward. The package is loaded only
// after that check (`adsSdk.native.ts`), never imported at the top: merely
// loading it looks up its native module, and that throws where there isn't one.
//
// **A dev build shows Google's test ads**, whatever `UNITS` says: tapping a real
// ad on your own phone is the quickest way to get an AdMob account suspended. A
// release build shows the real units — or test ads while they are still blank.
//
// **Consent comes first.** In the EEA and UK, AdMob may only serve once the user
// has been asked (Google's UMP form, set up under *Privacy & messaging* in
// AdMob); `initAds` shows that form where it is needed and only then starts the
// SDK. It runs once at launch, and again at the first video if it failed then —
// a phone offline at launch had no form to show.
//
// **Then, on iOS, Apple's tracking prompt** (App Tracking Transparency), after
// Google's form as Google asks and before any ad request, since the answer is
// read at request time. The OS shows it once per install and answers every later
// ask itself, so asking at each start costs nothing. Declining changes nothing in
// the game — the prompt's own text says so — only which ads are served.
//
// **One ad is kept loaded per placement**, so the video starts when the button
// is pressed rather than after a load. A rewarded ad goes stale after an hour, so
// an old one is dropped and fetched again.

import { isRunningInExpoGo } from "expo";
import { AppState, Platform } from "react-native";

import { loadAdSdk, type AdSdk as Sdk } from "./adsSdk";
import { sound } from "./sound";

type Rewarded = import("react-native-google-mobile-ads").RewardedAd;

export type Placement = "revive" | "hint";

/**
 * How a video went. Only `rewarded` pays: `dismissed` is the player closing it
 * early, `unavailable` is there being nothing to show (offline, no fill, no
 * consent, a build without the SDK).
 */
export type AdOutcome = "rewarded" | "dismissed" | "unavailable";

/**
 * The AdMob ad units: *Rewarded*, one per placement per platform, so AdMob's
 * reports say which of the two earns. Blank means Google's test ad.
 */
const UNITS: Record<Placement, { ios: string; android: string }> = {
  revive: {
    ios: "ca-app-pub-4604843322018757/6445084802",
    android: "ca-app-pub-4604843322018757/2784117958",
  },
  hint: {
    ios: "ca-app-pub-4604843322018757/8732336794",
    android: "ca-app-pub-4604843322018757/2366238991",
  },
};

/** How long a press waits for an ad that hadn't loaded yet. */
const LOAD_WAIT_MS = 8_000;
/** Google's limit is an hour; a few minutes' margin. */
const STALE_MS = 55 * 60_000;
/**
 * A beat between the video closing and the verdict. The reward is reported
 * before the close on both platforms, but not every mediated network holds to
 * that, and a reward that arrived a moment late must still be paid.
 */
const CLOSE_GRACE_MS = 150;

/** No ad SDK here — Expo Go, or the web — so a reward is paid without a video. */
export const adsSimulated = Platform.OS === "web" || isRunningInExpoGo();

let sdk: Sdk | null | undefined;

function getSdk(): Sdk | null {
  if (sdk !== undefined) return sdk;
  sdk = null;
  if (adsSimulated) return sdk;
  try {
    sdk = loadAdSdk();
  } catch {
    // A native build made before the package was added: no ads, no crash.
  }
  return sdk;
}

let started: Promise<boolean> | null = null;
let ready = false;

/**
 * Ask for consent where the law wants it, then start the SDK and load an ad for
 * each placement. Once — or again, if the last attempt came to nothing.
 */
export function initAds(): Promise<boolean> {
  const m = getSdk();
  if (!m) return Promise.resolve(false);
  if (!started) {
    started = start(m).then((ok) => {
      ready = ok;
      if (!ok) started = null;
      return ok;
    });
  }
  return started;
}

async function start(m: Sdk): Promise<boolean> {
  try {
    // Shows the consent form only where one is required and not yet answered.
    // Offline it fails, and the answer cached from last time still stands.
    await m.AdsConsent.gatherConsent().catch(() => {});
    const { canRequestAds } = await m.AdsConsent.getConsentInfo();
    if (!canRequestAds) return false;
    await askToTrack();
    // Set before the SDK starts, so no request ever goes out without it. The
    // game is rated for everyone, and the videos it plays have to be too.
    await m.default().setRequestConfiguration({ maxAdContentRating: m.MaxAdContentRating.PG });
    await m.default().initialize();
    preload(m, "revive");
    preload(m, "hint");
    return true;
  } catch {
    return false;
  }
}

/**
 * Apple's tracking prompt, on iOS. Only an active app can show it — asked while
 * the app is still coming up or has been left, iOS answers "no" without a word,
 * and App Review rejects a build whose prompt it never saw — so it waits for the
 * app to be active first. The module is loaded here rather than imported:
 * loading it looks up its native module, which the web lacks.
 */
async function askToTrack(): Promise<void> {
  if (Platform.OS !== "ios") return;
  try {
    const att = require("expo-tracking-transparency") as typeof import("expo-tracking-transparency");
    await whenActive();
    await att.requestTrackingPermissionsAsync();
  } catch {
    // No prompt to show: the ads go out untracked, which is the safe side.
  }
}

function whenActive(): Promise<void> {
  if (AppState.currentState === "active") return Promise.resolve();
  return new Promise((resolve) => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      sub.remove();
      resolve();
    });
  });
}

/**
 * Whether this player is owed a way back to their consent answer — only where
 * the law asks for one (the EEA, the UK…), and Google says which once the
 * consent info has been gathered at launch. Settings offers the row only then.
 */
export async function privacyOptionsRequired(): Promise<boolean> {
  const m = getSdk();
  if (!m) return false;
  try {
    const { privacyOptionsRequirementStatus } = await m.AdsConsent.getConsentInfo();
    return privacyOptionsRequirementStatus === m.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
  } catch {
    return false;
  }
}

/**
 * Google's privacy options form, where the player can change what they answered.
 * The new answer decides whether ads may be requested at all, so the SDK is
 * started if it now may be, and counted as stopped if it may not — the next
 * video then asks again and finds nothing to show.
 */
export async function showPrivacyOptions(): Promise<void> {
  const m = getSdk();
  if (!m) return;
  try {
    const { canRequestAds } = await m.AdsConsent.showPrivacyOptionsForm();
    if (canRequestAds) {
      initAds();
    } else {
      ready = false;
      started = null;
    }
  } catch {
    // No form to show (offline, or none configured): nothing changed.
  }
}

type Slot = { ad: Rewarded; loadedAt: number };
const slots: Partial<Record<Placement, Slot>> = {};

function unitFor(m: Sdk, placement: Placement): string {
  const own = Platform.OS === "ios" ? UNITS[placement].ios : UNITS[placement].android;
  return __DEV__ || !own ? m.TestIds.REWARDED : own;
}

/** The placement's ad, set loading if it isn't already. A stale one is replaced. */
function preload(m: Sdk, placement: Placement): Rewarded {
  let slot = slots[placement];
  if (slot && slot.ad.loaded && Date.now() - slot.loadedAt > STALE_MS) {
    slot.ad.destroy();
    slot = undefined;
  }
  if (!slot) {
    const fresh: Slot = { ad: m.RewardedAd.createForAdRequest(unitFor(m, placement)), loadedAt: 0 };
    fresh.ad.addAdEventListener(m.RewardedAdEventType.LOADED, () => {
      fresh.loadedAt = Date.now();
    });
    slots[placement] = slot = fresh;
  }
  // A no-op while it is loading or loaded; after a close or a failure, the next one.
  slot.ad.load();
  return slot.ad;
}

/**
 * Get a placement's ad loading ahead of need — a screen that may offer a video
 * calls this as it opens. Only once the SDK is up: it never starts the SDK, so it
 * can't put a consent form over whatever is on screen.
 */
export function prepareRewarded(placement: Placement) {
  const m = getSdk();
  if (!m || !ready) return;
  try {
    preload(m, placement);
  } catch {
    // Nothing to prepare; the press will say so.
  }
}

function whenLoaded(m: Sdk, ad: Rewarded): Promise<boolean> {
  if (ad.loaded) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const offs: (() => void)[] = [];
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      offs.forEach((off) => off());
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), LOAD_WAIT_MS);
    offs.push(ad.addAdEventListener(m.RewardedAdEventType.LOADED, () => finish(true)));
    offs.push(ad.addAdEventListener(m.AdEventType.ERROR, () => finish(false)));
  });
}

function play(m: Sdk, ad: Rewarded): Promise<AdOutcome> {
  return new Promise((resolve) => {
    let earned = false;
    let done = false;
    const offs: (() => void)[] = [];
    const finish = (outcome: AdOutcome) => {
      if (done) return;
      done = true;
      offs.forEach((off) => off());
      sound.holdMusic(false);
      resolve(outcome);
    };
    offs.push(
      ad.addAdEventListener(m.RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }),
    );
    offs.push(
      ad.addAdEventListener(m.AdEventType.CLOSED, () => {
        setTimeout(() => finish(earned ? "rewarded" : "dismissed"), CLOSE_GRACE_MS);
      }),
    );
    offs.push(ad.addAdEventListener(m.AdEventType.ERROR, () => finish(earned ? "rewarded" : "unavailable")));
    sound.holdMusic(true);
    try {
      ad.show().catch(() => finish("unavailable"));
    } catch {
      finish("unavailable");
    }
  });
}

/**
 * Show a placement's video and say how it went. Never rejects. Where there is no
 * SDK (Expo Go, the web) it pays at once without showing anything.
 */
export async function showRewarded(placement: Placement): Promise<AdOutcome> {
  if (adsSimulated) return "rewarded";
  const m = getSdk();
  if (!m) return "unavailable";
  try {
    if (!(await initAds())) return "unavailable";
    const ad = preload(m, placement);
    if (!(await whenLoaded(m, ad))) return "unavailable";
    const outcome = await play(m, ad);
    preload(m, placement);
    return outcome;
  } catch {
    sound.holdMusic(false);
    return "unavailable";
  }
}
