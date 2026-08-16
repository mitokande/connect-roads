// Every sound in the game, synthesised from scratch. Run with:
//   npm run sfx:build
//
// Why generate rather than download: a puzzle this quiet needs a handful of very
// short, very specific noises, and the useful ones are easier to describe as a
// recipe than to find. Twenty lines of oscillator and envelope give exactly the
// 60ms tick the game wants, weigh a few kB, are the same on every machine, and
// carry no licence with them. It is the same bargain as the level bank: the
// source of truth is this script, the .wav files are its baked output.
//
// Rendering is deterministic — the noise source is a seeded PRNG, so re-running
// this produces byte-identical files and a rebuild never shows up as a diff.
//
// Output: assets/sfx/*.wav, 16-bit mono PCM at 44.1kHz.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "sfx");

// --- the synth -------------------------------------------------------------

const samples = (ms: number) => Math.max(1, Math.round((ms / 1000) * SR));

/** Deterministic white noise, so two builds are the same file. */
function noiseSource(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

type Wave = "sine" | "tri" | "saw" | "square" | "soft";

function shape(wave: Wave, phase: number): number {
  const p = phase - Math.floor(phase);
  switch (wave) {
    case "sine":
      return Math.sin(2 * Math.PI * p);
    case "tri":
      return 4 * Math.abs(p - 0.5) - 1;
    case "saw":
      return 2 * p - 1;
    case "square":
      return p < 0.5 ? 1 : -1;
    case "soft":
      // A square with its corners knocked off — body without the fizz.
      return Math.tanh(Math.sin(2 * Math.PI * p) * 2.5) / Math.tanh(2.5);
  }
}

/**
 * Amplitude at time `u` (0..1 through the sound): a linear attack so nothing
 * starts with a click, then an exponential decay. `curve` is how sharply it
 * falls away — 1 is a swell, 8 is a tick.
 */
function envelope(u: number, attack: number, curve: number, hold = 0): number {
  if (u < attack) return u / attack;
  const v = (u - attack) / Math.max(1e-6, 1 - attack);
  if (v < hold) return 1;
  const w = (v - hold) / Math.max(1e-6, 1 - hold);
  return Math.exp(-curve * w);
}

type ToneOpts = {
  ms: number;
  /** Start of the sound within the buffer. */
  at?: number;
  /** Frequency in Hz — glides from `f` to `to` if given. */
  f: number;
  to?: number;
  /** Glide shape: exponential is what a falling pitch sounds like. */
  glide?: "exp" | "lin";
  wave?: Wave;
  gain?: number;
  attack?: number;
  curve?: number;
  hold?: number;
  /** Add a second voice this many cents away, for width. */
  detune?: number;
};

function tone(buf: Float32Array, o: ToneOpts) {
  const start = samples(o.at ?? 0);
  const n = samples(o.ms);
  const gain = o.gain ?? 1;
  const attack = (o.attack ?? 2) / o.ms;
  const curve = o.curve ?? 4;
  const wave = o.wave ?? "sine";
  const voices = o.detune ? [1, Math.pow(2, o.detune / 1200)] : [1];

  for (const mult of voices) {
    let phase = 0;
    for (let i = 0; i < n && start + i < buf.length; i++) {
      const u = i / n;
      const f =
        o.to === undefined
          ? o.f
          : o.glide === "lin"
            ? o.f + (o.to - o.f) * u
            : o.f * Math.pow(o.to / o.f, u);
      phase += (f * mult) / SR;
      buf[start + i] +=
        shape(wave, phase) * envelope(u, attack, curve, o.hold ?? 0) * (gain / voices.length);
    }
  }
}

type NoiseOpts = {
  ms: number;
  at?: number;
  gain?: number;
  attack?: number;
  curve?: number;
  hold?: number;
  /** One-pole lowpass corner, Hz. Glides to `lpTo` if given. */
  lp?: number;
  lpTo?: number;
  /** One-pole highpass corner, Hz — the two together make a band. */
  hp?: number;
  seed?: number;
};

function noise(buf: Float32Array, o: NoiseOpts) {
  const start = samples(o.at ?? 0);
  const n = samples(o.ms);
  const rand = noiseSource(o.seed ?? 1);
  const gain = o.gain ?? 1;
  const attack = (o.attack ?? 1) / o.ms;
  let low = 0;
  let high = 0;
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const u = i / n;
    const x = rand();
    const fc = o.lpTo === undefined ? (o.lp ?? 20000) : (o.lp ?? 20000) * Math.pow(o.lpTo / (o.lp ?? 20000), u);
    const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
    low += a * (x - low);
    let y = low;
    if (o.hp) {
      const b = 1 - Math.exp((-2 * Math.PI * o.hp) / SR);
      high += b * (y - high);
      y = y - high;
    }
    buf[start + i] += y * envelope(u, attack, o.curve ?? 6, o.hold ?? 0) * gain;
  }
}

