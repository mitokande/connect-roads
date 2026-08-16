// Sound effects, in one place so the setting toggle has a single switch to flip
// and call sites never have to care about players, loading, or the fact that a
// browser will not make a noise until it has been touched. The shape deliberately
// mirrors `src/haptics.ts`: named verbs, no arguments, safe to call from anywhere.
//
// The files come from `npm run sfx:build`, which synthesises them — see
// `scripts/buildSounds.ts` for what each one is made of and why.
//
// **Players are made once, at import.** Every sound here is a few kB and the
// whole set is a few hundred, so paying for them up front buys the thing that
// actually matters for a game: the first tap makes its noise immediately rather
// than after a load. Nothing here ever throws into the app — a device that
// cannot play audio should be a quiet game, not a broken one.
//
// **The hot sounds come in threes.** A cross and a cell of road are heard
// thousands of times, often several a second inside one stroke, and the ear picks
// out an identical sample repeated at speed and starts hearing a machine gun.
// Rotating three near-identical takes breaks that up, and as a bonus it gives
// each play its own player, so consecutive ones can overlap properly.

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

import claimSrc from "../assets/sfx/claim.wav";
import cross1 from "../assets/sfx/cross1.wav";
import cross2 from "../assets/sfx/cross2.wav";
import cross3 from "../assets/sfx/cross3.wav";
import driveSrc from "../assets/sfx/drive.wav";
import failSrc from "../assets/sfx/fail.wav";
import hintSrc from "../assets/sfx/hint.wav";
import openSrc from "../assets/sfx/open.wav";
import pave1 from "../assets/sfx/pave1.wav";
import pave2 from "../assets/sfx/pave2.wav";
import pave3 from "../assets/sfx/pave3.wav";
import pressSrc from "../assets/sfx/press.wav";
import settledSrc from "../assets/sfx/settled.wav";
import uncrossSrc from "../assets/sfx/uncross.wav";
import unpaveSrc from "../assets/sfx/unpave.wav";
import winSrc from "../assets/sfx/win.wav";
import wrongSrc from "../assets/sfx/wrong.wav";

/** Every sound the game can make, and the takes it rotates through. */
const SOURCES = {
  cross: [cross1, cross2, cross3],
  uncross: [uncrossSrc],
  claim: [claimSrc],
  wrong: [wrongSrc],
  pave: [pave1, pave2, pave3],
  unpave: [unpaveSrc],
  hint: [hintSrc],
  settled: [settledSrc],
  drive: [driveSrc],
  win: [winSrc],
  fail: [failSrc],
  press: [pressSrc],
  open: [openSrc],
} as const;

type Id = keyof typeof SOURCES;

/**
 * The least time that may pass between two plays of the same sound. Only the
 * stroke sounds need it: a finger dragged fast across a settled row can cross
 * out eight squares in a fifth of a second, and eight ticks in 200ms is a rattle
 * rather than eight marks.
 */
const FLOOR_MS: Partial<Record<Id, number>> = {
  cross: 28,
  uncross: 28,
  pave: 28,
  unpave: 28,
  press: 40,
};

/**
 * A player, plus whether it is sitting at the start of its clip.
 *
 * This matters more than it looks. A player that has finished is parked at the
 * *end* of its sound, and asking it to play again from there is silence on iOS
 * and Android — only the web's `<audio>` rewinds itself. So a used voice is
 * rewound in the background once its clip is over, and the next play finds it
 * ready. Only a voice retriggered before it finished has to seek first, and that
 * seek has to be *chained* rather than fired alongside `play()`: `seekTo`
 * returns a promise and `play` does not, so back-to-back the play goes first and
 * plays nothing.
 */
type Voice = { player: AudioPlayer; ready: boolean; rewind: ReturnType<typeof setTimeout> | null };

let enabled = true;
const last: Partial<Record<Id, number>> = {};
const turn: Partial<Record<Id, number>> = {};

const voices: Partial<Record<Id, Voice[]>> = {};
for (const id of Object.keys(SOURCES) as Id[]) {
  try {
    voices[id] = SOURCES[id].map((src) => ({
      player: createAudioPlayer(src, {
        // Nothing here reads playback status, so stop every sounding voice
        // posting one across the bridge twice a second.
        updateInterval: 60_000,
        // iOS tears the shared audio session down ~100ms after a clip ends;
        // without this it is rebuilt on every single tap, and every other app
        // on the phone is told about it each time.
        keepAudioSessionActive: true,
      }),
      ready: true,
      rewind: null,
    }));
  } catch {
    // No audio on this platform: leave the entry empty and play nothing.
  }
}

// Sounds this small should behave like interface noises: audible with the ring
// switch off, and never enough to duck someone's music or hold the session open.
setAudioModeAsync({
  playsInSilentMode: true,
  interruptionMode: "mixWithOthers",
  allowsRecording: false,
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
}).catch(() => {});

/** Start a voice that is known to be sitting at zero, and rewind it after. */
function start(v: Voice) {
  try {
    v.player.play();
  } catch {
    // A player torn down under us is not worth a crash.
    return;
  }
  v.ready = false;
  const ms = Number.isFinite(v.player.duration) && v.player.duration > 0 ? v.player.duration * 1000 : 900;
  if (v.rewind) clearTimeout(v.rewind);
  v.rewind = setTimeout(() => {
    v.player
      .seekTo(0)
      .then(() => {
        v.ready = true;
      })
      .catch(() => {});
  }, ms + 80);
}

function fire(id: Id) {
  if (!enabled) return;
  const takes = voices[id];
  if (!takes || takes.length === 0) return;

  const now = Date.now();
  const floor = FLOOR_MS[id];
  if (floor && now - (last[id] ?? 0) < floor) return;
  last[id] = now;

  const i = (turn[id] ?? 0) % takes.length;
  turn[id] = i + 1;
  const v = takes[i];

  // The common path: already at zero, so play with nothing between the finger
  // and the noise. Otherwise seek first and wait for it, which costs a bridge
  // hop but is the only way the sound is heard at all.
  if (v.ready) start(v);
  else v.player.seekTo(0).then(() => start(v)).catch(() => {});
}

export const sound = {
  setEnabled(on: boolean) {
    enabled = on;
  },
  /** A square ruled out. */
  cross: () => fire("cross"),
  /** A mark taken back — a cross rubbed out, or a claim un-claimed. */
  uncross: () => fire("uncross"),
  /** A claim accepted, however it was made. */
  claim: () => fire("claim"),
  /** A claim refused: a heart gone. */
  wrong: () => fire("wrong"),
  /** One more cell of road. */
  pave: () => fire("pave"),
  /** The road wound back a cell. */
  unpave: () => fire("unpave"),
  /** A hint spent. */
  hint: () => fire("hint"),
  /** Every square found — the whole route is drawable now. */
  settled: () => fire("settled"),
  /** The cars pulling away. */
  drive: () => fire("drive"),
  win: () => fire("win"),
  fail: () => fire("fail"),
  /** A button. */
  press: () => fire("press"),
  /** A board opening. */
  open: () => fire("open"),
};
