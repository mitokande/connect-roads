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
// Output: assets/sfx/*.wav, 16-bit mono PCM at 44.1kHz, and one music loop at
// 22.05kHz (it is soft and low, so the top octave it would lose is not there).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "sfx");
/** The music's own rate. Everything else is rendered at `SR`. */
const MUSIC_SR = 22050;

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

function wav(buf: Float32Array, rate = SR): Buffer {
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
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28); // byte rate
  head.writeUInt16LE(2, 32); // block align
  head.writeUInt16LE(16, 34); // bits
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

// --- instruments -------------------------------------------------------------
//
// The game is a toy town on a tabletop, so it sounds like one: struck wood and
// a small marimba, with the odd tin-toy horn. A marimba bar is a sine with a
// fourth-harmonic overtone that dies almost at once — that fast-dying partial
// *is* the mallet, and it is what makes a note sound struck rather than blown.

/** One marimba note. */
function mallet(buf: Float32Array, f: number, at: number, ms: number, gain: number) {
  tone(buf, { ms, at, f, wave: "sine", gain, attack: 2, curve: 5.2 });
  tone(buf, { ms: ms * 0.28, at, f: f * 3.98, wave: "sine", gain: gain * 0.22, attack: 1, curve: 9 });
  tone(buf, { ms: ms * 0.5, at, f: f * 2, wave: "sine", gain: gain * 0.12, attack: 2, curve: 7 });
  noise(buf, { ms: 12, at, gain: gain * 0.18, lp: 3800, hp: 900, curve: 10, seed: Math.round(f) });
}

/** A hollow wood block: a very short pitched knock over a click of noise. */
function block(buf: Float32Array, f: number, at: number, gain: number, seed: number) {
  tone(buf, { ms: 38, at, f, to: f * 0.86, wave: "sine", gain, attack: 1, curve: 11 });
  tone(buf, { ms: 22, at, f: f * 2.7, wave: "sine", gain: gain * 0.25, attack: 1, curve: 13 });
  noise(buf, { ms: 14, at, gain: gain * 0.45, lp: 4200, hp: 1200, curve: 12, seed });
}

const note = (semitonesFromA4: number) => 440 * Math.pow(2, semitonesFromA4 / 12);
/** Named pitches used below (C major, around the middle of the keyboard). */
const P = {
  C3: note(-21), D3: note(-19), E3: note(-17), F3: note(-16), G3: note(-14), A3: note(-12), B3: note(-10),
  C4: note(-9), D4: note(-7), E4: note(-5), F4: note(-4), G4: note(-2), A4: note(0), B4: note(2),
  C5: note(3), D5: note(5), E5: note(7), F5: note(8), G5: note(10), A5: note(12), C6: note(15), E6: note(19), G6: note(22),
};

// --- the sounds ------------------------------------------------------------
//
// Levels are set per sound rather than left to normalisation, because the
// difference between a noise you can hear a thousand times and one you mute is
// mostly loudness — and an undo is always quieter than the act it undoes.

