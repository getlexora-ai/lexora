"use client";

import { useRef } from "react";
import { useInView } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Scroll reveal. The from-state lives in CSS (`.reveal` in globals.css, inside
 * a `prefers-reduced-motion: no-preference` query) rather than in an inline
 * style, for two reasons: under reduced motion there is then no from-state at
 * all to undo, and the server and the first client render agree, so nothing
 * can hydrate stuck at opacity 0. Motion's observer just flips `.in`.
 */
export function Reveal({
  children,
  className,
  amount = 0.15,
}: {
  children: React.ReactNode;
  className?: string;
  amount?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount });

  return (
    <div ref={ref} className={cn("reveal", inView && "in", className)}>
      {children}
    </div>
  );
}
