import Link from "next/link";
import { BrandLockup } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
   The auth split: form on the left, brand panel on the right above 940px.

   The right half is where the product argues for itself — one flagged clause,
   shown rather than described. Below 940px it drops away entirely; on a phone
   the only job is to get the form done.
   ═══════════════════════════════════════════════════════════════════════════ */

export function AuthTopBar() {
  return (
    <header className="flex h-14 items-center gap-3 border-b border-border px-[clamp(16px,4vw,28px)]">
      <Link href="/" aria-label="Lexora home">
        <BrandLockup size={23} className="text-[15px]" />
      </Link>
      <span className="flex-1" />
      <Link
        href="/"
        className="text-[12.5px] text-text-3 transition-colors hover:text-foreground"
      >
        ← Back to site
      </Link>
      <ThemeToggle />
    </header>
  );
}

/** A statistic in the brand panel's bottom row. */
function Stat({ n, k }: { n: string; k: string }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="font-mono text-xl font-semibold tracking-[-0.03em] tabular-nums">
        {n}
      </span>
      <span className="font-mono text-[9.5px] tracking-[0.08em] text-text-3 uppercase">
        {k}
      </span>
    </div>
  );
}

export function AuthBrandPanel({
  quote,
  by,
  stats,
  snippet,
}: {
  quote: React.ReactNode;
  by: string;
  stats: { n: string; k: string }[];
  snippet?: React.ReactNode;
}) {
  return (
    <aside className="relative hidden flex-col justify-center gap-6.5 overflow-hidden border-l border-border bg-surface-2 p-12 min-[940px]:flex">
      {/* Grid wash, masked toward the top-right so the type stays clean. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          WebkitMaskImage:
            "radial-gradient(120% 80% at 80% 20%, #000 10%, transparent 72%)",
          maskImage:
            "radial-gradient(120% 80% at 80% 20%, #000 10%, transparent 72%)",
        }}
      />

      <p className="relative max-w-[22ch] text-xl leading-[1.4] tracking-[-0.02em]">
        {quote}
      </p>
      <p className="relative font-mono text-[11px] tracking-[0.04em] text-text-3">
        {by}
      </p>

      {snippet && (
        <div className="relative max-w-[340px] rounded-lg border border-border bg-surface px-3.5 py-3 text-xs leading-[1.7] text-text-2 shadow-e-inset">
          {snippet}
        </div>
      )}

      <div className="relative flex gap-5.5 border-t border-border pt-5">
        {stats.map((s) => (
          <Stat key={s.k} {...s} />
        ))}
      </div>
    </aside>
  );
}

export function AuthSplit({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[calc(100vh-57px)] min-[940px]:grid-cols-[1fr_minmax(420px,46%)]">
      {children}
    </div>
  );
}

export function AuthFormColumn({
  title,
  lede,
  children,
  className,
}: {
  title: string;
  lede: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center px-[clamp(20px,5vw,40px)] py-[clamp(28px,6vw,64px)]",
        className
      )}
    >
      <div className="w-full max-w-[372px]">
        <h1 className="text-[22px] font-semibold tracking-[-0.025em]">{title}</h1>
        <p className="mt-1.5 text-[13.5px] text-text-2">{lede}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

/**
 * Clerk's widget owns the form itself — the auth flow is untouched — so it is
 * flattened into the column: no card, no border, no duplicate heading, since
 * the page already carries one.
 */
export const CLERK_FLUSH_APPEARANCE = {
  elements: {
    rootBox: "w-full",
    cardBox: "w-full border-0 shadow-none",
    card: "bg-transparent px-0 py-0 shadow-none",
    header: "hidden",
  },
} as const;
