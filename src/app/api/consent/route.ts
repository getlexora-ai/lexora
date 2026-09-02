import { NextRequest, NextResponse } from "next/server";
import { currentUserId, signInRequired } from "@/lib/auth";
import {
  getLatestConsent,
  hasCurrentConsent,
  recordConsent,
  type ConsentMethod,
} from "@/lib/legal/consent";
import { POLICY_VERSION } from "@/lib/legal/policies";

function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip");
}

/** Whether the signed-in user has accepted the legal documents in force. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  const latest = await getLatestConsent(userId);
  return NextResponse.json({
    currentVersion: POLICY_VERSION,
    accepted: latest?.policy_version === POLICY_VERSION,
    latest,
  });
}

/** Record the signed-in user's acceptance of the current legal documents. */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  if (await hasCurrentConsent(userId)) {
    return NextResponse.json({ ok: true, alreadyRecorded: true });
  }

  let method: ConsentMethod = "signup";
  try {
    const body = (await req.json()) as { method?: string } | null;
    if (body?.method === "reprompt" || body?.method === "settings") {
      method = body.method;
    }
  } catch {
    /* an empty body is fine, method stays "signup" */
  }

  await recordConsent({
    userId,
    method,
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true, version: POLICY_VERSION });
}
