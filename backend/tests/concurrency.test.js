const request = require("supertest");
const app = require("../app");
const { signToken } = require("./helpers/tokens");

jest.mock("../db/supabaseClient", () =>
  require("./helpers/mockSupabase").createMockSupabase(),
);
jest.mock("../utils/email", () => ({ sendWelcomeEmail: jest.fn() }));

const mockSupabase = require("../db/supabaseClient");

describe("Concurrent requests cannot corrupt progression (atomic compare-and-set)", () => {
  beforeEach(() => {
    mockSupabase.__testing.reset();
  });

  const baseTeam = {
    id: "team-a",
    team_name: "Team Alpha",
    team_leader: "Alice",
    members: ["Alice"],
    password: "$2a$10$hashed",
    route: [
      { island_id: "i1", question_id: "q1" },
      { island_id: "i2", question_id: "q2" },
    ],
    email: "a@test.com",
    progress: 0,
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

  function setup(config = {}) {
    const team = { ...baseTeam, ...config };
    mockSupabase.__testing.setTable("teams", [team]);
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
    // A round trip on `teams` is what creates the race: every caller reads the
    // row before any write lands, so the conditional update has to reject the
    // losers. Without it these requests serialise and nothing is proven.
    mockSupabase.__testing.setLatency("teams", 5);
    return team;
  }

  test("concurrent verify-answer calls advance progress exactly once", async () => {
    // Each test uses its own id: verifyLimiter allows 10 attempts per userId
    // per 15 minutes and its counters outlive the test.
    const teamId = "conc-answer";
    setup({ id: teamId, progress: 0, stage: "awaiting_puzzle" });
    const token = signToken(teamId);
    const concurrency = 10;

    const promises = Array(concurrency)
      .fill()
      .map(() =>
        request(app)
          .post("/api/team/verify-answer")
          .set("Authorization", `Bearer ${token}`)
          .send({ enteredAns: "ANS1" }),
      );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => r.body.success === true);
    const wrongStage = results.filter(
      (r) => r.body.success === false && r.body.reason === "wrong_stage",
    );
    const errors = results.filter((r) => r.status !== 200);

    expect(successes.length).toBe(1);
    expect(wrongStage.length).toBe(concurrency - 1);
    expect(errors.length).toBe(0);

    const finalTeam = mockSupabase.__testing
      .getTable("teams")
      .find((t) => t.id === teamId);
    expect(finalTeam.progress).toBe(1);
    expect(finalTeam.stage).toBe("awaiting_code");
  });

  test("concurrent verify-code calls on non-final stop transition stage exactly once", async () => {
    const teamId = "conc-code-nonfinal";
    const nonFinalTeam = {
      ...baseTeam,
      id: teamId,
      progress: 0,
      stage: "awaiting_code",
      route: [{ island_id: "i1", question_id: "q1" }],
    };
    mockSupabase.__testing.setTable("teams", [nonFinalTeam]);
    mockSupabase.__testing.setTable("islands", [island1]);
    mockSupabase.__testing.setTable("questions", [question1]);
    mockSupabase.__testing.setTable("announcements", []);
    mockSupabase.__testing.setTable("event_config", [
      {
        id: 1,
        started_at: new Date(Date.now() - 1000).toISOString(),
        duration_minutes: 120,
        ended_at: null,
      },
    ]);
    mockSupabase.__testing.setLatency("teams", 5);

    const token = signToken(teamId);
    const concurrency = 10;

    const promises = Array(concurrency)
      .fill()
      .map(() =>
        request(app)
          .post("/api/team/verify-code")
          .set("Authorization", `Bearer ${token}`)
          .send({ enteredCode: "CODE1" }),
      );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => r.body.success === true);
    const wrongStage = results.filter(
      (r) => r.body.success === false && r.body.reason === "wrong_stage",
    );
    const errors = results.filter((r) => r.status !== 200);

    expect(successes.length).toBe(1);
    expect(wrongStage.length).toBe(concurrency - 1);
    expect(errors.length).toBe(0);

    const finalTeam = mockSupabase.__testing
      .getTable("teams")
      .find((t) => t.id === teamId);
    expect(finalTeam.stage).toBe("awaiting_puzzle");
    expect(finalTeam.progress).toBe(0);
  });

  test("concurrent verify-code calls on final stop finish team exactly once", async () => {
    const finalIsland = {
      id: "i-final",
      correct_code: "FINAL",
      clue_statement: "Final",
      is_common_room: true,
    };
    const teamId = "conc-code-final";
    const finalTeam = {
      ...baseTeam,
      id: teamId,
      progress: 4,
      stage: "awaiting_code",
      // Five stops, so progress 4 is the last one.
      route: [
        { island_id: "i1", question_id: "q1" },
        { island_id: "i1", question_id: "q1" },
        { island_id: "i1", question_id: "q1" },
        { island_id: "i1", question_id: "q1" },
        { island_id: "i-final", question_id: null },
      ],
    };
    mockSupabase.__testing.setTable("teams", [finalTeam]);
    mockSupabase.__testing.setTable("islands", [finalIsland]);
    mockSupabase.__testing.setTable("questions", []);
    mockSupabase.__testing.setTable("announcements", []);
    mockSupabase.__testing.setTable("event_config", [
      {
        id: 1,
        started_at: new Date(Date.now() - 1000).toISOString(),
        duration_minutes: 120,
        ended_at: null,
      },
    ]);
    mockSupabase.__testing.setLatency("teams", 5);

    const token = signToken(teamId);
    const concurrency = 10;

    const promises = Array(concurrency)
      .fill()
      .map(() =>
        request(app)
          .post("/api/team/verify-code")
          .set("Authorization", `Bearer ${token}`)
          .send({ enteredCode: "FINAL" }),
      );

    const results = await Promise.all(promises);

    const successes = results.filter((r) => r.body.success === true);
    const wrongStage = results.filter(
      (r) => r.body.success === false && r.body.reason === "wrong_stage",
    );
    const errors = results.filter((r) => r.status !== 200);

    expect(successes.length).toBe(1);
    expect(wrongStage.length).toBe(concurrency - 1);
    expect(errors.length).toBe(0);

    const finalTeamResult = mockSupabase.__testing
      .getTable("teams")
      .find((t) => t.id === teamId);
    expect(finalTeamResult.progress).toBe(5);
    expect(finalTeamResult.status).toBe("finished");
    // `stage` is not a terminal column -- the row keeps awaiting_code and the
    // "finished" stage is derived from progress/status when state is built.
    expect(finalTeamResult.stage).toBe("awaiting_code");
    expect(successes[0].body.state.stage).toBe("finished");
  });

  test("mixed concurrent verify-code then verify-answer maintains consistency", async () => {
    const teamId = "conc-mixed";
    const mixedTeam = {
      ...baseTeam,
      id: teamId,
      progress: 0,
      stage: "awaiting_code",
    };
    mockSupabase.__testing.setTable("teams", [mixedTeam]);
    mockSupabase.__testing.setTable("islands", [island1]);
    mockSupabase.__testing.setTable("questions", [question1]);
    mockSupabase.__testing.setTable("announcements", []);
    mockSupabase.__testing.setTable("event_config", [
      {
        id: 1,
        started_at: new Date(Date.now() - 1000).toISOString(),
        duration_minutes: 120,
        ended_at: null,
      },
    ]);
    mockSupabase.__testing.setLatency("teams", 5);

    const token = signToken(teamId);

    const codePromise = request(app)
      .post("/api/team/verify-code")
      .set("Authorization", `Bearer ${token}`)
      .send({ enteredCode: "CODE1" });

    const codeResult = await codePromise;
    expect(codeResult.body.success).toBe(true);
    expect(codeResult.body.state.stage).toBe("awaiting_puzzle");
    expect(codeResult.body.state.team.progress).toBe(0);

    // The verify-code above already spent one of this team's 10 attempts.
    const answerCount = 9;
    const answerPromises = Array(answerCount)
      .fill()
      .map(() =>
        request(app)
          .post("/api/team/verify-answer")
          .set("Authorization", `Bearer ${token}`)
          .send({ enteredAns: "ANS1" }),
      );

    const answerResults = await Promise.all(answerPromises);
    const answerSuccesses = answerResults.filter((r) => r.body.success === true);
    const answerWrongStage = answerResults.filter(
      (r) => r.body.success === false && r.body.reason === "wrong_stage",
    );

    expect(answerResults.filter((r) => r.status !== 200)).toEqual([]);
    expect(answerSuccesses.length).toBe(1);
    expect(answerWrongStage.length).toBe(answerCount - 1);

    const finalTeam = mockSupabase.__testing
      .getTable("teams")
      .find((t) => t.id === teamId);
    expect(finalTeam.progress).toBe(1);
    expect(finalTeam.stage).toBe("awaiting_code");
  });
});
