const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const { signToken } = require("./helpers/tokens");
const { invalidateTeamStateCache } = require("../utils/teamState");

jest.mock("../db/supabaseClient", () =>
  require("./helpers/mockSupabase").createMockSupabase(),
);
jest.mock("../utils/email", () => ({ sendWelcomeEmail: jest.fn() }));

const mockSupabase = require("../db/supabaseClient");

/**
 * One active session per team.
 *
 * The login endpoint is rate limited to 5 per minute per IP and the limiter is
 * module state shared by every test in this file, so real logins are spent
 * sparingly here -- only where the test is actually about issuing a session.
 * Everything else mints tokens directly.
 */

// bcrypt hash of "hunter2", generated once so the tests do not pay for a hash.
const PASSWORD = "hunter2";
const PASSWORD_HASH = "$2b$10$M.VJWJ54qm1zXwSGpj5jgOCnjAbiD12XTUQaRlawC6f4XzALuBdrG";

function team(overrides = {}) {
  return {
    id: "team-a",
    team_name: "Team Alpha",
    team_leader: "Alice",
    members: ["Alice", "Bob"],
    password: PASSWORD_HASH,
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
    session_token: null,
    ...overrides,
  };
}

function seed(teamRow) {
  mockSupabase.__testing.setTable("teams", [teamRow]);
  mockSupabase.__testing.setTable("islands", [
    { id: "i1", correct_code: "CODE1", clue_statement: "Clue 1", is_common_room: false },
    { id: "i2", correct_code: "CODE2", clue_statement: "Clue 2", is_common_room: true },
  ]);
  mockSupabase.__testing.setTable("questions", [
    { id: "q1", question_statement: "Q1?", question_answer: "ANSWER1", domain: "d1" },
  ]);
  mockSupabase.__testing.setTable("event_config", [
    {
      id: 1,
      started_at: new Date(Date.now() - 60000).toISOString(),
      ended_at: null,
      duration_minutes: 180,
    },
  ]);
  mockSupabase.__testing.setTable("announcements", []);
}

function storedSession() {
  return mockSupabase.__testing.getTable("teams")[0].session_token;
}

describe("Single active session per team", () => {
  beforeEach(() => {
    mockSupabase.__testing.reset();
    // The state cache has a 1s TTL keyed by team id, and these tests run well
    // inside that window -- without this, one test reads the previous test's
    // team state.
    invalidateTeamStateCache("team-a");
  });

  test("login records a session_token and puts the same id in the JWT", async () => {
    seed(team());

    const res = await request(app)
      .post("/api/login")
      .send({ team_name: "Team Alpha", password: PASSWORD });

    expect(res.status).toBe(200);

    const stored = storedSession();
    expect(stored).toBeTruthy();

    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(payload.sid).toBe(stored);
    expect(payload.userId).toBe("team-a");
  });

  test("a second login evicts the first device from the write endpoints", async () => {
    seed(team());

    const first = await request(app)
      .post("/api/login")
      .send({ team_name: "Team Alpha", password: PASSWORD });
    const firstToken = first.body.token;

    const second = await request(app)
      .post("/api/login")
      .send({ team_name: "Team Alpha", password: PASSWORD });
    const secondToken = second.body.token;

    expect(firstToken).not.toBe(secondToken);
    expect(storedSession()).toBe(jwt.verify(secondToken, process.env.JWT_SECRET).sid);

    // The superseded phone is refused...
    const evicted = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${firstToken}`)
      .send({ enteredCode: "CODE1" });

    expect(evicted.status).toBe(401);
    expect(evicted.body.reason).toBe("session_replaced");

    // ...and crucially, being refused did not advance the team.
    expect(mockSupabase.__testing.getTable("teams")[0].stage).toBe("awaiting_code");
    expect(mockSupabase.__testing.getTable("teams")[0].progress).toBe(0);

    // The current phone is unaffected.
    const current = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${secondToken}`)
      .send({ enteredCode: "CODE1" });

    expect(current.status).toBe(200);
    expect(current.body.success).toBe(true);
  });

  test("an evicted device cannot burn an attempt with a wrong code", async () => {
    seed(team({ session_token: "current-session" }));

    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a", "stale-session")}`)
      .send({ enteredCode: "NOPE" });

    expect(res.status).toBe(401);
    const row = mockSupabase.__testing.getTable("teams")[0];
    expect(row.wrong_attempts).toBe(0);
    expect(row.status).toBe("active");
    expect(row.lock_until).toBeNull();
  });

  test("verify-answer rejects a superseded session too", async () => {
    seed(team({ stage: "awaiting_puzzle", session_token: "current-session" }));

    const res = await request(app)
      .post("/api/team/verify-answer")
      .set("Authorization", `Bearer ${signToken("team-a", "stale-session")}`)
      .send({ enteredAns: "ANSWER1" });

    expect(res.status).toBe(401);
    expect(res.body.reason).toBe("session_replaced");
    expect(mockSupabase.__testing.getTable("teams")[0].progress).toBe(0);
  });

  test("a null session_token is permissive, so pre-existing teams still play", async () => {
    // This is the fallback that keeps a team registered before this feature
    // shipped from being locked out of a live event.
    seed(team({ session_token: null }));

    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "CODE1" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("a token with no sid is refused once the team has a session", async () => {
    // Otherwise the whole rule could be sidestepped by replaying an older token.
    seed(team({ session_token: "current-session" }));

    const res = await request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredCode: "CODE1" });

    expect(res.status).toBe(401);
    expect(res.body.reason).toBe("session_replaced");
  });

  test("a superseded device can still READ its state", async () => {
    // Documents the writes-only boundary as a decision, not an oversight: the
    // check is deliberately absent from /team/state so the poll costs no extra
    // database read. The evicted phone can look, but cannot act.
    seed(team({ session_token: "current-session" }));

    const res = await request(app)
      .get("/api/team/state")
      .set("Authorization", `Bearer ${signToken("team-a", "stale-session")}`);

    expect(res.status).toBe(200);
    expect(res.body.stage).toBe("awaiting_code");
  });
});
