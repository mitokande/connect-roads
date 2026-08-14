// Shared visual system — a cool paper-white workbench with one warm accent.
//
// Colour is assigned by function, not decoration:
//   rail / sleeper  the track itself, and nothing else
//   accent (blue)   primary actions and instructions
//   good (green)    a clue that is settled, and success
//   danger (red)    hearts and mistakes
//   mark            the ✕ glyph — two weights, see below
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
  /** A cell known to carry track — a shade cooler, so track reads as inlaid. */
  cellTrack: "#DFE7F0",
  /** A cell the finger is over. */
  cellHot: "#FFF6DA",

  rail: "#22364B",
  sleeper: "#DFA162",
  sleeperEdge: "#C0834A",

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
