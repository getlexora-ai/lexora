"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/* The hero's little editor: a contract being read. A scan line sweeps the
   card once, and each flagged phrase's marker stroke draws in behind it,
   staggered so the eye follows the analysis in reading order. Under reduced
   motion there is no sweep and no from-state — the flags are simply there. */

type Risk = "high" | "med" | "low";

const CLAUSES: {
  n: string;
  risk?: Risk;
  delay?: number;
  before: string;
  mark?: string;
  after: string;
  flag?: string;
}[] = [
  {
    n: "1.1",
    before: "Provider shall perform the services with reasonable skill and care.",
    after: "",
  },
  {
    n: "3.2",
    risk: "high",
    delay: 0.5,
    before: "Provider's aggregate liability shall be limited to ",
    mark: "one dollar ($1)",
    after: ", whether in contract or tort.",
    flag: "High · cap far below market",
  },
  {
    n: "4.1",
    risk: "med",
    delay: 0.95,
    before: "All IP created shall ",
    mark: "belong exclusively to Provider in perpetuity",
    after: ".",
    flag: "Medium · no licence to Client",
  },
  {
    n: "7.4",
    risk: "low",
    delay: 1.35,
    before: "Either party may terminate on ",
    mark: "ninety (90) days'",
    after: " notice.",
    flag: "Low · notice longer than standard",
  },
];

const RISK_TINT: Record<Risk, string> = {
  high: "border-l-risk-high bg-[color-mix(in_oklab,var(--high)_6%,transparent)]",
  med: "border-l-risk-medium bg-[color-mix(in_oklab,var(--med)_6%,transparent)]",
  low: "border-l-risk-low bg-[color-mix(in_oklab,var(--low)_6%,transparent)]",
};

const RISK_TEXT: Record<Risk, string> = {
  high: "text-risk-high",
  med: "text-risk-medium",
  low: "text-risk-low",
};

const MARK_HUE: Record<Risk, string> = {
  high: "hl-high",
  med: "hl-med",
  low: "hl-low",
};

export function HeroPreview() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.45 });
  const lit = inView || !!reduce;

  return (
    <div
      ref={ref}
      aria-label="Preview: a contract being scanned for risk"
      className="overflow-hidden rounded-xl border border-border-strong bg-paper shadow-e3"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 font-mono text-[10.5px] tracking-[0.05em] text-text-3 uppercase">
        <span className="size-[7px] shrink-0 rounded-full bg-risk-high" aria-hidden />
        <span className="truncate">Reading — MSA_TestCorp.pdf</span>
        <span className="ml-auto shrink-0 text-text-2">6 issues</span>
      </div>

      <div className="relative px-4 pt-4 pb-4.5">
        {/* The sweep. Purely decorative, so it never renders under reduced motion. */}
        {!reduce && inView && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[linear-gradient(90deg,transparent,var(--high),transparent)] shadow-[0_0_20px_3px_color-mix(in_oklab,var(--high)_40%,transparent)]"
            initial={{ top: "-2%", opacity: 0 }}
            animate={{ top: ["-2%", "102%"], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.9, ease: "easeInOut" }}
          />
        )}

        <p className="text-[13px] font-bold tracking-[-0.02em]">
          Master Services Agreement
        </p>
        <p className="mt-1 mb-3 font-mono text-[10px] text-text-3">
          TESTCORP ⇄ NORTHWIND · 41 CLAUSES
        </p>

        {CLAUSES.map((c, i) => (
          <div
            key={c.n}
            className={cn(
              "relative border-t border-border py-1.5 pl-[34px] text-[12.5px] leading-[1.75] text-text-2",
              i === 0 && "border-t-0",
              c.risk && "rounded-r-lg border-l-2",
              c.risk && RISK_TINT[c.risk]
            )}
          >
            <span className="absolute top-1.5 left-0 font-mono text-[10px] text-text-3">
              {c.n}
            </span>
            {c.before}
            {c.mark && c.risk && (
              <span
                className={cn("hl hl-draw", MARK_HUE[c.risk], lit && "is-lit")}
                style={{ "--d": `${c.delay}s` } as React.CSSProperties}
              >
                {c.mark}
              </span>
            )}
            {c.after}
            {c.flag && c.risk && (
              <span
                className={cn(
                  "mt-1.5 flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.06em] uppercase transition-all duration-400",
                  RISK_TEXT[c.risk],
                  !reduce && !lit && "-translate-x-1.5 opacity-0"
                )}
                style={
                  { transitionDelay: `${(c.delay ?? 0) + 0.16}s` } as React.CSSProperties
                }
              >
                <i className="size-[5px] rounded-[1px] bg-current" aria-hidden />
                {c.flag}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
