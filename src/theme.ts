// Shared visual system — a cool paper-white workbench with one warm accent.
//
// Colour is assigned by function, not decoration:
//   asphalt / verge the road itself, and nothing else
//   accent (blue)   primary actions and instructions
//   good (green)    a clue that is settled, and success
//   danger (red)    hearts and mistakes
//   mark            the ✕ glyph — two weights, see below
//
// The road is the only place greens and greys are allowed to be this saturated:
// tarmac, its dashed centre line, and the grass verge that runs alongside it.
// Everything else on the screen is paper and ink, so the route reads as the one
// physical thing on the board.
//
// The two ✕ weights carry real meaning and shouldn't be collapsed: `markAuto`
// is the board crossing out cells the clues have already settled, `mark` is the
// player's own claim. Same glyph, different authorship — a player scanning the
// grid needs to know which crosses are theirs before trusting them.

export const theme = {
  bg: "#EEF2F7",
  bgDeep: "#E2E9F2",
  panel: "#FFFFFF",
  panelLine: "#DCE4EC",
  panelEdge: "#CBD6E2",

  text: "#22364B",
  textDim: "#6B7C8F",

  accent: "#2F8FEF",
  accentDark: "#1D6FC4",
  onAccent: "#FFFFFF",

  good: "#22C55E",
  goodDark: "#16A34A",
  danger: "#F4695F",
  dangerDark: "#C93F35",

  gold: "#F5B324",

  // --- the board ---------------------------------------------------------
  /** The chunky frame the grid sits inside. */
  frame: "#2F4157",
  /** Hairlines between cells. */
  grid: "#D9E1EA",
  /** An ordinary cell. */
  cell: "#FFFFFF",
  /** A cell known to carry road but not yet paved — a shade cooler. */
  cellRoad: "#DFE7F0",
  /** A cell the finger is over. */
  cellHot: "#FFF6DA",

  /** Tarmac, its darker kerb line, and the dashes down the middle. */
  asphalt: "#3B4753",
  asphaltEdge: "#2B333C",
  roadLine: "#FFFFFF",
  /** The grass either side of the road, and what grows on it. */
  verge: "#B4DD5F",
  vergeDeep: "#9ACB43",
  bush: "#71B233",
  bloom: "#FFFFFF",

  /** The car: body, the dark glass, and its lamps. */
  car: "#F7C948",
  carEdge: "#C99700",
  carGlass: "#2F3B47",
  carLamp: "#FFF2C2",
  /**
   * The convoy that drives a finished board, lead car first. Five of one colour
   * would read as a copy-paste; five of a colour each reads as traffic, which is
   * what a finished road is meant to be for.
   */
  fleet: [
    { body: "#F7C948", edge: "#C99700" },
    { body: "#F4695F", edge: "#C1382F" },
    { body: "#5DA9F8", edge: "#2D74C0" },
    { body: "#F2F5F8", edge: "#B4C2D0" },
    { body: "#6FD08C", edge: "#3B9E5C" },
  ],

  /** The player's own ✕. */
  mark: "#7C8DA0",
  /** The ✕ the board fills in once a row or column is settled. */
  markAuto: "#BFCAD7",

  /** The unknown-piece "?" tile placed by a double tap. */
  guess: "#2F8FEF",
  guessFill: "#EAF3FE",
} as const;

/** Soft drop shadow for raised cards, cross-platform. */
export const shadow = {
  shadowColor: "#22364B",
  shadowOpacity: 0.12,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;
