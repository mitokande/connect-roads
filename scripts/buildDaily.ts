// Bakes the daily bank. Run with:
//   npm run daily:build
//
// One board per day for `DAILY_WEEKS` weeks, each built to its weekday's recipe
// (`WEEK` in `src/game/daily.ts`): a size, the hardest rule its clues may need,
// how many candidates to draw, and whether to keep the easiest or the hardest. Same bargain
// as the level bank — generation is deterministic, so this script is the source
// and `dailyData.ts` is its output; it exists because an 8×8 costs the phone a
// visible freeze to build, and a daily is opened first thing, every day.
//
// Re-running it changes the days that follow — harmless before release, and
// after it only ever worth doing to *extend* the bank, never to reshuffle it.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { encodePuzzle } from "../src/game/codec";
import { DAILY_EPOCH, DAILY_WEEKS, WEEK, WEEKDAYS } from "../src/game/daily";
import { ladderScore } from "../src/game/deduce";
import { generateGraded, type GradedPuzzle } from "../src/game/generator";
import { levelSeed } from "../src/game/levels";

const out = join(process.cwd(), "src", "game", "dailyData.ts");

const t0 = performance.now();
const lines: string[] = [];
const days = DAILY_WEEKS * 7;
for (let i = 0; i < days; i++) {
  const recipe = WEEK[i % 7];
  let chosen: GradedPuzzle | null = null;
  for (let k = 0; k < recipe.tries; k++) {
    // Seeded apart from the ladder's, which hashes small level numbers.
    const seed = (levelSeed(0xda11 + i) ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0;
    const cand = generateGraded(seed, { size: recipe.size, maxTier: recipe.tier });
    if (cand.gate.maxTier > recipe.tier) continue;
    const score = ladderScore(cand.gate, cand.grade);
    const best = chosen ? ladderScore(chosen.gate, chosen.grade) : null;
    if (best === null || (recipe.keep === "hardest" ? score > best : score < best)) chosen = cand;
  }
  if (!chosen) throw new Error(`day ${i}: no board met the ${WEEKDAYS[i % 7]} recipe`);
  const date = new Date((DAILY_EPOCH + i) * 86_400_000).toISOString().slice(0, 10);
  lines.push(
    `  "${encodePuzzle(chosen.puzzle)}", // ${date} ${WEEKDAYS[i % 7].slice(0, 3)} ` +
      `${recipe.size}×${recipe.size} T${chosen.gate.maxTier}`,
  );
  process.stdout.write(`\r  ${i + 1}/${days} days (${((performance.now() - t0) / 1000).toFixed(0)}s)   `);
}

writeFileSync(
  out,
  `// GENERATED FILE — do not edit by hand. Run \`npm run daily:build\`.
//
// One line per day in \`codec.ts\` form, starting on \`DAILY_EPOCH\` and cycling
// every ${DAILY_WEEKS} weeks (the dates are the first cycle's). The trailing comment
// is the day's recipe and the rule its clues need. \`npm test\` re-proves every one
// of them single-shaped and deducible within its weekday's cap.

export const DAILY_BANK: string[] = [
${lines.join("\n")}
];
`,
);
process.stdout.write(`\r  baked ${days} daily boards in ${((performance.now() - t0) / 1000).toFixed(1)}s\n`);
