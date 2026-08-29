// Load the curated German-rental knowledge base from src/lib/rag/corpus/*.md.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import type { CorpusDoc } from "./types.ts";

const CORPUS_DIR = join(dirname(fileURLToPath(import.meta.url)), "corpus");

/**
 * Parse a tiny YAML-ish frontmatter block:
 *
 *   ---
 *   title: Kaution (§ 551 BGB)
 *   source: BGB § 551, paraphrased
 *   tags: [kaution, deposit, sicherheit]
 *   ---
 *
 * Only `title` (string), `source` (string) and `tags` (inline list) are read.
 */
function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { meta: {}, body: raw };

  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: raw.slice(match[0].length) };
}

function parseTags(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/** Read every corpus doc, sorted by filename (the numeric prefix orders them). */
export function loadCorpus(): CorpusDoc[] {
  const files = readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  return files.map((file) => {
    const raw = readFileSync(join(CORPUS_DIR, file), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const id = basename(file, ".md");
    return {
      id,
      title: meta.title || id,
      source: meta.source || "curated",
      tags: parseTags(meta.tags),
      body: body.trim(),
    };
  });
}
