// Shared visual system — a sunny toy-town diorama.
//
// The board is a patch of lawn in a wooden tray, and everything the game draws
// on it is something you could build in that tray: tarmac with painted lines,
// a square of taped-off tarmac waiting for its shape, a flag, a town. The screens
// around it are sky and hills, so the board reads as the one object in a
// landscape rather than as a widget on a page.
//
// Colour is still assigned by function, not decoration:
//   asphalt / paint   the road itself, and nothing else
//   lawn              an undecided square — the ground before anyone builds
//   fresh tarmac,     a claimed square: road works — road is here, its shape
//   works tape        is not known
//   accent (orange)   primary actions and the next thing to do
//   good (green)      a clue that is settled, and success
//   danger (red)      hearts and mistakes
//   mark              the ✕ glyph
//
// There is one ✕ weight. The board writes some of them — the rest of a full line
// (see CLAUDE.md, "A full line crosses itself out") — but those can only ever be
// true, and they always sit under a green sign, so nothing about a ✕ needs a
// second look to say who wrote it.

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

  /** Tarmac, its darker edge, the painted lines. */
  asphalt: "#4B5263",
  asphaltEdge: "#353A48",
  /**
   * A claimed square's tarmac: fresh, a shade paler than the finished road and
   * with its stones still showing, so the road the player has laid stays the
   * darkest, cleanest thing on the board.
   */
  asphaltFresh: "#6A7182",
  gritLight: "#8C93A3",
  gritDark: "#555C6C",
  /**
   * The works tape round a claimed square, where its kerb will go. Yellow and
   * black are used nowhere else on the board, so the tape can't be read as a
   * hint (orange), a mistake (red) or a settled clue (green).
   */
  tape: "#FFC83D",
  tapeStripe: "#3A3848",
  tapeEdge: "#2E2A45",
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
  /** Something not open yet — a stop on the map, the daily before level 10: face and edge. */
  lockedFace: "#D9D4E4",
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

/**
 * The low cards — a loss, a restart, a hint for a video. Edge to edge on a phone;
 * on a tablet a card the width of the screen reads as a banner rather than a
 * question, so it stops at about a phone's width, under the board it is about.
 */
export const sheet = { width: "100%", maxWidth: 520, alignSelf: "center" } as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 24,
  pill: 999,
} as const;

/**
 * The ladder's regions, in the order the road trip drives through them: the five
 * that grow the board, the two mountain bands, and the second road trip's nine.
 * The tag says what a region asks of the player — a difficulty on the first
 * trip, the twist on the rest.
 */
export const REGIONS: Record<RegionId, { name: string; tag: string; color: string; dark: string }> = {
  meadow: { name: "Meadow Lane", tag: "Easy", color: "#3DBE5B", dark: "#279A43" },
  village: { name: "Village Green", tag: "Medium", color: "#27B9A8", dark: "#16907F" },
  market: { name: "Market Town", tag: "Tricky", color: "#3FA7F5", dark: "#2379BD" },
  riverside: { name: "Riverside City", tag: "Hard", color: "#8E6CF0", dark: "#5E43B8" },
  metropolis: { name: "Metropolis", tag: "Expert", color: "#FF5A5F", dark: "#D63B41" },
  pass: { name: "Mountain Pass", tag: "Rocks & pines", color: "#C27C3A", dark: "#94591F" },
  summit: { name: "Cloud Summit", tag: "Fog", color: "#7C93B8", dark: "#566D91" },
  harbour: { name: "Harbour Bay", tag: "Sea fog", color: "#2F6FB5", dark: "#1F4F86" },
  orchard: { name: "Orchard Hills", tag: "Fruit trees", color: "#7FA83A", dark: "#5E7F22" },
  canyon: { name: "Sunset Canyon", tag: "Rock & dust", color: "#D4A12E", dark: "#A57A14" },
  isles: { name: "Palm Isles", tag: "Lagoons & mist", color: "#F2668B", dark: "#C2426A" },
  frost: { name: "Frost Valley", tag: "Snow & what-ifs", color: "#35BFD9", dark: "#1C8FA8" },
  lantern: { name: "Lantern Town", tag: "Night fog", color: "#4B4FB8", dark: "#31348A" },
  ember: { name: "Ember Ridge", tag: "Pure logic", color: "#B5452E", dark: "#86301D" },
  blossom: { name: "Blossom Valley", tag: "Deep mist", color: "#D97BC4", dark: "#A8519A" },
  castle: { name: "Castle Hill", tag: "Grand finale", color: "#8C3B5E", dark: "#652440" },
};

/** What drifts across a region's sky. Every kind is a native-driver loop. */
export type Weather = "clouds" | "snow" | "leaves" | "petals" | "embers" | "stars";

/** What stands on a region's far ridge, side-on, in the haze. */
export type Skyline =
  | "cottages"
  | "windmills"
  | "spire"
  | "market"
  | "bridge"
  | "city"
  | "peaks"
  | "cloudsea"
  | "harbour"
  | "orchard"
  | "mesas"
  | "islands"
  | "snowpeaks"
  | "lanterns"
  | "volcano"
  | "pagoda"
  | "castle";

