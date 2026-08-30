"use client";

/* PII pseudonymisation playground (issue #3).
 *
 * One input, four visible stages:
 *   1. Original          — what the user typed
 *   2. Sent to the LLM   — after real → pseudonym  (+ the map, + a LEAK check)
 *   3. LLM raw response  — pseudonyms still in place
 *   4. Shown to the user — after pseudonym → real  (+ a RESIDUAL check)
 *
 * Toggle the layers (L1 dictionary / L2 patterns / L3 model scan) and the
 * pseudonym style to see how each combination behaves — the goal is to pick the
 * *smallest* set that holds, not to stack every filter.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PiiEntry, PiiKind, PseudonymStyle } from "@/lib/pii/types";

const KINDS: PiiKind[] = ["name", "address", "email", "phone", "iban", "tax-id", "date", "other"];

const SAMPLE = `Zwischen Herrn Dr. Klaus Bergmann, wohnhaft Hauptstraße 14, 80331 München, (nachfolgend „Vermieter")
und Frau Aylin Yıldız, Kantstraße 8, 10627 Berlin, E-Mail aylin.yildiz@gmx.de, Tel. +49 170 2233445,
(nachfolgend „Mieterin") wird folgender Wohnraummietvertrag über die Wohnung Lessingstraße 22, 3. OG links,
04109 Leipzig geschlossen.

Die Kaution in Höhe von 2.400 EUR wird auf das Konto DE89 3704 0044 0532 0130 00 überwiesen.
Die Steuer-ID des Vermieters lautet 12345678901. Mietbeginn ist der 01.09.2026.`;

const DEFAULT_KNOWN: { value: string; kind: PiiKind }[] = [
  { value: "Dr. Klaus Bergmann", kind: "name" },
  { value: "Aylin Yıldız", kind: "name" },
  { value: "Hauptstraße 14, 80331 München", kind: "address" },
  { value: "Kantstraße 8, 10627 Berlin", kind: "address" },
];

const DEFAULT_INSTRUCTION =
  "You are a German Rechtsanwalt. Using ONLY the facts below, write a short (3–5 sentence) " +
  "excerpt of a residential lease (Wohnraummietvertrag) in German. Name the landlord and the " +
  "tenant, and use each name at least once in the genitive (e.g. „… die Wohnung des …“).";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Result = {
  stages: { original: string; sent: string; llmRaw: string; shown: string };
  map: PiiEntry[];
  leaks: string[];
  residual: string[];
  meta: { ms: number; matched: number; mapped: number; llmScanError: string | null };
};

/** Wrap every occurrence of any needle in a <mark>. */
function Marked({ text, needles, tone }: { text: string; needles: string[]; tone: "focus" | "applied" | "bad" }) {
  const nodes = useMemo(() => {
    const uniq = [...new Set(needles.filter(Boolean))].sort((a, b) => b.length - a.length);
    if (!uniq.length) return [text];
    const re = new RegExp(uniq.map(escapeRe).join("|"), "g");
    const out: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(text))) {
      if (m.index === re.lastIndex) re.lastIndex++;
      if (!m[0]) continue;
      if (m.index > last) out.push(text.slice(last, m.index));
      const cls =
        tone === "applied"
          ? "bg-mark-applied"
          : tone === "bad"
            ? "bg-risk-high-soft text-risk-high"
            : "bg-mark-focus";
      out.push(
        <mark key={i++} className={`rounded-[3px] px-0.5 ${cls}`}>
          {m[0]}
        </mark>,
      );
      last = m.index + m[0].length;
    }
    out.push(text.slice(last));
    return out;
  }, [text, needles, tone]);
  return <>{nodes}</>;
}