const build: Record<string, () => Float32Array> = {
  /**
   * Ruling a square out: a pencil-tap on a wood block. The most repeated sound
   * in the game by a distance, so it is barely there and has no tail. Three
   * takes, rotated at the call site, so a fast sweep never machine-guns.
   */
  cross1: () => variantCross(1, 1),
  cross2: () => variantCross(2, 1.07),
  cross3: () => variantCross(3, 0.93),

  /** A mark taken back: the same block, lower and softer. */
  uncross: () => {
    const b = new Float32Array(samples(60));
    block(b, 520, 0, 0.8, 7);
    return finish(b, 0.24);
  },

  /**
   * A claim accepted — a surveyor's stake going into soft ground, then a note
   * saying "yes". The committing move, so it has body: a low thump under a
   * two-note marimba step up a fourth.
   */
  claim: () => {
    const b = new Float32Array(samples(360));
    noise(b, { ms: 40, gain: 0.5, lp: 900, hp: 120, curve: 9, seed: 11 });
    tone(b, { ms: 90, f: 150, to: 90, wave: "sine", gain: 0.7, attack: 2, curve: 7 });
    mallet(b, P.G4, 20, 220, 0.8);
    mallet(b, P.C5, 95, 260, 0.9);
    return finish(b, 0.6);
  },

  /**
   * A claim refused. "No" without scolding — the heart is already gone. A
   * dull two-note toy-horn *bwomp*, falling a semitone, lowpassed.
   */
  wrong: () => {
    const b = new Float32Array(samples(420));
    tone(b, { ms: 170, f: 220, to: 208, wave: "soft", gain: 0.7, attack: 6, curve: 3.5, hold: 0.3, detune: 18 });
    tone(b, { ms: 240, at: 150, f: 185, to: 164, wave: "soft", gain: 0.75, attack: 6, curve: 3.2, detune: 18 });
    tone(b, { ms: 380, f: 92, wave: "sine", gain: 0.45, attack: 8, curve: 3 });
    noise(b, { ms: 90, gain: 0.12, lp: 900, curve: 7, seed: 3 });
    return finish(b, 0.55);
  },

  /**
   * One more cell of road: a paving slab set down. Up to a dozen inside one
   * drag, so it is short and dry. The three takes climb a little, so a fast
   * drag sounds like building speed rather than a stutter.
   */
  pave1: () => variantPave(1, 1),
  pave2: () => variantPave(2, 1.06),
  pave3: () => variantPave(3, 1.12),

  /** Winding the road back: the slab lifted — lower, falling. */
  unpave: () => {
    const b = new Float32Array(samples(90));
    noise(b, { ms: 50, gain: 0.5, lp: 1800, lpTo: 700, hp: 200, curve: 9, seed: 23 });
    tone(b, { ms: 80, f: 300, to: 200, wave: "tri", gain: 0.5, curve: 8 });
    return finish(b, 0.3);
  },

  /** A hint spent: a little sparkle, three bells rising. */
  hint: () => {
    const b = new Float32Array(samples(560));
    [P.E5, P.G5, P.C6].forEach((f, i) => {
      tone(b, { ms: 380, at: i * 70, f, wave: "sine", gain: 0.55, attack: 3, curve: 5 });
      tone(b, { ms: 200, at: i * 70, f: f * 2.76, wave: "sine", gain: 0.12, attack: 2, curve: 8 });
    });
    noise(b, { ms: 380, gain: 0.08, lp: 9000, hp: 5000, attack: 40, curve: 4, seed: 71 });
    return finish(b, 0.48);
  },

  /**
   * Every square found — the whole route is drawable now. A rising marimba
   * arpeggio: the one moment in the board where the game changes character.
   */
  settled: () => {
    const b = new Float32Array(samples(900));
    [P.C4, P.E4, P.G4, P.C5, P.E5].forEach((f, i) => mallet(b, f, i * 75, 520 - i * 30, 0.75));
    return finish(b, 0.52);
  },

  /**
   * The convoy pulling away: a toy engine revving up, and two cheerful toots
   * from the lead car — the only horn in the game, so it means "go".
   */
  drive: () => {
    const b = new Float32Array(samples(1300));
    tone(b, { ms: 1200, f: 70, to: 118, wave: "saw", gain: 0.35, attack: 80, curve: 1.8, detune: 16 });
    tone(b, { ms: 1200, f: 140, to: 236, wave: "tri", gain: 0.18, attack: 90, curve: 2 });
    noise(b, { ms: 1200, gain: 0.22, lp: 600, lpTo: 2200, hp: 180, attack: 120, curve: 2.2, seed: 31 });
    for (const at of [80, 260]) {
      tone(b, { ms: 140, at, f: 523, wave: "soft", gain: 0.42, attack: 6, curve: 2.2, hold: 0.5, detune: 22 });
      tone(b, { ms: 140, at, f: 659, wave: "soft", gain: 0.3, attack: 6, curve: 2.2, hold: 0.5 });
    }
    return finish(b, 0.5);
  },

  /** The level cleared: a marimba fanfare over a warm chord. */
  win: () => {
    const b = new Float32Array(samples(1700));
    const run = [P.C5, P.E5, P.G5, P.C6];
    run.forEach((f, i) => mallet(b, f, i * 110, 420, 0.7));
    mallet(b, P.G5, 520, 300, 0.55);
    mallet(b, P.C6, 640, 900, 0.85);
    mallet(b, P.E5, 640, 900, 0.45);
    tone(b, { ms: 1300, at: 60, f: P.C3, wave: "tri", gain: 0.28, attack: 80, curve: 2.4, detune: 8 });
    tone(b, { ms: 1100, at: 300, f: P.G3, wave: "sine", gain: 0.2, attack: 60, curve: 2.6 });
    return finish(b, 0.62);
  },

  /** One star landing on the win card; pitched per star at the call site. */
  star1: () => starPop(P.E5),
  star2: () => starPop(P.G5),
  star3: () => starPop(P.C6),

  /** A house or a tree popping up on a won board. Soft, because there are many. */
  pop: () => {
    const b = new Float32Array(samples(90));
    tone(b, { ms: 80, f: 380, to: 900, wave: "sine", gain: 0.8, attack: 2, curve: 6 });
    noise(b, { ms: 20, gain: 0.2, lp: 3000, hp: 600, curve: 10, seed: 91 });
    return finish(b, 0.22);
  },

  /** Out of hearts. Falls, softly, and stops — the board behind is the message. */
  fail: () => {
    const b = new Float32Array(samples(1000));
    [P.G4, P.E4, P.C4, P.G3].forEach((f, i) => mallet(b, f, i * 160, 520, 0.7));
    tone(b, { ms: 800, at: 200, f: P.C3 / 2, wave: "sine", gain: 0.3, attack: 40, curve: 2.4 });
    return finish(b, 0.5);
  },

  /** A button. Quieter than anything on the board — chrome, not play. */
  press: () => {
    const b = new Float32Array(samples(55));
    block(b, 1040, 0, 1, 41);
    return finish(b, 0.28);
  },

  /** A board opening: a breath of air and a soft two-note hello. */
  open: () => {
    const b = new Float32Array(samples(520));
    noise(b, { ms: 320, gain: 0.5, lp: 400, lpTo: 3000, hp: 300, attack: 40, curve: 3.2, seed: 53 });
    mallet(b, P.C5, 120, 300, 0.5);
    mallet(b, P.G5, 220, 300, 0.45);
    return finish(b, 0.34);
  },
};

