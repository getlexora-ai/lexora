"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "motion/react";
import { Check, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
   The landing demo. The artifact's vanilla analyser, ported to React state.

   Two analysers, deliberately: the three sample clauses carry hand-written
   findings so the copy stays exact, while "Paste your own" runs a small
   pattern matcher over the text. Everything runs in the browser — no network,
   no API — so the page works signed-out and offline.
   ═══════════════════════════════════════════════════════════════════════════ */

type Risk = "high" | "med" | "low";

type Finding = {
  phrase: string;
  risk: Risk;
  title: string;
  issue: string;
  fix: string;
};

type Sample = { text: string; findings: Finding[] };

const SAMPLES: Sample[] = [
  {
    text: "Subject to clause 8.1, Provider's total aggregate liability arising out of or in connection with this Agreement shall be limited to one dollar ($1), whether in contract, tort or otherwise, even in cases of gross negligence or wilful misconduct.",
    findings: [
      {
        phrase: "one dollar ($1)",
        risk: "high",
        title: "Liability capped at $1",
        issue:
          "A $1 cap is unenforceable in most jurisdictions and leaves you fully exposed to loss.",
        fix: "the total fees paid by Client in the twelve (12) months preceding the claim",
      },
      {
        phrase: "even in cases of gross negligence or wilful misconduct",
        risk: "high",
        title: "No carve-out for serious fault",
        issue:
          "The cap also covers gross negligence and wilful misconduct, which should never be limited.",
        fix: "this limit shall not apply to gross negligence, wilful misconduct, or breach of confidentiality",
      },
    ],
  },
  {
    text: "All intellectual property, work product and materials disclosed or created under this Agreement shall belong exclusively to the Discloser in perpetuity, and this Agreement shall continue in force until terminated by the Discloser in its sole discretion.",
    findings: [
      {
        phrase: "belong exclusively to the Discloser in perpetuity",
        risk: "med",
        title: "Perpetual, one-way IP assignment",
        issue:
          "You assign all IP forever with no licence back to use what you helped create.",
        fix: "belong to the Discloser, with a perpetual, royalty-free licence to the Recipient for its internal business use",
      },
      {
        phrase: "terminated by the Discloser in its sole discretion",
        risk: "med",
        title: "One-sided termination right",
        issue: "Only the other side can end the agreement, and on no notice.",
        fix: "terminated by either party on thirty (30) days' written notice",
      },
    ],
  },
  {
    text: "This subscription renews automatically for successive twelve (12) month terms unless cancelled at least ninety (90) days before the renewal date, and the fees may be increased by the Provider at any time and without limitation on notice to the Customer.",
    findings: [
      {
        phrase: "ninety (90) days",
        risk: "med",
        title: "Long cancellation window",
        issue:
          "A 90-day notice window makes it easy to miss the cancellation deadline and auto-renew.",
        fix: "thirty (30) days",
      },
      {
        phrase: "increased by the Provider at any time and without limitation",
        risk: "high",
        title: "Uncapped unilateral price rises",
        issue:
          "Fees can rise by any amount, any time, with no cap and no meaningful notice.",
        fix: "increased once per year by no more than 5%, on at least sixty (60) days' written notice",
      },
    ],
  },
];

const PATTERNS: { re: RegExp; risk: Risk; title: string; issue: string; fix: string }[] = [
  {
    re: /(one dollar \(\$1\)|\$1\.00|\$1(?!\d))/i,
    risk: "high",
    title: "Nominal liability cap",
    issue:
      "A near-zero liability cap is unenforceable in many jurisdictions and offers no real protection.",
    fix: "the fees paid in the 12 months preceding the claim, with carve-outs for confidentiality and wilful misconduct",
  },
  {
    re: /in perpetuity/i,
    risk: "med",
    title: "Perpetual obligation",
    issue:
      "“In perpetuity” creates an obligation with no end date and no review point.",
    fix: "for the term of this Agreement and three (3) years thereafter",
  },
  {
    re: /sole discretion/i,
    risk: "med",
    title: "Unfettered discretion",
    issue:
      "“Sole discretion” lets one party decide unilaterally with no reasonableness standard.",
    fix: "acting reasonably and in good faith",
  },
  {
    re: /without limitation/i,
    risk: "high",
    title: "Uncapped exposure",
    issue:
      "“Without limitation” removes any ceiling on the associated obligation or cost.",
    fix: "up to a cap of the fees paid under this Agreement",
  },
  {
    re: /any and all claims/i,
    risk: "high",
    title: "Unbounded indemnity",
    issue:
      "Indemnifying “any and all claims” with no cap or fault carve-out is a one-sided risk transfer.",
    fix: "third-party claims arising from your breach, excluding claims caused by the other party's negligence",
  },
  {
    re: /automatically renew|renews automatically|auto-renew/i,
    risk: "med",
    title: "Automatic renewal",
    issue:
      "Auto-renewal can lock you into another full term if a notice deadline slips.",
    fix: "renews only on the Customer's written confirmation before the renewal date",
  },
];

const TABS = [
  { key: 0, label: "Liability cap" },
  { key: 1, label: "IP & term" },
  { key: 2, label: "Auto-renewal" },
  { key: "own", label: "Paste your own" },
] as const;

const RISK_LABEL: Record<Risk, string> = {
  high: "High",
  med: "Medium",
  low: "Low",
};

const PILL: Record<Risk, string> = {
  high: "pill-high",
  med: "pill-med",
  low: "pill-low",
};

const OWN_PLACEHOLDER =
  "Paste a clause here — try one with “in perpetuity”, “sole discretion”, “without limitation” or “any and all claims”.";

type Tab = 0 | 1 | 2 | "own";
/** `true` = the fix was applied as a redline; `"dismiss"` = the finding was waved off. */
type AppliedState = Record<number, true | "dismiss">;

/** Marked-up document, as React nodes — never innerHTML. */
type Segment =
  | { kind: "text"; text: string; key: string }
  | { kind: "mark"; text: string; risk: Risk; index: number; key: string }
  | { kind: "redline"; was: string; now: string; key: string };

function computeFindings(tab: Tab, text: string): Finding[] {
  if (tab !== "own") {
    return SAMPLES[tab].findings
      .filter((f) => text.includes(f.phrase))
      .map((f) => ({ ...f }));
  }
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const p of PATTERNS) {
    const m = p.re.exec(text);
    if (m && !seen.has(m[0].toLowerCase())) {
      seen.add(m[0].toLowerCase());
      out.push({
        phrase: m[0],
        risk: p.risk,
        title: p.title,
        issue: p.issue,
        fix: p.fix,
      });
    }
  }
  return out;
}

