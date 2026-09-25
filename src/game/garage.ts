// The garage: paint jobs for the convoy, unlocked by stars.
//
// Stars were a record and nothing else — the hearts a board was won with, summed
// on the home screen and read by nothing. A number with nowhere to go is a number
// players stop looking at, and with it goes the one reason to replay a board for
// a cleaner win. So stars now open paint jobs for the five cars that drive every
// finished road: the payoff the player sees most often, dressed in something they
// earned.
//
// **Still a record, not a rule.** Nothing about play reads a paint job, stars are
// never spent (a threshold opens a fleet for good), and the last fleet sits at
// 360 of the ladder's 450 — a real goal, reachable only by winning most boards
// without losing a heart.

/** One car's paint: body, the darker line round it, and its roof. */
export type Paint = { body: string; edge: string; roof: string };

export type Fleet = {
  id: string;
  name: string;
  /** Stars the ladder must have paid before this fleet opens. */
  stars: number;
  /** The five cars of the convoy, lead first. */
  paints: Paint[];
};

export const FLEETS: Fleet[] = [
  {
    id: "classic",
    name: "Rainbow",
    stars: 0,
    paints: [
      { body: "#FF5A5F", edge: "#C23A3F", roof: "#FF8C8F" },
      { body: "#3FA7F5", edge: "#2379BD", roof: "#7CC4FA" },
      { body: "#FFC83D", edge: "#CF9416", roof: "#FFDD85" },
      { body: "#8E6CF0", edge: "#5E43B8", roof: "#B29BF6" },
      { body: "#27B9A8", edge: "#15877A", roof: "#6ED6C9" },
    ],
  },
  {
    id: "taxi",
    name: "Taxi rank",
    stars: 20,
    paints: [
      { body: "#FFC83D", edge: "#CF9416", roof: "#2E2A45" },
      { body: "#FFD65A", edge: "#D6A21E", roof: "#2E2A45" },
      { body: "#FFBE2E", edge: "#C98A0E", roof: "#2E2A45" },
      { body: "#FFD24A", edge: "#D19A16", roof: "#2E2A45" },
      { body: "#FFC83D", edge: "#CF9416", roof: "#2E2A45" },
    ],
  },
  {
    id: "fire",
    name: "Fire brigade",
    stars: 50,
    paints: [
      { body: "#E53935", edge: "#A82A27", roof: "#F4F1EA" },
      { body: "#EF4B3F", edge: "#B0322A", roof: "#F4F1EA" },
      { body: "#E53935", edge: "#A82A27", roof: "#FFC83D" },
      { body: "#EF4B3F", edge: "#B0322A", roof: "#F4F1EA" },
      { body: "#E53935", edge: "#A82A27", roof: "#F4F1EA" },
    ],
  },
  {
    id: "icecream",
    name: "Ice-cream vans",
    stars: 90,
    paints: [
      { body: "#FFB3C7", edge: "#E07A98", roof: "#FFFFFF" },
      { body: "#A8E6CF", edge: "#62B894", roof: "#FFFFFF" },
      { body: "#FFF1A8", edge: "#D9C35E", roof: "#FFFFFF" },
      { body: "#D4BFFF", edge: "#9C82D9", roof: "#FFFFFF" },
      { body: "#FFD3B0", edge: "#E09A66", roof: "#FFFFFF" },
    ],
  },
  {
    id: "police",
    name: "Patrol",
    stars: 150,
    paints: [
      { body: "#F5F7FA", edge: "#AEB8C6", roof: "#2F6FDB" },
      { body: "#2F6FDB", edge: "#1E4FA8", roof: "#F5F7FA" },
      { body: "#F5F7FA", edge: "#AEB8C6", roof: "#2F6FDB" },
      { body: "#2F6FDB", edge: "#1E4FA8", roof: "#F5F7FA" },
      { body: "#F5F7FA", edge: "#AEB8C6", roof: "#2F6FDB" },
    ],
  },
  {
    id: "night",
    name: "Night drive",
    stars: 240,
    paints: [
      { body: "#2E2A45", edge: "#15131F", roof: "#FF5AE0" },
      { body: "#2E2A45", edge: "#15131F", roof: "#5AF0FF" },
      { body: "#2E2A45", edge: "#15131F", roof: "#B8FF5A" },
      { body: "#2E2A45", edge: "#15131F", roof: "#FFD65A" },
      { body: "#2E2A45", edge: "#15131F", roof: "#8C7BFF" },
    ],
  },
  {
    id: "gold",
    name: "Gold convoy",
    stars: 360,
    paints: [
      { body: "#FFD54A", edge: "#B8860B", roof: "#FFF3C4" },
      { body: "#F2B705", edge: "#9C6F04", roof: "#FFE38A" },
      { body: "#FFD54A", edge: "#B8860B", roof: "#FFF3C4" },
      { body: "#F2B705", edge: "#9C6F04", roof: "#FFE38A" },
      { body: "#FFD54A", edge: "#B8860B", roof: "#FFF3C4" },
    ],
  },
];

/** A fleet by id; an unknown one (a stale save) is the classic. */
export const fleetById = (id: string | undefined): Fleet =>
  FLEETS.find((f) => f.id === id) ?? FLEETS[0];

export const isUnlocked = (fleet: Fleet, stars: number): boolean => stars >= fleet.stars;

/**
 * The fleet a clear just opened, going from `before` to `after` stars — the
 * biggest, if one clear crossed two thresholds — or null.
 */
export function newlyUnlocked(before: number, after: number): Fleet | null {
  let found: Fleet | null = null;
  for (const f of FLEETS) if (f.stars > before && f.stars <= after) found = f;
  return found;
}

/** The ladder's stars, summed — what the thresholds are measured in. */
export const totalStars = (stars: Record<number, number>): number =>
  Object.values(stars).reduce((a, b) => a + b, 0);