/** Peak-normalise, soften anything that clipped, and fade the tail to silence. */
function finish(buf: Float32Array, level: number): Float32Array {
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? level / peak : 0;
  for (let i = 0; i < buf.length; i++) buf[i] = Math.tanh(buf[i] * k * 1.05);
  // 3ms in and out: a buffer that starts or stops mid-wave clicks on every play.
  const edge = samples(3);
  for (let i = 0; i < edge && i < buf.length; i++) {
    buf[i] *= i / edge;
    buf[buf.length - 1 - i] *= i / edge;
  }
  return buf;
}

function wav(buf: Float32Array): Buffer {
  const data = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) {
    const v = Math.max(-1, Math.min(1, buf[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16); // PCM chunk size
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(SR, 24);
  head.writeUInt32LE(SR * 2, 28); // byte rate
  head.writeUInt16LE(2, 32); // block align
  head.writeUInt16LE(16, 34); // bits
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

// --- the sounds ------------------------------------------------------------
//
// One instrument family: a small wooden thing struck on a workbench, plus the
// road under a tyre. Everything is a short filtered noise transient with a
// pitched body under it; nothing is brighter than about 6kHz, nothing rings.
// Levels are set here rather than left to chance, because the difference between
// a sound you can hear a thousand times and one you mute is mostly loudness.

const build: Record<string, () => Float32Array> = {
  /**
   * Ruling a square out. The most repeated sound in the game by a distance, so
   * it is barely a sound at all: a 40ms tick with no tail to trip over the next
   * one. Three variants, rotated at the call site, because the ear picks out an
   * identical sample repeated at speed and starts hearing a machine gun.
   */
  cross1: () => variantCross(1, 1),
  cross2: () => variantCross(2, 1.06),
  cross3: () => variantCross(3, 0.94),

  /** Taking a cross back: the same tick, lower and softer — an undo, not a move. */
  uncross: () => {
    const b = new Float32Array(samples(55));
    noise(b, { ms: 34, gain: 0.5, lp: 2600, hp: 700, curve: 11, seed: 7 });
    tone(b, { ms: 50, f: 420, to: 330, wave: "sine", gain: 0.5, curve: 9 });
    // Quieter than the cross it takes back — an undo should never be the louder
    // half of the pair.
    return finish(b, 0.27);
  },

  /**
   * A claim accepted. The committing move of the deduction half, so it is the
   * one deduction sound with any body: a soft mallet, pitch falling a fourth,
   * landing rather than pinging.
   */
  claim: () => {
    const b = new Float32Array(samples(190));
    noise(b, { ms: 22, gain: 0.4, lp: 4200, hp: 900, curve: 14, seed: 11 });
    tone(b, { ms: 170, f: 660, to: 494, wave: "sine", gain: 1, attack: 3, curve: 5.5 });
    tone(b, { ms: 120, f: 1320, to: 988, wave: "sine", gain: 0.22, attack: 2, curve: 8 });
    tone(b, { ms: 180, f: 247, wave: "sine", gain: 0.35, attack: 4, curve: 5 });
    return finish(b, 0.62);
  },

  /**
   * A claim refused. It has to read as "no" without punishing — the player has
   * already lost a heart, and a harsh buzz on top of that is the game telling
   * them off. So: two low notes falling a semitone, lowpassed, no fizz.
   */
  wrong: () => {
    const b = new Float32Array(samples(340));
    tone(b, { ms: 150, f: 233, wave: "soft", gain: 0.8, attack: 4, curve: 4, hold: 0.25 });
    tone(b, { ms: 190, at: 120, f: 196, wave: "soft", gain: 0.8, attack: 4, curve: 4 });
    tone(b, { ms: 300, f: 98, wave: "sine", gain: 0.5, attack: 6, curve: 3 });
    noise(b, { ms: 60, gain: 0.16, lp: 1400, curve: 8, seed: 3 });
    return finish(b, 0.6);
  },

  /**
   * One more cell of road laid. Fires up to a dozen times inside a single drag,
   * so it is short and dry — a tyre finding tarmac, not a chime. Three variants
   * again, and they climb a little, so a fast drag sounds like acceleration
   * rather than a stutter.
   */
  pave1: () => variantPave(1, 1),
  pave2: () => variantPave(2, 1.05),
  pave3: () => variantPave(3, 1.11),

  /** Winding the road back: the pave sound falling instead of rising. */
  unpave: () => {
    const b = new Float32Array(samples(80));
    noise(b, { ms: 44, gain: 0.55, lp: 3000, lpTo: 1200, hp: 400, curve: 10, seed: 23 });
    tone(b, { ms: 70, f: 340, to: 240, wave: "tri", gain: 0.6, curve: 8 });
    return finish(b, 0.33);
  },

  /** A hint spent: two notes up, bell-ish, so it reads as a gift not an alarm. */
  hint: () => {
    const b = new Float32Array(samples(420));
    tone(b, { ms: 180, f: 784, wave: "sine", gain: 0.7, attack: 6, curve: 6 });
    tone(b, { ms: 300, at: 110, f: 1175, wave: "sine", gain: 0.7, attack: 8, curve: 5 });
    tone(b, { ms: 300, at: 110, f: 2350, wave: "sine", gain: 0.12, attack: 8, curve: 7 });
    return finish(b, 0.5);
  },

  /**
   * The deduction finished — every square found, the whole route now drawable.
   * A rising major triad: the one moment in the board where the game changes
   * character, and the only place a chord is warranted.
   */
  settled: () => {
    const b = new Float32Array(samples(620));
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      tone(b, { ms: 420 - i * 40, at: i * 90, f, wave: "sine", gain: 0.6, attack: 8, curve: 4.5 });
      tone(b, { ms: 300, at: i * 90, f: f * 2, wave: "sine", gain: 0.1, attack: 8, curve: 6 });
    });
    return finish(b, 0.52);
  },

  /**
   * The cars pulling away. Low and swelling, meant to sit *under* the drive
   * animation for its first second rather than announce itself: an engine note
   * rising a fifth, with tyre noise opening up over it.
   */
  drive: () => {
    const b = new Float32Array(samples(1100));
    tone(b, { ms: 1000, f: 62, to: 96, wave: "saw", gain: 0.5, attack: 90, curve: 1.6, detune: 14 });
    tone(b, { ms: 1000, f: 124, to: 192, wave: "tri", gain: 0.22, attack: 120, curve: 2 });
    noise(b, { ms: 1050, gain: 0.3, lp: 700, lpTo: 2600, hp: 220, attack: 140, curve: 2.2, seed: 31 });
    return finish(b, 0.5);
  },

  /** The level cleared. Four notes up, with a pad under them to stop it being thin. */
  win: () => {
    const b = new Float32Array(samples(1200));
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      tone(b, { ms: 520 - i * 60, at: i * 105, f, wave: "sine", gain: 0.62, attack: 5, curve: 4 });
      tone(b, { ms: 240, at: i * 105, f: f * 3, wave: "sine", gain: 0.07, attack: 4, curve: 8 });
    });
    tone(b, { ms: 900, at: 60, f: 130.8, wave: "tri", gain: 0.3, attack: 60, curve: 2.4, detune: 8 });
    tone(b, { ms: 700, at: 300, f: 196, wave: "sine", gain: 0.18, attack: 60, curve: 2.6 });
    return finish(b, 0.62);
  },

  /** Out of hearts. Falls, softly, and stops — the board behind is the message. */
  fail: () => {
    const b = new Float32Array(samples(760));
    const notes = [392, 329.63, 261.63];
    notes.forEach((f, i) => {
      tone(b, { ms: 420 - i * 40, at: i * 150, f, wave: "sine", gain: 0.6, attack: 8, curve: 3.6 });
    });
    tone(b, { ms: 600, at: 150, f: 87.31, wave: "sine", gain: 0.4, attack: 40, curve: 2.4 });
    return finish(b, 0.5);
  },

  /** A button. Quieter than anything on the board — chrome, not play. */
  press: () => {
    const b = new Float32Array(samples(45));
    noise(b, { ms: 22, gain: 0.5, lp: 5200, hp: 1400, curve: 14, seed: 41 });
    tone(b, { ms: 40, f: 880, to: 740, wave: "sine", gain: 0.45, curve: 10 });
    return finish(b, 0.3);
  },

  /** A board opening: a short breath of air, no pitch, so it never gets old. */
  open: () => {
    const b = new Float32Array(samples(340));
    noise(b, { ms: 320, gain: 0.6, lp: 400, lpTo: 3400, hp: 300, attack: 40, curve: 3.2, seed: 53 });
    tone(b, { ms: 260, f: 196, to: 392, wave: "sine", gain: 0.3, attack: 30, curve: 3.5 });
    return finish(b, 0.34);
  },
};

