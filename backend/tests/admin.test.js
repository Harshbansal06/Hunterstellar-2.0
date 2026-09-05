const request = require("supertest");
const app = require("../app");
const { signToken } = require("./helpers/tokens");

jest.mock("../db/supabaseClient", () =>
  require("./helpers/mockSupabase").createMockSupabase(),
);
jest.mock("../utils/email", () => ({ sendWelcomeEmail: jest.fn() }));

const mockSupabase = require("../db/supabaseClient");

describe("Admin routes", () => {
  beforeEach(() => {
    mockSupabase.__testing.reset();
  });

  const teamA = {
    id: "team-a",
    team_name: "Team Alpha",
    team_leader: "Alice",
    members: ["Alice"],
    password: "$2a$10$hashed",
    route: [{ island_id: "i1", question_id: "q1" }],
    email: "a@test.com",
    progress: 1,
    stage: "awaiting_puzzle",
    status: "active",
    wrong_attempts: 0,
    lock_until: null,
    notice: null,
    last_correct_at: new Date().toISOString(),
  };
  const teamB = {
    id: "team-b",
    team_name: "Team Beta",
    team_leader: "Bob",
    members: ["Bob"],
    password: "$2a$10$hashed",
    route: [{ island_id: "i2", question_id: "q2" }],
    email: "b@test.com",
    progress: 0,
    stage: "awaiting_code",
    status: "locked",
    wrong_attempts: 2,
    lock_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    notice: null,
    last_correct_at: null,
  };
  const island1 = {
    id: "i1",
    correct_code: "CODE1",
    clue_statement: "Clue 1",
    is_common_room: false,
  };
  const island2 = {
    id: "i2",
    correct_code: "CODE2",
    clue_statement: "Clue 2",
    is_common_room: false,
  };
  const question1 = {
    id: "q1",
    question_statement: "Q1",
    question_answer: "ANS1",
    domain: "test",
  };
  const question2 = {
    id: "q2",
    question_statement: "Q2",
    question_answer: "ANS2",
    domain: "test",
  };

  beforeEach(() => {
    mockSupabase.__testing.setTable("teams", [teamA, teamB]);
    mockSupabase.__testing.setTable("islands", [island1, island2]);
    mockSupabase.__testing.setTable("questions", [question1, question2]);
    mockSupabase.__testing.setTable("announcements", []);
    mockSupabase.__testing.setTable("event_config", [
      { id: 1, started_at: null, duration_minutes: 120, ended_at: null },
    ]);
  });

  test("admin secret works (requireAdmin passes)", async () => {
    const res = await request(app)
      .post("/api/admin/start")
      .set("x-admin-secret", process.env.ADMIN_SECRET);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.started_at).toBeDefined();
  });

  test("admin login (normal team JWT) rejected on admin routes", async () => {
    const res = await request(app)
      .get("/api/admin/teams")
      .set("Authorization", `Bearer ${signToken("team-a")}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  test("no admin secret rejected", async () => {
    const res = await request(app).get("/api/admin/teams");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  test("wrong admin secret rejected", async () => {
    const res = await request(app)
      .get("/api/admin/teams")
      .set("x-admin-secret", "wrong-secret");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  test("admin can list all teams", async () => {
    const res = await request(app)
      .get("/api/admin/teams")
      .set("x-admin-secret", process.env.ADMIN_SECRET);
    expect(res.status).toBe(200);
    expect(res.body.teams).toHaveLength(2);
    expect(res.body.teams[0].team_name).toBe("Team Alpha");
    expect(res.body.teams[1].team_name).toBe("Team Beta");
    expect(res.body.teams[0]).toHaveProperty("progress");
    expect(res.body.teams[0]).toHaveProperty("status");
    expect(res.body.teams[0]).toHaveProperty("last_correct_at");
  });

  test("admin can unlock team", async () => {
    const res = await request(app)
      .post("/api/admin/unlock-team")
      .set("x-admin-secret", process.env.ADMIN_SECRET)
      .send({ team_id: "team-b" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const team = mockSupabase.__testing.getTable("teams").find((t) => t.id === "team-b");
    expect(team.status).toBe("active");
    expect(team.lock_until).toBeNull();
  });

  test("admin unlock requires team_id", async () => {
    const res = await request(app)
      .post("/api/admin/unlock-team")
      .set("x-admin-secret", process.env.ADMIN_SECRET)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("team_id required");
  });

  test("admin can send message to team", async () => {
    const res = await request(app)
      .post("/api/admin/send-message")
      .set("x-admin-secret", process.env.ADMIN_SECRET)
      .send({ team_id: "team-a", message: "Good luck!" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Good luck!");

    const team = mockSupabase.__testing.getTable("teams").find((t) => t.id === "team-a");
    expect(team.notice).toBe("Good luck!");
  });

  test("admin send-message requires team_id and message", async () => {
    const res1 = await request(app)
      .post("/api/admin/send-message")
      .set("x-admin-secret", process.env.ADMIN_SECRET)
      .send({ message: "Hi" });
    expect(res1.status).toBe(400);
    expect(res1.body.error).toBe("team_id required");

    const res2 = await request(app)
      .post("/api/admin/send-message")
      .set("x-admin-secret", process.env.ADMIN_SECRET)
      .send({ team_id: "team-a", message: "" });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toBe("message required");
  });

  test("admin can announce to all teams", async () => {
    const res = await request(app)
      .post("/api/admin/announce")
      .set("x-admin-secret", process.env.ADMIN_SECRET)
      .send({ message: "Event starting in 5 min!" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const announcements = mockSupabase.__testing.getTable("announcements");
    expect(announcements.length).toBe(1);
    expect(announcements[0].message).toBe("Event starting in 5 min!");
  });

  test("admin announce requires message", async () => {
    const res = await request(app)
      .post("/api/admin/announce")
      .set("x-admin-secret", process.env.ADMIN_SECRET)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("message required");
  });

  test("admin can end event", async () => {
    const res = await request(app)
      .post("/api/admin/end")
      .set("x-admin-secret", process.env.ADMIN_SECRET);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.ended_at).toBeDefined();

    const config = mockSupabase.__testing
      .getTable("event_config")
      .find((c) => c.id === 1);
    expect(config.ended_at).toBe(res.body.ended_at);
  });
});
