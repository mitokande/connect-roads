// Tools for testing the game by hand — never for players.
//
// **Open every level** (Settings, under "Debug"): every stop on the road trip
// can be opened, so any region and any board is one tap away without playing
// the ladder up to it. It only unlocks the map. Progress is untouched: the car
// stays at the player's real level, Continue still goes there, and nothing past
// it is marked cleared. A board won out of order still keeps its star record, as
// any clear does — "Reset progress" wipes that.
//
// The tools show in development builds only (`__DEV__`: Expo Go, a dev client,
// the web dev server). To test a release build — a TestFlight or preview build —
// set `DEBUG_TOOLS` to `true`, and set it back before a store submission: the
// switch is a way round the whole ladder.

export const DEBUG_TOOLS: boolean = __DEV__;

/** Every level is open: the switch is on, and debug tools exist in this build. */
export const openAll = (progress: { openAll?: boolean }): boolean => DEBUG_TOOLS && !!progress.openAll;
