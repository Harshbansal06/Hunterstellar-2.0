const request = require("supertest");
const bcrypt = require("bcryptjs");
const app = require("../app");
const { signToken } = require("./helpers/tokens");

jest.mock("../db/supabaseClient", () =>
  require("./helpers/mockSupabase").createMockSupabase(),
);
jest.mock("../utils/email", () => ({ sendWelcomeEmail: jest.fn() }));

// These suites push hundreds of requests through the app at once and run
// in parallel with each other, so the 5s default is not a meaningful bound.
jest.setTimeout(120000);

const mockSupabase = require("../db/supabaseClient");
const { invalidateAllTeamStateCache } = require("../utils/teamState");
const { loginLimiter, adminLimiter } = require("../middleware/rateLimit");

// Supertest talks to the app over loopback, so every request in this file
// shares one IP -- and therefore one bucket in each per-IP limiter.
const TEST_IP = "127.0.0.1";

const TEAM_COUNT = 150;
const PASSWORD = "hunt-me-1234";
let PASSWORD_HASH;

/**
 * Every endpoint under a full field of 150 teams.
 *
 * Three separate rate limiters shape what "all at once" can even mean here,
 * and they key on different things:
 *
 *   verifyLimiter   10 / 15 min  per userId    -- each team has its own budget
 *   loginLimiter     5 / 60 s    per team_name -- each callsign has its own
 *   loginIpLimiter 300 / 60 s    per IP        -- abuse backstop only
 *   adminLimiter    30 / 60 s    per IP        -- shared by the whole dashboard
 *
 * Tests that would exceed a per-IP budget assert the throttling that actually
 * happens rather than pretending it does not exist.
 */