function Stage({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <header className="flex items-baseline gap-2 border-b border-border px-3 py-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[11px] text-text-2">
          {n}
        </span>
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <span className="ml-auto text-[11px] text-text-3">{hint}</span>
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

type LayerMode = "1" | "1-2" | "1-2-3";

export default function PiiPlaygroundPage() {
  const [input, setInput] = useState(SAMPLE);
  const [known, setKnown] = useState(DEFAULT_KNOWN);
  // One dropdown, three presets. The point is to compare: if "1" (or "1-2")
  // already reports 0 leaked, the heavier layer earns nothing.
  const [layerMode, setLayerMode] = useState<LayerMode>("1-2");
  const layers = {
    dictionary: true,
    patterns: layerMode !== "1",
    llmScan: layerMode === "1-2-3",
  };
  const [style, setStyle] = useState<PseudonymStyle>("fake");
  const [germanMorphology, setGermanMorphology] = useState(true);
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/pii-roundtrip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          instruction,
          options: { layers, style, germanMorphology, knownValues: known.filter((k) => k.value.trim()) },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Request failed");
        return;
      }
      setResult(data as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  const reals = result?.map.map((e) => e.real) ?? [];
  const pseudos = result?.map.map((e) => e.pseudonym) ?? [];

  return (
    <div className="mx-auto max-w-[1400px] p-5">
      <h1 className="text-lg font-semibold">PII pseudonymisation playground</h1>
      <p className="mt-1 text-[13px] text-text-2">
        Dev-only. Exercises <code className="rounded bg-surface-2 px-1">real → pseudonym → LLM → real</code> and
        shows every stage. Issue&nbsp;#3.
      </p>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* ── controls ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <div>
            <label className="text-[12px] font-medium text-text-2">Input</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={10}
              className="mt-1 w-full resize-y rounded-md border border-border-strong bg-surface px-2.5 py-2 font-mono text-[12px] leading-[1.5] shadow-e-inset focus-visible:outline-none"
            />
          </div>

          <fieldset className="rounded-md border border-border p-2.5">
            <legend className="px-1 text-[11px] font-semibold text-text-2">
              L1 · known field values (dictionary)
            </legend>
            <div className="space-y-1.5">
              {known.map((k, i) => (
                <div key={i} className="flex gap-1.5">
                  <input
                    value={k.value}
                    onChange={(e) =>
                      setKnown((prev) => prev.map((p, j) => (j === i ? { ...p, value: e.target.value } : p)))
                    }
                    className="min-w-0 flex-1 rounded border border-border-strong bg-surface px-2 py-1 font-mono text-[11.5px] shadow-e-inset focus-visible:outline-none"
                  />
                  <select
                    value={k.kind}
                    onChange={(e) =>
                      setKnown((prev) =>
                        prev.map((p, j) => (j === i ? { ...p, kind: e.target.value as PiiKind } : p)),
                      )
                    }
                    className="rounded border border-border-strong bg-surface px-1.5 py-1 text-[11.5px] shadow-e-inset focus-visible:outline-none"
                  >
                    {KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setKnown((prev) => prev.filter((_, j) => j !== i))}
                    className="rounded px-1.5 text-[11px] text-text-3 hover:bg-surface-2 hover:text-foreground"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={() => setKnown((prev) => [...prev, { value: "", kind: "name" }])}
                className="text-[11.5px] text-text-3 hover:text-foreground"
              >
                + add value
              </button>
            </div>
          </fieldset>

          <div>
            <label className="text-[12px] font-medium text-text-2">Detection layers</label>
            <select
              value={layerMode}
              onChange={(e) => setLayerMode(e.target.value as LayerMode)}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[12px] shadow-e-inset focus-visible:outline-none"
            >
              <option value="1">Layer 1 — known field values only (dictionary)</option>
              <option value="1-2">Layers 1 + 2 — plus regex sweep (email / phone / IBAN / tax-id / date)</option>
              <option value="1-2-3">Layers 1 + 2 + 3 — plus a model scan for free-text entities</option>
            </select>
            <p className="mt-1 text-[11px] text-text-3">
              Run the same input at each setting and compare the summary line — if L1 (or L1+L2)
              already shows <b>0 leaked</b>, the next layer buys you nothing.
            </p>
          </div>

          <fieldset className="rounded-md border border-border p-2.5">
            <legend className="px-1 text-[11px] font-semibold text-text-2">Pseudonym style</legend>
            {(
              [
                ["fake", "Realistic fake — „Anna Schmidt“"],
                ["token", "Typed token — [NAME_1]"],
                ["opaque", "Opaque hash — ⟦a1b2c3d4⟧"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 py-0.5 text-[12px]">
                <input
                  type="radio"
                  name="style"
                  checked={style === key}
                  onChange={() => setStyle(key)}
                />
                {label}
              </label>
            ))}
            <label className="mt-1.5 flex items-center gap-2 border-t border-border pt-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={germanMorphology}
                onChange={(e) => setGermanMorphology(e.target.checked)}
              />
              German inflection tolerance (–s / –es / –n / –en)
            </label>
          </fieldset>

          <div>
            <label className="text-[12px] font-medium text-text-2">LLM task (system prompt)</label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={4}
              className="mt-1 w-full resize-y rounded-md border border-border-strong bg-surface px-2.5 py-2 text-[12px] leading-[1.5] shadow-e-inset focus-visible:outline-none"
            />
          </div>

          <Button onClick={run} disabled={loading} className="w-full">
            {loading ? "Running round-trip…" : "Run round-trip"}
          </Button>
          {error && (
            <p className="rounded-md border border-risk-high-line bg-risk-high-soft px-2.5 py-2 text-[12px] text-risk-high">
              {error}
            </p>
          )}
        </div>

        {/* ── stages ───────────────────────────────────────────── */}
        <div className="space-y-3">
          {!result && (
            <p className="rounded-lg border border-dashed border-border-strong px-4 py-10 text-center text-[13px] text-text-3">
              Run the round-trip to see the four stages.
            </p>
          )}

          {result && (
            <>
              {result.leaks.length > 0 ? (
                <p className="rounded-md border border-risk-high-line bg-risk-high-soft px-3 py-2 text-[12px] text-risk-high">
                  ⚠ LEAK — {result.leaks.length} raw value(s) reached the LLM payload:{" "}
                  <span className="font-mono">{result.leaks.join(" · ")}</span>
                </p>
              ) : (
                <p className="rounded-md border border-risk-low-line bg-risk-low-soft px-3 py-2 text-[12px] text-risk-low">
                  ✓ No raw value reached the LLM payload.
                </p>
              )}
              <p className="text-[12px] text-text-2">
                <b>{result.map.length}</b> sensitive item(s) found ·{" "}
                <b>{result.map.length - result.residual.length}</b> replaced &amp; restored ·{" "}
                <b className={result.leaks.length ? "text-risk-high" : "text-risk-low"}>
                  {result.leaks.length}
                </b>{" "}
                leaked to the LLM ·{" "}
                <b className={result.residual.length ? "text-risk-high" : "text-risk-low"}>
                  {result.residual.length}
                </b>{" "}
                not restored
                <span className="text-text-3"> · {result.meta.ms} ms</span>
                {result.meta.llmScanError && (
                  <span className="text-risk-high"> · L3 error: {result.meta.llmScanError}</span>
                )}
              </p>

              <Stage n={1} title="Original" hint="what the user typed">
                <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.55]">
                  <Marked text={result.stages.original} needles={reals} tone="focus" />
                </pre>
              </Stage>

              <Stage n={2} title="Sent to the LLM" hint="real → pseudonym">
                <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.55]">
                  <Marked text={result.stages.sent} needles={pseudos} tone="focus" />
                </pre>
                {result.map.length > 0 && (
                  <table className="mt-3 w-full border-collapse text-[11.5px]">
                    <thead>
                      <tr className="text-left text-text-3">
                        <th className="border-b border-border py-1 pr-2 font-medium">real</th>
                        <th className="border-b border-border py-1 pr-2 font-medium">pseudonym</th>
                        <th className="border-b border-border py-1 pr-2 font-medium">kind</th>
                        <th className="border-b border-border py-1 font-medium">layer</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {result.map.map((e, i) => (
                        <tr key={i}>
                          <td className="border-b border-border py-1 pr-2">{e.real}</td>
                          <td className="border-b border-border py-1 pr-2">{e.pseudonym}</td>
                          <td className="border-b border-border py-1 pr-2 text-text-2">{e.kind}</td>
                          <td className="border-b border-border py-1 text-text-2">{e.layer}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Stage>

              <Stage n={3} title="LLM raw response" hint="pseudonyms in place">
                <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.55]">
                  <Marked text={result.stages.llmRaw} needles={pseudos} tone="focus" />
                </pre>
              </Stage>

              <Stage n={4} title="Shown to the user" hint="pseudonym → real">
                <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.55]">
                  <Marked
                    text={result.stages.shown}
                    needles={result.residual.length ? result.residual : reals}
                    tone={result.residual.length ? "bad" : "applied"}
                  />
                </pre>
                {result.residual.length > 0 && (
                  <p className="mt-2 rounded-md border border-risk-high-line bg-risk-high-soft px-2.5 py-1.5 text-[11.5px] text-risk-high">
                    {result.residual.length} pseudonym(s) not restored:{" "}
                    <span className="font-mono">{result.residual.join(" · ")}</span>
                  </p>
                )}
              </Stage>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
