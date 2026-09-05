const request = require("supertest");
const app = require("../app");
const { signToken } = require("./helpers/tokens");

jest.mock("../db/supabaseClient", () =>
  require("./helpers/mockSupabase").createMockSupabase(),
);
jest.mock("../utils/email", () => ({ sendWelcomeEmail: jest.fn() }));

const mockSupabase = require("../db/supabaseClient");

describe("Verify answer behavior", () => {
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
    clue_images: ["https://cdn.test/i2.jpg"],
    is_terminal: false,
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
    return team;
  }

  test("a correct answer hands back the fragment index and the next clue in one response", async () => {
    // The client shows the fragment then the next clue with no further request,
    // so both must ride on this one payload.
    setup({
      progress: 0,
      stage: "awaiting_puzzle",
      route: [
        { island_id: "i1", question_id: "q1" },
        { island_id: "i2", question_id: "q2" },
      ],
    });

    const res = await request(app)
      .post("/api/team/verify-answer")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredAns: "ANS1" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Solving the first stop earns Fragment I.
    expect(res.body.fragment_index).toBe(1);
    expect(res.body.solved_stop).toBe(0);
    // ...and the payload already describes the NEXT stop.
    expect(res.body.state.stage).toBe("awaiting_code");
    expect(res.body.state.clue_statement).toBe("Clue 2");
    expect(res.body.state.clue_images).toEqual(["https://cdn.test/i2.jpg"]);
  });

  test("a wrong answer is reported as wrong_answer and never locks the team", async () => {
    setup({ progress: 0, stage: "awaiting_puzzle" });

    const res = await request(app)
      .post("/api/team/verify-answer")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredAns: "DEFINITELY WRONG" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    // Distinguishable from an unrecognised failure, which the bare
    // {success:false} was not.
    expect(res.body.reason).toBe("wrong_answer");

    const team = mockSupabase.__testing.getTable("teams").find((t) => t.id === "team-a");
    expect(team.status).toBe("active");
    expect(team.lock_until).toBeNull();
    expect(team.progress).toBe(0);
  });

  test("correct answer increments progress exactly once", async () => {
    setup({ progress: 0, stage: "awaiting_puzzle" });
    const res = await request(app)
      .post("/api/team/verify-answer")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredAns: "ANS1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.state.team.progress).toBe(1);
    expect(res.body.state.stage).toBe("awaiting_code");

    const team = mockSupabase.__testing.getTable("teams").find((t) => t.id === "team-a");
    expect(team.progress).toBe(1);
    expect(team.stage).toBe("awaiting_code");
  });

  test("answering the fifth stop's puzzle (progress 4 -> 5) finishes team", async () => {
    const finalIsland = {
      id: "i-final",
      correct_code: "FINAL",
      clue_statement: "Final",
      is_common_room: true,
    };
    setup({
      // The last stop carries a puzzle here, so answering it is what takes
      // progress to 5 and trips the finish branch in verify-answer.
      route: [
        { island_id: "i1", question_id: "q1" },
        { island_id: "i2", question_id: "q2" },
        { island_id: "i1", question_id: "q1" },
        { island_id: "i1", question_id: "q1" },
        { island_id: "i-final", question_id: "q2" },
      ],
      progress: 4,
      stage: "awaiting_puzzle",
    });
    // After setup, which reseeds the islands table.
    mockSupabase.__testing.setTable("islands", [island1, island2, finalIsland]);

    const res = await request(app)
      .post("/api/team/verify-answer")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredAns: "ANS2" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.state.team.progress).toBe(5);
    expect(res.body.state.stage).toBe("finished");
    expect(res.body.state.team.status).toBe("finished");
  });

  test("finished team cannot continue (verify-answer reports finished, not 404)", async () => {
    setup({ progress: 5, stage: "awaiting_code", status: "finished" });
    const res = await request(app)
      .post("/api/team/verify-answer")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredAns: "ANS1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.reason).toBe("finished");
    expect(res.body.state.stage).toBe("finished");
    expect(res.body.state.team.progress).toBe(5);
  });

  test("wrong answer returns success:false (no lock, no progress change)", async () => {
    setup({ progress: 0, stage: "awaiting_puzzle" });
    const res = await request(app)
      .post("/api/team/verify-answer")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredAns: "WRONG" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);

    const team = mockSupabase.__testing.getTable("teams").find((t) => t.id === "team-a");
    expect(team.progress).toBe(0);
    expect(team.stage).toBe("awaiting_puzzle");
    expect(team.status).toBe("active");
  });

  test("verify-answer when locked returns locked", async () => {
    const lockUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    setup({ stage: "awaiting_puzzle", status: "locked", lock_until: lockUntil });
    const res = await request(app)
      .post("/api/team/verify-answer")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredAns: "ANS1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.reason).toBe("locked");
    expect(res.body.lock_until).toBe(lockUntil);
  });

  test("verify-answer with wrong stage returns wrong_stage", async () => {
    setup({ stage: "awaiting_code" });
    const res = await request(app)
      .post("/api/team/verify-answer")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredAns: "ANS1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.reason).toBe("wrong_stage");
  });

  test("enteredAns validation", async () => {
    setup();
    const res = await request(app)
      .post("/api/team/verify-answer")
      .set("Authorization", `Bearer ${signToken("team-a")}`)
      .send({ enteredAns: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("enteredAns required");
  });
});
