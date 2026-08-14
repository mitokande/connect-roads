// The level ladder. A level is nothing but a number: its size band and its seed
// are both derived from it, so progress persists as a single integer and every
// device generates byte-identical boards.

import { decodePuzzle } from "./codec";
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
 * one is a string parse rather than a search — an 8×8 takes the generator a
 * second or two to *prove* unique, which is a frozen screen on a phone. Levels
 * past the bank fall back to generating on the spot, so a future ladder that
 * outgrows the bank still plays rather than crashing.
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
      });
  cache.set(level, puzzle);
  return puzzle;
}
