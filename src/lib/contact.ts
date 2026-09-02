/**
 * Contact-form handling: persist every message, then best-effort email a copy
 * to the contact address over SMTP.
 *
 * Storage is the source of truth (table `contact_messages`, see
 * db/011_contact_messages.sql). Email delivery is optional and non-fatal: it
 * runs only when SMTP is configured, and a failure never loses the message.
 *
 * Env (all from the mailbox that hosts hello@getlexora.de):
 *   SMTP_HOST             e.g. "smtp.zoho.eu", "smtp.ionos.de", "smtp.gmail.com"
 *   SMTP_PORT             465 (implicit TLS) or 587 (STARTTLS). Default: 587.
 *   SMTP_USER             usually the full address, e.g. "hello@getlexora.de"
 *   SMTP_PASS             mailbox password, or an app-specific password if the
 *                         provider requires one (Google Workspace, Zoho with 2FA)
 *   SMTP_SECURE           "true" / "false". Default: true when port is 465.
 *   CONTACT_FORWARD_TO    destination inbox. Default: hello@getlexora.de
 *   CONTACT_FORWARD_FROM  From header. Default: "Lexora <${SMTP_USER}>".
 *                         Most SMTP servers require this to match SMTP_USER.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { query, queryOne } from "@/lib/db";

const FORWARD_TO = process.env.CONTACT_FORWARD_TO ?? "hello@getlexora.de";

export type ContactInput = {
  name: string;
  email: string;
  message: string;
  ip: string | null;
  userAgent: string | null;
};

/** Insert the message and return its id. */
export async function saveContactMessage(input: ContactInput): Promise<number> {
  const row = await queryOne<{ id: string }>(
    `insert into contact_messages (name, email, message, ip, user_agent)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [input.name, input.email, input.message, input.ip, input.userAgent],
  );
  return Number(row?.id ?? 0);
}

// Cache the transporter across invocations (and across hot-reloads in dev).
const globalForMail = globalThis as unknown as { mailer?: Transporter | null };

function transporter(): Transporter | null {
  if (globalForMail.mailer !== undefined) return globalForMail.mailer;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn("[contact] SMTP not configured — messages are stored only.");
    globalForMail.mailer = null;
    return null;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure =
    process.env.SMTP_SECURE != null
      ? process.env.SMTP_SECURE === "true"
      : port === 465;

  globalForMail.mailer = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    // Cloud hosts + IONOS/465 can stall on connect. Bound every phase so a
    // hung SMTP server can never wedge the caller.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return globalForMail.mailer;
}

/**
 * Email a copy of the message to the contact inbox. Returns true only when the
 * hand-off to the SMTP server succeeded. Never throws.
 */
export async function forwardContactEmail(
  id: number,
  input: ContactInput,
): Promise<boolean> {
  const mailer = transporter();
  if (!mailer) return false;

  const from =
    process.env.CONTACT_FORWARD_FROM ??
    `Lexora <${process.env.SMTP_USER as string}>`;

  const text = [
    `New message from the Lexora contact form (#${id})`,
    "",
    `Name:  ${input.name}`,
    `Email: ${input.email}`,
    input.ip ? `IP:    ${input.ip}` : null,
    "",
    input.message,
  ]
    .filter((line) => line !== null)
    .join("\n");

  try {
    await mailer.sendMail({
      from,
      to: FORWARD_TO,
      replyTo: input.email,
      subject: `Contact form: ${input.name}`,
      text,
    });
    await query(`update contact_messages set forwarded = true where id = $1`, [
      id,
    ]).catch(() => {});
    return true;
  } catch (err) {
    console.error("[contact] SMTP send failed:", err);
    return false;
  }
}