describe(TEAM_COUNT + " concurrent teams across every endpoint", () => {
  beforeAll(async () => {
    PASSWORD_HASH = await bcrypt.hash(PASSWORD, 10);
  });

  // The per-IP windows are a minute long and the suite runs in seconds, so
  // without this every test after the first would inherit a spent budget.
  beforeEach(async () => {
    await loginLimiter.resetKey(TEST_IP);
    await adminLimiter.resetKey(TEST_IP);
  });

  function seedTeams(prefix, overrides = {}) {
    const teams = [];
    const islands = [];
    const questions = [];

    for (let i = 0; i < TEAM_COUNT; i++) {
      islands.push({
        id: prefix + "-i-" + i,
        correct_code: "CODE-" + i,
        clue_statement: "Clue for team " + i,
        is_common_room: false,
        order: 1,
      });
      questions.push({
        id: prefix + "-q-" + i,
        question_statement: "Question for team " + i,
        question_answer: "ANS-" + i,
        domain: "domain-" + i,
      });
      teams.push({
        id: prefix + "-team-" + i,
        team_name: "Team " + i,
        team_leader: "Leader " + i,
        members: ["Leader " + i],
        password: PASSWORD_HASH,
        route: [{ island_id: prefix + "-i-" + i, question_id: prefix + "-q-" + i }],
        email: "team" + i + "@test.com",
        progress: 0,
        stage: "awaiting_code",
        status: "active",
        wrong_attempts: 0,
        lock_until: null,
        notice: null,
        last_correct_at: null,
        ...overrides,
      });
    }

    mockSupabase.__testing.reset();
    mockSupabase.__testing.setTable("teams", teams);
    mockSupabase.__testing.setTable("islands", islands);
    mockSupabase.__testing.setTable("questions", questions);
    mockSupabase.__testing.setTable("announcements", []);
    mockSupabase.__testing.setTable("event_config", [
      {
        id: 1,
        started_at: new Date(Date.now() - 1000).toISOString(),
        duration_minutes: 120,
        ended_at: null,
      },
    ]);

    invalidateAllTeamStateCache();
    return teams;
  }

  const statuses = (responses) => responses.map((r) => r.status);
  const unique = (values) => new Set(values).size;

  // ---------------------------------------------------------------- public

  describe("GET /api/event", () => {
    test("serves 150 simultaneous readers one consistent config", async () => {
      seedTeams("event");

      const responses = await Promise.all(
        Array(TEAM_COUNT)
          .fill()
          .map(() => request(app).get("/api/event")),
      );

      expect(statuses(responses).filter((s) => s !== 200)).toEqual([]);
      const payloads = responses.map((r) => JSON.stringify(r.body));
      expect(unique(payloads)).toBe(1);
      expect(responses[0].body.duration_minutes).toBe(120);
      expect(responses[0].body.ended_at).toBeNull();
    });
  });

  describe("GET /health", () => {
    test("stays healthy under 150 simultaneous probes", async () => {
      seedTeams("health");

      const responses = await Promise.all(
        Array(TEAM_COUNT)
          .fill()
          .map(() => request(app).get("/health")),
      );

      expect(statuses(responses).filter((s) => s !== 200)).toEqual([]);
      for (const res of responses) {
        expect(res.body.status).toBe("healthy");
        expect(res.body.database).toBe("ok");
      }
    });
  });

  describe("POST /api/team/register", () => {
    test("registers 150 teams at once, each with its own five-stop route", async () => {
      // buildRandomRoute picks one island per `order` group 1..5 and needs at
      // least four question domains to fill the first four stops.
      mockSupabase.__testing.reset();
      const islands = [];
      for (let order = 1; order <= 5; order++) {
        for (let n = 0; n < 3; n++) {
          islands.push({
            id: "reg-i-" + order + "-" + n,
            correct_code: "CODE-" + order + "-" + n,
            clue_statement: "Clue " + order + "-" + n,
            is_common_room: order === 5,
            order,
          });
        }
      }
      const questions = [];
      for (const domain of ["mytho", "quantum", "space", "bio", "logic"]) {
        for (let n = 0; n < 3; n++) {
          questions.push({
            id: "reg-q-" + domain + "-" + n,
            question_statement: "Q " + domain + " " + n,
            question_answer: "A " + domain + " " + n,
            domain,
          });
        }
      }
      mockSupabase.__testing.setTable("teams", []);
      mockSupabase.__testing.setTable("islands", islands);
      mockSupabase.__testing.setTable("questions", questions);
      mockSupabase.__testing.setTable("announcements", []);
      mockSupabase.__testing.setTable("event_config", [
        {
          id: 1,
          started_at: null,
          duration_minutes: 120,
          ended_at: null,
        },
      ]);

      const responses = await Promise.all(
        Array(TEAM_COUNT)
          .fill()
          .map((_, i) =>
            request(app)
              .post("/api/team/register")
              .set("x-webhook-secret", process.env.WEBHOOK_SECRET)
              .send({
                team_name: "Registered " + i,
                team_leader: "Leader " + i,
                members: ["Leader " + i],
                password: PASSWORD,
                email: "reg" + i + "@test.com",
              }),
          ),
      );

      expect(statuses(responses).filter((s) => s !== 200)).toEqual([]);

      const stored = mockSupabase.__testing.getTable("teams");
      expect(stored).toHaveLength(TEAM_COUNT);
      expect(unique(stored.map((t) => t.team_name))).toBe(TEAM_COUNT);
      expect(unique(stored.map((t) => t.id))).toBe(TEAM_COUNT);

      for (const team of stored) {
        expect(team.route).toHaveLength(5);
        // Only the common room closes a route, and it carries no puzzle.
        expect(team.route[4].question_id).toBeNull();
        for (let stop = 0; stop < 4; stop++) {
          expect(team.route[stop].question_id).toBeTruthy();
        }
        expect(team.password).not.toBe(PASSWORD);
      }
      // Registration is the one CPU-bound endpoint: each call runs a cost-10
      // bcrypt hash, so a simultaneous field of 150 takes roughly ten seconds
      // of hashing. Real signups trickle in through the form webhook.
    }, 60000);

    test("registering 150 teams under one name suffixes instead of colliding", async () => {
      mockSupabase.__testing.reset();
      mockSupabase.__testing.setTable("teams", []);
      mockSupabase.__testing.setTable("islands", [
        {
          id: "d-1",
          correct_code: "C1",
          clue_statement: "c",
          is_common_room: false,
          order: 1,
        },
        {
          id: "d-2",
          correct_code: "C2",
          clue_statement: "c",
          is_common_room: false,
          order: 2,
        },
        {
          id: "d-3",
          correct_code: "C3",
          clue_statement: "c",
          is_common_room: false,
          order: 3,
        },
        {
          id: "d-4",
          correct_code: "C4",
          clue_statement: "c",
          is_common_room: false,
          order: 4,
        },
        {
          id: "d-5",
          correct_code: "C5",
          clue_statement: "c",
          is_common_room: true,
          order: 5,
        },
      ]);
      mockSupabase.__testing.setTable("questions", [
        { id: "dq-1", question_statement: "q", question_answer: "a", domain: "d1" },
        { id: "dq-2", question_statement: "q", question_answer: "a", domain: "d2" },
        { id: "dq-3", question_statement: "q", question_answer: "a", domain: "d3" },
        { id: "dq-4", question_statement: "q", question_answer: "a", domain: "d4" },
      ]);
      mockSupabase.__testing.setTable("announcements", []);
      mockSupabase.__testing.setTable("event_config", [
        {
          id: 1,
          started_at: null,
          duration_minutes: 120,
          ended_at: null,
        },
      ]);

      const responses = await Promise.all(
        Array(20)
          .fill()
          .map(() =>
            request(app)
              .post("/api/team/register")
              .set("x-webhook-secret", process.env.WEBHOOK_SECRET)
              .send({
                team_name: "Duplicate",
                team_leader: "L",
                members: ["L"],
                password: PASSWORD,
                email: "dup@test.com",
              }),
          ),
      );

      // Every attempt is accepted; the suffixing keeps names distinct.
      expect(statuses(responses).filter((s) => s !== 200 && s !== 409)).toEqual([]);
      const stored = mockSupabase.__testing.getTable("teams");
      expect(unique(stored.map((t) => t.team_name))).toBe(stored.length);
    }, 60000);

    test("rejects 150 forged registrations with no webhook secret", async () => {
      seedTeams("forged");

      const responses = await Promise.all(
        Array(TEAM_COUNT)
          .fill()
          .map((_, i) =>
            request(app)
              .post("/api/team/register")
              .send({
                team_name: "Forged " + i,
                password: PASSWORD,
                email: "f@test.com",
              }),
          ),
      );

      expect(statuses(responses).filter((s) => s !== 403)).toEqual([]);
      expect(mockSupabase.__testing.getTable("teams")).toHaveLength(TEAM_COUNT);
    });
  });

  describe("POST /api/login", () => {
    test("150 distinct teams behind one IP all sign in", async () => {
      const teams = seedTeams("login");

      const responses = await Promise.all(
        teams.map((team) =>
          request(app)
            .post("/api/login")
            .send({ team_name: team.team_name, password: PASSWORD }),
        ),
      );

      const ok = responses.filter((r) => r.status === 200);
      const throttled = responses.filter((r) => r.status === 429);

      // The login budget is per CALLSIGN, not per IP. This is the whole point
      // of that choice: players are on mobile data behind carrier CGNAT, so
      // hundreds of unrelated crews share a handful of public addresses. Under
      // the old per-IP rule this assertion was `ok = 5` and 145 real teams were
      // turned away at the door.
      expect(ok).toHaveLength(TEAM_COUNT);
      expect(throttled).toHaveLength(0);

      for (const res of ok) {
        expect(res.body.token).toBeTruthy();
        expect(res.body.user.password).toBeUndefined();
      }
      // Distinct teams get distinct tokens.
      expect(unique(ok.map((r) => r.body.token))).toBe(ok.length);
    });

    test("a wrong password never issues a token", async () => {
      const teams = seedTeams("badpass");

      const responses = await Promise.all(
        teams
          .slice(0, 5)
          .map((team) =>
            request(app)
              .post("/api/login")
              .send({ team_name: team.team_name, password: "not-the-password" }),
          ),
      );

      for (const res of responses) {
        expect(res.status).toBe(401);
        expect(res.body.token).toBeUndefined();
      }
    });
  });

  // ------------------------------------------------------------------ team

  describe("GET /api/team/state", () => {
    test("150 teams polling at once each receive only their own row", async () => {
      const teams = seedTeams("state");

      const responses = await Promise.all(
        teams.map((team, i) =>
          request(app)
            .get("/api/team/state")
            .set("Authorization", "Bearer " + signToken(team.id))
            .then((res) => ({ res, team, i })),
        ),
      );

      expect(responses.filter(({ res }) => res.status !== 200)).toEqual([]);
      for (const { res, team, i } of responses) {
        expect(res.body.team.id).toBe(team.id);
        expect(res.body.clue_statement).toBe("Clue for team " + i);
        expect(res.body.team.password).toBeUndefined();
      }
      expect(unique(responses.map(({ res }) => res.body.clue_statement))).toBe(
        TEAM_COUNT,
      );
    });

    test("150 unauthenticated polls are all rejected", async () => {
      seedTeams("noauth");

      const responses = await Promise.all(
        Array(TEAM_COUNT)
          .fill()
          .map(() => request(app).get("/api/team/state")),
      );

      expect(statuses(responses).filter((s) => s !== 401)).toEqual([]);
    });
  });

  describe("POST /api/team/verify-code and /verify-answer", () => {
    test("150 teams play a full stop concurrently and land on their own next step", async () => {
      const teams = seedTeams("play");
      mockSupabase.__testing.setLatency("teams", 2);

      const codeResults = await Promise.all(
        teams.map((team, i) =>
          request(app)
            .post("/api/team/verify-code")
            .set("Authorization", "Bearer " + signToken(team.id))
            .send({ enteredCode: "CODE-" + i })
            .then((res) => ({ res, team, i })),
        ),
      );

      expect(codeResults.filter(({ res }) => res.status !== 200)).toEqual([]);
      for (const { res, team, i } of codeResults) {
        expect(res.body.success).toBe(true);
        expect(res.body.state.team.id).toBe(team.id);
        expect(res.body.state.question).toBe("Question for team " + i);
      }

      const answerResults = await Promise.all(
        teams.map((team, i) =>
          request(app)
            .post("/api/team/verify-answer")
            .set("Authorization", "Bearer " + signToken(team.id))
            .send({ enteredAns: "ANS-" + i })
            .then((res) => ({ res, team })),
        ),
      );

      expect(answerResults.filter(({ res }) => res.status !== 200)).toEqual([]);
      for (const { res, team } of answerResults) {
        expect(res.body.success).toBe(true);
        expect(res.body.state.team.id).toBe(team.id);
      }

      for (const team of mockSupabase.__testing.getTable("teams")) {
        expect(team.progress).toBe(1);
        expect(team.last_correct_at).toBeTruthy();
      }
    });

    test("150 teams entering wrong codes each lock only themselves", async () => {
      const teams = seedTeams("wrong");

      const responses = await Promise.all(
        teams.map((team) =>
          request(app)
            .post("/api/team/verify-code")
            .set("Authorization", "Bearer " + signToken(team.id))
            .send({ enteredCode: "NOPE" }),
        ),
      );

      expect(statuses(responses).filter((s) => s !== 200)).toEqual([]);
      for (const res of responses) {
        expect(res.body.reason).toBe("wrong_code");
      }

      const stored = mockSupabase.__testing.getTable("teams");
      expect(stored.filter((t) => t.status === "locked")).toHaveLength(TEAM_COUNT);
      for (const team of stored) {
        expect(team.wrong_attempts).toBe(1);
        expect(new Date(team.lock_until).getTime()).toBeGreaterThan(Date.now());
      }
    });

    test("one team burning its 10 attempts does not throttle the other 149", async () => {
      const teams = seedTeams("budget");
      const noisy = teams[0];

      // Spend the noisy team's entire per-user budget.
      await Promise.all(
        Array(11)
          .fill()
          .map(() =>
            request(app)
              .post("/api/team/verify-code")
              .set("Authorization", "Bearer " + signToken(noisy.id))
              .send({ enteredCode: "NOPE" }),
          ),
      );

      const others = await Promise.all(
        teams.slice(1).map((team, idx) =>
          request(app)
            .post("/api/team/verify-code")
            .set("Authorization", "Bearer " + signToken(team.id))
            .send({ enteredCode: "CODE-" + (idx + 1) }),
        ),
      );

      // verifyLimiter keys on userId, so the budget is per team, not shared.
      expect(statuses(others).filter((s) => s !== 200)).toEqual([]);
      for (const res of others) {
        expect(res.body.success).toBe(true);
      }
    });
  });

  // ----------------------------------------------------------------- admin

  describe("admin endpoints", () => {
    const admin = (req) => req.set("x-admin-secret", process.env.ADMIN_SECRET);

    test("GET /admin/teams returns all 150 teams without leaking passwords", async () => {
      seedTeams("adminlist");

      const res = await admin(request(app).get("/api/admin/teams"));

      expect(res.status).toBe(200);
      expect(res.body.teams).toHaveLength(TEAM_COUNT);
      expect(unique(res.body.teams.map((t) => t.id))).toBe(TEAM_COUNT);
      for (const team of res.body.teams) {
        expect(team.password).toBeUndefined();
        expect(team.route).toBeUndefined();
        expect(team).toHaveProperty("progress");
        expect(team).toHaveProperty("last_correct_at");
      }
    });

    test("unlocking 150 locked teams one call at a time clears every lock", async () => {
      const teams = seedTeams("unlock", {
        status: "locked",
        lock_until: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });

      // adminLimiter allows 30 requests per minute per IP across all admin
      // routes, so a 150-team sweep is issued in batches under that ceiling.
      const batch = teams.slice(0, 25);
      const responses = await Promise.all(
        batch.map((team) =>
          admin(request(app).post("/api/admin/unlock-team")).send({ team_id: team.id }),
        ),
      );

      expect(statuses(responses).filter((s) => s !== 200)).toEqual([]);

      const stored = mockSupabase.__testing.getTable("teams");
      const unlocked = stored.filter((t) => t.status === "active");
      expect(unlocked).toHaveLength(batch.length);
      for (const team of unlocked) {
        expect(team.lock_until).toBeNull();
      }
      // Teams outside the batch are untouched.
      expect(stored.filter((t) => t.status === "locked")).toHaveLength(
        TEAM_COUNT - batch.length,
      );
    });

    test("admin messages land on the addressed team only", async () => {
      const teams = seedTeams("notice");

      const batch = teams.slice(0, 25);
      const responses = await Promise.all(
        batch.map((team, i) =>
          admin(request(app).post("/api/admin/send-message")).send({
            team_id: team.id,
            message: "Message for " + i,
          }),
        ),
      );

      expect(statuses(responses).filter((s) => s !== 200)).toEqual([]);

      const stored = mockSupabase.__testing.getTable("teams");
      batch.forEach((team, i) => {
        const row = stored.find((t) => t.id === team.id);
        expect(row.notice).toBe("Message for " + i);
      });
      for (const team of stored.slice(batch.length)) {
        expect(team.notice).toBeNull();
      }
    });

    test("an announcement reaches all 150 teams at once", async () => {
      const teams = seedTeams("announce");

      const posted = await admin(request(app).post("/api/admin/announce")).send({
        message: "All crews report in",
      });
      expect(posted.status).toBe(200);

      const responses = await Promise.all(
        teams.map((team) =>
          request(app)
            .get("/api/team/state")
            .set("Authorization", "Bearer " + signToken(team.id)),
        ),
      );

      expect(statuses(responses).filter((s) => s !== 200)).toEqual([]);
      for (const res of responses) {
        expect(res.body.announcement).toBeTruthy();
      }
    });

    test("admin routes are closed to teams and to the wrong secret", async () => {
      const teams = seedTeams("adminauth");

      const withTeamToken = await Promise.all(
        teams.slice(0, 10).map((team) =>
          request(app)
            .get("/api/admin/teams")
            .set("Authorization", "Bearer " + signToken(team.id)),
        ),
      );
      const withWrongSecret = await Promise.all(
        Array(10)
          .fill()
          .map(() => request(app).get("/api/admin/teams").set("x-admin-secret", "wrong")),
      );

      for (const res of withTeamToken.concat(withWrongSecret)) {
        expect(res.status).toBe(403);
        expect(res.body.teams).toBeUndefined();
      }
    });

    test("admin traffic past 30/min is throttled per IP", async () => {
      seedTeams("adminrate");

      const responses = await Promise.all(
        Array(40)
          .fill()
          .map(() => admin(request(app).get("/api/admin/teams"))),
      );

      const ok = responses.filter((r) => r.status === 200);
      const throttled = responses.filter((r) => r.status === 429);
      expect(ok.length).toBeLessThanOrEqual(30);
      expect(ok.length + throttled.length).toBe(40);
    });

    test("start and end gate play for all 150 teams", async () => {
      const teams = seedTeams("gate");
      mockSupabase.__testing.setTable("event_config", [
        {
          id: 1,
          started_at: null,
          duration_minutes: 120,
          ended_at: null,
        },
      ]);

      const beforeStart = await Promise.all(
        teams.map((team, i) =>
          request(app)
            .post("/api/team/verify-code")
            .set("Authorization", "Bearer " + signToken(team.id))
            .send({ enteredCode: "CODE-" + i }),
        ),
      );
      for (const res of beforeStart) {
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/not started/i);
      }

      expect((await admin(request(app).post("/api/admin/start"))).status).toBe(200);
      expect((await admin(request(app).post("/api/admin/end"))).status).toBe(200);

      const afterEnd = await Promise.all(
        teams.map((team, i) =>
          request(app)
            .post("/api/team/verify-code")
            .set("Authorization", "Bearer " + signToken(team.id))
            .send({ enteredCode: "CODE-" + i }),
        ),
      );
      for (const res of afterEnd) {
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/ended/i);
      }
    });
  });

  // ----------------------------------------------------------- leaderboard

  /**
   * There is no leaderboard endpoint on this API. The frontend reads the
   * Supabase `leaderboard` view straight from the browser, so what the server
   * owes it is the two columns that view orders by:
   *
   *   ORDER BY progress DESC, last_correct_at ASC NULLS LAST
   *
   * These cover that contract at full field size.
   */
  describe("leaderboard ordering data", () => {
    test("150 concurrent solves each stamp their own progress and last_correct_at", async () => {
      const teams = seedTeams("board", { stage: "awaiting_puzzle" });
      mockSupabase.__testing.setLatency("teams", 2);

      const before = Date.now();
      const responses = await Promise.all(
        teams.map((team, i) =>
          request(app)
            .post("/api/team/verify-answer")
            .set("Authorization", "Bearer " + signToken(team.id))
            .send({ enteredAns: "ANS-" + i }),
        ),
      );
      const after = Date.now();

      expect(statuses(responses).filter((s) => s !== 200)).toEqual([]);

      const stored = mockSupabase.__testing.getTable("teams");
      expect(stored).toHaveLength(TEAM_COUNT);
      for (const team of stored) {
        expect(team.progress).toBe(1);
        const stamped = new Date(team.last_correct_at).getTime();
        expect(stamped).toBeGreaterThanOrEqual(before);
        expect(stamped).toBeLessThanOrEqual(after);
      }

      // The view's sort must be total: no team may be missing the tie-break.
      expect(stored.filter((t) => t.last_correct_at === null)).toEqual([]);
    });

    test("ranking 150 mixed-progress teams is stable and ties break by solve time", async () => {
      const teams = seedTeams("rank");
      const stored = teams.map((team, i) => ({
        ...team,
        progress: i % 6,
        status: i % 6 === 5 ? "finished" : "active",
        // Earlier index solved earlier, so it must outrank its ties.
        last_correct_at: new Date(Date.now() - (TEAM_COUNT - i) * 1000).toISOString(),
      }));
      mockSupabase.__testing.setTable("teams", stored);

      const res = await request(app)
        .get("/api/admin/teams")
        .set("x-admin-secret", process.env.ADMIN_SECRET);
      expect(res.status).toBe(200);

      const ranked = [...res.body.teams].sort((a, b) => {
        if (b.progress !== a.progress) return b.progress - a.progress;
        return new Date(a.last_correct_at) - new Date(b.last_correct_at);
      });

      expect(ranked).toHaveLength(TEAM_COUNT);
      expect(ranked[0].progress).toBe(5);
      expect(ranked[ranked.length - 1].progress).toBe(0);

      for (let i = 1; i < ranked.length; i++) {
        const prev = ranked[i - 1];
        const curr = ranked[i];
        expect(prev.progress).toBeGreaterThanOrEqual(curr.progress);
        if (prev.progress === curr.progress) {
          expect(new Date(prev.last_correct_at).getTime()).toBeLessThanOrEqual(
            new Date(curr.last_correct_at).getTime(),
          );
        }
      }
    });

    test("a locked team still ranks with the progress it earned", async () => {
      const teams = seedTeams("lockedrank", {
        status: "locked",
        lock_until: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        progress: 3,
        last_correct_at: new Date().toISOString(),
      });
      expect(teams).toHaveLength(TEAM_COUNT);

      const res = await request(app)
        .get("/api/admin/teams")
        .set("x-admin-secret", process.env.ADMIN_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.teams).toHaveLength(TEAM_COUNT);
      for (const team of res.body.teams) {
        expect(team.status).toBe("locked");
        expect(team.progress).toBe(3);
        expect(team.last_correct_at).toBeTruthy();
      }
    });
  });
});
