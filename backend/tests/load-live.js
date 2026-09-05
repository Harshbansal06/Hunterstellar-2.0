#!/usr/bin/env node
/**
 * Live load test for the deployed Odyssey backend.
 *
 * Phases:
 *   1. Register 150 test teams (parallel, webhook-authed)
 *   2. Login all 150 teams (rate-limited: 5/min per IP → batched)
 *   3. Fire concurrent requests against key endpoints and measure latency
 *
 * Usage:
 *   WEBHOOK_SECRET=<secret> node tests/load-live.js
 *
 * No dependencies beyond Node 18+ (uses global fetch).
 */

const TEAM_COUNT = 150;
const BASE_URL = "https://odyssey-production-a1c0.up.railway.app";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.error("Set WEBHOOK_SECRET env var. Example:");
  console.error("  WEBHOOK_SECRET=abc123 node tests/load-live.js");
  process.exit(1);
}

const PASSWORD = "loadtest-pw-2026";
const PREFIX = `loadtest_${Date.now()}_`;

// ─── helpers ───────────────────────────────────────────────────────────

function log(phase, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${phase}] ${msg}`);
}

async function post(path, body, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return res;
}

async function get(path, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  return res;
}

function stats(latencies) {
  if (!latencies.length) return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const percentile = (p) =>
    sorted[Math.floor(sorted.length * p) - 1] || sorted[sorted.length - 1];
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
  };
}

function bar(label, s, unit = "ms") {
  log(
    "stats",
    `${label.padEnd(38)} min=${s.min}${unit}  avg=${s.avg}${unit}  p50=${s.p50}${unit}  p95=${s.p95}${unit}  p99=${s.p99}${unit}  max=${s.max}${unit}`,
  );
}

// ─── phase 1: register 150 teams ──────────────────────────────────────

async function registerTeams() {
  log("register", `Registering ${TEAM_COUNT} teams...`);
  const t0 = Date.now();

  const results = await Promise.allSettled(
    Array.from({ length: TEAM_COUNT }, (_, i) =>
      post(
        "/api/team/register",
        {
          team_name: `${PREFIX}${i}`,
          team_leader: `Leader ${i}`,
          members: [`Leader ${i}`],
          password: PASSWORD,
          email: `loadtest${i}@test.local`,
        },
        {
          "x-webhook-secret": WEBHOOK_SECRET,
        },
      ).then((res) => ({ status: res.status, i })),
    ),
  );

  const ok = results.filter(
    (r) => r.status === "fulfilled" && r.value.status === 200,
  ).length;
  const failed = results.filter(
    (r) => r.status === "rejected" || (r.value && r.value.status !== 200),
  );
  const elapsed = Date.now() - t0;

  log("register", `Done in ${elapsed}ms, ${ok}/${TEAM_COUNT} registered`);
  if (failed.length > 0) {
    log("register", `${failed.length} failures, first 5:`);
    failed.slice(0, 5).forEach((f) => {
      if (f.status === "rejected")
        log("register", `  rejected: ${f.reason?.message || f.reason}`);
      else log("register", `  status ${f.value.status}`);
    });
  }

  return ok;
}

// ─── phase 2: login all teams (rate-limited) ──────────────────────────

async function loginTeams() {
  log("login", `Logging in ${TEAM_COUNT} teams (rate-limited: 5/min per IP)...`);
  const t0 = Date.now();
  const BATCH = 5;
  const DELAY_MS = 62_000; // slightly over 60s window
  const tokens = [];

  for (let batchStart = 0; batchStart < TEAM_COUNT; batchStart += BATCH) {
    const batchEnd = Math.min(batchStart + BATCH, TEAM_COUNT);
    const batchNum = Math.floor(batchStart / BATCH) + 1;
    const totalBatches = Math.ceil(TEAM_COUNT / BATCH);

    const results = await Promise.allSettled(
      Array.from({ length: batchEnd - batchStart }, (_, j) => {
        const i = batchStart + j;
        return post("/api/login", {
          team_name: `${PREFIX}${i}`,
          password: PASSWORD,
        }).then(async (res) => {
          if (res.status === 200) {
            const data = await res.json();
            return { i, token: data.token, status: 200 };
          }
          return { i, status: res.status };
        });
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.token) {
        tokens[r.value.i] = r.value.token;
      }
    }

    const loggedIn = tokens.filter(Boolean).length;
    log(
      "login",
      `batch ${batchNum}/${totalBatches}, ${loggedIn}/${TEAM_COUNT} tokens so far`,
    );

    if (batchEnd < TEAM_COUNT) {
      log("login", `waiting ${DELAY_MS / 1000}s for rate limit window...`);
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  const elapsed = Date.now() - t0;
  log(
    "login",
    `Done in ${(elapsed / 1000).toFixed(1)}s, ${tokens.filter(Boolean).length}/${TEAM_COUNT} tokens obtained`,
  );
  return tokens;
}

// ─── phase 3: concurrent load ──────────────────────────────────────────

async function measure(label, fn) {
  const t0 = Date.now();
  const result = await fn();
  const elapsed = Date.now() - t0;
  return { label, result, elapsed };
}

async function runLoadPhase(label, requests) {
  log("load", `── ${label}, ${requests.length} concurrent requests ──`);
  const t0 = Date.now();

  const settled = await Promise.allSettled(requests);
  const elapsed = Date.now() - t0;

  const fulfilled = settled.filter((r) => r.status === "fulfilled");
  const rejected = settled.filter((r) => r.status === "rejected");
  const responses = fulfilled.map((r) => r.value);

  const byStatus = {};
  for (const res of responses) {
    byStatus[res.status] = (byStatus[res.status] || 0) + 1;
  }

  const latencies = responses.map((r) => r.ms);
  const s = stats(latencies);

  log("load", `completed in ${elapsed}ms (wall clock)`);
  log("load", `status breakdown: ${JSON.stringify(byStatus)}`);
  if (rejected.length) log("load", `rejected (network errors): ${rejected.length}`);
  bar("latency", s);

  return { label, byStatus, rejected: rejected.length, stats: s, wallClock: elapsed };
}

async function runLoadTests(tokens) {
  const validTokens = tokens.filter(Boolean);
  if (validTokens.length === 0) {
    log("load", "No tokens available, skipping authenticated load tests");
    return [];
  }

  const results = [];

  // ── 3a: health endpoint (unauthenticated, baseline) ──
  results.push(
    await runLoadPhase(
      "GET /health (unauthenticated)",
      validTokens.map(() =>
        get("/health")
          .then(async (res) => ({ status: res.status, ms: Date.now() }))
          .catch((e) => ({ status: 0, ms: Date.now() })),
      ),
    ),
  );

  // ── 3b: /api/event (unauthenticated) ──
  results.push(
    await runLoadPhase(
      "GET /api/event (unauthenticated)",
      validTokens.map(() =>
        get("/api/event")
          .then(async (res) => ({ status: res.status, ms: Date.now() }))
          .catch((e) => ({ status: 0, ms: Date.now() })),
      ),
    ),
  );

  // ── 3c: /api/team/state (authenticated, read-only) ──
  results.push(
    await runLoadPhase(
      "GET /api/team/state (authenticated)",
      validTokens.map((token) =>
        get("/api/team/state", { Authorization: `Bearer ${token}` })
          .then(async (res) => ({ status: res.status, ms: Date.now() }))
          .catch((e) => ({ status: 0, ms: Date.now() })),
      ),
    ),
  );

  // ── 3d: /api/team/verify-code (write, each team submits wrong code) ──
  results.push(
    await runLoadPhase(
      "POST /api/team/verify-code (150 concurrent writes)",
      validTokens.map((token) =>
        post(
          "/api/team/verify-code",
          { enteredCode: "WRONG_LOADTEST" },
          { Authorization: `Bearer ${token}` },
        )
          .then(async (res) => ({ status: res.status, ms: Date.now() }))
          .catch((e) => ({ status: 0, ms: Date.now() })),
      ),
    ),
  );

  // ── 3e: 300 concurrent (double-submit simulation) ──
  const doubleTokens = [...validTokens, ...validTokens];
  results.push(
    await runLoadPhase(
      "POST /api/team/verify-code x2 (300 concurrent, double-submit)",
      doubleTokens.map((token) =>
        post(
          "/api/team/verify-code",
          { enteredCode: "WRONG_LOADTEST" },
          { Authorization: `Bearer ${token}` },
        )
          .then(async (res) => ({ status: res.status, ms: Date.now() }))
          .catch((e) => ({ status: 0, ms: Date.now() })),
      ),
    ),
  );

  // ── 3f: /api/team/state rapid re-poll (simulates 15s refresh cycle) ──
  const pollsPerTeam = 3;
  const pollRequests = [];
  for (let p = 0; p < pollsPerTeam; p++) {
    for (const token of validTokens) {
      pollRequests.push(
        get("/api/team/state", { Authorization: `Bearer ${token}` })
          .then(async (res) => ({ status: res.status, ms: Date.now() }))
          .catch((e) => ({ status: 0, ms: Date.now() })),
      );
    }
  }
  results.push(
    await runLoadPhase(
      `GET /api/team/state x${pollsPerTeam} (${pollRequests.length} total)`,
      pollRequests,
    ),
  );

  return results;
}

// ─── phase 4: summary ──────────────────────────────────────────────────

function printSummary(results) {
  console.log("\n" + "═".repeat(72));
  console.log("  LOAD TEST SUMMARY, " + BASE_URL);
  console.log("═".repeat(72));

  for (const r of results) {
    const totalRequests =
      Object.values(r.byStatus).reduce((a, b) => a + b, 0) + r.rejected;
    const successRate = (((totalRequests - r.rejected) / totalRequests) * 100).toFixed(1);
    console.log(`\n  ${r.label}`);
    console.log(
      `    Requests: ${totalRequests}  |  Success: ${successRate}%  |  Errors: ${r.rejected}  |  Wall: ${r.wallClock}ms`,
    );
    console.log(`    Status: ${JSON.stringify(r.byStatus)}`);
    console.log(
      `    Latency: avg=${r.stats.avg}ms  p50=${r.stats.p50}ms  p95=${r.stats.p95}ms  p99=${r.stats.p99}ms  max=${r.stats.max}ms`,
    );
  }

  console.log("\n" + "═".repeat(72));
}

// ─── main ──────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║  Odyssey Live Load Test, 150 Concurrent Teams                 ║");
  console.log("║  Target: " + BASE_URL.padEnd(52) + "║");
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");

  // Phase 1: register
  const registered = await registerTeams();
  if (registered === 0) {
    console.error("No teams registered, aborting.");
    process.exit(1);
  }

  // Phase 2: login (slow, rate limited)
  const tokens = await loginTeams();

  // Phase 3: load test
  const results = await runLoadTests(tokens);

  // Phase 4: summary
  if (results.length > 0) printSummary(results);

  console.log("\nTest teams have prefix:", PREFIX);
  console.log("They remain in the database, clean up manually if needed.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
