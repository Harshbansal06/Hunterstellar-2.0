const supabase = require("../db/supabaseClient");
const teamModel = require("../db/teamModel");

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const STATE_CACHE = new Map();
// Per-process only. On a multi-instance deploy two teammates can briefly see
// different stages; the mitigation is client-side -- the verify endpoints
// return the fresh state, so the client trusts a POST response over a poll.
const CACHE_TTL_MS = 2000;

// Set to "true" once the get_team_state RPC itself returns clue_images and
// is_terminal (migration 003), which removes the hydration round trip below.
// Defaulting to hydrating makes the deploy order-independent: the app is
// correct whether or not the DB function has been updated yet.
const HYDRATE_RPC_IMAGES = process.env.RPC_HAS_IMAGES !== "true";

/**
 * Whether the RPC payload already carries the image arrays. Migration 003
 * returns them (empty or not) on every clue and puzzle state, so once it is
 * deployed the hydration round trips stop on their own; the flag above only
 * matters for a function that predates 003 and omits the keys entirely.
 */
function rpcReturnedImages(raw) {
  return Array.isArray(raw?.clue_images) || Array.isArray(raw?.question_images);
}

function invalidateTeamStateCache(userId) {
  if (userId) STATE_CACHE.delete(String(userId));
}

function invalidateAllTeamStateCache() {
  STATE_CACHE.clear();
}

/**
 * Guarantees the fields the client renders exist on every state, whichever
 * path produced it -- the RPC returns the DB function's shape verbatim, so
 * without this the two paths drift apart silently.
 */
function normalizeState(state) {
  if (!state || state.error) return state;
  return {
    ...state,
    clue_images: Array.isArray(state.clue_images) ? state.clue_images : [],
    // Exposed as `question_images` to match `clue_images`; the column itself
    // is `questions.que_img`.
    question_images: Array.isArray(state.question_images) ? state.question_images : [],
    is_terminal: state.is_terminal ?? null,
  };
}

// Callers spread and mutate the state they get back, and the cache hands the
// same object to everyone inside the TTL window. Copy on the way in and out.
function cloneState(state) {
  if (!state || typeof state !== "object") return state;
  return { ...state, team: state.team ? { ...state.team } : state.team };
}

function cacheState(cacheKey, state) {
  const normalized = normalizeState(state);
  STATE_CACHE.set(cacheKey, { data: cloneState(normalized), ts: Date.now() });
  return normalized;
}

/**
 * The RPC strips `route`, so it cannot tell us which island or question the
 * team is on. Re-reads the team to find the current stop, then fetches that
 * stop's art -- the island's `clue_images` on the clue screen, the question's
 * `que_img` on the puzzle screen.
 *
 * Only runs until the DB function returns these itself (RPC_HAS_IMAGES=true).
 */
async function hydrateStopImages(state, userId) {
  const isClue = state.stage === "awaiting_code";
  const isPuzzle = state.stage === "awaiting_puzzle";
  if (!isClue && !isPuzzle) return state;

  // Already populated by the RPC -- nothing to fetch.
  if (isClue && state.clue_images?.length > 0) return state;
  if (isPuzzle && state.question_images?.length > 0) return state;

  try {
    const { data: team } = await teamModel.getById(userId);
    const stop = team?.route?.[team.progress];
    if (!stop) return state;

    if (isPuzzle) {
      if (!stop.question_id) return state;
      const { data: question } = await supabase
        .from("questions")
        .select("que_img")
        .eq("id", stop.question_id)
        .single();
      if (!question) return state;

      return {
        ...state,
        question_images: Array.isArray(question.que_img) ? question.que_img : [],
      };
    }

    if (!stop.island_id) return state;
    const { data: island } = await supabase
      .from("islands")
      .select("clue_images, is_terminal")
      .eq("id", stop.island_id)
      .single();
    if (!island) return state;

    return {
      ...state,
      clue_images: Array.isArray(island.clue_images) ? island.clue_images : [],
      is_terminal: island.is_terminal ?? state.is_terminal ?? null,
    };
  } catch {
    // Art is decoration -- never fail the clue or puzzle screen over it.
    return state;
  }
}

