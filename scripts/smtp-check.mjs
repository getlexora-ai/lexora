// Diagnose contact-form email delivery in isolation — no Next, no DB.
//
//   node scripts/smtp-check.mjs
//
// Reads SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS (and the
// optional CONTACT_FORWARD_TO / CONTACT_FORWARD_FROM) from lexora/.env.local,
// verifies the connection, then sends one test message. Prints the exact
// error from the mail server if anything fails — the fast way to tell a wrong
// password from a blocked port from a rejected sender.

import nodemailer from "nodemailer";

try {
  process.loadEnvFile(".env.local");
} catch {
  console.log("(no .env.local found — using the current environment)\n");
}

const host = process.env.SMTP_HOST;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const port = Number(process.env.SMTP_PORT ?? 587);
const secure =
  process.env.SMTP_SECURE != null
    ? process.env.SMTP_SECURE === "true"
    : port === 465;
const to = process.env.CONTACT_FORWARD_TO ?? "hello@getlexora.de";
const from = process.env.CONTACT_FORWARD_FROM ?? `Lexora <${user}>`;

function mask(s) {
  if (!s) return "(unset)";
  if (s.length <= 4) return `${s[0]}***  (len ${s.length})`;
  return `${s[0]}***${s[s.length - 1]}  (len ${s.length})`;
}

console.log("SMTP config seen by the app:");
console.log("  SMTP_HOST  ", host ?? "(unset)");
console.log("  SMTP_PORT  ", port);
console.log("  SMTP_SECURE", secure);
console.log("  SMTP_USER  ", user ?? "(unset)");
console.log("  SMTP_PASS  ", mask(pass));
console.log("  from       ", from);
console.log("  to         ", to);
console.log("");

if (!host || !user || !pass) {
  console.error("✗ SMTP_HOST, SMTP_USER and SMTP_PASS must all be set. Stop.");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
  logger: true, // print the full SMTP conversation
});

try {
  console.log("→ verifying connection and login…");
  await transporter.verify();
  console.log("✓ connection + auth OK\n");

  console.log(`→ sending a test message to ${to}…`);
  const info = await transporter.sendMail({
    from,
    to,
    subject: "Lexora SMTP check",
    text: "If you can read this, the contact form can deliver email.",
  });
  console.log("✓ accepted by the server");
  console.log("  messageId:", info.messageId);
  console.log("  response :", info.response);
  process.exit(0);
} catch (err) {
  console.error("\n✗ FAILED");
  console.error("  code   :", err.code ?? "(none)");
  console.error("  command:", err.command ?? "(none)");
  console.error("  message:", err.message);
  if (err.response) console.error("  server :", err.response);
  process.exit(1);
}
