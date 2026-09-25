// The daily road: one board a day, the same for everyone, harder as the week
// goes on — and the streak of days in a row it has been built.
//
// The ladder is a thing a player finishes. After level 120 there was nothing, and
// before it there was no reason to come back *tomorrow* rather than whenever —
// which, for a puzzle game on a phone, mostly means never. A daily board is the
// one mechanic this genre reliably brings people back with, and this game already
// has everything it needs: a generator whose boards are provably deducible, and a
// ladder of rules to grade them against.
//
// **The week is the difficulty curve.** Monday is a small board that falls to the
// basics; Sunday is the biggest board, the hardest of several, and may need
// "try each way". A player learns the rhythm without being told it, and the size
// alone says on sight what kind of day it is. Nothing past `T4` ever appears: the
// what-if is the ladder's endgame, and a daily must be playable by anyone who
// has cleared the first region.
//
// **Baked, like the ladder** (`npm run daily:build` → `dailyData.ts`). An 8×8 takes
// the generator up to most of a second on a desktop, which is a frozen screen on
// a phone, every morning. The bank is `52` weeks long and cycles; being a whole
// number of weeks is what keeps every Monday a Monday when it wraps.
//
// A board's id says what it is: ladder levels are 1…`LEVEL_COUNT`, the tutorial
// uses 1000+, and a daily is `DAILY_BASE + day`, where `day` counts days since
// 1970-01-01 *in the player's own calendar* — the board turns over at their
// midnight, not at a server's.

import { decodePuzzle } from "./codec";
import { DAILY_BANK } from "./dailyData";
import { deduce, deduceInput, type Tier } from "./deduce";
import { levelSeed } from "./levels";
import type { Puzzle } from "./types";

/** Board ids at and above this are dailies: `DAILY_BASE + day`. */
export const DAILY_BASE = 100_000;
export const isDaily = (id: number): boolean => id >= DAILY_BASE;
export const dailyId = (day: number): number => DAILY_BASE + day;
export const dayOf = (id: number): number => id - DAILY_BASE;

/** Clear the first region to unlock the daily: the basics come first. */
export const DAILY_UNLOCK = 11;

/** The day the bank starts on: Monday 2026-09-28. Any Monday would do. */
export const DAILY_EPOCH = 20724;

/** Weeks in the bank. Whole weeks, so a wrap keeps every weekday in place. */
export const DAILY_WEEKS = 52;

/** Today, as whole days since 1970-01-01 in the player's own calendar. */
export function today(now: Date = new Date()): number {
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000);
}

/** 0 = Monday … 6 = Sunday. 1970-01-01 was a Thursday. */
export const weekday = (day: number): number => (((day + 3) % 7) + 7) % 7;

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * What each day of the week asks for: a board size, the hardest rule its clues
 * may need, and which of `tries` candidates to keep. The easy days keep the
 * easiest — a Monday that happened to be hard would be the wrong Monday — and the
 * rest keep the hardest, so the tier cap is a ceiling the week actually reaches.
 * Sunday draws twice as many, which is what makes it the week's hardest rather
 * than a second Saturday.
 */
export const WEEK: { size: number; tier: Tier; keep: "easiest" | "hardest"; tries: number }[] = [
  { size: 5, tier: 2, keep: "easiest", tries: 3 },
  { size: 6, tier: 2, keep: "easiest", tries: 3 },
  { size: 6, tier: 4, keep: "hardest", tries: 3 },
  { size: 7, tier: 4, keep: "hardest", tries: 3 },
  { size: 7, tier: 4, keep: "hardest", tries: 3 },
  { size: 8, tier: 4, keep: "hardest", tries: 3 },
  { size: 8, tier: 4, keep: "hardest", tries: 6 },
];

/** Where a day falls in the bank. */
export const bankIndex = (day: number): number => {
  const n = DAILY_BANK.length;
  return (((day - DAILY_EPOCH) % n) + n) % n;
};

const cache = new Map<number, Puzzle>();

/** The board for a day. */
export function dailyPuzzle(day: number): Puzzle {
  const hit = cache.get(day);
  if (hit) return hit;
  const puzzle = decodePuzzle(DAILY_BANK[bankIndex(day)], levelSeed(dailyId(day)));
  cache.set(day, puzzle);
  return puzzle;
}

/**
 * The hardest rule a board as printed needs — so that a player who has never been
 * shown it gets the lesson first, as they would on the ladder.
 */
export function tierNeeded(puzzle: Puzzle): Tier {
  const input = deduceInput(puzzle);
  for (let t = 1; t < 5; t++) if (deduce(input, t as Tier).solved) return t as Tier;
  return 5;
}

// --- the streak --------------------------------------------------------------

/**
 * What the player has done with the dailies. `last` is the most recent day built;
 * `stars` holds each day's best, as the ladder's own do — a record, not a rule.
 */
export type DailyRecord = {
  last: number;
  streak: number;
  best: number;
  stars: Record<number, number>;
};

export const NO_DAILY: DailyRecord = { last: -1, streak: 0, best: 0, stars: {} };

/**
 * The record after building `day`'s road with `hearts` left.
 *
 * The streak counts days in a row: yesterday's road and today's extend it, a gap
 * restarts it at one, and building the same day again changes nothing but its
 * stars. A board started before midnight and finished after counts for the day it
 * was dealt on, which is the day the player sat down to.
 */
export function recordDaily(rec: DailyRecord, day: number, hearts: number): DailyRecord {
  const stars = { ...rec.stars, [day]: Math.max(rec.stars[day] ?? 0, hearts) };
  if (day <= rec.last) return { ...rec, stars };
  const streak = rec.last === day - 1 ? rec.streak + 1 : 1;
  return { last: day, streak, best: Math.max(rec.best, streak), stars };
}

/**
 * The streak as it stands on `now`: still alive while yesterday's road is built,
 * because today's may not have been played yet — gone once a whole day is missed.
 */
export const currentStreak = (rec: DailyRecord, now: number): number =>
  rec.last >= now - 1 ? rec.streak : 0;
