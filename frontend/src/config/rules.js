/**
 * Numbers the UI says out loud that the server also enforces.
 *
 * These must match the backend or the app lies to players about a penalty:
 *  - LOCKOUT_MINUTES  -> routes/teamRoutes.js  (wrong station code)
 *  - VERIFY_ATTEMPTS / VERIFY_WINDOW_MINUTES -> middleware/rateLimit.js
 *  - STOP_COUNT       -> utils/teamState.js buildRandomRoute, and the
 *                        `progress >= 5` finish check
 *
 * The lockout and the rate-limit window are separate controls that were both
 * 15 minutes for a while; keeping them as distinct named values here is what
 * stops one edit from silently changing the other's copy.
 */

/** How long a wrong station code costs a crew. */
export const LOCKOUT_MINUTES = 5

/** Attempts a crew shares across all its devices, per window. */
export const VERIFY_ATTEMPTS = 10
export const VERIFY_WINDOW_MINUTES = 15

/**
 * Stops on a route, including the terminal Null Void.
 *
 * `STATION_COUNT` is the number that actually yield a fragment, which is the
 * number the briefing promises and therefore the number the UI must promise.
 * The fifth stop is the Void: it takes a code and ends the hunt, but it hands
 * over no fragment, so counting it as a station would make the app claim five
 * fragments exist when there are four.
 */
export const STOP_COUNT = 5
export const STATION_COUNT = 4