/** Splits the clause around each finding, skipping overlaps, in reading order. */
function buildSegments(
  text: string,
  findings: Finding[],
  applied: AppliedState
): Segment[] {
  const marks = findings
    .map((f, i) => ({ i, idx: text.indexOf(f.phrase), f }))
    .filter((o) => o.idx >= 0)
    .sort((a, b) => a.idx - b.idx);

  const out: Segment[] = [];
  let last = 0;

  for (const o of marks) {
    if (o.idx < last) continue; // overlapping match — the earlier one wins
    if (o.idx > last) {
      out.push({ kind: "text", text: text.slice(last, o.idx), key: `t${last}` });
    }
    if (applied[o.i] === "dismiss") {
      out.push({ kind: "text", text: o.f.phrase, key: `d${o.i}` });
    } else if (applied[o.i]) {
      out.push({
        kind: "redline",
        was: o.f.phrase,
        now: o.f.fix,
        key: `r${o.i}`,
      });
    } else {
      out.push({
        kind: "mark",
        text: o.f.phrase,
        risk: o.f.risk,
        index: o.i,
        key: `m${o.i}`,
      });
    }
    last = o.idx + o.f.phrase.length;
  }
  if (last < text.length) {
    out.push({ kind: "text", text: text.slice(last), key: `t${last}` });
  }
  return out;
}