/**
 * How a region looks: the sky, the ridge, the weather — and the tray itself.
 *
 * A region used to be a name and a colour on a sign, and the board looked the
 * same from level 1 to the last, so nothing *on screen* said where the player
 * had got to. Now each region brings its own world, and the parts are chosen for
 * where they show: on a phone the board fills the width, so what the eye meets
 * is the sky above it, the hills under the tools, and the tray and lawn of the
 * board itself.
 *
 * **The lawn only ever moves along the greens.** It is the ground everything on
 * the board was tuned against — the chalk ✕ and its green shadow, the dark road,
 * the works tape — so a region may make it drier, lusher, cooler or warmer, but
 * never sand or snow; those live in the hills round the board instead.
 */
export type Look = {
  skyTop: string;
  skyLow: string;
  /** The sun — or the moon, where `night` — or neither. */
  sun: string | null;
  night?: boolean;
  hillFar: string;
  hillMid: string;
  hillNear: string;
  /** A sea on the horizon in place of the far hills. */
  sea?: string;
  skyline: Skyline;
  /** The skyline's colour: the far ridge's, a shade into the haze. */
  haze: string;
  cloud: string;
  weather: Weather;
  /** The lawn's two checker greens and its clumps. */
  lawn: readonly [string, string, string];
  /** The tray: its face, lit top edge and shaded bottom edge. */
  wood: readonly [string, string, string];
};

const LAWN = [theme.lawnA, theme.lawnB, theme.lawnBlade] as const;
const WOOD = [theme.wood, theme.woodLight, theme.woodDark] as const;

/** The world with no region in it — the splash, the tutorial, the map. */
export const CLASSIC_LOOK: Look = {
  skyTop: theme.skyTop,
  skyLow: theme.skyLow,
  sun: theme.sun,
  hillFar: theme.hillFar,
  hillMid: theme.hillMid,
  hillNear: theme.hillNear,
  skyline: "cottages",
  haze: theme.hillFar,
  cloud: theme.cloud,
  weather: "clouds",
  lawn: LAWN,
  wood: WOOD,
};