function variantCross(seed: number, bend: number): Float32Array {
  const b = new Float32Array(samples(50));
  block(b, 760 * bend, 0, 1, seed * 17);
  return finish(b, 0.3);
}

function variantPave(seed: number, bend: number): Float32Array {
  const b = new Float32Array(samples(100));
  // The slab: a thud with a little grit on it.
  noise(b, { ms: 45, gain: 0.55, lp: 1400 * bend, lpTo: 2600 * bend, hp: 260, curve: 9, seed: seed * 29 });
  tone(b, { ms: 85, f: 210 * bend, to: 300 * bend, wave: "tri", gain: 0.6, curve: 7 });
  tone(b, { ms: 60, f: 630 * bend, to: 840 * bend, wave: "sine", gain: 0.16, curve: 9 });
  return finish(b, 0.38);
}

function starPop(f: number): Float32Array {
  const b = new Float32Array(samples(480));
  tone(b, { ms: 70, f: f / 2, to: f, wave: "sine", gain: 0.4, attack: 2, curve: 3 });
  mallet(b, f, 40, 420, 0.9);
  tone(b, { ms: 300, at: 40, f: f * 2, wave: "sine", gain: 0.14, attack: 4, curve: 6 });
  noise(b, { ms: 260, at: 40, gain: 0.06, lp: 10000, hp: 5500, attack: 20, curve: 5, seed: Math.round(f) });
  return finish(b, 0.5);
}

// --- the music ---------------------------------------------------------------
//
// One loop, eight bars at 96bpm (20s), under every screen. It has to be
// something you can leave on for an hour of puzzling, so it is mostly air: a
// soft pad, a plucked bass on the one and the three, and a marimba line that
// only ever uses the pentatonic notes, so nothing in it can clash with the
// sound effects laid over it.
//
// The loop is seamless by construction: every note's tail that runs past the
// end is folded back onto the start, so the last bar rings on into the first
// exactly as it would if the tune really repeated.

