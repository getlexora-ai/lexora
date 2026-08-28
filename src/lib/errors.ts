import { NextResponse } from "next/server";

/**
 * An error whose `message` is safe to show a user, carrying an HTTP status and a
 * short machine `code`. Throw this from libs/routes for anything the user should
 * see a real explanation for; anything else becomes a generic 500.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Turn any thrown value into a JSON error response the frontend can render:
 *   { error: <code>, message: <human-readable> }
 * - AppError  → its own status / code / message
 * - anything else → 500 "internal", with the real error logged server-side only
 */
export function errorResponse(err: unknown, context = "api"): NextResponse {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  }
  console.error(`[${context}]`, err);
  return NextResponse.json(
    { error: "internal", message: "Something went wrong on our end. Please try again." },
    { status: 500 },
  );
}
