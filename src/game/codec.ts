// Compact puzzle serialisation, so the shipped levels can be a baked bank
// rather than something the phone has to search for at launch.
//
// Only the irreducible facts are stored — size, the two terminals, the route,
// and which of its cells start revealed. Everything else about a puzzle (the
// piece grid, the row and column clues) is a *consequence* of the route, so it
// is recomputed on decode. That keeps the bank small and, more usefully, makes
// it impossible for a stored clue to disagree with the stored solution.
//
// Format:  size | eR,eC,eD | xR,xC,xD | path cells as r*size+c, dot-joined
//               | indices into that path that start revealed, dot-joined

import { piecesFromPath } from "./generator";
import type { Coord, Dir, Puzzle } from "./types";

export function encodePuzzle(p: Puzzle): string {
  const cells = p.path.map((cell) => cell.r * p.size + cell.c).join(".");
  const fixed = p.fixed
    .map((f) => p.path.findIndex((cell) => cell.r === f.r && cell.c === f.c))
    .join(".");
  return [
    p.size,
    `${p.entry.r},${p.entry.c},${p.entry.dir}`,
    `${p.exit.r},${p.exit.c},${p.exit.dir}`,
    cells,
    fixed,
  ].join("|");
}

export function decodePuzzle(encoded: string, seed: number): Puzzle {
  const [sizeStr, entryStr, exitStr, cellsStr, fixedStr] = encoded.split("|");
  const size = Number(sizeStr);

  const terminal = (s: string) => {
    const [r, c, d] = s.split(",").map(Number);
    return { r, c, dir: d as Dir };
  };
  const entry = terminal(entryStr);
  const exit = terminal(exitStr);

  const path: Coord[] = cellsStr.split(".").map((v) => {
    const i = Number(v);
    return { r: Math.floor(i / size), c: i % size };
  });
  const fixed: Coord[] = fixedStr.split(".").map((v) => path[Number(v)]);

  const rows = new Array<number>(size).fill(0);
  const cols = new Array<number>(size).fill(0);
  for (const { r, c } of path) {
    rows[r]++;
    cols[c]++;
  }

  return {
    size,
    rows,
    cols,
    entry,
    exit,
    solution: piecesFromPath(path, entry, exit, size),
    path,
    fixed,
    seed,
  };
}
