// What the board sounds like, derived from what changed in it.
//
// The obvious way to do this is to put a `sound.claim()` next to every dispatch,
// and it is wrong here for the same reason the haptics gave up on it: a claim can
// arrive from a double tap, from the hint button, or from a drag that paved its
// way into an unknown square, and a mark can be taken back by three different
// gestures. Watching the *state* instead means every one of those routes makes
// the right noise exactly once, and a new route to the same outcome gets its
// sound for free.
//
// One state change makes one sound. Several things can move in a single reducer
// pass — a push into the unknown claims a square *and* extends the road — so the
// rules are ranked and the loudest event wins. Two sounds landing on the same
// frame is the difference between a game and a slot machine.

import { useEffect, useRef } from "react";

import { blockedTotal, foundTotal } from "../game/board";
import { sound } from "../sound";
import type { Game } from "./useGame";

type Snapshot = {
  level: number;
  found: number;
  blocked: number;
  route: number;
  hints: number;
  shake: number;
  phase: string;
  riding: boolean;
  celebrate: boolean;
  failed: boolean;
};

const snapshot = (game: Game): Snapshot => ({
  level: game.level,
  found: foundTotal(game.marks),
  blocked: blockedTotal(game.marks),
  route: game.route.length,
  hints: game.hintsUsed,
  shake: game.shake,
  phase: game.phase,
  riding: game.riding,
  celebrate: game.celebrate,
  failed: game.failed,
});

export function useGameSounds(game: Game) {
  const was = useRef<Snapshot | null>(null);

  useEffect(() => {
    const now = snapshot(game);
    const prev = was.current;
    was.current = now;

    // A board opening — including the first, since this hook lives on the board
    // screen and mounting it *is* a board opening. Nothing else this pass is a
    // move the player made.
    if (!prev || prev.level !== now.level) {
      sound.open();
      return;
    }

    // Ranked, most consequential first. Exactly one of these fires.
    //
    // `fail` outranks `wrong` deliberately: losing the last heart bumps the
    // shake as well, and the claim being refused is no longer the news.
    if (now.failed && !prev.failed) sound.fail();
    else if (now.shake !== prev.shake) sound.wrong();
    else if (now.celebrate && !prev.celebrate) sound.win();
    else if (now.riding && !prev.riding) sound.drive();
    else if (now.phase === "connect" && prev.phase === "deduce") sound.settled();
    else if (now.hints > prev.hints) sound.hint();
    else if (now.found > prev.found) sound.claim();
    else if (now.found < prev.found) sound.uncross();
    else if (now.blocked > prev.blocked) sound.cross();
    else if (now.blocked < prev.blocked) sound.uncross();
    else if (now.route > prev.route) sound.pave();
    else if (now.route < prev.route) sound.unpave();
  });
}
