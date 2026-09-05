const express = require("express");
const supabase = require("../db/supabaseClient");
const teamModel = require("../db/teamModel");
const { requireAdmin } = require("../middleware/auth");
const { adminLimiter } = require("../middleware/rateLimit");
const {
  invalidateTeamStateCache,
  invalidateAllTeamStateCache,
} = require("../utils/teamState");
const { invalidateEventConfigCache } = require("../utils/eventConfigCache");

const router = express.Router();

router.use(adminLimiter);

router.post("/admin/start", requireAdmin, async (req, res) => {
  const { error } = await supabase
    .from("event_config")
    // Clearing ended_at lets a marshal restart after an accidental /admin/end;
    // without it the gate stays shut forever because ended_at wins.
    .update({ started_at: new Date().toISOString(), ended_at: null })
    .eq("id", 1);

  if (error) return res.status(500).json({ error: error.message });
  invalidateEventConfigCache();
  res.json({ success: true, started_at: new Date().toISOString() });
});

router.post("/admin/end", requireAdmin, async (req, res) => {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("event_config")
    .update({ ended_at: now })
    .eq("id", 1);

  if (error) return res.status(500).json({ error: error.message });
  invalidateEventConfigCache();
  res.json({ success: true, ended_at: now });
});

router.post("/admin/unlock-team", requireAdmin, async (req, res) => {
  const { team_id } = req.body;
  if (!team_id) return res.status(400).json({ error: "team_id required" });

  const { error } = await supabase
    .from("teams")
    .update({ status: "active", lock_until: null })
    .eq("id", team_id);

  if (error) return res.status(500).json({ error: error.message });
  invalidateTeamStateCache(team_id);
  res.json({ success: true });
});

router.get("/admin/teams", requireAdmin, async (req, res) => {
  const { data: teams, error } = await teamModel.getAll();
  if (error) return res.status(500).json({ error: error.message });

  const list = teams.map((t) => ({
    id: t.id,
    team_name: t.team_name,
    progress: t.progress,
    status: t.status,
    last_correct_at: t.last_correct_at,
  }));

  res.json({ teams: list });
});

router.post("/admin/send-message", requireAdmin, async (req, res) => {
  const { team_id, message } = req.body;
  if (!team_id) return res.status(400).json({ error: "team_id required" });

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message required" });
  }

  const { error } = await supabase
    .from("teams")
    .update({ notice: message })
    .eq("id", team_id);

  if (error) return res.status(500).json({ error: error.message });
  invalidateTeamStateCache(team_id);
  res.json({ success: true, team_id, message });
});

router.post("/admin/announce", requireAdmin, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });

  const { error } = await supabase.from("announcements").insert({ message });
  if (error) return res.status(500).json({ error: error.message });
  invalidateAllTeamStateCache();
  res.json({ success: true });
});
module.exports = router;
