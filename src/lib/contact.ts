/**
 * Contact-form handling: persist every message, then best-effort email a copy
 * to the contact address.
 *
 * Storage is the source of truth (table `contact_messages`, see
 * db/011_contact_messages.sql). Email delivery is optional and non-fatal: it
 * runs only when RESEND_API_KEY is set, and a failure never loses the message.
 *
 * Env:
 *   RESEND_API_KEY        Resend API key. Unset ⇒ messages are stored only.
 *   CONTACT_FORWARD_TO    Destination inbox. Default: hello@getlexora.de
 *   CONTACT_FORWARD_FROM  From header. Default: Resend's shared onboarding
 *                         sender, which works before domain verification.
 *                         Switch to an address on a domain you've verified in
 *                         Resend (e.g. "Lexora <contact@getlexora.de>").
 */
import { query, queryOne } from "@/lib/db";

const FORWARD_TO = process.env.CONTACT_FORWARD_TO ?? "hello@getlexora.de";
const FORWARD_FROM =
  process.env.CONTACT_FORWARD_FROM ?? "Lexora contact form <onboarding@resend.dev>";

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

/**
 * Email a copy of the message to the contact inbox. Returns true only when the
 * hand-off to the email provider succeeded. Never throws.
 */
export async function forwardContactEmail(
  id: number,
  input: ContactInput,
): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;

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
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FORWARD_FROM,
        to: [FORWARD_TO],
        reply_to: input.email,
        subject: `Contact form: ${input.name}`,
        text,
      }),
    });
    if (!res.ok) {
      console.error(
        "[contact] Resend responded",
        res.status,
        await res.text().catch(() => ""),
      );
      return false;
    }
    await query(`update contact_messages set forwarded = true where id = $1`, [
      id,
    ]).catch(() => {});
    return true;
  } catch (err) {
    console.error("[contact] email forward failed:", err);
    return false;
  }
}
