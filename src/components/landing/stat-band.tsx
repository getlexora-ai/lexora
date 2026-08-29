"use client";

import { useEffect, useRef } from "react";
import { useInView, useReducedMotion } from "motion/react";

/* Count-up stat band. The number is rendered at its final value, so the
   server, the first client paint and every reduced-motion visitor all show the
   real figure — the ticker only rewinds it once the band is half on screen and
   motion is welcome. It writes textContent directly rather than through state:
   a 60fps counter is a DOM update, not application state.

   Figures are illustrative for this design study — the footer says so. */

const STATS = [
  { value: 1.2, decimals: 1, suffix: "s", label: "to the first flag" },
  { value: 41, decimals: 0, suffix: "", label: "clauses parsed, average NDA" },
  { value: 6, decimals: 0, suffix: "", label: "clauses flagged on a typical MSA" },
  { value: 129, decimals: 0, suffix: "", label: "suggestions applied this week" },
];

const DURATION = 1300;

function Stat({
  value,
  decimals,
  suffix,
  label,
  run,
}: (typeof STATS)[number] & { run: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !run) return;

    const format = (n: number) => n.toFixed(decimals) + suffix;
    let frame = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic: quick, then settles
      el.textContent = format(value * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
      else el.textContent = format(value);
    };

    el.textContent = format(0);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = format(value);
    };
  }, [run, value, decimals, suffix]);

  return (
    <div className="bg-surface px-4.5 py-5.5">
      <div
        className="text-[clamp(1.7rem,4vw,2.3rem)] font-bold tracking-[-0.04em] tabular-nums"
        data-numeric
      >
        <span ref={ref}>
          {value.toFixed(decimals)}
          {suffix}
        </span>
      </div>
      <div className="mt-1.5 text-xs text-text-3">{label}</div>
    </div>
  );
}

export function StatBand() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });

  return (
    <div
      ref={ref}
      className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border min-[760px]:grid-cols-4"
    >
      {STATS.map((s) => (
        <Stat key={s.label} {...s} run={inView && !reduce} />
      ))}
    </div>
  );
}
