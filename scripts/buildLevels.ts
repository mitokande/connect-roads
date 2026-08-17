// Bakes the level bank. Run with:
//   npm run levels:build
//
// Generation is deterministic, so this script is not *needed* — the app could
// call the generator directly and get the same boards. It exists for latency:
// building an 8×8 that is both deducible and single-shaped takes around half a
// second, and one in the hard band several, which the player would spend staring
// at an empty screen. Baking moves that cost to build time.
//
// It also does something the app could not: **it grades and sorts**. Difficulty
// used to be whatever the seed happened to produce, so levels 76 and 120 were
// statistically the same 8×8 board and the only thing that grew across the ladder
// was the grid. Here each band generates a surplus, `deduce.ts` grades every
// candidate by which rules it actually needed, and the band ships the graded
// boards in order. That is what makes a band a ramp rather than a bag.
//
// The bank is regenerated wholesale, so re-running this after touching the
// generator will change existing levels. That is fine before release and not
// after — the tests pin the bank's contents, not the generator's output.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { encodePuzzle } from "../src/game/codec";
import { ladderScore, type Grade } from "../src/game/deduce";
import { generateGraded, withBonusReveals, type GradedPuzzle } from "../src/game/generator";
import {
  bandIndex,
  GRACE_LEVELS,
  LEVEL_COUNT,
  levelSeed,
  sizeForLevel,
  tierCapForLevel,
} from "../src/game/levels";

// Run from the project root (`npm run levels:build`).
const out = join(process.cwd(), "src", "game", "levelData.ts");

/**
 * Candidates per level slot, of which the **hardest** is kept.
 *
 * Keeping the hardest is not greed, it is a counterweight. Deducible boards are
 * rare and the easy ones are far commoner — the search finds a board that falls
 * to plain counting long before it finds one that needs real geometry — so taking
 * the first acceptable candidate fills the whole ladder with tier-1 and tier-2
 * boards. A first cut of this script did exactly that: every band came out T1/T2
 * with nothing above it.
 */
const TRIES_PER_SLOT = 3;

/**
 * The footholds knob, as a fraction of the board's lines.
 *
 * Extreme clues (0, n, n−1) are where counting bites, so *withholding* them is
 * what makes a board demand the harder rules. A band therefore opens generous and
 * tightens: early levels get plenty of ways in, late ones have to be worked out.
 * This is the main difficulty dial, and it is the one that was missing when every
 * band came out T1/T2 with nothing above it.
 *
 * The ask is **adaptive**, and has to be: extreme clues get rarer as the board
 * grows — measured across the old bank, 4.0 of 8 lines on a 4×4 but only 2.4 of
 * 16 on an 8×8 — so one fixed fraction is either trivial for small boards or
 * impossible for large ones. Asking 35% of an 8×8's lines starved the band
 * outright. So each slot asks for what it wants and settles for what the size can
 * actually supply, walking the floor down until a board turns up.
 */
const FOOTHOLDS_EASY = 0.35;
const FOOTHOLDS_HARD = 0.1;

/**
 * Walks per attempt while probing a foothold floor. Small on purpose: a floor
 * this size cannot meet should be abandoned quickly rather than exhaustively
 * disproved.
 */
const PROBE_ATTEMPTS = 1_200;

type Candidate = GradedPuzzle;

/** The levels of one size band, in ladder order. */
function bandOf(level: number): number[] {
  const size = sizeForLevel(level);
  const levels: number[] = [];
  for (let l = 1; l <= LEVEL_COUNT; l++) if (sizeForLevel(l) === size) levels.push(l);
  return levels;
}

const banks = new Map<number, string>();
const grades = new Map<number, Grade>();
const footholds = new Map<number, number[]>();
const t0 = performance.now();
const seen = new Set<number>();

