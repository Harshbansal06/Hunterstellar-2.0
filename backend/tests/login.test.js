const request = require("supertest");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

/**
 * Every limiter this module exports has to be stubbed, not just the ones this
 * file exercises: authRoutes destructures `loginIpLimiter` and hands it to
 * `router.post`, so omitting it passes `undefined` as a handler and Express
 * throws "argument handler must be a function" at import time. That took the
 * whole suite down before a single test ran, which is why it went unnoticed.
 */
jest.mock("../middleware/rateLimit", () => ({
  loginLimiter: (req, res, next) => next(),
  loginIpLimiter: (req, res, next) => next(),
  verifyLimiter: (req, res, next) => next(),
  adminLimiter: (req, res, next) => next(),
}));

const app = require("../app");
const { invalidateAllTeamStateCache } = require("../utils/teamState");

jest.mock("../db/supabaseClient", () =>
  require("./helpers/mockSupabase").createMockSupabase(),
);
jest.mock("../utils/email", () => ({ sendWelcomeEmail: jest.fn() }));

const mockSupabase = require("../db/supabaseClient");
const origFrom = mockSupabase.from.bind(mockSupabase);

const PASSWORD = "testpass";
let hashedPassword;

const baseTeam = {
  id: "team-1",
  team_name: "Celestials",
  team_leader: "Alice",
  members: ["Alice", "Bob"],
  password: "",
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
};

function rpcState(overrides = {}) {
  return {
    team: {
      id: baseTeam.id,
      team_name: baseTeam.team_name,
      team_leader: baseTeam.team_leader,
      members: baseTeam.members,
      email: baseTeam.email,
      progress: baseTeam.progress,
      stage: baseTeam.stage,
      status: baseTeam.status,
      wrong_attempts: baseTeam.wrong_attempts,
      lock_until: baseTeam.lock_until,
      notice: baseTeam.notice,
      last_correct_at: baseTeam.last_correct_at,
    },
    stage: baseTeam.stage,
    notice: null,
    announcement: null,
    ...overrides,
  };
}

beforeAll(async () => {
  hashedPassword = await bcrypt.hash(PASSWORD, 10);
});

beforeEach(() => {
  mockSupabase.__testing.reset();
  mockSupabase.from = origFrom;
  invalidateAllTeamStateCache();

  const team = { ...baseTeam, password: hashedPassword };
  mockSupabase.__testing.setTable("teams", [team]);
  mockSupabase.__testing.setTable("islands", []);
  mockSupabase.__testing.setTable("questions", []);
  mockSupabase.__testing.setTable("announcements", []);
  mockSupabase.__testing.setRpc("get_team_state", () => ({
    data: rpcState(),
    error: null,
  }));
});

describe("POST /api/login", () => {
  test("400 when team_name is missing", async () => {
    const res = await request(app).post("/api/login").send({ password: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/team_name and password/i);
  });

  test("400 when password is missing", async () => {
    const res = await request(app).post("/api/login").send({ team_name: "Celestials" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/team_name and password/i);
  });

  test("400 when body is empty", async () => {
    const res = await request(app).post("/api/login").send({});
    expect(res.status).toBe(400);
  });

  test("404 when team does not exist", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ team_name: "Nonexistent", password: PASSWORD });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/team not found/i);
  });

  test("401 when password is wrong", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ team_name: "Celestials", password: "wrongpassword" });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid password/i);
  });

  test("200 with valid credentials, returns user and signed JWT", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ team_name: "Celestials", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.team_name).toBe("Celestials");

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.userId).toBe("team-1");
    expect(decoded.sid).toBeDefined();
    expect(typeof decoded.sid).toBe("string");
  });

  test("JWT has 3-hour expiry", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ team_name: "Celestials", password: PASSWORD });

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    const ttlMs = decoded.exp * 1000 - Date.now();
    expect(ttlMs).toBeGreaterThan(2.5 * 60 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(3 * 60 * 60 * 1000);
  });

  test("session_token is written to the team row", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ team_name: "Celestials", password: PASSWORD });

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    const rows = mockSupabase.__testing.getTable("teams");
    expect(rows[0].session_token).toBe(decoded.sid);
  });

  test("user object excludes password field", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ team_name: "Celestials", password: PASSWORD });

    expect(res.body.user).toBeDefined();
    expect(res.body.user.password).toBeUndefined();
  });

  test("404 when database lookup fails", async () => {
    mockSupabase.__testing.setTable("teams", []);

    const res = await request(app)
      .post("/api/login")
      .send({ team_name: "Celestials", password: PASSWORD });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/team not found/i);
  });

  test("500 when session update fails", async () => {
    const failBuilder = {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      single: () => Promise.resolve({ data: null, error: { message: "update failed" } }),
      then: (resolve, reject) =>
        Promise.resolve({ data: null, error: { message: "update failed" } }).then(
          resolve,
          reject,
        ),
    };

    let updateCallCount = 0;
    mockSupabase.from = function (table) {
      const builder = origFrom(table);
      if (table === "teams") {
        const origUpdate = builder.update;
        builder.update = function (data) {
          updateCallCount++;
          if (updateCallCount >= 1) {
            return failBuilder;
          }
          return origUpdate.call(builder, data);
        };
      }
      return builder;
    };

    const res = await request(app)
      .post("/api/login")
      .send({ team_name: "Celestials", password: PASSWORD });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/could not start session/i);
  });

  test("state from getTeamStateForUser is returned", async () => {
    const puzzleState = rpcState({ stage: "awaiting_puzzle" });
    puzzleState.team = { ...puzzleState.team, stage: "awaiting_puzzle" };
    mockSupabase.__testing.setRpc("get_team_state", () => ({
      data: puzzleState,
      error: null,
    }));
    mockSupabase.__testing.setTable("teams", [{ ...baseTeam, password: hashedPassword }]);

    const res = await request(app)
      .post("/api/login")
      .send({ team_name: "Celestials", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.stage).toBe("awaiting_puzzle");
  });

  test("team password hash is never leaked in response", async () => {
    const res = await request(app)
      .post("/api/login")
      .send({ team_name: "Celestials", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain(hashedPassword);
  });
});
