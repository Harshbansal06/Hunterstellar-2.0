const { signToken } = require("./helpers/tokens");

jest.mock("../db/supabaseClient", () =>
  require("./helpers/mockSupabase").createMockSupabase(),
);
jest.mock("../utils/email", () => ({ sendWelcomeEmail: jest.fn() }));

const mockSupabase = require("../db/supabaseClient");
const {
  getTeamStateForUser,
  invalidateAllTeamStateCache,
} = require("../utils/teamState");

/**
 * getTeamStateForUser has two paths that must agree: the get_team_state RPC
 * (whose body lives in the database, not this repo, and whose result is
 * returned verbatim) and the sequential JS fallback.
 *
 * Production runs the RPC path. Tests, by default, run the fallback -- the
 * mock has no RPC registered. That asymmetry is exactly how a field can be
 * added to the fallback, pass every test, and ship nothing. These tests pin
 * both paths to the same contract.
 */
describe("team state contract (RPC path vs JS fallback)", () => {
  const ISLAND = {
    id: "i1",
    correct_code: "CODE1",
    clue_statement: "Behind the third pillar",
    clue_images: ["https://cdn.test/clue-1a.jpg", "https://cdn.test/clue-1b.jpg"],
    is_terminal: false,
    order: 1,
  };
  const QUESTION = {
    id: "q1",
    question_statement: "Q1",
    question_answer: "ANS1",
    domain: "test",
    que_img: ["https://cdn.test/question-1.jpg"],
  };

  function seed(overrides = {}) {
    mockSupabase.__testing.reset();
    mockSupabase.__testing.setTable("teams", [
      {
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
        ...overrides,
      },
    ]);
    mockSupabase.__testing.setTable("islands", [ISLAND]);
    mockSupabase.__testing.setTable("questions", [QUESTION]);
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
  }

  beforeEach(() => {
    seed();
  });

  describe("JS fallback (no RPC deployed)", () => {
    test("awaiting_code carries the clue, its images and the terminal flag", async () => {
      const state = await getTeamStateForUser("team-a");

      expect(state.stage).toBe("awaiting_code");
      expect(state.clue_statement).toBe("Behind the third pillar");
      expect(state.clue_images).toEqual(ISLAND.clue_images);
      expect(state.is_terminal).toBe(false);
      expect(state.team.password).toBeUndefined();
      expect(state.team.route).toBeUndefined();
    });

    test("an island with no images still yields an array, never undefined", async () => {
      mockSupabase.__testing.setTable("islands", [{ ...ISLAND, clue_images: null }]);
      invalidateAllTeamStateCache();

      const state = await getTeamStateForUser("team-a");
      expect(state.clue_images).toEqual([]);
    });

    test("every stage exposes clue_images so the client never branches on undefined", async () => {
      const stages = [
        {},
        { stage: "awaiting_puzzle" },
        { status: "locked", lock_until: new Date(Date.now() + 60000).toISOString() },
        { progress: 5, status: "finished" },
      ];

      for (const overrides of stages) {
        seed(overrides);
        const state = await getTeamStateForUser("team-a");
        expect(Array.isArray(state.clue_images)).toBe(true);
        expect(state).toHaveProperty("is_terminal");
      }
    });
  });

  describe("RPC path", () => {
    test("an RPC result missing images is hydrated from the island", async () => {
      // Mirrors production before migration 003: the function returns the clue
      // but knows nothing about the new columns.
      mockSupabase.__testing.setRpc("get_team_state", () => ({
        data: {
          team: { id: "team-a", team_name: "Team Alpha", progress: 0 },
          stage: "awaiting_code",
          clue_statement: "Behind the third pillar",
          notice: null,
          announcement: null,
        },
        error: null,
      }));

      const state = await getTeamStateForUser("team-a");

      expect(state.stage).toBe("awaiting_code");
      expect(state.clue_images).toEqual(ISLAND.clue_images);
      expect(state.is_terminal).toBe(false);
    });

    test("an RPC result that already has images is not re-queried", async () => {
      mockSupabase.__testing.setRpc("get_team_state", () => ({
        data: {
          team: { id: "team-a", team_name: "Team Alpha", progress: 0 },
          stage: "awaiting_code",
          clue_statement: "Behind the third pillar",
          clue_images: ["https://cdn.test/from-rpc.jpg"],
          is_terminal: false,
          notice: null,
          announcement: null,
        },
        error: null,
      }));

      const state = await getTeamStateForUser("team-a");

      expect(state.clue_images).toEqual(["https://cdn.test/from-rpc.jpg"]);
      // The whole point of the RPC is one round trip -- prove we didn't add one.
      const islandReads = mockSupabase.__testing
        .getCallLog()
        .filter((c) => c.table === "islands");
      expect(islandReads).toEqual([]);
    });

    test("a JSON-string RPC result is parsed and normalized like an object one", async () => {
      mockSupabase.__testing.setRpc("get_team_state", () => ({
        data: JSON.stringify({
          team: { id: "team-a", team_name: "Team Alpha", progress: 0 },
          stage: "awaiting_puzzle",
          question: "Q1",
        }),
        error: null,
      }));

      const state = await getTeamStateForUser("team-a");
      expect(state.stage).toBe("awaiting_puzzle");
      expect(state.question).toBe("Q1");
      expect(state.clue_images).toEqual([]);
    });

    test("question images reach the client on the fallback path", async () => {
      seed({ stage: "awaiting_puzzle" });

      const state = await getTeamStateForUser("team-a");
      expect(state.stage).toBe("awaiting_puzzle");
      expect(state.question_images).toEqual(QUESTION.que_img);
    });

    test("question images are hydrated when the RPC omits them", async () => {
      // The RPC body lives in the database and does not know about que_img
      // yet. Without hydration this is exactly how the column ships nothing
      // while every other test stays green.
      seed({ stage: "awaiting_puzzle" });
      mockSupabase.__testing.setRpc("get_team_state", () => ({
        data: {
          team: { id: "team-a", team_name: "Team Alpha", progress: 0 },
          stage: "awaiting_puzzle",
          question: "Q1",
        },
        error: null,
      }));

      const state = await getTeamStateForUser("team-a");
      expect(state.question_images).toEqual(QUESTION.que_img);
    });

    test("a question with no image yields an empty array, never null", async () => {
      // Most questions have no art; the client maps over this unconditionally.
      seed({ stage: "awaiting_puzzle" });
      mockSupabase.__testing.setTable("questions", [{ ...QUESTION, que_img: null }]);

      const state = await getTeamStateForUser("team-a");
      expect(state.question_images).toEqual([]);
    });

    test("an RPC error falls through to the fallback rather than failing", async () => {
      mockSupabase.__testing.setRpc("get_team_state", () => ({
        data: null,
        error: { message: "function does not exist", code: "42883" },
      }));

      const state = await getTeamStateForUser("team-a");
      expect(state.stage).toBe("awaiting_code");
      expect(state.clue_images).toEqual(ISLAND.clue_images);
    });
  });

  describe("cache isolation", () => {
    test("mutating a returned state does not poison the next read", async () => {
      const first = await getTeamStateForUser("team-a");
      first.clue_statement = "CORRUPTED";
      first.clue_images.push("https://cdn.test/injected.jpg");
      first.team.progress = 99;

      const second = await getTeamStateForUser("team-a");

      expect(second.clue_statement).toBe("Behind the third pillar");
      expect(second.team.progress).toBe(0);
    });

    test("two readers inside the cache window get independent objects", async () => {
      const a = await getTeamStateForUser("team-a");
      const b = await getTeamStateForUser("team-a");

      expect(a).not.toBe(b);
      expect(a.team).not.toBe(b.team);
      expect(b).toEqual(a);
    });
  });

  test("an unknown team reports 404 rather than an empty state", async () => {
    const state = await getTeamStateForUser("nobody");
    expect(state.error).toBe(true);
    expect(state.status).toBe(404);
  });

  test("token helper stays in sync with the ids used here", () => {
    expect(typeof signToken("team-a")).toBe("string");
  });
});
