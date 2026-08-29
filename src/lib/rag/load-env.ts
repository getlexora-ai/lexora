// Minimal .env.local reader for scripts run outside Next.js.
// Next injects env vars itself; the CLI (`node scripts/rag-*.mjs`) does not, so
// we parse the file the same way tests/rate-limit.test.mjs does.
// No dotenv dependency on purpose.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let loaded = false;

/** Load KEY=VALUE lines from lexora/.env.local into process.env (once, non-clobbering). */
export function loadEnvLocal(): void {
  if (loaded) return;
  loaded = true;

  // src/lib/rag/ -> repo root is three levels up.
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = join(here, "..", "..", "..", ".env.local");

  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return; // no file: rely on whatever is already in process.env
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