export function ClauseDemo() {
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true, amount: 0.5 });

  const [tab, setTab] = useState<Tab>(0);
  const [text, setText] = useState(SAMPLES[0].text);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [applied, setApplied] = useState<AppliedState>({});
  const [analysed, setAnalysed] = useState(false);
  const [lit, setLit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const analyse = useCallback(
    (source: string, forTab: Tab) => {
      const clause = source.trim();
      if (!clause) {
        setStatus("Nothing to analyse");
        return;
      }
      const found = computeFindings(forTab, clause);
      const highs = found.filter((f) => f.risk === "high").length;
      const meds = found.filter((f) => f.risk === "med").length;

      setFindings(found);
      setApplied({});
      setAnalysed(true);
      setStatus(
        found.length
          ? `${found.length} issue${found.length !== 1 ? "s" : ""} · ${highs} high · ${meds} medium`
          : "No issues found"
      );

      if (reduce) {
        setLit(true);
        setBusy(false);
        return;
      }

      // The pause is the point: it reads as the document being scanned, and
      // gives the marker strokes somewhere to draw from.
      setLit(false);
      setBusy(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setBusy(false);
        setLit(true);
      }, 700);
    },
    [reduce]
  );

  // Analyse the opening sample the first time the section scrolls into view.
  // Deferred a frame so the analysis is a response to the scroll rather than a
  // second render chained onto the one that revealed the section.
  const started = useRef(false);
  useEffect(() => {
    if (!inView || started.current) return;
    started.current = true;
    const frame = requestAnimationFrame(() => analyse(SAMPLES[0].text, 0));
    return () => cancelAnimationFrame(frame);
  }, [inView, analyse]);

  function loadSample(next: Tab) {
    if (timer.current) clearTimeout(timer.current);
    const nextText = next === "own" ? "" : SAMPLES[next].text;
    setTab(next);
    setText(nextText);
    setFindings([]);
    setApplied({});
    setAnalysed(false);
    setLit(false);
    setBusy(false);
    setStatus("Ready");
    if (next !== "own") analyse(nextText, next);
  }

  function reset() {
    loadSample(tab);
  }

  const segments = buildSegments(text.trim(), findings, applied);
  const visibleCards = findings
    .map((f, i) => ({ f, i }))
    .filter(({ i }) => applied[i] !== "dismiss");

  return (
    <div
      ref={rootRef}
      className="overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-e3"
    >
      {/* Tabs + status */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-surface-2 p-3.5">
        <div role="tablist" aria-label="Sample clauses" className="flex flex-wrap gap-1">
          {TABS.map(({ key, label }) => {
            const on = tab === key;
            return (
              <button
                key={String(key)}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => loadSample(key as Tab)}
                className={cn(
                  "rounded-full border px-2.5 py-1.5 text-xs font-medium shadow-e-inset transition-colors",
                  on
                    ? "btn-graphite border-transparent"
                    : "border-border bg-surface text-text-2 hover:text-foreground"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <span
          className="ml-auto font-mono text-[11px] text-text-3"
          aria-live="polite"
        >
          {status}
        </span>
      </div>

      <div className="grid min-[860px]:grid-cols-[1.15fr_0.85fr]">
        {/* Clause */}
        <div className="border-b border-border p-4 min-[860px]:border-r min-[860px]:border-b-0">
          <p className="eyebrow mb-2">Contract clause</p>

          <div className="rounded-lg border border-border bg-paper shadow-e-inset">
            {!analysed ? (
              <textarea
                value={text}
                spellCheck={false}
                aria-label="Contract clause to analyse"
                placeholder={tab === "own" ? OWN_PLACEHOLDER : undefined}
                onChange={(e) => setText(e.target.value)}
                className="block min-h-[172px] w-full resize-y rounded-lg bg-transparent px-4 py-[15px] text-[13.5px] leading-[1.9] text-foreground placeholder:text-text-3 focus-visible:shadow-[inset_0_0_0_2px_var(--ring)] focus-visible:outline-none"
              />
            ) : (
              <div className="min-h-[172px] px-4 py-[15px] text-[13.5px] leading-[1.9] break-words whitespace-pre-wrap text-text-2">
                {segments.map((seg) =>
                  seg.kind === "text" ? (
                    <span key={seg.key}>{seg.text}</span>
                  ) : seg.kind === "redline" ? (
                    <span key={seg.key}>
                      <del className="rl-del">{seg.was}</del>{" "}
                      <ins className="rl-ins">{seg.now}</ins>
                    </span>
                  ) : (
                    <mark
                      key={seg.key}
                      className={cn(
                        "hl hl-draw bg-transparent text-foreground",
                        seg.risk === "high" && "hl-high",
                        seg.risk === "med" && "hl-med",
                        seg.risk === "low" && "hl-low",
                        lit && "is-lit"
                      )}
                      style={
                        { "--d": `${seg.index * 0.12}s` } as React.CSSProperties
                      }
                    >
                      {seg.text}
                    </mark>
                  )
                )}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {!analysed ? (
              <Button size="lg" onClick={() => analyse(text, tab)}>
                <ScanLine className="size-4" />
                Analyse clause
              </Button>
            ) : (
              <Button size="lg" variant="outline" onClick={() => setAnalysed(false)}>
                Edit text
              </Button>
            )}
            <Button size="lg" variant="ghost" onClick={reset}>
              Reset
            </Button>
          </div>

          {busy && (
            <p className="mt-3 flex items-center gap-2.5 font-mono text-[11px] text-text-3">
              <span className="shimmer-track h-1 w-[180px] max-w-full" aria-hidden />
              Reading clause…
            </p>
          )}
        </div>

        {/* Findings */}
        <div className="min-w-0 p-4">
          <p className="eyebrow mb-2">Findings</p>
          <div className="flex flex-col gap-2.5" aria-live="polite">
            {!analysed || busy ? (
              <p className="rounded-lg border border-dashed border-border-strong p-3.5 text-[12.5px] leading-relaxed text-text-3">
                Pick a clause and hit <strong className="font-semibold">Analyse</strong> —
                Lexora highlights the language it would raise and drafts wording
                for you to consider.
              </p>
            ) : visibleCards.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border-strong p-3.5 text-[12.5px] leading-relaxed text-text-3">
                No flagged language found in this text. Try a sample, or add a
                clause with “without limitation” or “in perpetuity”.
              </p>
            ) : (
              visibleCards.map(({ f, i }) => {
                const done = applied[i] === true;
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex flex-col gap-[7px] rounded-lg border border-l-[3px] border-border bg-surface p-3 shadow-e-inset transition-opacity",
                      f.risk === "high" && "border-l-risk-high",
                      f.risk === "med" && "border-l-risk-medium",
                      f.risk === "low" && "border-l-risk-low",
                      done && "opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("pill", PILL[f.risk])}>
                        <i />
                        {RISK_LABEL[f.risk]}
                      </span>
                      <span className="text-[12.5px] font-semibold">{f.title}</span>
                    </div>
                    <p className="text-xs leading-[1.55] text-text-2">{f.issue}</p>

                    {done ? (
                      <p className="flex items-center gap-1.5 font-mono text-[11px] text-risk-low">
                        <Check className="size-3" aria-hidden />
                        Applied as redline
                      </p>
                    ) : (
                      <>
                        <div className="rounded-md border border-border bg-surface-2 px-2.5 py-2">
                          <span className="eyebrow mb-1 block">Suggested fix</span>
                          <p className="text-xs leading-[1.55] text-foreground">
                            {f.fix}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            size="sm"
                            onClick={() =>
                              setApplied((prev) => ({ ...prev, [i]: true }))
                            }
                          >
                            Apply fix
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setApplied((prev) => ({ ...prev, [i]: "dismiss" }))
                            }
                          >
                            Dismiss
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
