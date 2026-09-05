const request = require("supertest");
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

const TEAM_COUNT = 150;

/**
 * Event-day load: every team plays simultaneously.
 *
 * Each team gets its own island and question so a response belonging to
 * another team is detectable. At this scale a cache-key or compare-and-set
 * bug surfaces as one team receiving another's clue or advancing twice.
 *
 * verifyLimiter allows 10 attempts per userId per 15 minutes and its counters
 * live for the whole process, so each test seeds a fresh id prefix and keeps
 * every team within budget.
 */
describe(TEAM_COUNT + " concurrent teams", () => {
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
      });
      questions.push({
        id: prefix + "-q-" + i,
        question_statement: "Question for team " + i,
        question_answer: "ANS-" + i,
        domain: "test",
      });
      teams.push({
        id: prefix + "-team-" + i,
        team_name: "Team " + i,
        team_leader: "Leader " + i,
        members: ["Leader " + i],
        password: "$2a$10$hashed",
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

  test("all 150 teams submit their own code at once; each advances only itself", async () => {
    const teams = seed("code");

    const responses = await Promise.all(
      teams.map((team, i) =>
        request(app)
          .post("/api/team/verify-code")
          .set("Authorization", "Bearer " + signToken(team.id))
          .send({ enteredCode: "CODE-" + i })
          .then((res) => ({ res, team, i })),
      ),
    );

    const nonOk = responses.filter(({ res }) => res.status !== 200);
    expect(nonOk.map(({ res, team }) => team.id + ":" + res.status)).toEqual([]);

    for (const { res, team, i } of responses) {
      expect(res.body.success).toBe(true);
      // The response must describe the caller, never a neighbour.
      expect(res.body.state.team.id).toBe(team.id);
      expect(res.body.state.team.team_name).toBe("Team " + i);
      expect(res.body.state.stage).toBe("awaiting_puzzle");
      expect(res.body.state.question).toBe("Question for team " + i);
    }

    const stored = mockSupabase.__testing.getTable("teams");
    expect(stored).toHaveLength(TEAM_COUNT);
    for (const team of stored) {
      expect(team.stage).toBe("awaiting_puzzle");
      expect(team.progress).toBe(0);
      expect(team.status).toBe("active");
    }
  });

  test("all 150 teams submit their own answer at once; each advances exactly one step", async () => {
    const teams = seed("ans", { stage: "awaiting_puzzle" });

    const responses = await Promise.all(
      teams.map((team, i) =>
        request(app)
          .post("/api/team/verify-answer")
          .set("Authorization", "Bearer " + signToken(team.id))
          .send({ enteredAns: "ANS-" + i })
          .then((res) => ({ res, team, i })),
      ),
    );

    const nonOk = responses.filter(({ res }) => res.status !== 200);
    expect(nonOk.map(({ res, team }) => team.id + ":" + res.status)).toEqual([]);

    for (const { res, team, i } of responses) {
      expect(res.body.success).toBe(true);
      expect(res.body.state.team.id).toBe(team.id);
      expect(res.body.state.team.team_name).toBe("Team " + i);
      expect(res.body.state.team.progress).toBe(1);
    }

    for (const team of mockSupabase.__testing.getTable("teams")) {
      expect(team.progress).toBe(1);
      expect(team.stage).toBe("awaiting_code");
      expect(team.last_correct_at).toBeTruthy();
    }
  });

  test("150 teams double-submitting (300 concurrent) advance exactly once each", async () => {
    // Two stops, so the losing racer lands on a real next stop and gets a
    // clean wrong_stage rather than running off the end of the route.
    const teams = seed("dup", { stage: "awaiting_puzzle" });
    const stored = mockSupabase.__testing.getTable("teams").map((team, i) => ({
      ...team,
      route: [
        { island_id: "dup-i-" + i, question_id: "dup-q-" + i },
        { island_id: "dup-i-" + i, question_id: "dup-q-" + i },
      ],
    }));
    mockSupabase.__testing.setTable("teams", stored);
    // Force a genuine race: with a round trip on `teams`, every duplicate has
    // read the pre-write row before any write lands, so the conditional update
    // is what has to reject the loser. Without this the requests serialise and
    // the guard is never exercised.
    mockSupabase.__testing.setLatency("teams", 5);
    const ATTEMPTS = 2;

    const calls = [];
    teams.forEach((team, i) => {
      for (let n = 0; n < ATTEMPTS; n++) {
        calls.push(
          request(app)
            .post("/api/team/verify-answer")
            .set("Authorization", "Bearer " + signToken(team.id))
            .send({ enteredAns: "ANS-" + i })
            .then((res) => ({ res, teamId: team.id })),
        );
      }
    });

    const responses = await Promise.all(calls);
    expect(responses).toHaveLength(TEAM_COUNT * ATTEMPTS);

    const nonOk = responses.filter(({ res }) => res.status !== 200);
    expect(nonOk.map(({ res, teamId }) => teamId + ":" + res.status)).toEqual([]);

    const successesByTeam = new Map();
    for (const { res, teamId } of responses) {
      if (res.body.success === true) {
        successesByTeam.set(teamId, (successesByTeam.get(teamId) || 0) + 1);
      }
      if (res.body.state) {
        // Even the losing racer must be told about its own team.
        expect(res.body.state.team.id).toBe(teamId);
      }
    }

    const advancedTwice = [...successesByTeam.entries()].filter(([, n]) => n !== 1);
    expect(advancedTwice).toEqual([]);
    expect(successesByTeam.size).toBe(TEAM_COUNT);

    for (const team of mockSupabase.__testing.getTable("teams")) {
      expect(team.progress).toBe(1);
      expect(team.stage).toBe("awaiting_code");
    }
  });

  test("150 teams polling state at once each receive their own clue", async () => {
    const teams = seed("state");

    const responses = await Promise.all(
      teams.map((team, i) =>
        request(app)
          .get("/api/team/state")
          .set("Authorization", "Bearer " + signToken(team.id))
          .then((res) => ({ res, team, i })),
      ),
    );

    const nonOk = responses.filter(({ res }) => res.status !== 200);
    expect(nonOk.map(({ res, team }) => team.id + ":" + res.status)).toEqual([]);

    // A cache keyed on anything but the team id would surface here.
    for (const { res, team, i } of responses) {
      expect(res.body.team.id).toBe(team.id);
      expect(res.body.stage).toBe("awaiting_code");
      expect(res.body.clue_statement).toBe("Clue for team " + i);
    }

    const clues = responses.map(({ res }) => res.body.clue_statement);
    expect(new Set(clues).size).toBe(TEAM_COUNT);
  });

  test("no password leaks in a state response under load", async () => {
    const teams = seed("leak");

    const responses = await Promise.all(
      teams.map((team) =>
        request(app)
          .get("/api/team/state")
          .set("Authorization", "Bearer " + signToken(team.id)),
      ),
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.team.password).toBeUndefined();
    }
  });
});
