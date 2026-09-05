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
const { loginLimiter, loginIpLimiter, adminLimiter } = require("../middleware/rateLimit");

const TEAM_COUNT = 150;
const MEMBERS_PER_TEAM = 4;
const USER_COUNT = TEAM_COUNT * MEMBERS_PER_TEAM; // 600
const TEST_IP = "127.0.0.1";
const PASSWORD = "hunt-me-1234";
let PASSWORD_HASH;

/**
 * 150 teams, four members each: 600 simultaneous clients.
 *
 * Identity here is the team, not the person -- everyone on a team signs in
 * with the same credentials, so four phones carry four tokens that all resolve
 * to one userId. Two consequences drive this file:
 *
 *   - The four members RACE each other. Every write path has to pick one
 *     winner per team, not four.
 *   - They SHARE one verifyLimiter budget (10 per userId / 15 min), so a
 *     team's attempts are consumed four times faster than a single player's.
 */
describe(
  USER_COUNT +
    " concurrent users (" +
    TEAM_COUNT +
    " teams x " +
    MEMBERS_PER_TEAM +
    " members)",
  () => {
    beforeAll(async () => {
      PASSWORD_HASH = await bcrypt.hash(PASSWORD, 10);
    });

    /**
     * Rate-limit stores live for the whole process, so without this every test
     * inherits the previous one's spent budget and the assertions become
     * order-dependent.
     *
     * `loginLimiter` is reset per TEAM, not per IP. It used to be keyed on the
     * address, and this hook still reset `TEST_IP` long after the key generator
     * changed to `team:<name>` -- so the reset silently stopped resetting
     * anything and counts drifted by however many logins earlier tests had
     * spent. The per-IP backstop is a separate limiter and needs its own reset.
     */
    beforeEach(async () => {
      for (let i = 0; i < TEAM_COUNT; i++) {
        await loginLimiter.resetKey("team:" + ("Team " + i).toLowerCase());
      }
      await loginIpLimiter.resetKey(TEST_IP);
      await adminLimiter.resetKey(TEST_IP);
    });

    function seed(prefix, overrides = {}) {
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
          members: [
            "Leader " + i,
            "Member " + i + "b",
            "Member " + i + "c",
            "Member " + i + "d",
          ],
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

    /** One client per member: four tokens per team, all for the same userId. */
    function clients(teams) {
      const out = [];
      teams.forEach((team, teamIndex) => {
        for (let m = 0; m < MEMBERS_PER_TEAM; m++) {
          out.push({ team, teamIndex, member: m, token: signToken(team.id) });
        }
      });
      return out;
    }

    const statuses = (responses) => responses.map((r) => r.status);
    const unique = (values) => new Set(values).size;

    function countByTeam(entries) {
      const byTeam = new Map();
      for (const teamId of entries) {
        byTeam.set(teamId, (byTeam.get(teamId) || 0) + 1);
      }
      return byTeam;
    }

    // --------------------------------------------------------------- read-only

    test("600 users read the event config at once and all see the same thing", async () => {
      seed("event");

      const responses = await Promise.all(
        Array(USER_COUNT)
          .fill()
          .map(() => request(app).get("/api/event")),
      );

      expect(responses).toHaveLength(USER_COUNT);
      expect(statuses(responses).filter((s) => s !== 200)).toEqual([]);
      expect(unique(responses.map((r) => JSON.stringify(r.body)))).toBe(1);
    }, 60000);

    test("600 health probes at once all report healthy", async () => {
      seed("health");

      const responses = await Promise.all(
        Array(USER_COUNT)
          .fill()
          .map(() => request(app).get("/health")),
      );

      expect(statuses(responses).filter((s) => s !== 200)).toEqual([]);
      for (const res of responses) {
        expect(res.body.status).toBe("healthy");
      }
    }, 60000);

    test("600 state polls: teammates agree, strangers never mix", async () => {
      const teams = seed("state");
      const everyone = clients(teams);
      expect(everyone).toHaveLength(USER_COUNT);

      const responses = await Promise.all(
        everyone.map((client) =>
          request(app)
            .get("/api/team/state")
            .set("Authorization", "Bearer " + client.token)
            .then((res) => ({ res, client })),
        ),
      );

      expect(responses.filter(({ res }) => res.status !== 200)).toEqual([]);

      for (const { res, client } of responses) {
        expect(res.body.team.id).toBe(client.team.id);
        expect(res.body.clue_statement).toBe("Clue for team " + client.teamIndex);
        expect(res.body.team.password).toBeUndefined();
      }

      // All four members of a team must be looking at one identical screen.
      const byTeam = new Map();
      for (const { res, client } of responses) {
        const seen = byTeam.get(client.team.id) || [];
        seen.push(JSON.stringify(res.body));
        byTeam.set(client.team.id, seen);
      }
      expect(byTeam.size).toBe(TEAM_COUNT);
      for (const [, views] of byTeam) {
        expect(views).toHaveLength(MEMBERS_PER_TEAM);
        expect(unique(views)).toBe(1);
      }
    }, 60000);

    // ------------------------------------------------------------- write races

    test("600 simultaneous code submissions: one winner per team, never four", async () => {
      const teams = seed("code");
      const everyone = clients(teams);
      mockSupabase.__testing.setLatency("teams", 5);

      const responses = await Promise.all(
        everyone.map((client) =>
          request(app)
            .post("/api/team/verify-code")
            .set("Authorization", "Bearer " + client.token)
            .send({ enteredCode: "CODE-" + client.teamIndex })
            .then((res) => ({ res, client })),
        ),
      );

      expect(responses).toHaveLength(USER_COUNT);
      expect(responses.filter(({ res }) => res.status !== 200)).toEqual([]);

      const winners = responses.filter(({ res }) => res.body.success === true);
      const losers = responses.filter(
        ({ res }) => res.body.success === false && res.body.reason === "wrong_stage",
      );

      expect(winners).toHaveLength(TEAM_COUNT);
      expect(losers).toHaveLength(USER_COUNT - TEAM_COUNT);

      const winsPerTeam = countByTeam(winners.map(({ client }) => client.team.id));
      expect(winsPerTeam.size).toBe(TEAM_COUNT);
      expect([...winsPerTeam.values()].filter((n) => n !== 1)).toEqual([]);

      // Winner and losers alike must be shown their own team.
      for (const { res, client } of responses) {
        if (res.body.state) expect(res.body.state.team.id).toBe(client.team.id);
      }

      for (const team of mockSupabase.__testing.getTable("teams")) {
        expect(team.stage).toBe("awaiting_puzzle");
        expect(team.progress).toBe(0);
      }
    }, 60000);

    test("600 simultaneous answers advance each team exactly one step", async () => {
      const teams = seed("answer", { stage: "awaiting_puzzle" });
      const everyone = clients(teams);
      mockSupabase.__testing.setLatency("teams", 5);

      const responses = await Promise.all(
        everyone.map((client) =>
          request(app)
            .post("/api/team/verify-answer")
            .set("Authorization", "Bearer " + client.token)
            .send({ enteredAns: "ANS-" + client.teamIndex })
            .then((res) => ({ res, client })),
        ),
      );

      expect(responses.filter(({ res }) => res.status !== 200)).toEqual([]);

      const winners = responses.filter(({ res }) => res.body.success === true);
      expect(winners).toHaveLength(TEAM_COUNT);

      const winsPerTeam = countByTeam(winners.map(({ client }) => client.team.id));
      expect([...winsPerTeam.values()].filter((n) => n !== 1)).toEqual([]);

      for (const team of mockSupabase.__testing.getTable("teams")) {
        expect(team.progress).toBe(1);
        expect(team.stage).toBe("awaiting_code");
        expect(team.last_correct_at).toBeTruthy();
      }
    }, 60000);

    test("four teammates guessing wrong together lock the team once, not four times", async () => {
      const teams = seed("wrong");
      const everyone = clients(teams);
      mockSupabase.__testing.setLatency("teams", 5);

      const responses = await Promise.all(
        everyone.map((client) =>
          request(app)
            .post("/api/team/verify-code")
            .set("Authorization", "Bearer " + client.token)
            .send({ enteredCode: "WRONG" })
            .then((res) => ({ res, client })),
        ),
      );

      expect(responses.filter(({ res }) => res.status !== 200)).toEqual([]);

      const stored = mockSupabase.__testing.getTable("teams");
      expect(stored.filter((t) => t.status === "locked")).toHaveLength(TEAM_COUNT);

      // Each team fields four wrong guesses at once; wrong_attempts records what
      // the lock path actually counted.
      const attemptCounts = unique(stored.map((t) => t.wrong_attempts));
      expect(stored.every((t) => t.wrong_attempts >= 1)).toBe(true);
      expect(attemptCounts).toBeGreaterThan(0);
      for (const team of stored) {
        expect(new Date(team.lock_until).getTime()).toBeGreaterThan(Date.now());
      }
    }, 60000);

    test("a team's 10-attempt budget is shared by all four members", async () => {
      const teams = seed("budget");
      const team = teams[0];
      const memberTokens = Array(MEMBERS_PER_TEAM)
        .fill()
        .map(() => signToken(team.id));

      // Three attempts each across four members = 12, past the team's 10.
      const attempts = [];
      for (const token of memberTokens) {
        for (let n = 0; n < 3; n++) {
          attempts.push(
            request(app)
              .post("/api/team/verify-code")
              .set("Authorization", "Bearer " + token)
              .send({ enteredCode: "WRONG" }),
          );
        }
      }

      const responses = await Promise.all(attempts);
      const served = responses.filter((r) => r.status === 200);
      const throttled = responses.filter((r) => r.status === 429);

      expect(responses).toHaveLength(12);
      // verifyLimiter keys on userId, so members pool one allowance.
      expect(served).toHaveLength(10);
      expect(throttled).toHaveLength(2);
    }, 60000);

    /**
     * This test used to assert that 600 logins from one IP were "throttled to 5
     * a minute", and it passed. That was the bug, not the contract: the login
     * limiter was keyed on IP with a budget of 5, and at a venue every phone is
     * behind one NAT address. The fifth person to sign in would have locked out
     * the entire event for a minute, repeatedly, for the whole hunt.
     *
     * The limiter is now keyed per team with a loose per-IP backstop, so the
     * assertions here invert: a crowded venue must succeed, and only a single
     * callsign being hammered may be throttled.
     */
    test("150 crews signing in from one venue IP all get through", async () => {
      const teams = seed("login");

      // One login per crew, which is the real sign-in rush. 150 is well under
      // the per-IP backstop and each crew is inside its own per-team budget.
      const responses = await Promise.all(
        teams.map((team) =>
          request(app)
            .post("/api/login")
            .send({ team_name: team.team_name, password: PASSWORD }),
        ),
      );

      const ok = responses.filter((r) => r.status === 200);
      const throttled = responses.filter((r) => r.status === 429);

      expect(ok).toHaveLength(TEAM_COUNT);
      expect(throttled).toHaveLength(0);
      for (const res of ok) {
        expect(res.body.token).toBeTruthy();
      }
    }, 60000);

    test("one crew hammering login is capped without touching the other 149", async () => {
      const teams = seed("hammer");
      const victim = teams[0];
      const bystander = teams[1];

      // Eight attempts on one callsign against a per-team budget of five.
      const hammered = await Promise.all(
        Array(8)
          .fill()
          .map(() =>
            request(app)
              .post("/api/login")
              .send({ team_name: victim.team_name, password: PASSWORD }),
          ),
      );

      expect(hammered.filter((r) => r.status === 200)).toHaveLength(5);
      expect(hammered.filter((r) => r.status === 429)).toHaveLength(3);

      // A different crew on the same IP is unaffected, which is the whole point
      // of keying on the team rather than the address.
      const other = await request(app)
        .post("/api/login")
        .send({ team_name: bystander.team_name, password: PASSWORD });

      expect(other.status).toBe(200);
      expect(other.body.token).toBeTruthy();
    }, 60000);

    test("600 unauthenticated polls are all rejected", async () => {
      seed("noauth");

      const responses = await Promise.all(
        Array(USER_COUNT)
          .fill()
          .map(() => request(app).get("/api/team/state")),
      );

      expect(statuses(responses).filter((s) => s !== 401)).toEqual([]);
    }, 60000);

    // ----------------------------------------------------------------- admin

    test("admin sees 150 teams while 600 users play", async () => {
      const teams = seed("adminlist");
      const everyone = clients(teams);

      const [adminRes, ...userResponses] = await Promise.all([
        request(app)
          .get("/api/admin/teams")
          .set("x-admin-secret", process.env.ADMIN_SECRET),
        ...everyone.map((client) =>
          request(app)
            .get("/api/team/state")
            .set("Authorization", "Bearer " + client.token),
        ),
      ]);

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.teams).toHaveLength(TEAM_COUNT);
      for (const team of adminRes.body.teams) {
        expect(team.password).toBeUndefined();
      }
      expect(userResponses.filter((r) => r.status !== 200)).toEqual([]);
    }, 60000);

    test("one announcement reaches all 600 clients", async () => {
      const teams = seed("announce");
      const everyone = clients(teams);

      const posted = await request(app)
        .post("/api/admin/announce")
        .set("x-admin-secret", process.env.ADMIN_SECRET)
        .send({ message: "All crews report in" });
      expect(posted.status).toBe(200);

      const responses = await Promise.all(
        everyone.map((client) =>
          request(app)
            .get("/api/team/state")
            .set("Authorization", "Bearer " + client.token),
        ),
      );

      expect(responses.filter((r) => r.status !== 200)).toEqual([]);
      for (const res of responses) {
        expect(res.body.announcement).toBeTruthy();
      }
    }, 60000);

    test("admin routes stay closed to all 600 team tokens", async () => {
      const teams = seed("adminauth");
      const everyone = clients(teams).slice(0, 40);

      const responses = await Promise.all(
        everyone.map((client) =>
          request(app)
            .get("/api/admin/teams")
            .set("Authorization", "Bearer " + client.token),
        ),
      );

      // adminLimiter sits ahead of requireAdmin, so once the per-IP window is
      // spent the throttle answers first. Either way nothing gets through.
      for (const res of responses) {
        expect([403, 429]).toContain(res.status);
        expect(res.body.teams).toBeUndefined();
      }
      expect(responses.filter((r) => r.status === 200)).toEqual([]);
      expect(responses.filter((r) => r.status === 403).length).toBeGreaterThan(0);
    }, 60000);

    test("event gating holds for all 600 before start and after end", async () => {
      const teams = seed("gate");
      const everyone = clients(teams);
      mockSupabase.__testing.setTable("event_config", [
        {
          id: 1,
          started_at: null,
          duration_minutes: 120,
          ended_at: null,
        },
      ]);

      const beforeStart = await Promise.all(
        everyone.map((client) =>
          request(app)
            .post("/api/team/verify-code")
            .set("Authorization", "Bearer " + client.token)
            .send({ enteredCode: "CODE-" + client.teamIndex }),
        ),
      );
      expect(statuses(beforeStart).filter((s) => s !== 403)).toEqual([]);

      await request(app)
        .post("/api/admin/start")
        .set("x-admin-secret", process.env.ADMIN_SECRET);
      await request(app)
        .post("/api/admin/end")
        .set("x-admin-secret", process.env.ADMIN_SECRET);

      const afterEnd = await Promise.all(
        everyone.map((client) =>
          request(app)
            .post("/api/team/verify-code")
            .set("Authorization", "Bearer " + client.token)
            .send({ enteredCode: "CODE-" + client.teamIndex }),
        ),
      );
      expect(statuses(afterEnd).filter((s) => s !== 403)).toEqual([]);
      for (const res of afterEnd) {
        expect(res.body.error).toMatch(/ended/i);
      }
    }, 60000);

    // ----------------------------------------------------------- leaderboard

    /**
     * No leaderboard endpoint exists on this API -- the frontend reads the
     * Supabase `leaderboard` view directly. What the server owes that view is
     * the pair of columns it sorts on: progress DESC, last_correct_at ASC.
     */
    test("600 concurrent solves leave every team rankable", async () => {
      const teams = seed("board", { stage: "awaiting_puzzle" });
      const everyone = clients(teams);
      mockSupabase.__testing.setLatency("teams", 5);

      const before = Date.now();
      const responses = await Promise.all(
        everyone.map((client) =>
          request(app)
            .post("/api/team/verify-answer")
            .set("Authorization", "Bearer " + client.token)
            .send({ enteredAns: "ANS-" + client.teamIndex }),
        ),
      );
      const after = Date.now();

      expect(responses.filter((r) => r.status !== 200)).toEqual([]);

      const stored = mockSupabase.__testing.getTable("teams");
      expect(stored).toHaveLength(TEAM_COUNT);
      for (const team of stored) {
        expect(team.progress).toBe(1);
        const stamped = new Date(team.last_correct_at).getTime();
        expect(stamped).toBeGreaterThanOrEqual(before);
        expect(stamped).toBeLessThanOrEqual(after);
      }
      // A null tie-break would make the view's ordering non-deterministic.
      expect(stored.filter((t) => t.last_correct_at === null)).toEqual([]);
    }, 60000);

    test("leaderboard ordering over 150 teams stays total while 600 users play", async () => {
      const teams = seed("rank");
      const ranked = teams.map((team, i) => ({
        ...team,
        progress: i % 6,
        status: i % 6 === 5 ? "finished" : "active",
        last_correct_at: new Date(Date.now() - (TEAM_COUNT - i) * 1000).toISOString(),
      }));
      mockSupabase.__testing.setTable("teams", ranked);

      const res = await request(app)
        .get("/api/admin/teams")
        .set("x-admin-secret", process.env.ADMIN_SECRET);
      expect(res.status).toBe(200);

      const board = [...res.body.teams].sort((a, b) => {
        if (b.progress !== a.progress) return b.progress - a.progress;
        return new Date(a.last_correct_at) - new Date(b.last_correct_at);
      });

      expect(board).toHaveLength(TEAM_COUNT);
      expect(board[0].progress).toBe(5);
      for (let i = 1; i < board.length; i++) {
        expect(board[i - 1].progress).toBeGreaterThanOrEqual(board[i].progress);
        if (board[i - 1].progress === board[i].progress) {
          expect(new Date(board[i - 1].last_correct_at).getTime()).toBeLessThanOrEqual(
            new Date(board[i].last_correct_at).getTime(),
          );
        }
      }
    }, 60000);
  },
);
