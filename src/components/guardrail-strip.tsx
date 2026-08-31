/* Guardrail status for a contract on the review screen.
 *
 * A compact, always-honest read of the small set of non-negotiables: red when a
 * hard statutory guardrail is missing or violated, amber for an important-but-
 * flexible flag, green when the load-bearing clauses check out. Purely
 * presentational — it takes the `GuardrailReport` the analyse / generate routes
 * return and renders it. The prop shape is declared locally so this component
 * doesn't pull in the engine. */

type Status = "ok" | "missing" | "violation" | "unchecked";

type Finding = {
  topic: string;
  label: string;
  tier: "guardrail" | "important";
  status: Status;
  detail: string;
  reference?: string;
};

export type GuardrailReportView = {
  contractType: string;
  findings: Finding[];
  hardFailures: Finding[];
  softFlags: Finding[];
  ok: boolean;
};

const ROW: Record<
  "hard" | "soft" | "ok",
  { wrap: string; dot: string; label: string }
> = {
  hard: {
    wrap: "border-risk-high-line bg-risk-high-soft text-risk-high",
    dot: "bg-risk-high",
    label: "Guardrail failed",
  },
  soft: {
    wrap: "border-risk-medium-line bg-risk-medium-soft text-foreground",
    dot: "bg-risk-medium",
    label: "Attention",
  },
  ok: {
    wrap: "border-risk-low-line bg-risk-low-soft text-risk-low",
    dot: "bg-risk-low",
    label: "Guardrails clear",
  },
};

export function GuardrailStrip({ report }: { report: GuardrailReportView | null | undefined }) {
  if (!report || report.findings.length === 0) return null;

  const hard = report.hardFailures;
  const soft = report.softFlags;
  const tone = hard.length ? "hard" : soft.length ? "soft" : "ok";
  const style = ROW[tone];

  return (
    <div className={`rounded-lg border px-3 py-2 text-[12px] ${style.wrap}`}>
      <div className="flex items-center gap-2 font-semibold">
        <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden />
        {tone === "ok" ? (
          <span>
            Guardrails clear — the {report.findings.length} load-bearing clause
            {report.findings.length === 1 ? "" : "s"} check out.
          </span>
        ) : (
          <span>
            {hard.length > 0 && `${hard.length} guardrail ${hard.length === 1 ? "failure" : "failures"}`}
            {hard.length > 0 && soft.length > 0 && " · "}
            {soft.length > 0 && `${soft.length} to review`}
          </span>
        )}
      </div>

      {(hard.length > 0 || soft.length > 0) && (
        <ul className="mt-1.5 space-y-1">
          {[...hard, ...soft].map((f) => (
            <li key={`${f.topic}-${f.status}`} className="flex gap-2 leading-snug">
              <span className="mt-[3px] size-1 shrink-0 rounded-full bg-current opacity-70" aria-hidden />
              <span>
                <b className="font-semibold">{f.label}</b>
                {f.status === "missing" ? " — not addressed" : ""} — {f.detail}
                {f.reference ? <span className="opacity-70"> ({f.reference})</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
