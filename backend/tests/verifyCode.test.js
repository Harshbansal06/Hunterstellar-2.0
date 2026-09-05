const request = require("supertest");
const app = require("../app");
const { signToken } = require("./helpers/tokens");

jest.mock("../db/supabaseClient", () =>
  require("./helpers/mockSupabase").createMockSupabase(),
);
jest.mock("../utils/email", () => ({ sendWelcomeEmail: jest.fn() }));

const mockSupabase = require("../db/supabaseClient");

describe("Verify code behavior", () => {
  beforeEach(() => {
    mockSupabase.__testing.reset();
  });

  const baseTeam = {
    id: "team-a",
    team_name: "Team Alpha",
    team_leader: "Alice",
    members: ["Alice"],
    password: "$2a$10$hashed",
    route: [{ island_id: "i1", question_id: "q1" }],
    email: "a@test.com",
    progress: 0,
    stage: "awaiting_code",
    status: "active",
    wrong_attempts: 0,
    lock_until: null,
    notice: null,
    last_correct_at: null,
  };
  const island = {
    id: "i1",
    correct_code: "CODE1",
    clue_statement: "Clue 1",
    is_common_room: false,
    clue_images: ["https://cdn.test/i1.jpg"],
    is_terminal: false,
  };
  const question = {
    id: "q1",
    question_statement: "Q1",
    question_answer: "ANS1",
    domain: "test",
  };

  function setup(config = {}) {
    const team = { ...baseTeam, ...config };
    mockSupabase.__testing.setTable("teams", [team]);
    mockSupabase.__testing.setTable("islands", [island]);
    mockSupabase.__testing.setTable("questions", [question]);
    mockSupabase.__testing.setTable("announcements", []);
    mockSupabase.__testing.setTable("event_config", [
      {
        id: 1,
        started_at: new Date(Date.now() - 1000).toISOString(),
        duration_minutes: 120,
        ended_at: null,
      },
    ]);
    return team;
  }

  test("wrong code returns locked, increments wrong_attempts, sets lock_until +7min", async () => {
    setup();
    const before = Date.now();
    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "WRONG" });
    const after = Date.now();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.reason).toBe("wrong_code");
    expect(res.body.lock_until).toBeDefined();
    const lockUntil = new Date(res.body.lock_until).getTime();
    // 7 minutes, with a minute of slack either side for slow CI.
    expect(lockUntil).toBeGreaterThanOrEqual(before + 6 * 60 * 1000);
    expect(lockUntil).toBeLessThanOrEqual(after + 8 * 60 * 1000);

    const team = mockSupabase.__testing.getTable("teams").find((t) => t.id === "team-a");
    expect(team.status).toBe("locked");
    expect(team.wrong_attempts).toBe(1);
    expect(new Date(team.lock_until).getTime()).toBe(lockUntil);
  });

  test("lock expires correctly (auto-unlock on state fetch after lock_until passes)", async () => {
    setup({
      status: "locked",
      lock_until: new Date(Date.now() - 1000).toISOString(),
      wrong_attempts: 1,
    });
    const res = await request(app)
      .get("/api/team/state")
      .set("Authorization", `Bearer ${signToken("team-a")}`);
    expect(res.status).toBe(200);
    expect(res.body.stage).not.toBe("locked");
    expect(res.body.stage).toBe("awaiting_code");

    const team = mockSupabase.__testing.getTable("teams").find((t) => t.id === "team-a");
    expect(team.status).toBe("active");
    expect(team.lock_until).toBeNull();
  });

  test("correct code on non-final stop changes stage exactly once (awaiting_code -> awaiting_puzzle)", async () => {
    setup();
    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "CODE1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.state.stage).toBe("awaiting_puzzle");
    expect(res.body.state.team.progress).toBe(0);
    expect(res.body.state.team.status).toBe("active");

    const team = mockSupabase.__testing.getTable("teams").find((t) => t.id === "team-a");
    expect(team.stage).toBe("awaiting_puzzle");
    expect(team.progress).toBe(0);
  });

  test("correct code on final stop (question_id null) finishes team", async () => {
    const finalIsland = {
      id: "i-final",
      correct_code: "FINAL",
      clue_statement: "Final",
      is_common_room: true,
    };
    setup({
      // A real route is five stops; the common room at index 4 ends the hunt.
      route: [
        { island_id: "i1", question_id: "q1" },
        { island_id: "i1", question_id: "q1" },
        { island_id: "i1", question_id: "q1" },
        { island_id: "i1", question_id: "q1" },
        { island_id: "i-final", question_id: null },
      ],
      progress: 4,
      stage: "awaiting_code",
    });
    // After setup, which reseeds the islands table.
    mockSupabase.__testing.setTable("islands", [island, finalIsland]);

    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "FINAL" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.state.stage).toBe("finished");
    expect(res.body.state.team.progress).toBe(5);
    expect(res.body.state.team.status).toBe("finished");
  });

  test("a locked team's response carries state, not just lock_until", async () => {
    // Without `state` the client patches stage:"locked" onto whatever it had
    // cached, which may already be stale.
    setup({
      status: "locked",
      lock_until: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "CODE1" });

    expect(res.status).toBe(200);
    expect(res.body.reason).toBe("locked");
    expect(res.body.lock_until).toBeTruthy();
    expect(res.body.state).toBeDefined();
    expect(res.body.state.team.id).toBe("team-a");
  });

  test("finished team submitting a code reports finished, not 404", async () => {
    setup({ progress: 5, stage: "awaiting_code", status: "finished" });
    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "CODE1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.reason).toBe("finished");
    expect(res.body.state.stage).toBe("finished");
    expect(res.body.state.team.progress).toBe(5);
  });

  test("unknown team still gets 404", async () => {
    setup();
    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("no-such-team")}`)
      .send({ enteredCode: "CODE1" });
    expect(res.status).toBe(404);
  });

  test("wrong code when already locked returns locked (no double lock)", async () => {
    const lockUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    setup({ status: "locked", lock_until: lockUntil, wrong_attempts: 2 });
    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "WRONG" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.reason).toBe("locked");
    expect(res.body.lock_until).toBe(lockUntil);
  });

  test("verify-code with wrong stage returns wrong_stage", async () => {
    setup({ stage: "awaiting_puzzle" });
    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "CODE1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.reason).toBe("wrong_stage");
  });

  test("enteredCode validation", async () => {
    setup();
    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("enteredCode required");
  });

  /**
   * Found in live data: a team sat at status:"locked" while already on the
   * puzzle screen, with an expired lock_until.
   *
   * A wrong code stamps status:"locked" + lock_until. The expiry is only
   * cleared on a state READ, so a team that submits the right code before any
   * read happens used to advance with "locked" carried forward.
   *
   * This test installs the get_team_state RPC on purpose. Production runs the
   * RPC path, and its stale-lock branch only fires when the RPC reports
   * stage:"locked" -- which it does not once the team has moved to the puzzle.
   * The sequential fallback DOES self-heal, so without an RPC registered this
   * test passes whether or not the bug is fixed. That divergence is exactly
   * how the bug reached live data in the first place.
   */
  test("a correct code clears an expired lock instead of carrying it forward", async () => {
    setup({
      status: "locked",
      lock_until: new Date(Date.now() - 60 * 1000).toISOString(), // expired
      wrong_attempts: 1,
    });

    // Mirrors the real DB function: reports the row as it now stands, and has
    // no opinion about stale locks.
    mockSupabase.__testing.setRpc("get_team_state", () => {
      const row = mockSupabase.__testing.getTable("teams")[0];
      return {
        data: { team: { ...row }, stage: row.stage, question: "Q1" },
        error: null,
      };
    });

    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "CODE1" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const row = mockSupabase.__testing.getTable("teams")[0];
    expect(row.stage).toBe("awaiting_puzzle");
    expect(row.status).toBe("active");
    expect(row.lock_until).toBeNull();
  });

  test("an unexpired lock still blocks, and nothing is cleared", async () => {
    const lockUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    setup({ status: "locked", lock_until: lockUntil, wrong_attempts: 1 });

    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "CODE1" });

    expect(res.body.success).toBe(false);
    expect(res.body.reason).toBe("locked");

    const row = mockSupabase.__testing.getTable("teams")[0];
    expect(row.status).toBe("locked");
    expect(row.stage).toBe("awaiting_code");
  });
});
