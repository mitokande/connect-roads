// The solution of a level, for capture.mjs to drive the board with.
import { puzzleForLevel } from "../../src/game/levels";

const p = puzzleForLevel(Number(process.argv[2]));
console.log(JSON.stringify({ size: p.size, path: p.path, scenery: p.scenery ?? [] }));
