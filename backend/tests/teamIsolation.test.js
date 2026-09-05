const request = require("supertest");
const app = require("../app");
const { signToken } = require("./helpers/tokens");

jest.mock("../db/supabaseClient", () =>
  require("./helpers/mockSupabase").createMockSupabase(),
);
jest.mock("../utils/email", () => ({ sendWelcomeEmail: jest.fn() }));

const mockSupabase = require("../db/supabaseClient");

describe("Team isolation (Team A cannot access Team B)", () => {
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
    progress: 0,
    stage: "awaiting_code",
    status: "active",
    wrong_attempts: 0,
    lock_until: null,
    notice: null,
    last_correct_at: null,
  };
  const teamB = {
    id: "team-b",
    team_name: "Team Beta",
    team_leader: "Bob",
    members: ["Bob"],
    password: "$2a$10$hashed",
    // Three stops so progress 2 lands on a real one; the stop under test is last.
    route: [
      { island_id: "i1", question_id: "q1" },
      { island_id: "i1", question_id: "q1" },
      { island_id: "i2", question_id: "q2" },
    ],
    email: "b@test.com",
    progress: 2,
    stage: "awaiting_puzzle",
    status: "active",
    wrong_attempts: 0,
    lock_until: null,
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
      {
        id: 1,
        started_at: new Date(Date.now() - 1000).toISOString(),
        duration_minutes: 120,
        ended_at: null,
      },
    ]);
  });

  test("Team A token returns Team A state, not Team B", async () => {
    const res = await request(app)
      .get("/api/team/state")
      .set("Authorization", `Bearer ${signToken("team-a")}`);
    expect(res.status).toBe(200);
    expect(res.body.team.id).toBe("team-a");
    expect(res.body.team.team_name).toBe("Team Alpha");
    expect(res.body.team.progress).toBe(0);
    expect(res.body.stage).toBe("awaiting_code");
  });

  test("Team B token returns Team B state, not Team A", async () => {
    const res = await request(app)
      .get("/api/team/state")
      .set("Authorization", `Bearer ${signToken("team-b")}`);
    expect(res.status).toBe(200);
    expect(res.body.team.id).toBe("team-b");
    expect(res.body.team.team_name).toBe("Team Beta");
    expect(res.body.team.progress).toBe(2);
    expect(res.body.stage).toBe("awaiting_puzzle");
  });

  test("Team A verify-code operates on Team A only", async () => {
    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "CODE1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.state.team.id).toBe("team-a");
    expect(res.body.state.team.progress).toBe(0);
  });

  test("Team B verify-code operates on Team B only", async () => {
    // Team B is seeded mid-puzzle; verifying a code needs it awaiting one.
    mockSupabase.__testing.setTable("teams", [
      teamA,
      { ...teamB, stage: "awaiting_code" },
    ]);

    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-b")}`)
      .send({ enteredCode: "CODE2" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.state.team.id).toBe("team-b");
    expect(res.body.state.team.progress).toBe(2);
  });

  test("Team A verify-answer operates on Team A only", async () => {
    mockSupabase.__testing.setTable("teams", [
      {
        ...teamA,
        progress: 0,
        stage: "awaiting_puzzle",
      },
    ]);

    const res = await request(app)
      .post("/api/team/verify-answer")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredAns: "ANS1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.state.team.id).toBe("team-a");
    expect(res.body.state.team.progress).toBe(1);
  });

  test("passing a different team_id in body is ignored (routes use token identity)", async () => {
    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "CODE1", teamId: "team-b" });
    expect(res.status).toBe(200);
    expect(res.body.state.team.id).toBe("team-a");
  });
});