async function getTeamStateForUser(userId) {
  const cacheKey = String(userId);
  const now = Date.now();
  const cached = STATE_CACHE.get(cacheKey);
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return cloneState(cached.data);
  }

  // Try single-round-trip RPC first (requires migration get_team_state)
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_team_state", {
      p_user_id: userId,
    });

    if (!rpcError && rpcData) {
      // Supabase may return json string; normalize
      const data = typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData;

      if (data && !data.error) {
        // Handle stale lock: if RPC still says locked but lock expired, fix row and retry once
        if (
          data.stage === "locked" &&
          (!data.lock_until || new Date(data.lock_until) <= new Date())
        ) {
          await supabase
            .from("teams")
            .update({ status: "active", lock_until: null })
            .eq("id", userId);
          STATE_CACHE.delete(cacheKey);

          // One retry via RPC (avoid infinite loop)
          const retry = await supabase.rpc("get_team_state", { p_user_id: userId });
          if (!retry.error && retry.data) {
            const retryRaw =
              typeof retry.data === "string" ? JSON.parse(retry.data) : retry.data;
            let r = normalizeState(retryRaw);
            if (HYDRATE_RPC_IMAGES && !rpcReturnedImages(retryRaw)) {
              r = await hydrateStopImages(r, userId);
            }
            return cacheState(cacheKey, r);
          }
        }
        // Handle team not found via RPC returning null
        if (data.team == null && data.stage == null) {
          // Fall through to sequential fallback which returns 404
        } else {
          let state = normalizeState(data);
          if (HYDRATE_RPC_IMAGES && !rpcReturnedImages(data)) {
            state = await hydrateStopImages(state, userId);
          }
          return cacheState(cacheKey, state);
        }
      }
    }
  } catch (_) {
    // RPC not deployed yet, fall through to sequential path
  }

  // --- Sequential fallback (keeps behavior before RPC was deployed) ---
  const { data: team, error } = await teamModel.getById(userId);

  if (error || !team) {
    return { error: true, status: 404, message: "Team not found" };
  }

  const { data: latestAnnouncement } = await supabase
    .from("announcements")
    .select("message")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const announcement = latestAnnouncement?.message || null;

  // session_token stays server-side: it is what a superseded device lacks.
  const { password, route, session_token, ...safeTeam } = team;
  const currentStop = team.route?.[team.progress];
  const notice = team.notice || null;

  if (!currentStop || team.progress >= 5) {
    const result = {
      team: safeTeam,
      stage:
        team.status === "finished" || team.progress >= 5
          ? "finished"
          : team.stage || "ready",
      notice,
      announcement,
    };
    return cacheState(cacheKey, result);
  }

  let status = team.status;
  if (
    status === "locked" &&
    (!team.lock_until || new Date(team.lock_until) <= new Date())
  ) {
    const { error } = await supabase
      .from("teams")
      .update({ status: "active", lock_until: null })
      .eq("id", userId)
      .select("status")
      .single();

    if (!error) {
      status = "active";
    }
  }

  if (status === "locked") {
    const result = {
      team: safeTeam,
      stage: "locked",
      lock_until: team.lock_until,
      notice,
      announcement,
    };
    return cacheState(cacheKey, result);
  }

  if (team.stage === "awaiting_code") {
    const { data: island } = await supabase
      .from("islands")
      .select("clue_statement, clue_images, is_terminal")
      .eq("id", currentStop.island_id)
      .single();

    const result = {
      team: safeTeam,
      stage: "awaiting_code",
      clue_statement: island?.clue_statement,
      clue_images: island?.clue_images,
      // Display only. Whether this stop actually ends the hunt is decided by
      // the route's question_id sentinel, not by this flag.
      is_terminal: island?.is_terminal ?? currentStop.question_id === null,
      notice,
      announcement,
    };
    return cacheState(cacheKey, result);
  }

  if (team.stage === "awaiting_puzzle") {
    const { data: question } = await supabase
      .from("questions")
      .select("question_statement, que_img")
      .eq("id", currentStop.question_id)
      .single();

    const result = {
      team: safeTeam,
      stage: "awaiting_puzzle",
      question: question?.question_statement,
      // Optional artwork for the puzzle. Named to match `clue_images`; the
      // column is `que_img`. Most questions have none, so this is usually [].
      question_images: question?.que_img,
      notice,
      announcement,
    };
    return cacheState(cacheKey, result);
  }

  const result = { team: safeTeam, stage: team.stage || "ready", notice, announcement };

  return cacheState(cacheKey, result);
}

async function buildRandomRoute() {
  const { data: allIslands } = await supabase.from("islands").select("*");

  const groups = {};
  for (const island of allIslands) {
    const o = island.order;
    if (!groups[o]) groups[o] = [];
    groups[o].push(island);
  }

  const domains = shuffle([
    ...new Set(
      (await supabase.from("questions").select("domain")).data.map((d) => d.domain),
    ),
  ]);

  const route = [];
  for (let o = 1; o <= 5; o++) {
    const selected = shuffle(groups[o] || [])[0];
    if (o === 5) {
      route.push({ island_id: selected.id, question_id: null });
    } else {
      const { data: questions } = await supabase
        .from("questions")
        .select("*")
        .eq("domain", domains[o - 1]);

      const question = questions[Math.floor(Math.random() * questions.length)];
      route.push({
        island_id: selected.id,
        question_id: question.id,
      });
    }
  }

  return route;
}

module.exports = {
  getTeamStateForUser,
  invalidateTeamStateCache,
  invalidateAllTeamStateCache,
  buildRandomRoute,
};

// Same arrangement as utils/eventConfigCache.js: in tests the client is the
// hand-rolled mock, and its reset() must also drop this cache or a state cached
// by one test (a fresh lockout, say) is served to the next test's fixture.
if (supabase && supabase.__testing && typeof supabase.__testing.reset === "function") {
  const originalReset = supabase.__testing.reset;
  supabase.__testing.reset = () => {
    invalidateAllTeamStateCache();
    return originalReset();
  };
}
