import { NextResponse } from "next/server";
import { currentUserId, signInRequired } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { currentFeedToken, feedUrl, rotateFeedToken, FEED_REFRESH_MINUTES } from "@/lib/calendar";

// GET /api/calendar/feed — the caller's subscription URL, minted on first use.
// This is what the UI shows behind a "Add to your calendar" button.
export async function GET() {
  try {
    const userId = await currentUserId();
    if (!userId) return signInRequired();

    const token = await currentFeedToken(userId);
    return NextResponse.json({
      url: feedUrl(token.token),
      // Both schemes point at the same route; webcal:// makes desktop calendar
      // apps subscribe instead of downloading a one-off file.
      webcalUrl: feedUrl(token.token).replace(/^https?:/, "webcal:"),
      createdAt: token.created_at,
      lastUsedAt: token.last_used_at,
      refreshMinutes: FEED_REFRESH_MINUTES,
    });
  } catch (err) {
    return errorResponse(err, "api/calendar/feed");
  }
}

// POST /api/calendar/feed — rotate. Revokes every live token immediately: the
// reason to rotate is that the old URL leaked, so a grace period would defeat
// the point. Existing subscribers must re-add the new URL.
export async function POST() {
  try {
    const userId = await currentUserId();
    if (!userId) return signInRequired();

    const token = await rotateFeedToken(userId);
    return NextResponse.json({
      url: feedUrl(token.token),
      webcalUrl: feedUrl(token.token).replace(/^https?:/, "webcal:"),
      rotated: true,
    });
  } catch (err) {
    return errorResponse(err, "api/calendar/feed");
  }
}
