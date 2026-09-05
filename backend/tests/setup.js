/**
 * Jest setup, run before every suite.
 *
 * These are stubs, not credentials. The app validates its environment at boot
 * (config/env.js) and refuses to start without a full set, so a test that
 * requires app.js needs the variables present or it fails on import rather
 * than on the thing it is actually testing.
 *
 * The Supabase values in particular never reach the network: every suite calls
 * `jest.mock('../db/supabaseClient', ...)` with the hand-rolled mock in
 * tests/helpers/mockSupabase.js, so the real client module is never loaded.
 * They exist only to satisfy the boot check.
 */

// Long enough to clear the 32-character minimum env.js enforces.
process.env.JWT_SECRET = "test-jwt-secret-min-32-chars-long-enough";
process.env.ADMIN_SECRET = "test-admin-secret";
process.env.WEBHOOK_SECRET = "test-webhook-secret";

// Never contacted. See above.
process.env.SUPABASE_URL = "http://supabase.test.invalid";
process.env.SUPABASE_KEY = "test-service-role-key";

process.env.NODE_ENV = "test";
