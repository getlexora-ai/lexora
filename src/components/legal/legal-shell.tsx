import Link from "next/link";
import { Info } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { SiteFooter } from "@/components/site-footer";
import { Fill } from "@/components/legal/fill";
import {
  COMPANY,
  POLICY_EFFECTIVE_DATE,
  POLICY_VERSION,
} from "@/lib/legal/policies";

const SHELL = "mx-auto w-full max-w-[760px] px-[clamp(18px,5vw,40px)]";

export type TocItem = { id: string; label: string };

/* Shared frame for the four legal documents plus the hub page: the marketing
   bar, a reading-width column, a mono eyebrow and headline, the version line,
   an optional on-page contents list, then the prose and the site footer. */
export function LegalShell({
  eyebrow,
  title,
  aka,
  intro,
  toc,
  children,
}: {
  eyebrow: string;
  title: string;
  aka?: string;
  intro?: React.ReactNode;
  toc?: TocItem[];
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar variant="bare" />

      <main className="overflow-x-hidden">
        <section className="border-b border-border py-[clamp(36px,7vw,72px)]">
          <div className={SHELL}>
            <span className="block font-mono text-[11px] font-medium tracking-[0.14em] text-text-3 uppercase">
              Lexora · {eyebrow}
            </span>
            <h1 className="mt-3.5 text-[clamp(1.9rem,4.5vw,2.8rem)] font-bold tracking-[-0.03em] text-balance">
              {title}
            </h1>
            {aka && (
              <p className="mt-2 text-[15px] text-text-3">
                Referred to in German law as the {aka}.
              </p>
            )}

            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] tracking-[0.04em] text-text-3">
              <span>Version {POLICY_VERSION}</span>
              <span aria-hidden>·</span>
              <span>Effective {POLICY_EFFECTIVE_DATE}</span>
              {COMPANY.reviewed && (
                <>
                  <span aria-hidden>·</span>
                  <span>Counsel reviewed {COMPANY.reviewed}</span>
                </>
              )}
            </p>

            {intro && (
              <div className="mt-5 text-[15px] leading-[1.7] text-text-2">
                {intro}
              </div>
            )}

            {!COMPANY.reviewed && <ReviewBanner />}
            {toc && toc.length > 0 && <Toc items={toc} />}
          </div>
        </section>

        <section className="py-[clamp(32px,6vw,56px)]">
          <div className={SHELL}>
            {children}

            <p className="mt-14 border-t border-border pt-5 text-[13px] text-text-3">
              Questions about this document? Write to{" "}
              <Fill value={COMPANY.privacyEmail ?? COMPANY.email}>
                our contact address
              </Fill>
              . The other legal documents are listed on the{" "}
              <Link href="/legal" className="text-brand hover:underline">
                legal overview
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function ReviewBanner() {
  return (
    <div className="mt-6 flex gap-3 rounded-lg border border-risk-medium-line bg-risk-medium-soft px-3.5 py-3 text-[13px] leading-[1.6] text-risk-medium">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <b className="font-semibold">Draft pending legal review.</b> This text is
        a working draft. Fields shown in amber must be completed, and the whole
        document must be checked by qualified counsel, before Lexora is offered
        to the public.
      </span>
    </div>
  );
}

function Toc({ items }: { items: TocItem[] }) {
  return (
    <nav
      aria-label="On this page"
      className="mt-7 rounded-xl border border-border bg-surface p-4 shadow-e1"
    >
      <span className="block font-mono text-[10px] font-medium tracking-[0.12em] text-text-3 uppercase">
        On this page
      </span>
      <ol className="mt-2.5 flex flex-col gap-1.5">
        {items.map((it, i) => (
          <li key={it.id} className="flex gap-2.5 text-[13px]">
            <span className="font-mono text-[11px] text-text-3 tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <a
              href={`#${it.id}`}
              className="text-text-2 transition-colors hover:text-foreground"
            >
              {it.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
