import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { currentUserId, ownsContract, signInRequired } from "@/lib/auth";
import { getOriginal, isStorageEnabled } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

// GET /api/contracts/[id]/original — stream back the original uploaded file
// (owner only). 404 when storage is disabled, the contract has no stored key,
// or nothing is stored under that key.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return signInRequired();
  if (!(await ownsContract(id, userId))) return notFound();

  if (!isStorageEnabled()) return notFound();

  try {
    const row = await queryOne<{ file_path: string | null; name: string | null }>(
      `select file_path, name
         from contracts
        where id = $1 and user_id = $2 and deleted_at is null`,
      [id, userId],
    );
    const key = row?.file_path;
    if (!key) return notFound();

    const original = await getOriginal(key);
    if (!original) return notFound();

    const filename = downloadName(key, row?.name);
    const body = new Uint8Array(original.body);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": original.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(original.body.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/**
 * Recover a human download name from the storage key
 * (`originals/<userId>/<uuid>-<safeFilename>`), stripping the uuid prefix.
 * Falls back to the contract name. The result is header-safe (no quotes /
 * control chars).
 */
function downloadName(key: string, contractName: string | null | undefined): string {
  const segment = key.split("/").pop() ?? "";
  const stripped = segment.replace(/^[0-9a-fA-F-]{36}-/, "");
  const candidate = stripped || contractName || "original";
  const safe = candidate.replace(/[^A-Za-z0-9._ -]+/g, "_").slice(0, 200).trim();
  return safe || "original";
}
