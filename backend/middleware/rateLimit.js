const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, slow down." },
});

/**
 * Login throttling, keyed by TEAM NAME rather than IP.
 *
 * The threat is someone brute-forcing one team's access code, and team-keying
 * stops that precisely. IP-keying did not: players are on mobile data, and
 * carriers put large numbers of subscribers behind CGNAT, so hundreds of
 * unrelated players share a handful of public addresses. A load test against
 * production confirmed the cost -- 150 concurrent logins from a single IP got
 * 25 through and 125 rejected with 429, and the whole address was walled off
 * for the next 60 seconds. At an event where 150 teams sign in within minutes
 * of each other, that reads as "the app is broken".
 *
 * `express.json()` runs before the routes (see app.js), so req.body is
 * populated by the time this key generator runs.
 */
const LOGIN_ATTEMPTS_PER_TEAM = 5;
const LOGIN_ATTEMPTS_PER_IP = 300;

/** Case- and whitespace-insensitive, so "Team A" and "team a " share a budget. */
function teamKey(req) {
  const name = req.body?.team_name;
  if (typeof name === "string" && name.trim()) {
    return `team:${name.trim().toLowerCase()}`;
  }
  // A request with no usable team name cannot be team-keyed. Falling back to
  // the IP keeps it counted rather than letting a malformed body slip the
  // limiter entirely.
  return `ip:${ipKeyGenerator(req.ip)}`;
}

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: LOGIN_ATTEMPTS_PER_TEAM,
  keyGenerator: teamKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts for this callsign, try again in a minute" },
});

/**
 * Abuse backstop. Deliberately loose -- it exists to stop one host scripting
 * thousands of requests, and to cap someone enumerating many DIFFERENT team
 * names (which slips the per-team budget above). It is NOT there to police a
 * crowded venue, so it sits well above a real sign-in rush: 150 teams each
 * logging in once, with retries, is a few hundred requests at most.
 */
const loginIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: LOGIN_ATTEMPTS_PER_IP,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts from this network, try again later" },
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many admin requests" },
});

module.exports = {
  verifyLimiter,
  loginLimiter,
  loginIpLimiter,
  adminLimiter,
};
