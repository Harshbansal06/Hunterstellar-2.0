const express = require("express");
const bcrypt = require("bcryptjs");
const supabase = require("../db/supabaseClient");
const teamModel = require("../db/teamModel");
const { requireAuth } = require("../middleware/auth");
const { requireEventActive } = require("../middleware/eventStatus");
const { verifyLimiter } = require("../middleware/rateLimit");
const {
  getTeamStateForUser,
  invalidateTeamStateCache,
  buildRandomRoute,
} = require("../utils/teamState");
const { sendWelcomeEmail } = require("../utils/email");
const { isCurrentSession, SESSION_REPLACED } = require("../utils/session");

const router = express.Router();

/**
 * How long a wrong station code seals a team out.
 *
 * Named because the number is also spoken in the UI ("a wrong code locks your
 * team out for N minutes") and the warning has to stay true. Distinct from the
 * verifyLimiter window in middleware/rateLimit.js, which is a separate
 * anti-script control that happens to also be measured in minutes.
 */
const LOCKOUT_MINUTES = 7;

router.post("/team/register", async (req, res) => {
  if (req.headers["x-webhook-secret"] !== process.env.WEBHOOK_SECRET) {
    return res.sendStatus(403);
  }

  const { team_name: requested_name, team_leader, members, password, email } = req.body;
  let team_name = requested_name;
  if (!team_name || !password || !email) {
    return res.status(400).json({
      error: "team_name, password, and email are required",
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  let route;
  try {
    route = await buildRandomRoute();
  } catch {
    return res.status(500).json({ error: "Could not build team route" });
  }
  const existing = await teamModel.getByTeamName(team_name);
  if (existing.error) return res.status(500).json({ error: existing.error.message });
  if (existing.data) {
    for (let i = 0; i < 5; i++) {
      const candidate = `${team_name}_${Math.floor(Math.random() * 9000 + 1000)}`;
      const check = await teamModel.getByTeamName(candidate);
      if (check.error) return res.status(500).json({ error: check.error.message });
      if (!check.data) {
        team_name = candidate;
        break;
      }
    }
  }
  const { error: insertError } = await supabase.from("teams").insert({
    team_name,
    team_leader,
    members,
    password: hashedPassword,
    route,
    email,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      return res.status(409).json({ error: "team_name already exists" });
    }
    return res.status(500).json({ error: insertError.message });
  }

  sendWelcomeEmail({ to: email, team_name, password, email });

  res.sendStatus(200);
});

router.post(
  "/team/verify-code",
  requireAuth,
  requireEventActive,
  verifyLimiter,
  async (req, res) => {
    const { enteredCode } = req.body;
    const teamId = req.userId;

    if (typeof enteredCode !== "string" || !enteredCode.trim()) {
      return res.status(400).json({ error: "enteredCode required" });
    }

    const { data: team } = await teamModel.getById(teamId);
    if (!team) {
      return res.status(404).json({ message: "team doesn't exist" });
    }
    // Checked before anything is read or mutated: a superseded device must not
    // be able to burn an attempt or move the team.
    if (!isCurrentSession(team, req.sessionId)) {
      return res.status(401).json(SESSION_REPLACED);
    }
    // Past the end of the route means the hunt is over, not that the team is
    // missing -- a finished team polling this endpoint gets a clean answer.
    if (!team.route?.[team.progress]) {
      const state = await getTeamStateForUser(teamId);
      return res.json({ success: false, reason: "finished", state });
    }
    const currentStop = team.route[team.progress];

    if (team.status === "locked" && new Date(team.lock_until) > new Date()) {
      // Include `state` so the client renders the lock against fresh data
      // instead of patching stage:"locked" onto whatever it had cached.
      const state = await getTeamStateForUser(teamId);
      return res.json({
        success: false,
        reason: "locked",
        lock_until: team.lock_until,
        state,
      });
    }

    if (team.stage !== "awaiting_code") {
      const state = await getTeamStateForUser(teamId);
      return res.json({ success: false, reason: "wrong_stage", state });
    }

    const { data: island } = await supabase
      .from("islands")
      .select("correct_code, id")
      .eq("id", currentStop.island_id)
      .single();

    if (!island) {
      return res.status(500).json({ error: "Could not fetch island" });
    }

    if (enteredCode.trim().toLowerCase() === island.correct_code.trim().toLowerCase()) {
      const isLastStop = currentStop.question_id === null;
      const newProgress = isLastStop ? team.progress + 1 : team.progress;
      const newStage = isLastStop ? "awaiting_code" : "awaiting_puzzle";
      // Reaching here means the lock guard above let us through, so the team
      // is definitionally not locked -- write that, rather than carrying
      // `team.status` forward. Carrying it forward left teams sitting at
      // status:"locked" after they had already moved on, because the expiry
      // is only cleared on a state READ and a team can submit before one
      // happens. Harmless to the player (the read self-heals) but it shows on
      // the public leaderboard as a penalty they are not serving.
      const newStatus = isLastStop ? "finished" : "active";

      const updatePayload = {
        stage: newStage,
        progress: newProgress,
        status: newStatus,
        lock_until: null,
      };
      const { data: updated, error: updateError } = await supabase
        .from("teams")
        .update(updatePayload)
        .eq("id", teamId)
        .eq("stage", "awaiting_code")
        .eq("progress", team.progress)
        .select();

      if (updateError) {
        return res.status(500).json({ error: updateError.message });
      }
      if (!updated || updated.length === 0) {
        const state = await getTeamStateForUser(teamId);
        return res.json({ success: false, reason: "wrong_stage", state });
      }

      invalidateTeamStateCache(teamId);
      const state = await getTeamStateForUser(teamId);
      return res.json({ success: true, state });
    }

    const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    await supabase
      .from("teams")
      .update({
        status: "locked",
        lock_until: lockUntil,
        wrong_attempts: team.wrong_attempts + 1,
      })
      .eq("id", teamId);
    invalidateTeamStateCache(teamId);

    // Every failure reason carries `state`, so the client adopts the fresh
    // locked state through the same path as a success and never has to
    // reconcile a wrong code with a stale poll.
    const state = await getTeamStateForUser(teamId);
    return res.json({
      success: false,
      reason: "wrong_code",
      lock_until: lockUntil,
      state,
    });
  },
);

router.post(
  "/team/verify-answer",
  requireAuth,
  requireEventActive,
  verifyLimiter,
  async (req, res) => {
    const { enteredAns } = req.body;

    if (typeof enteredAns !== "string" || !enteredAns.trim()) {
      return res.status(400).json({ error: "enteredAns required" });
    }

    const { data: team } = await teamModel.getById(req.userId);
    if (!team) {
      return res.status(404).json({ message: "team doesn't exist" });
    }
    if (!isCurrentSession(team, req.sessionId)) {
      return res.status(401).json(SESSION_REPLACED);
    }
    // Past the end of the route means the hunt is over, not that the team is
    // missing -- a finished team polling this endpoint gets a clean answer.
    if (!team.route?.[team.progress]) {
      const state = await getTeamStateForUser(req.userId);
      return res.json({ success: false, reason: "finished", state });
    }
    const currentStop = team.route[team.progress];

    if (team.status === "locked" && new Date(team.lock_until) > new Date()) {
      const state = await getTeamStateForUser(req.userId);
      return res.json({
        success: false,
        reason: "locked",
        lock_until: team.lock_until,
        state,
      });
    }

    if (team.stage !== "awaiting_puzzle") {
      const state = await getTeamStateForUser(req.userId);
      return res.json({ success: false, reason: "wrong_stage", state });
    }

    const { data: question } = await supabase
      .from("questions")
      .select("question_answer, id")
      .eq("id", currentStop.question_id)
      .single();

    if (!question) {
      return res.status(500).json({ error: "Could not fetch question" });
    }

    if (
      enteredAns.trim().toLowerCase() === question.question_answer.trim().toLowerCase()
    ) {
      const newProgress = team.progress + 1;
      // Same reasoning as verify-code: a correct answer cannot happen while
      // locked, so never carry a stale "locked" forward.
      const newStatus = newProgress === 5 ? "finished" : "active";

      const updatePayload = {
        stage: "awaiting_code",
        progress: newProgress,
        status: newStatus,
        lock_until: null,
        last_correct_at: new Date().toISOString(),
      };
      const { data: updated, error: updateError } = await supabase
        .from("teams")
        .update(updatePayload)
        .eq("id", req.userId)
        .eq("stage", "awaiting_puzzle")
        .eq("progress", team.progress)
        .select();

      if (updateError) {
        return res.status(500).json({ error: updateError.message });
      }
      if (!updated || updated.length === 0) {
        const state = await getTeamStateForUser(req.userId);
        return res.json({ success: false, reason: "wrong_stage", state });
      }

      invalidateTeamStateCache(req.userId);
      const state = await getTeamStateForUser(req.userId);
      // `state` already describes the NEXT stop, so the client can show the
      // fragment and then the next clue without another request.
      //
      // fragment_index is the new progress: solving the 1st stop earns
      // Fragment I. Computed here so the client never has to infer it from a
      // local diff that a racing teammate could have already moved.
      return res.json({
        success: true,
        state,
        fragment_index: newProgress,
        solved_stop: team.progress,
      });
    }

    // Wrong answers do not lock the team -- only wrong codes do. The client
    // needs `reason` to tell this apart from an unrecognised failure.
    return res.json({ success: false, reason: "wrong_answer" });
  },
);

router.get("/team/state", requireAuth, async (req, res) => {
  const state = await getTeamStateForUser(req.userId);
  if (state.error) {
    return res.status(state.status).json({ error: state.message });
  }
  res.json(state);
});

module.exports = router;
