import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

/**
 * Compute (paid-AI) endpoints. A signed-out POST to any of these gets a 401
 * JSON — never a sign-in redirect, because these are API calls. Everything
 * else is untouched: the `/api/contracts/*` routes keep doing their own
 * `currentUserId()` checks, and all non-POST / non-compute traffic passes
 * through exactly as before.
 */
const GATED_COMPUTE_PATHS = new Set([
  "/api/analyse",
  "/api/generate",
  "/api/extract",
  "/api/refine",
  "/api/chat",
  "/api/contract-edit",
  "/api/clause-library/search", // embeds the query with Gemini
  "/api/templates/suggest-variables", // askLLM to extract variables
]);

/** `/api/contracts/<id>/reanalyse` — id is dynamic. */
const GATED_COMPUTE_PATTERN = /^\/api\/contracts\/[^/]+\/reanalyse$/;

function isGatedCompute(req: NextRequest): boolean {
  if (req.method !== "POST") return false;
  const path = req.nextUrl.pathname;
  return GATED_COMPUTE_PATHS.has(path) || GATED_COMPUTE_PATTERN.test(path);
}

export default clerkMiddleware(async (auth, req) => {
  if (isGatedCompute(req)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
