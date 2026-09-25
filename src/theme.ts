// Shared visual system — a sunny toy-town diorama.
//
// The board is a patch of lawn in a wooden tray, and everything the game draws
// on it is something you could build in that tray: tarmac with painted lines,
// a graded plot waiting for its road, a flag, a town. The screens around it are
// sky and hills, so the board reads as the one object in a landscape rather than
// as a widget on a page.
//
// Colour is still assigned by function, not decoration:
//   asphalt / paint   the road itself, and nothing else
//   lawn              an undecided square — the ground before anyone builds
//   dirt              a claimed square: road is coming, its shape is not known
//   accent (orange)   primary actions and the next thing to do
//   good (green)      a clue that is settled, and success
//   danger (red)      hearts and mistakes
//   mark              the ✕ glyph, and only ever the player's own
//
// There is one ✕ weight, because there is one author: the board never crosses
// anything out on the player's behalf (see CLAUDE.md, "Every cross is the
// player's"), so a scan of the grid never has to sort whose marks are whose.

import { FLEETS } from "./game/garage";
import { bandFor, type RegionId } from "./game/levels";

export const theme = {
  // --- the world around the board -------------------------------------------
  skyTop: "#6EC3F5",
  skyLow: "#CDEEFF",
  sun: "#FFE27A",
  cloud: "#FFFFFF",
  hillFar: "#A6DA7E",
  hillMid: "#86C95A",
  hillNear: "#6CB846",

  /** The page colour behind scrolling content and under the scenery. */
  bg: "#CDEEFF",
  bgDeep: "#B4E1F7",

  /** Cards, sheets, dialogs: warm paper, never pure white. */
  panel: "#FFF9EE",
  panelLine: "#F0E3CC",
  panelEdge: "#E2CFAE",

  text: "#2E2A45",
  textDim: "#7A7392",
  onDark: "#FFFFFF",

  accent: "#FF8A3D",
  accentDark: "#E0621A",
  onAccent: "#FFFFFF",
  teal: "#27B9A8",
  tealDark: "#16907F",

  good: "#3DBE5B",
  goodDark: "#279A43",
  danger: "#FF5A5F",
  dangerDark: "#D63B41",

  gold: "#FFC83D",
  goldDark: "#E29B12",

  // --- the board --------------------------------------------------------------
  /** The wooden tray the lawn sits in. */
  wood: "#C98A55",
  woodDark: "#9A5E33",
  woodLight: "#E0A56F",
  /** Mown lawn, in two stripes, so the grid reads without drawing a grid. */
  lawnA: "#8DD05F",
  lawnB: "#80C654",
  lawnBlade: "#6EB344",
  /** The moving end of the road, or where a hint landed. */
  cellHot: "rgba(255,244,170,0.88)",
  /** A refused claim. */
  cellWrong: "rgba(255,110,110,0.92)",
  /** A claimed plot: graded earth, pegged out. */
  dirt: "#E8C68B",
  dirtDark: "#C9A064",
  dirtPebble: "#B98F55",
  /** The little road-works sign on a claimed plot. */
  sign: "#FF9F1C",
  signEdge: "#2E2A45",

  /** Tarmac, its darker edge, the painted lines. */
  asphalt: "#4B5263",
  asphaltEdge: "#353A48",
  roadEdgeLine: "#F3F1EA",
  roadLine: "#FFD23F",
  /** The kerb stones either side of the tarmac. */
  kerb: "#DAD5C8",
  kerbDark: "#BDB6A6",
  bush: "#4E9E37",
  bushLight: "#63B847",
  bloom: "#FF7AA8",

  /**
   * The glow laid under the finished road when the board is won — traced to
   * the road's own shape, never to the squares it runs through.
   */
  roadLit: "#FFE066",

  /**
   * The convoy that drives a finished board, lead car first — the garage's first
   * paint job, which every player starts with (`src/game/garage.ts`).
   */
  fleet: FLEETS[0].paints,
  carGlass: "#2B3346",
  carLamp: "#FFF6C8",
  tyre: "#23252E",

  /** The ✕ — the player's note that a square is empty. */
  mark: "#FFFBF0",
  markShadow: "#4F8F33",
  locked: "#B8B2C8",

  /** The town that grows on the empty squares of a won board. */
  roofs: ["#FF6B6B", "#FF9F43", "#5F9DF7", "#A77BF3", "#F76FA8"],
  walls: ["#FFF3E0", "#FFE8C8", "#F4F1FF", "#E8F6FF"],
  trunk: "#8A5A36",
  pond: "#5EC8F2",
  /** A fogged clue's cloud, and the ? that shows through it. */
  fog: "#DCE4EF",
  fogInk: "#5E6F8A",
} as const;

/** Font families. Custom fonts carry their weight in the name, not `fontWeight`. */
export const font = {
  regular: "Fredoka_400Regular",
  medium: "Fredoka_500Medium",
  semi: "Fredoka_600SemiBold",
  bold: "Fredoka_700Bold",
} as const;

/** Soft drop shadow for raised cards, cross-platform. */
export const shadow = {
  shadowColor: "#2E2A45",
  shadowOpacity: 0.16,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 5 },
  elevation: 4,
} as const;

/**
 * What every full-screen overlay's outermost view must sit on.
 *
 * Being last in the tree is not enough on Android: `elevation` outranks draw
 * order there, so raised cards underneath punch straight through a backdrop
 * left at 0. `zIndex` is the same statement for iOS and web. The transparent
 * `shadowColor` stops Android casting a full-screen shadow under a see-through
 * overlay, which reads as a dark rectangle over the whole display.
 */
export const overlayLift = {
  elevation: 24,
  zIndex: 24,
  shadowColor: "transparent",
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 24,
  pill: 999,
} as const;

/** The ladder's regions — one per grid size, named for what gets built there. */
export const REGIONS: Record<RegionId, { name: string; tag: string; color: string; dark: string }> = {
  meadow: { name: "Meadow Lane", tag: "Easy", color: "#3DBE5B", dark: "#279A43" },
  village: { name: "Village Green", tag: "Medium", color: "#27B9A8", dark: "#16907F" },
  market: { name: "Market Town", tag: "Tricky", color: "#3FA7F5", dark: "#2379BD" },
  riverside: { name: "Riverside City", tag: "Hard", color: "#8E6CF0", dark: "#5E43B8" },
  metropolis: { name: "Metropolis", tag: "Expert", color: "#FF5A5F", dark: "#D63B41" },
  pass: { name: "Mountain Pass", tag: "Rocks & pines", color: "#C27C3A", dark: "#94591F" },
  summit: { name: "Cloud Summit", tag: "Fog", color: "#7C93B8", dark: "#566D91" },
};

/** The region a ladder level is drawn in. */
export const regionForLevel = (level: number) => REGIONS[bandFor(level).region];
