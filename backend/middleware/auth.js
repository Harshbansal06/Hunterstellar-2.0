const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Not logged in" });

  try {
    const payload = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    req.userId = payload.userId;
    // Carried through, not checked here. Verifying it against the database
    // would cost a read on every /team/state poll; the write handlers already
    // hold the team row, so they do the check. See utils/session.js.
    req.sessionId = payload.sid;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}

function requireAdmin(req, res, next) {
  const secret = req.headers["x-admin-secret"];

  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  console.log(
    `ADMIN ACTION: ${req.method} ${req.path} from ${req.ip} at ${new Date().toISOString()}`,
  );
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
};
