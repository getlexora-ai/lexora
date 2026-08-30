// Pure template renderer — substitutes `{{placeholders}}` in a template body.
//
// NO `@/` imports, NO next/server, relative imports only (node builtins are
// fine) so `node --test` can import this file directly. See
// src/lib/clause-taxonomy.ts:1-10 for why that constraint exists.
//
// Rules (see the Wave 3 plan):
//   - `{{key}}` (and `{{ key }}` with whitespace) is replaced by values[key].
//   - An unknown `{{key}}` is left VERBATIM — never blanked. A vanished
//     placeholder is a silent legal hole.
//   - A `{{key}}` declared `required` in `variables` but absent from `values`
//     is left verbatim AND reported in `missing[]`.
//   - `{{section:foo}}` markers: if `foo` is absent from `sections` or disabled,
//     the whole line carrying the marker is dropped; otherwise the marker token
//     is removed and the surrounding text is kept.
//   - A `variables` entry `{ key, type: "derived", expr }` is evaluated over the
//     other numeric variables with a hand-written whitelist evaluator
//     (`+ - * /`, parentheses, numbers, variable names — NO eval / Function).

export type VariableSpec = {
  key: string;
  label?: string;
  type?: string;
  /** For `type: "derived"` — an arithmetic expression over other variable keys. */
  expr?: string;
  required?: boolean;
  maps_to?: string;
  group?: string;
};

export type SectionSpec = {
  key: string;
  /** Explicitly `false` disables the section; anything else (incl. undefined) keeps it. */
  enabled?: boolean;
};

export type RenderOptions = {
  variables?: VariableSpec[];
  sections?: SectionSpec[];
};

export type RenderResult = { text: string; missing: string[] };

const PLACEHOLDER_RE = /\{\{\s*([\w.:-]+)\s*\}\}/g;

/** de-DE currency string, e.g. `formatEur(1200)` → `"1.200,00 EUR"`. */
export function formatEur(n: number | string): string {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return String(n);
  const body = new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
  return `${body} EUR`;
}

// ── whitelist arithmetic evaluator ─────────────────────────────────────────
// Recursive-descent over a tiny grammar:
//   expr   → term (("+" | "-") term)*
//   term   → factor (("*" | "/") factor)*
//   factor → number | identifier | "(" expr ")"
// Anything else (`;`, `**`, `.` outside a number, `[`, backticks, keywords used
// as operators, …) throws.

type Tok = { kind: "num" | "id" | "op" | "lparen" | "rparen"; value: string };

function tokenize(expr: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      toks.push({ kind: "op", value: c });
      i++;
      continue;
    }
    if (c === "(") {
      toks.push({ kind: "lparen", value: c });
      i++;
      continue;
    }
    if (c === ")") {
      toks.push({ kind: "rparen", value: c });
      i++;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i + 1;
      let seenDot = false;
      while (j < expr.length && ((expr[j] >= "0" && expr[j] <= "9") || (expr[j] === "." && !seenDot))) {
        if (expr[j] === ".") seenDot = true;
        j++;
      }
      toks.push({ kind: "num", value: expr.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j])) j++;
      toks.push({ kind: "id", value: expr.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`derived expr: illegal character ${JSON.stringify(c)} in ${JSON.stringify(expr)}`);
  }
  return toks;
}