export const LOOKS: Record<RegionId, Look> = {
  meadow: { ...CLASSIC_LOOK, skyline: "windmills", haze: "#94C6A4" },
  village: {
    ...CLASSIC_LOOK,
    skyTop: "#86CBF2",
    skyLow: "#E6F6FF",
    sun: "#FFE9A0",
    hillFar: "#B0DC86",
    hillMid: "#90CB63",
    hillNear: "#74BA4C",
    skyline: "spire",
    haze: "#A3C7B6",
    lawn: ["#92D263", "#85C857", "#70B447"],
  },
  market: {
    ...CLASSIC_LOOK,
    skyTop: "#7BBDEB",
    skyLow: "#FFE7CC",
    sun: "#FFD36B",
    hillFar: "#BCD77E",
    hillMid: "#9CC65C",
    hillNear: "#80B548",
    skyline: "market",
    haze: "#C4B4A6",
    lawn: ["#96CF5C", "#89C450", "#74B141"],
    wood: ["#C07A48", "#DA9562", "#8E5029"],
  },
  riverside: {
    ...CLASSIC_LOOK,
    skyTop: "#6AB8EE",
    skyLow: "#D8EFFF",
    hillFar: "#A2D496",
    hillMid: "#82C372",
    hillNear: "#68B058",
    skyline: "bridge",
    haze: "#9AB6C9",
    lawn: ["#88CF66", "#7BC45A", "#67B04A"],
    wood: ["#B98556", "#D29F70", "#8A5C36"],
  },
  metropolis: {
    ...CLASSIC_LOOK,
    skyTop: "#5E9EE0",
    skyLow: "#F7DCBC",
    sun: "#FFC46B",
    hillFar: "#A3CB84",
    hillMid: "#80B962",
    hillNear: "#66A64B",
    skyline: "city",
    haze: "#8E9DB9",
    lawn: ["#84CC5E", "#77C152", "#63AE41"],
    wood: ["#8E97A6", "#ABB3C0", "#646C7B"],
  },
  pass: {
    ...CLASSIC_LOOK,
    skyTop: "#5DB2EC",
    skyLow: "#DDF1FF",
    hillFar: "#98C77C",
    hillMid: "#78B45E",
    hillNear: "#5E9F4A",
    skyline: "peaks",
    haze: "#8EA2BA",
    lawn: ["#8CC766", "#7FBC5A", "#6AA848"],
    wood: ["#A8743F", "#C28E58", "#7D5129"],
  },
  summit: {
    ...CLASSIC_LOOK,
    skyTop: "#8FA6D6",
    skyLow: "#EEF1FA",
    sun: "#FFF1C2",
    hillFar: "#DDE5F2",
    hillMid: "#EDF1F8",
    hillNear: "#FAFBFD",
    skyline: "cloudsea",
    haze: "#A2AFCB",
    lawn: ["#93CB74", "#86C068", "#71AC55"],
    wood: ["#A89A8A", "#C2B5A5", "#7D7063"],
  },
  harbour: {
    ...CLASSIC_LOOK,
    skyTop: "#74C6F0",
    skyLow: "#E8F8FF",
    sea: "#3A9AD8",
    hillFar: "#3A9AD8",
    hillMid: "#EBD9A2",
    hillNear: "#98CB68",
    skyline: "harbour",
    haze: "#6F93B8",
    lawn: ["#97D265", "#8AC759", "#75B447"],
    wood: ["#5C8FC2", "#7DAAD8", "#3D6A97"],
  },
  orchard: {
    ...CLASSIC_LOOK,
    skyTop: "#8BC3E8",
    skyLow: "#FFE2AE",
    sun: "#FFC247",
    hillFar: "#C9D57C",
    hillMid: "#ACC45E",
    hillNear: "#90B24A",
    skyline: "orchard",
    haze: "#A9AE78",
    weather: "leaves",
    lawn: ["#A0CE5A", "#93C34E", "#7EAF3F"],
    wood: ["#B8653E", "#D08058", "#8A4526"],
  },
  canyon: {
    ...CLASSIC_LOOK,
    skyTop: "#F29C6B",
    skyLow: "#FFE4A8",
    sun: "#FFF3C4",
    hillFar: "#E4B574",
    hillMid: "#D39B5D",
    hillNear: "#BD834A",
    skyline: "mesas",
    haze: "#C8745A",
    cloud: "#FFEBDD",
    lawn: ["#A5CA62", "#99BE56", "#84AA46"],
    wood: ["#D39A5F", "#E8B47C", "#A06C38"],
  },
  isles: {
    ...CLASSIC_LOOK,
    skyTop: "#3FC3E8",
    skyLow: "#D2F7FF",
    sea: "#2DBBD0",
    hillFar: "#2DBBD0",
    hillMid: "#F4E2A8",
    hillNear: "#7CD168",
    skyline: "islands",
    haze: "#2F9C86",
    lawn: ["#7ED56A", "#71CA5E", "#5CB64B"],
    wood: ["#D8B866", "#EBD08A", "#A88A3E"],
  },
  frost: {
    ...CLASSIC_LOOK,
    skyTop: "#9CCFF0",
    skyLow: "#F1F8FF",
    sun: "#FFF6D6",
    hillFar: "#D5E3F0",
    hillMid: "#E6EFF7",
    hillNear: "#F7FAFD",
    skyline: "snowpeaks",
    haze: "#A9BDD3",
    weather: "snow",
    lawn: ["#8ECC8E", "#81C182", "#6CAE6E"],
    wood: ["#E0CAA2", "#F0E0C0", "#B09870"],
  },
  lantern: {
    ...CLASSIC_LOOK,
    skyTop: "#1D2150",
    skyLow: "#50508F",
    sun: "#FFF4CF",
    night: true,
    hillFar: "#34506A",
    hillMid: "#2B455A",
    hillNear: "#223849",
    skyline: "lanterns",
    haze: "#2A2F63",
    cloud: "#6A6CA8",
    weather: "stars",
    lawn: ["#7EC45B", "#72B950", "#5FA541"],
    wood: ["#B0443A", "#CC6258", "#7F2A22"],
  },
  ember: {
    ...CLASSIC_LOOK,
    skyTop: "#6A4868",
    skyLow: "#F3A56E",
    sun: "#FF9A5A",
    hillFar: "#7A6158",
    hillMid: "#63504A",
    hillNear: "#4E403B",
    skyline: "volcano",
    haze: "#4C3A42",
    cloud: "#9A7E84",
    weather: "embers",
    lawn: ["#9EC15E", "#92B552", "#7DA143"],
    wood: ["#5E4A42", "#7A645A", "#3E2F29"],
  },
  blossom: {
    ...CLASSIC_LOOK,
    skyTop: "#A9C8F5",
    skyLow: "#FFE3F0",
    sun: "#FFF0C8",
    hillFar: "#BCE092",
    hillMid: "#9FD07A",
    hillNear: "#83BF62",
    skyline: "pagoda",
    haze: "#C9A2C4",
    weather: "petals",
    lawn: ["#94D76A", "#87CC5E", "#71B94C"],
    wood: ["#D0968A", "#E6B2A6", "#A0685C"],
  },
  castle: {
    ...CLASSIC_LOOK,
    skyTop: "#5B7BD6",
    skyLow: "#FFDAA8",
    sun: "#FFD36B",
    hillFar: "#9ECF74",
    hillMid: "#80BE58",
    hillNear: "#65AA45",
    skyline: "castle",
    haze: "#7E80A8",
    lawn: ["#88CF5E", "#7BC452", "#67B143"],
    wood: ["#9C9A94", "#B8B6AF", "#72706A"],
  },
};

/** A region's look, or the classic world when there is no region. */
export const lookFor = (region: RegionId | undefined): Look => (region ? LOOKS[region] : CLASSIC_LOOK);

/** The region a ladder level is drawn in. */
export const regionForLevel = (level: number) => REGIONS[bandFor(level).region];
