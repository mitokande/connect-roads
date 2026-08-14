// Bakes the level bank. Run with:
//   npm run levels:build
//
// Generation is deterministic, so this script is not *needed* — the app could
// call the generator directly and get the same boards. It exists for latency:
// proving an 8×8 has only one solution takes the search a second or two on a
// laptop, which is several seconds on a phone, and the player would spend it
// staring at an empty screen. Baking moves that cost to build time.
//
// The bank is regenerated wholesale, so re-running this after touching the
// generator will change existing levels. That is fine before release and not
// after — the tests pin the bank's contents, not the generator's output.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { encodePuzzle } from "../src/game/codec";
import { generatePuzzle } from "../src/game/generator";
import { bandIndex, GRACE_LEVELS, LEVEL_COUNT, levelSeed, sizeForLevel } from "../src/game/levels";

// Run from the project root (`npm run levels:build`).
const out = join(process.cwd(), "src", "game", "levelData.ts");

const lines: string[] = [];
const t0 = performance.now();

for (let level = 1; level <= LEVEL_COUNT; level++) {
  const size = sizeForLevel(level);
  const started = performance.now();
  const puzzle = generatePuzzle(levelSeed(level), {
    size,
    bonusReveals: bandIndex(level) < GRACE_LEVELS ? 1 : 0,
  });
  lines.push(`  "${encodePuzzle(puzzle)}", // ${level}: ${size}×${size}`);
  process.stdout.write(
    `\r  level ${level}/${LEVEL_COUNT} (${size}×${size}) ` +
      `${(performance.now() - started).toFixed(0)}ms   `,
  );
}

const body = `// GENERATED FILE — do not edit by hand. Run \`npm run levels:build\`.
//
// One line per level, in the format \`src/game/codec.ts\` documents. These are
// the generator's own output, baked so the phone never has to run the search;
// \`npm test\` re-proves every one of them has exactly one solution.

export const LEVEL_BANK: string[] = [
${lines.join("\n")}
];
`;

writeFileSync(out, body);
process.stdout.write(
  `\r  baked ${LEVEL_COUNT} levels in ${((performance.now() - t0) / 1000).toFixed(1)}s → ${out}\n`,
);