function variantCross(seed: number, bend: number): Float32Array {
  const b = new Float32Array(samples(46));
  noise(b, { ms: 26, gain: 0.6, lp: 3400 * bend, hp: 900, curve: 13, seed: seed * 17 });
  tone(b, { ms: 40, f: 620 * bend, to: 520 * bend, wave: "sine", gain: 0.45, curve: 10 });
  return finish(b, 0.32);
}

function variantPave(seed: number, bend: number): Float32Array {
  const b = new Float32Array(samples(90));
  // The tyre: a band of noise opening upward, which is what rubber on tarmac is.
  noise(b, { ms: 52, gain: 0.6, lp: 1500 * bend, lpTo: 3800 * bend, hp: 420, curve: 9, seed: seed * 29 });
  // The body under it, rising so a fast drag reads as acceleration.
  tone(b, { ms: 80, f: 260 * bend, to: 360 * bend, wave: "tri", gain: 0.65, curve: 7.5 });
  tone(b, { ms: 55, f: 520 * bend, to: 720 * bend, wave: "sine", gain: 0.14, curve: 9 });
  return finish(b, 0.4);
}

// --- go --------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
let total = 0;
const rows: string[] = [];
for (const [name, make] of Object.entries(build)) {
  const buf = wav(make());
  writeFileSync(join(OUT, `${name}.wav`), buf);
  total += buf.length;
  rows.push(`  ${name.padEnd(10)} ${(buf.length / 1024).toFixed(1).padStart(6)} kB`);
}
console.log(`Connect Roads — ${Object.keys(build).length} sounds\n`);
console.log(rows.join("\n"));
console.log(`\n  total      ${(total / 1024).toFixed(1).padStart(6)} kB  →  assets/sfx/`);
