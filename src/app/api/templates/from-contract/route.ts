import { NextRequest, NextResponse } from "next/server";
import { currentUserId, ownsContract, signInRequired } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { createTemplate, type TemplateVariable } from "@/lib/contract-templates";
import { deltaToText, type Delta } from "@/lib/delta-text";

type Replacement = { literal: string; key: string; label?: string; type?: string };

const VAR_TYPES = new Set(["text", "textarea", "number", "date", "select", "currency"]);

// POST /api/templates/from-contract — de-identify a contract into a template by
// a deterministic literal → {{key}} replacement over its flattened text. No LLM.
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) return signInRequired();

  let body: { contractId?: string; name?: string; replacements?: Replacement[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const contractId = typeof body.contractId === "string" ? body.contractId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!contractId || !name) {
    return NextResponse.json({ error: "contractId and name are required" }, { status: 400 });
  }
  if (!(await ownsContract(contractId, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const replacements = (Array.isArray(body.replacements) ? body.replacements : [])
    .filter((r): r is Replacement => !!r && typeof r.literal === "string" && typeof r.key === "string")
    .map((r) => ({
      literal: r.literal,
      key: r.key.trim().replace(/[^\w]/g, "_"),
      label: typeof r.label === "string" && r.label.trim() ? r.label.trim() : r.key,
      type: typeof r.type === "string" && VAR_TYPES.has(r.type) ? r.type : "text",
    }))
    .filter((r) => r.literal.length > 0 && r.key.length > 0)
    // longest literal first so a shorter literal can't chew into a longer match
    .sort((a, b) => b.literal.length - a.literal.length);

  try {
    const contract = await queryOne<{ quill_delta: Delta | null; extracted_text: string | null; contract_type: string }>(
      `select quill_delta, extracted_text, contract_type
         from contracts where id = $1 and user_id = $2 and deleted_at is null`,
      [contractId, userId],
    );
    if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let text = contract.quill_delta
      ? deltaToText(contract.quill_delta)
      : (contract.extracted_text ?? "");
    if (!text.trim()) {
      return NextResponse.json({ error: "the contract has no text to templatise" }, { status: 400 });
    }

    for (const r of replacements) {
      text = text.split(r.literal).join(`{{${r.key}}}`);
    }

    // De-dupe variables by key (a literal may be entered twice).
    const seen = new Set<string>();
    const variables: TemplateVariable[] = [];
    for (const r of replacements) {
      if (seen.has(r.key)) continue;
      seen.add(r.key);
      variables.push({ key: r.key, label: r.label, type: r.type as TemplateVariable["type"], required: true });
    }

    const template = await createTemplate(userId, {
      name,
      contract_type: contract.contract_type || "Other",
      body: text,
      variables,
      sections: [],
      based_on_contract_id: contractId,
      description: `Created from a contract on ${new Date().toISOString().slice(0, 10)}.`,
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
