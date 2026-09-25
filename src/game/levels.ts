// The level ladder. A level is nothing but a number: its size band and its seed
// are both derived from it, so progress persists as a single integer and every
// device generates byte-identical boards.

import { decodePuzzle } from "./codec";
import type { Tier } from "./deduce";
import { generatePuzzle } from "./generator";
import { LEVEL_BANK } from "./levelData";
import type { Puzzle } from "./types";

export const LEVEL_COUNT = 150;

/** The regions of the road trip, in the order it drives through them. */
export type RegionId = "meadow" | "village" | "market" | "riverside" | "metropolis" | "pass" | "summit";

/**
 * A stretch of the ladder: where it starts, the board size, the region it is
 * drawn as — and, for the mountains, the twists every board in it carries.
 *
 * The first five grow the board; the last two keep it at 8×8 and change the
 * *game* instead, because a ninth size would shrink the cells past what a thumb
 * can hit. **Mountain Pass** prints scenery — rocks, pines, lakes the road has to
 * find its way round — and **Cloud Summit** adds fog over some of the counts.
 * Scenery gives facts away and fog takes some back, so the two together are a
 * new texture of puzzle rather than just a harder one; see `generator.ts`.
 */
export type Band = {
  first: number;
  size: number;
  region: RegionId;
  /** Squares of scenery on every board. */
  scenery?: number;
  /** Lines under fog on every board (0, or at least 2). */
  fog?: number;
};

export const BANDS: Band[] = [
  { first: 1, size: 4, region: "meadow" },
  { first: 11, size: 5, region: "village" },
  { first: 26, size: 6, region: "market" },
  { first: 46, size: 7, region: "riverside" },
  { first: 76, size: 8, region: "metropolis" },
  { first: 121, size: 8, region: "pass", scenery: 5 },
  { first: 136, size: 8, region: "summit", scenery: 4, fog: 2 },
];

/** The band a level belongs to. */
export function bandFor(level: number): Band {
  let band = BANDS[0];
  for (const b of BANDS) if (level >= b.first) band = b;
  return band;
}

/** Every level in a band, in order. */
export function bandLevels(band: Band): number[] {
  const i = BANDS.indexOf(band);
  const end = i + 1 < BANDS.length ? BANDS[i + 1].first - 1 : LEVEL_COUNT;
  const out: number[] = [];
  for (let l = band.first; l <= end; l++) out.push(l);
  return out;
}

/** The classic region for a board size — for boards that aren't on the ladder. */
export const regionForSize = (size: number): RegionId =>
  size <= 4 ? "meadow" : size === 5 ? "village" : size === 6 ? "market" : size === 7 ? "riverside" : "metropolis";

/** Levels at the start of a new size that get one extra piece revealed. */
export const GRACE_LEVELS = 3;

/** From here up, a board may require assume-and-refute (`deduce.ts` tier 5). */
export const HARD_TIER_FROM = 96;

/**
 * The hardest rule a level is allowed to demand.
 *
 * Everything below {@link HARD_TIER_FROM} must fall to pure forward deduction —
 * counting, two-ways-out, connectivity, line intersection — so the player is
 * never asked to hold a hypothesis in their head. The last stretch may ask for
 * one, at depth one only: assume a square, follow it to a contradiction, and take
 * that as proof of the opposite. That is still sound reasoning rather than a
 * gamble, which is what keeps it compatible with a checked claim and three hearts.
 */
export const tierCapForLevel = (level: number): Tier => {
  const band = bandFor(level);
  // The mountains' difficulty is their twists; they never also ask for a what-if.
  if (band.scenery || band.fog) return 4;
  return level >= HARD_TIER_FROM ? 5 : 4;
};

export const sizeForLevel = (level: number): number => bandFor(level).size;

/** How far into its band a level sits (0 = the band's first board). */
export const bandIndex = (level: number): number => level - bandFor(level).first;

/**
 * Seed for a level. The multiply-and-mix keeps neighbouring levels from drawing
 * neighbouring puzzles — consecutive raw seeds tend to open the same way.
 */
export function levelSeed(level: number): number {
  let h = Math.imul(level, 0x9e3779b1) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

const cache = new Map<number, Puzzle>();

/**
 * The board for a level.
 *
 * Shipped levels come out of the baked bank (`npm run levels:build`) so opening
 * one is a string parse rather than a search — building an 8×8 that is both
 * deducible and single-shaped takes the generator around half a second, and the
 * hard band several, which is a frozen screen on a phone.
 *
 * Past the bank there is a fallback, and it is a **degrade path rather than a
 * supported one**: it relaxes to the easy tier cap and a small attempt budget so
 * it returns *something* rather than hanging, which means a board looser than the
 * ones the bank was graded into. With `LEVEL_COUNT` levels and a bank of the same
 * length it is unreachable in practice; it exists so a longer ladder degrades
 * instead of crashing.
 */
export function puzzleForLevel(level: number): Puzzle {
  const hit = cache.get(level);
  if (hit) return hit;
  const encoded = LEVEL_BANK[level - 1];
  const puzzle = encoded
    ? decodePuzzle(encoded, levelSeed(level))
    : generatePuzzle(levelSeed(level), {
        size: sizeForLevel(level),
        bonusReveals: bandIndex(level) < GRACE_LEVELS ? 1 : 0,
        maxTier: 4,
        attempts: 400,
        scenery: bandFor(level).scenery,
        fog: bandFor(level).fog,
      });
  cache.set(level, puzzle);
  return puzzle;
}