function music(): Float32Array {
  const bpm = 96;
  const beat = 60 / bpm;
  const bars = 8;
  const len = Math.round(bars * 4 * beat * MUSIC_SR);
  const out = new Float32Array(len);

  // Render with the same synth at the music's rate by working in a scratch
  // buffer at SR and resampling — simpler than threading a rate through.
  const hi = new Float32Array(Math.round(bars * 4 * beat * SR) + samples(3000));
  const at = (b: number) => b * beat * 1000;

  // I – vi – IV – V, twice.
  const chords = [
    [P.C3, P.E4, P.G4, P.C4],
    [P.A3 / 2, P.C4, P.E4, P.A3],
    [P.F3, P.A3, P.C4, P.F4],
    [P.G3, P.B3, P.D4, P.G4],
  ];
  const melody: [number, number, number][] = [
    // [beat within the 8 bars, pitch, length in beats]
    [0, P.E5, 1], [1.5, P.G5, 0.5], [2, P.A5, 1], [3, P.G5, 1],
    [4, P.E5, 1.5], [6, P.C5, 1], [7, P.D5, 1],
    [8, P.C5, 1], [9.5, P.D5, 0.5], [10, P.E5, 1], [11, P.G5, 1],
    [12, P.D5, 2], [14.5, P.G4, 0.5], [15, P.A4, 1],
    [16, P.E5, 1], [17.5, P.G5, 0.5], [18, P.A5, 1], [19, P.C6, 1],
    [20, P.A5, 1.5], [22, P.G5, 1], [23, P.E5, 1],
    [24, P.D5, 1], [25.5, P.E5, 0.5], [26, P.G5, 1], [27, P.E5, 1],
    [28, P.C5, 3],
  ];

  for (let bar = 0; bar < bars; bar++) {
    const ch = chords[bar % 4];
    // Pad: the chord, soft and wide, swelling in over the bar.
    for (const f of ch.slice(1)) {
      tone(hi, { ms: 4 * beat * 1000 + 400, at: at(bar * 4), f, wave: "tri", gain: 0.09, attack: 500, curve: 1.2, detune: 9 });
    }
    // Bass on one and three.
    for (const b of [0, 2]) {
      tone(hi, { ms: 900, at: at(bar * 4 + b), f: ch[0], wave: "sine", gain: 0.42, attack: 6, curve: 4 });
      tone(hi, { ms: 200, at: at(bar * 4 + b), f: ch[0] * 2, wave: "tri", gain: 0.08, attack: 4, curve: 7 });
    }
    // Light shaker on the off-beats.
    for (let k = 0; k < 4; k++) {
      noise(hi, { ms: 60, at: at(bar * 4 + k + 0.5), gain: 0.05, lp: 9000, hp: 4500, attack: 8, curve: 7, seed: 100 + bar * 4 + k });
    }
    // Marimba chord pulse, very quiet, keeping time under the tune.
    for (const b of [1, 3]) {
      for (const f of ch.slice(1, 3)) mallet(hi, f * 2, at(bar * 4 + b), 260, 0.07);
    }
  }
  for (const [b, f, dur] of melody) mallet(hi, f, at(b), Math.max(320, dur * beat * 1000), 0.34);

  // Fold the tail back onto the start, then resample to MUSIC_SR.
  const loopHi = Math.round(bars * 4 * beat * SR);
  for (let i = loopHi; i < hi.length; i++) hi[i - loopHi] += hi[i];
  const ratio = SR / MUSIC_SR;
  for (let i = 0; i < len; i++) {
    // A two-tap average is enough of an anti-alias for material this soft.
    const x = i * ratio;
    const j = Math.floor(x);
    out[i] = ((hi[j] ?? 0) + (hi[j + 1] ?? 0)) / 2;
  }
  // Normalise without the edge fades `finish` adds — a loop must not dip.
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? 0.55 / peak : 0;
  for (let i = 0; i < len; i++) out[i] = Math.tanh(out[i] * k);
  return out;
}

// --- go --------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
let total = 0;
const rows: string[] = [];
const emit = (name: string, buf: Buffer) => {
  writeFileSync(join(OUT, `${name}.wav`), buf);
  total += buf.length;
  rows.push(`  ${name.padEnd(10)} ${(buf.length / 1024).toFixed(1).padStart(7)} kB`);
};
for (const [name, make] of Object.entries(build)) emit(name, wav(make()));
emit("music", wav(music(), MUSIC_SR));
console.log(`Connect Roads — ${Object.keys(build).length + 1} sounds\n`);
console.log(rows.join("\n"));
console.log(`\n  total      ${(total / 1024).toFixed(1).padStart(7)} kB  →  assets/sfx/`);