for (let first = 1; first <= LEVEL_COUNT; first++) {
  if (seen.has(first)) continue;
  const levels = bandOf(first);
  for (const l of levels) seen.add(l);
  const size = sizeForLevel(first);

  // One board per slot, generated against that slot's difficulty dial. The dial
  // sweeps across the band, so the *pool itself* spans easy to hard rather than
  // being a uniform bag that sorting can only reorder.
  const picked: Candidate[] = [];
  /** The foothold floor each slot actually settled on — reported at the end. */
  const settled: number[] = [];

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const t = levels.length === 1 ? 0 : i / (levels.length - 1);
    const share = FOOTHOLDS_EASY + (FOOTHOLDS_HARD - FOOTHOLDS_EASY) * t;
    const wanted = Math.max(1, Math.round(size * 2 * share));
    // Only slots that will end up at a level allowed to need it are built to the
    // hard cap, which is what keeps assume-and-refute boards out of the levels
    // that must never require one.
    const cap = tierCapForLevel(level);

    let best: Candidate | null = null;
    let floor = wanted;
    for (; floor >= 0 && !best; floor--) {
      for (let k = 0; k < TRIES_PER_SLOT; k++) {
        const seed = (levelSeed(level) ^ (0x9e37 * (k + 1))) >>> 0;
        try {
          const cand = generateGraded(seed, {
            size,
            maxTier: cap,
            minExtremeLines: floor,
            attempts: PROBE_ATTEMPTS,
          });
          if (!best || cand.grade.score > best.grade.score) best = cand;
        } catch {
          // This floor is beyond what the size can supply; the loop drops it.
        }
      }
    }
    if (!best) {
      throw new Error(`${size}×${size} produced no board at all for level ${level}`);
    }
    picked.push(best);
    settled.push(floor + 1);
    process.stdout.write(
      `\r  ${size}×${size}: ${picked.length}/${levels.length} boards ` +
        `(${((performance.now() - t0) / 1000).toFixed(0)}s)      `,
    );
  }

  // The dial makes the spread; this makes the *order* exact, so the ramp holds
  // even where the dial and the search disagreed about which board is harder.
  //
  // `ladderScore` leads with the tier the *clues* demand, which does two jobs at
  // once: the band comes out genuinely easiest-first, and clue difficulty rises
  // monotonically, so the boards that need assume-and-refute can only land in the
  // slots at the end — the only ones whose cap allows one. Sorting on the played
  // grade instead put a T5-by-clues board at level 90, which its own tests caught.
  picked.sort((a, b) => ladderScore(a.gate, a.grade) - ladderScore(b.gate, b.grade));

  footholds.set(size, settled);

  levels.forEach((level, i) => {
    const chosen = picked[i];
    const allowed = tierCapForLevel(level);
    // `gate`, not `grade`: the cap is a promise about what the *clues* demand, and
    // a printed piece can make a board that needs assume-and-refute look as though
    // it only needed counting. Guarding on the played grade let a T5-by-clues board
    // land at level 90, where the tests rightly refused it.
    if (chosen.gate.maxTier > allowed) {
      throw new Error(
        `level ${level} allows tier ${allowed} but its clues need T${chosen.gate.maxTier}`,
      );
    }
    // Grace levels get one extra piece: difficulty, not correctness.
    const bonus = bandIndex(level) < GRACE_LEVELS ? 1 : 0;
    banks.set(level, encodePuzzle(withBonusReveals(chosen.puzzle, bonus, levelSeed(level))));
    grades.set(level, chosen.grade);
  });
}

const lines: string[] = [];
for (let level = 1; level <= LEVEL_COUNT; level++) {
  const g = grades.get(level)!;
  lines.push(
    `  "${banks.get(level)}", // ${level}: ${sizeForLevel(level)}×${sizeForLevel(level)} ` +
      `T${g.maxTier} score ${g.score}`,
  );
}

const body = `// GENERATED FILE — do not edit by hand. Run \`npm run levels:build\`.
//
// One line per level, in the format \`src/game/codec.ts\` documents, ordered
// easiest-first within each size band by the grade \`src/game/deduce.ts\` gives it.
// The trailing comment is that grade: \`T\` is the hardest rule the board needs.
// \`npm test\` re-proves every one of them is deducible and single-shaped.

export const LEVEL_BANK: string[] = [
${lines.join("\n")}
];
`;

writeFileSync(out, body);

process.stdout.write(`\r  baked ${LEVEL_COUNT} levels in ${((performance.now() - t0) / 1000).toFixed(1)}s\n`);
const bySize = new Map<number, number[]>();
for (let l = 1; l <= LEVEL_COUNT; l++) {
  const s = sizeForLevel(l);
  if (!bySize.has(s)) bySize.set(s, []);
  bySize.get(s)!.push(grades.get(l)!.maxTier);
}
for (const [size, tiers] of [...bySize].sort((a, b) => a[0] - b[0])) {
  const hist = [1, 2, 3, 4, 5].map((t) => `T${t}:${tiers.filter((x) => x === t).length}`).join(" ");
  const f = footholds.get(size) ?? [];
  process.stdout.write(
    `  ${size}×${size}  ${hist}   footholds asked ${Math.max(...f)}→${Math.min(...f)}\n`,
  );
}