/** Evaluate a whitelisted arithmetic `expr`, resolving names via `lookup`. */
export function evalExpr(expr: string, lookup: (name: string) => number): number {
  const toks = tokenize(expr);
  let pos = 0;

  const peek = () => toks[pos];
  const next = () => toks[pos++];

  function parseExpr(): number {
    let left = parseTerm();
    while (peek() && peek().kind === "op" && (peek().value === "+" || peek().value === "-")) {
      const op = next().value;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (peek() && peek().kind === "op" && (peek().value === "*" || peek().value === "/")) {
      const op = next().value;
      const right = parseFactor();
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  function parseFactor(): number {
    const t = peek();
    if (!t) throw new Error(`derived expr: unexpected end of ${JSON.stringify(expr)}`);
    if (t.kind === "op" && (t.value === "-" || t.value === "+")) {
      next();
      const v = parseFactor();
      return t.value === "-" ? -v : v;
    }
    if (t.kind === "num") {
      next();
      return Number(t.value);
    }
    if (t.kind === "id") {
      next();
      const v = lookup(t.value);
      if (!Number.isFinite(v)) {
        throw new Error(`derived expr: variable ${JSON.stringify(t.value)} is not a finite number`);
      }
      return v;
    }
    if (t.kind === "lparen") {
      next();
      const v = parseExpr();
      const close = next();
      if (!close || close.kind !== "rparen") {
        throw new Error(`derived expr: missing ")" in ${JSON.stringify(expr)}`);
      }
      return v;
    }
    throw new Error(`derived expr: unexpected token ${JSON.stringify(t.value)} in ${JSON.stringify(expr)}`);
  }

  const result = parseExpr();
  if (pos !== toks.length) {
    throw new Error(`derived expr: trailing tokens in ${JSON.stringify(expr)}`);
  }
  return result;
}

/** Round to at most 2 decimals, drop a trailing `.0`. */
function numToStr(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
}

/** Compute every `type: "derived"` variable from `values` + earlier derived. */
export function computeDerived(
  variables: VariableSpec[],
  values: Record<string, string | number>,
): Record<string, number> {
  const derived: Record<string, number> = {};
  const lookup = (name: string): number => {
    if (name in derived) return derived[name];
    const raw = values[name];
    return typeof raw === "number" ? raw : Number(raw);
  };
  for (const v of variables) {
    if (v.type !== "derived" || !v.expr) continue;
    if (v.key in values) continue; // an explicit value wins over the formula
    derived[v.key] = evalExpr(v.expr, lookup);
  }
  return derived;
}

function pruneSections(body: string, sections: SectionSpec[] | undefined): string {
  const enabled = new Map<string, boolean>();
  for (const s of sections ?? []) enabled.set(s.key, s.enabled !== false);

  const lines = body.split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const markers = [...line.matchAll(/\{\{\s*section:([\w.-]+)\s*\}\}/g)];
    if (markers.length === 0) {
      kept.push(line);
      continue;
    }
    const anyDisabled = markers.some((m) => enabled.get(m[1]) !== true);
    if (anyDisabled) continue; // drop the whole line
    kept.push(line.replace(/\{\{\s*section:[\w.-]+\s*\}\}/g, "").replace(/[ \t]{2,}/g, " ").trimEnd());
  }
  return kept.join("\n");
}

/**
 * Render `body`, substituting `{{key}}` from `values`. Unknown keys stay
 * verbatim; required-but-absent keys are also reported in `missing`.
 */
export function renderTemplate(
  body: string,
  values: Record<string, string | number>,
  opts: RenderOptions = {},
): RenderResult {
  const variables = opts.variables ?? [];
  const requiredKeys = new Set(variables.filter((v) => v.required).map((v) => v.key));

  const withSections = pruneSections(body, opts.sections);

  const derived = computeDerived(variables, values);
  const resolved: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null || v === "") continue;
    resolved[k] = typeof v === "number" ? numToStr(v) : String(v);
  }
  for (const [k, v] of Object.entries(derived)) {
    if (!(k in resolved) && Number.isFinite(v)) resolved[k] = numToStr(v);
  }

  const missing = new Set<string>();
  const text = withSections.replace(PLACEHOLDER_RE, (full, rawKey: string) => {
    const key = rawKey.trim();
    if (key.startsWith("section:")) return ""; // stray marker (single-line body)
    if (key in resolved) return resolved[key];
    if (requiredKeys.has(key)) missing.add(key);
    return full; // verbatim — never blank a placeholder
  });

  return { text, missing: [...missing] };
}
