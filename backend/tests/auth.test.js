const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const { signToken, signExpiredToken, signInvalidToken } = require("./helpers/tokens");

jest.mock("../db/supabaseClient", () =>
  require("./helpers/mockSupabase").createMockSupabase(),
);
jest.mock("../utils/email", () => ({ sendWelcomeEmail: jest.fn() }));

const mockSupabase = require("../db/supabaseClient");

describe("Auth middleware", () => {
  beforeEach(() => {
    mockSupabase.__testing.reset();
  });

  test("invalid JWT rejected", async () => {
    const res = await request(app)
      .get("/api/team/state")
      .set("Authorization", `Bearer ${signInvalidToken()}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid or expired session");
  });

  test("expired JWT rejected", async () => {
    const res = await request(app)
      .get("/api/team/state")
      .set("Authorization", `Bearer ${signExpiredToken("team-a")}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid or expired session");
  });

  test("valid JWT passes auth", async () => {
    const team = {
      id: "team-a",
      team_name: "Team Alpha",
      team_leader: "Alice",
      members: ["Alice", "Bob"],
      password: "$2a$10$hashed",
      route: [
        { island_id: "i1", question_id: "q1" },
        { island_id: "i2", question_id: null },
      ],
      email: "a@test.com",
      progress: 0,
      stage: "awaiting_code",
      status: "active",
      wrong_attempts: 0,
      lock_until: null,
      notice: null,
      last_correct_at: null,
    };
    mockSupabase.__testing.setTable("teams", [team]);
    mockSupabase.__testing.setTable("islands", [
      {
        id: "i1",
        correct_code: "CODE1",
        clue_statement: "Clue 1",
        is_common_room: false,
      },
    ]);
    mockSupabase.__testing.setTable("questions", [
      { id: "q1", question_statement: "Q1", question_answer: "ANS1", domain: "test" },
    ]);
    mockSupabase.__testing.setTable("announcements", []);

    const res = await request(app)
      .get("/api/team/state")
      .set("Authorization", `Bearer ${signToken("team-a")}`);
    expect(res.status).toBe(200);
    expect(res.body.team.team_name).toBe("Team Alpha");
  });

  describe("login throttling is keyed by callsign, not by IP", () => {
    const PASSWORD = "hunter2";
    // bcrypt hash of the above.
    const HASH = "$2b$10$M.VJWJ54qm1zXwSGpj5jgOCnjAbiD12XTUQaRlawC6f4XzALuBdrG";

    function seedTeams(names) {
      mockSupabase.__testing.setTable(
        "teams",
        names.map((team_name, i) => ({
          id: "t" + i,
          team_name,
          team_leader: "L",
          members: ["L"],
          password: HASH,
          route: [{ island_id: "i1", question_id: "q1" }],
          email: "a@test.com",
          progress: 0,
          stage: "awaiting_code",
          status: "active",
          wrong_attempts: 0,
          lock_until: null,
          notice: null,
          last_correct_at: null,
          session_token: null,
        })),
      );
      mockSupabase.__testing.setTable("islands", [
        { id: "i1", correct_code: "C1", clue_statement: "c", is_terminal: false },
      ]);
      mockSupabase.__testing.setTable("questions", [
        { id: "q1", question_statement: "q", question_answer: "a", domain: "1" },
      ]);
      mockSupabase.__testing.setTable("announcements", []);
      mockSupabase.__testing.setTable("event_config", [
        {
          id: 1,
          started_at: new Date(Date.now() - 1000).toISOString(),
          duration_minutes: 120,
          ended_at: null,
        },
      ]);
    }

    const login = (team_name, password = PASSWORD) =>
      request(app).post("/api/login").send({ team_name, password });

    test("brute-forcing ONE callsign is cut off after 5 attempts", async () => {
      seedTeams(["Rust Runners"]);

      const results = [];
      for (let i = 0; i < 8; i++) {
        results.push(await login("Rust Runners", "wrong-password"));
      }

      // 5 reach the password check and fail; the rest never get that far.
      expect(results.filter((r) => r.status === 401)).toHaveLength(5);
      expect(results.filter((r) => r.status === 429)).toHaveLength(3);
    });

    test("a throttled callsign does not block a different crew", async () => {
      // The property the old per-IP rule destroyed: these two are on the same
      // address, and one of them being attacked must not lock the other out.
      seedTeams(["Victim Crew", "Innocent Crew"]);

      for (let i = 0; i < 8; i++) await login("Victim Crew", "wrong-password");

      const other = await login("Innocent Crew");
      expect(other.status).toBe(200);
      expect(other.body.token).toBeTruthy();
    });

    test("case and padding cannot buy extra attempts", async () => {
      seedTeams(["Rust Runners"]);

      const spellings = [
        "Rust Runners",
        "rust runners",
        "RUST RUNNERS",
        " Rust Runners ",
        "RuSt RuNnErS",
        "  rust runners",
      ];
      const results = [];
      for (const name of spellings) results.push(await login(name, "wrong-password"));

      // All six spellings share one budget, so the last one is refused.
      expect(results.filter((r) => r.status === 429).length).toBeGreaterThan(0);
    });

    test("a body with no callsign is still counted, not waved through", async () => {
      seedTeams(["Rust Runners"]);

      const results = [];
      for (let i = 0; i < 8; i++) {
        results.push(await request(app).post("/api/login").send({ password: "x" }));
      }

      // Falls back to an IP key rather than becoming un-keyed and unlimited.
      expect(results.filter((r) => r.status === 429).length).toBeGreaterThan(0);
    });
  });
});
