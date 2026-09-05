const { Resend } = require("resend");

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const WELCOME_SUBJECT = "Hunterstellar 2.0: your shuttlecraft credentials";

/**
 * Field names here are copied from the registration form, and the login
 * screen uses the same two. That consistency is the point: a crew reading
 * this email while looking at the login screen must not have to work out that
 * "Team name" and "Shuttlecraft Callsign" are the same thing.
 */
function renderWelcomeTemplate({ team_name, password, email }) {
  return `
    <h1>Welcome aboard, ${team_name}!</h1>
    <p>Your crew is registered for Hunterstellar 2.0. Sign in with these:</p>
    <p>Shuttlecraft Callsign: <strong>${team_name}</strong></p>
    <p>Rust Bucket Access Code: <strong>${password}</strong></p>
    <p>Registered email: ${email}</p>
    <p>Keep this email, you will need both to log in, and only one device can be signed in at a time.</p>
  `;
}

async function sendWelcomeEmail({ to, team_name, password, email }) {
  if (!resend) {
    console.warn(
      "Resend not configured (RESEND_API_KEY missing), skipping welcome email.",
    );
    return;
  }

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "Odyssey Hunt <noreply@example.com>",
      to,
      subject: WELCOME_SUBJECT,
      html: renderWelcomeTemplate({ team_name, password, email }),
    });
    console.log(`Welcome email sent to ${to}`);
  } catch (err) {
    console.error("Failed to send welcome email:", err);
  }
}

module.exports = { sendWelcomeEmail };
