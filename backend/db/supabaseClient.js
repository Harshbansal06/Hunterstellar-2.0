const { createClient } = require("@supabase/supabase-js");
const { readEnv } = require("../config/env");

/**
 * The service-role Supabase client.
 *
 * Always a real client, never null. It used to export `null` when the
 * credentials were missing, which pushed the failure out to roughly a dozen
 * `supabase.from(...)` call sites that had no guard, turning a configuration
 * mistake into a TypeError and then a generic 500 on every request. `readEnv`
 * now refuses to boot instead, so everything downstream can assume this
 * exists.
 *
 * Service role means row-level security is bypassed, so this client must never
 * be handed to the browser. The frontend has its own anon-key client in
 * src/api/supabase.js.
 *
 * Tests never reach this file: they `jest.mock('../db/supabaseClient')` with
 * the hand-rolled mock in tests/helpers/mockSupabase.js.
 */
const env = readEnv();

const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
  auth: {
    // No browser here, so there is no session to persist and no token to
    // refresh on a timer. Leaving these on keeps a needless interval alive in
    // a serverless function.
    persistSession: false,
    autoRefreshToken: false,
  },
});

module.exports = supabase;
