const request = require("supertest");
const app = require("../app");
const { signToken } = require("./helpers/tokens");

jest.mock("../db/supabaseClient", () =>
  require("./helpers/mockSupabase").createMockSupabase(),
);
jest.mock("../utils/email", () => ({ sendWelcomeEmail: jest.fn() }));

const mockSupabase = require("../db/supabaseClient");

describe("Event status middleware (requireEventActive)", () => {
  beforeEach(() => {
    mockSupabase.__testing.reset();
  });

  const team = {
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
  };
  const question = {
    id: "q1",
    question_statement: "Q1",
    question_answer: "ANS1",
    domain: "test",
  };

  function setupBase() {
    mockSupabase.__testing.setTable("teams", [team]);
    mockSupabase.__testing.setTable("islands", [island]);
    mockSupabase.__testing.setTable("questions", [question]);
    mockSupabase.__testing.setTable("announcements", []);
  }

  test("cannot verify before event starts (started_at in future)", async () => {
    setupBase();
    const futureStart = new Date(Date.now() + 3600000).toISOString();
    mockSupabase.__testing.setTable("event_config", [
      { id: 1, started_at: futureStart, duration_minutes: 120, ended_at: null },
    ]);

    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "CODE1" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Event has not started");
  });

  test("cannot verify after event ends (ended_at in past)", async () => {
    setupBase();
    const pastEnd = new Date(Date.now() - 3600000).toISOString();
    mockSupabase.__testing.setTable("event_config", [
      {
        id: 1,
        started_at: new Date(Date.now() - 7200000).toISOString(),
        duration_minutes: 120,
        ended_at: pastEnd,
      },
    ]);

    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "CODE1" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Event has ended");
  });

  test("cannot verify after duration expires (no ended_at but started_at + duration passed)", async () => {
    setupBase();
    const oldStart = new Date(Date.now() - 7200000).toISOString();
    mockSupabase.__testing.setTable("event_config", [
      { id: 1, started_at: oldStart, duration_minutes: 60, ended_at: null },
    ]);

    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "CODE1" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Event has ended");
  });

  test("missing event config (started_at null) fails safely -> 'Event has not started'", async () => {
    setupBase();
    mockSupabase.__testing.setTable("event_config", [
      { id: 1, started_at: null, duration_minutes: 120, ended_at: null },
    ]);

    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "CODE1" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Event has not started");
  });

  test("event config query error returns 500", async () => {
    setupBase();
    mockSupabase.__testing.setTable("event_config", []);

    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "CODE1" });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  test("GET /api/event returns 404 when config missing", async () => {
    mockSupabase.__testing.setTable("event_config", []);

    const res = await request(app).get("/api/event");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Event config not found");
  });

  test("GET /api/event returns config when present", async () => {
    const config = {
      id: 1,
      started_at: new Date().toISOString(),
      duration_minutes: 120,
      ended_at: null,
    };
    mockSupabase.__testing.setTable("event_config", [config]);

    const res = await request(app).get("/api/event");
    expect(res.status).toBe(200);
    expect(res.body.started_at).toBe(config.started_at);
    expect(res.body.duration_minutes).toBe(120);
  });
});
