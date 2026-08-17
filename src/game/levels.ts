// The level ladder. A level is nothing but a number: its size band and its seed
// are both derived from it, so progress persists as a single integer and every
// device generates byte-identical boards.

import { decodePuzzle } from "./codec";
import type { Tier } from "./deduce";
import { generatePuzzle } from "./generator";
import { LEVEL_BANK } from "./levelData";
import type { Puzzle } from "./types";

export const LEVEL_COUNT = 120;

/** [first level of the band, grid size]. */
const BANDS: [number, number][] = [
  [1, 4],
  [11, 5],
  [26, 6],
  [46, 7],
  [76, 8],
];

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
export const tierCapForLevel = (level: number): Tier => (level >= HARD_TIER_FROM ? 5 : 4);

export function sizeForLevel(level: number): number {
  let size = BANDS[0][1];
  for (const [start, s] of BANDS) if (level >= start) size = s;
  return size;
}

/** How far into its size band a level sits (0 = the first board at that size). */
export function bandIndex(level: number): number {
  let start = 1;
  for (const [s] of BANDS) if (level >= s) start = s;
  return level - start;
}

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
      });
  cache.set(level, puzzle);
  return puzzle;
}
