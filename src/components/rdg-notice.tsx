import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The RDG disclaimers. Lexora is software, not Rechtsberatung — the wording is
 * a legal requirement, so it is kept verbatim and reused rather than restated
 * per screen. Four registers, same substance at different densities.
 */

/** Full notice beside the landing demo. */
export function RdgDisclaimerBox({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex max-w-[640px] gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-3",
        "text-xs leading-relaxed text-text-3",
        className
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        <b className="font-semibold text-text-2">
          Informational tool, not legal advice.
        </b>{" "}
        Lexora is software. It does not provide legal advice within the meaning
        of the German Legal Services Act (RDG) and is not a substitute for a
        lawyer. Analyses and suggested wording are generated automatically, may
        be incomplete or wrong, and are for your own review. For advice on your
        specific situation, consult a licensed lawyer
        (Rechtsanwältin/Rechtsanwalt).
      </span>
    </p>
  );
}

/** Persistent bar at the top of the Contracts view. */
export function RdgNoticeBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5",
        "text-xs leading-relaxed text-text-2 bevel",
        className
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0 text-text-3" aria-hidden />
      <span>
        <b className="font-semibold text-foreground">
          Lexora flags clauses and drafts wording for your review.
        </b>{" "}
        It is an informational tool — not legal advice within the meaning of the
        German Legal Services Act (RDG) — and does not replace a lawyer.
        Automated output may be incomplete or wrong; verify before you rely on
        it.
      </span>
    </div>
  );
}

/** Slim strip under the editor toolbar. */
export function RdgStrip({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-3.5 py-1.5",
        "text-[11.5px] leading-snug text-text-3",
        className
      )}
    >
      <Info className="size-3.5 shrink-0" aria-hidden />
      <span>
        <b className="font-semibold text-text-2">
          Informational tool — not legal advice.
        </b>{" "}
        Flags and suggested wording are AI-generated for your own review; Lexora
        performs no legal assessment of your case (RDG) and does not replace a
        lawyer. Verify before you rely on anything here.
      </span>
    </div>
  );
}

/** One-liner under the auth forms. */
export function RdgMicro({
  variant = "signin",
  className,
}: {
  variant?: "signin" | "signup";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mt-2.5 text-center text-[11px] leading-relaxed text-text-3",
        className
      )}
    >
      {variant === "signup"
        ? "By continuing you agree that Lexora is an informational tool, not legal advice within the meaning of the RDG."
        : "Lexora is a software tool for your own review. It doesn't give legal advice (RDG) and doesn't replace a lawyer."}
    </p>
  );
}

/** The full footer notice on the landing page. */
export function RdgFooterNotice({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "font-mono text-[11px] leading-[1.7] text-text-3",
        className
      )}
    >
      <strong className="font-semibold text-text-2">Not legal advice.</strong>{" "}
      Lexora is a software tool. It does not provide legal advice
      (Rechtsberatung) within the meaning of the German Legal Services Act
      (Rechtsdienstleistungsgesetz, RDG) and does not replace a lawyer. It
      performs no legal assessment of your individual case and creates no client
      relationship. AI-generated analyses and suggested wording may be
      incomplete or incorrect and are provided for your own review; for advice
      on your specific situation, consult a licensed lawyer
      (Rechtsanwältin/Rechtsanwalt).
    </p>
  );
}

/** The pre-flight note on the last onboarding step. */
export function RdgOnboardingNote({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-3",
        "text-xs leading-relaxed text-text-3",
        className
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        <b className="font-semibold text-text-2">A note before you start.</b>{" "}
        Lexora is a software tool that supports your own contract review. It
        does not provide legal advice (Rechtsberatung) within the meaning of the
        German Legal Services Act (RDG), performs no legal assessment of your
        individual case, and is not a substitute for a lawyer. Its analyses and
        suggested wording are generated automatically and may be incomplete or
        wrong — review them yourself and, for legal advice, consult a licensed
        lawyer (Rechtsanwältin/Rechtsanwalt).
      </span>
    </p>
  );
}
