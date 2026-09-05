require("dotenv").config();

/**
 * Environment validation, run once at boot.
 *
 * The app used to start happily with no database configured. `supabaseClient`
 * exported `null` after a `console.warn`, and every route that touched it threw
 * a TypeError which the error middleware turned into a generic 500. So a
 * misconfigured deploy looked like a working server that failed every request,
 * and `/health` reported "healthy" while doing it.
 *
 * Failing at boot is the correct trade. A process that cannot reach its
 * database has nothing useful to serve, and on Vercel a cold-start throw shows
 * up as one loud error in the logs instead of a thousand quiet 500s. The
 * message names every missing variable at once, so a deploy is fixed in one
 * pass rather than one variable per attempt.
 *
 * Tests never load this: they `jest.mock` the supabase client module, and
 * tests/setup.js stubs the secrets it needs.
 */

/** Required for the app to serve a single meaningful request. */
const REQUIRED = [
  ["SUPABASE_URL", "Supabase project URL, from Project Settings > API"],
  ["SUPABASE_KEY", "Supabase service-role key, same page"],
  ["JWT_SECRET", "any long random string; signs team session tokens"],
  ["ADMIN_SECRET", "the value marshals type into the admin console"],
  ["WEBHOOK_SECRET", "shared with the registration form's Apps Script"],
];

/** Optional, with the consequence of leaving each one unset. */
const OPTIONAL = [
  ["RESEND_API_KEY", "welcome emails are skipped"],
  ["EMAIL_FROM", "welcome emails fall back to a placeholder sender"],
  ["PORT", "defaults to 3005"],
  ["TRUST_PROXY_HOPS", "defaults to 1, correct behind a single proxy"],
  [
    "RPC_HAS_IMAGES",
    "set to true once migration 003 is deployed, skips the image hydration query",
  ],
];

/**
 * A blank or malformed TRUST_PROXY_HOPS used to become 0 or NaN through
 * Number(), which silently disabled trust proxy and collapsed every player
 * onto the proxy's IP for rate limiting. Blank means "use the default";
 * anything else that is not a whole number is a configuration error.
 */
function readTrustProxyHops() {
  const raw = process.env.TRUST_PROXY_HOPS;
  if (raw === undefined || raw.trim() === "") return 1;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(
      `TRUST_PROXY_HOPS must be a whole number of proxies (got ${JSON.stringify(raw)}).`,
    );
  }
  return n;
}

function readEnv() {
  const missing = REQUIRED.filter(([key]) => {
    const v = process.env[key];
    return typeof v !== "string" || v.trim() === "";
  });

  if (missing.length > 0) {
    const lines = missing.map(([key, why]) => `  ${key}  -  ${why}`);
    throw new Error(
      [
        `Missing ${missing.length} required environment variable${missing.length > 1 ? "s" : ""}:`,
        ...lines,
        "",
        "Copy backend/.env.example to backend/.env and fill these in, or set",
        "them in your host's environment. The server will not start without",
        "them, deliberately: it cannot serve a useful request either way.",
      ].join("\n"),
    );
  }

  // A short JWT secret is a real weakness rather than a style preference, and
  // it is the kind of thing that gets set to "secret" during a rush.
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error(
      "JWT_SECRET must be at least 32 characters. It signs every team's " +
        "session; a short one is guessable. Generate one with:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  return {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY,
    jwtSecret: process.env.JWT_SECRET,
    adminSecret: process.env.ADMIN_SECRET,
    webhookSecret: process.env.WEBHOOK_SECRET,

    resendApiKey: process.env.RESEND_API_KEY || null,
    emailFrom: process.env.EMAIL_FROM || null,

    port: Number(process.env.PORT || 3005),
    // Behind Vercel (or any single reverse proxy) req.ip is the proxy's address
    // unless this is set, which collapses every player onto one rate-limit key.
    // Keep it at the exact number of proxies in front of the app; `true` would
    // let clients spoof X-Forwarded-For and dodge the limiter entirely.
    trustProxyHops: readTrustProxyHops(),

    isProduction: process.env.NODE_ENV === "production",
    isTest: process.env.NODE_ENV === "test",
  };
}

module.exports = { readEnv, REQUIRED, OPTIONAL };
