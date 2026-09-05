const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

// Validates and throws before a single route is wired. See config/env.js for
// why booting is the right place to fail.
const { readEnv } = require("./config/env");

const env = readEnv();
const app = express();
const PORT = env.port;

app.set("trust proxy", env.trustProxyHops);

// The frontend is served from a different origin than the API, so the
// rate-limit headers must be listed here or the browser hides them and the
// client falls back to a guessed 60s countdown against a 15 minute window.
app.use(
  cors({
    exposedHeaders: [
      "RateLimit-Limit",
      "RateLimit-Remaining",
      "RateLimit-Reset",
      "Retry-After",
    ],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("combined"));

app.use("/api", require("./routes/eventRoutes"));
app.use("/api", require("./routes/authRoutes"));
app.use("/api", require("./routes/teamRoutes"));
app.use("/api", require("./routes/adminRoutes"));

/**
 * Liveness and readiness in one endpoint.
 *
 * The previous version initialised `dbStatus` to "ok" and skipped the probe
 * when the client was missing, so an unconfigured deploy reported
 * `{"status":"healthy","database":"ok"}` while failing every real request. A
 * health check that goes green with no database is worse than no health check,
 * because it is what an uptime monitor trusts.
 *
 * Two things changed. The probe always runs, because the client is now
 * guaranteed to exist. And a degraded result answers 503, not 200: a monitor
 * and a load balancer both read the status code, not the body, so returning
 * 200 with `"degraded"` inside means nobody is ever paged.
 */
app.get("/health", async (req, res) => {
  const supabase = require("./db/supabaseClient");

  let database = "ok";
  let detail = null;

  try {
    const { error } = await supabase.from("event_config").select("id").limit(1);
    if (error) {
      database = "degraded";
      detail = error.message;
    }
  } catch (err) {
    database = "degraded";
    detail = err.message;
  }

  const healthy = database === "ok";
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "healthy" : "degraded",
    database,
    ...(detail ? { detail } : {}),
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      message: err.message,
      stack: err.stack,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userId: req.userId || null,
    }),
  );
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? "Internal server error" : err.message,
  });
});

let server;

if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);
  if (server) {
    server.close(() => {
      console.log("HTTP server closed");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
  setTimeout(() => {
    console.error("Forced shutdown");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = app;
