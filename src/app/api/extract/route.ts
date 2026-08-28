import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/errors";

const EXTRACT_FAILED = "We couldn't read text from that file. Try a different file or try again.";

export const maxDuration = 120;

const BASE_URL = process.env.LLMWHISPERER_BASE_URL!;
const API_KEY  = process.env.LLMWHISPERER_API_KEY!;

const HEADERS = { "unstract-key": API_KEY };

async function retrieveResult(whisperHash: string): Promise<string> {
  // GET /whisper-retrieve?whisper_hash=HASH → JSON { extraction: { result_text: "..." } }
  const res = await fetch(
    `${BASE_URL}/whisper-retrieve?whisper_hash=${encodeURIComponent(whisperHash)}`,
    { headers: HEADERS },
  );
  if (!res.ok) throw new Error(`Retrieve failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  // /whisper-retrieve returns the extraction object directly as the response body
  // (the Python SDK wraps it in { extraction: ... } locally, but raw HTTP is just the object)
  return data?.result_text ?? data?.extraction?.result_text ?? "";
}

async function pollUntilProcessed(whisperHash: string): Promise<string> {
  // GET /whisper-status?whisper_hash=HASH  ← note underscore
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 5000));

    const res = await fetch(
      `${BASE_URL}/whisper-status?whisper_hash=${encodeURIComponent(whisperHash)}`,
      { headers: HEADERS },
    );
    if (!res.ok) throw new Error(`Status check failed (${res.status}): ${await res.text()}`);

    const status = await res.json();
    const s = status?.status ?? "";

    if (s === "processed") return await retrieveResult(whisperHash);
    if (s === "error" || s.startsWith("error")) throw new Error(`LLMWhisperer error: ${status?.message ?? s}`);
    // "accepted" or "processing" → keep polling
  }
  throw new Error("LLMWhisperer timed out after 3+ minutes");
}

export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, "extract");
    if (limited) return limited;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const bytes = Buffer.from(await file.arrayBuffer());

    // Original-file storage was dropped in the move off Supabase; only the
    // extracted text is persisted now.
    const filePath: string | null = null;

    // Match Python SDK: raw binary body, query params for config (no wait_timeout — handled client-side)
    const params = new URLSearchParams({
      mode:           "high_quality",
      output_mode:    "layout_preserving",
      page_seperator: "<<<",
      filename:       file.name,
    });

    const submitRes = await fetch(`${BASE_URL}/whisper?${params}`, {
      method:  "POST",
      headers: { ...HEADERS, "Content-Type": "application/octet-stream" },
      body:    bytes,
    });

    if (submitRes.status === 200) {
      // Synchronous result — extraction is in the body directly
      const data = await submitRes.json();
      const text = data?.extraction?.result_text ?? "";
      if (!text) return NextResponse.json({ error: "no_text", message: EXTRACT_FAILED }, { status: 422 });
      return NextResponse.json({ text, file_path: filePath });
    }

    if (submitRes.status === 202) {
      // Async — poll with whisper_hash (underscore)
      const data = await submitRes.json();
      const whisperHash = data?.whisper_hash;
      if (!whisperHash) {
        console.error("[extract] no whisper_hash in 202 response:", JSON.stringify(data));
        return NextResponse.json({ error: "upstream_error", message: EXTRACT_FAILED }, { status: 502 });
      }
      const text = await pollUntilProcessed(whisperHash);
      if (!text) return NextResponse.json({ error: "no_text", message: EXTRACT_FAILED }, { status: 422 });
      return NextResponse.json({ text, file_path: filePath });
    }

    // Any other status = error
    console.error(`[extract] LLMWhisperer submit failed (${submitRes.status}): ${await submitRes.text()}`);
    return NextResponse.json({ error: "upstream_error", message: EXTRACT_FAILED }, { status: 502 });

  } catch (err) {
    return errorResponse(err, "extract");
  }
}
