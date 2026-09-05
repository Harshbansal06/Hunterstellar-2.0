const jwt = require("jsonwebtoken");

/**
 * @param sid  optional session id. Omitted by default, which mirrors a token
 *             minted before single-session login existed -- the case the
 *             permissive NULL session_token fallback has to keep working.
 */
function signToken(userId, sid) {
  const payload = sid ? { userId, sid } : { userId };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "3h" });
}

function signExpiredToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "-1s" });
}

function signInvalidToken() {
  return "invalid.token.string";
}

module.exports = { signToken, signExpiredToken, signInvalidToken };
