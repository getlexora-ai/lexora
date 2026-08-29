import { ArrowRight, History, ScanLine, Sparkles } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { BrandLockup } from "@/components/brand-mark";
import { RdgDisclaimerBox, RdgFooterNotice } from "@/components/rdg-notice";
import { ClauseDemo } from "@/components/landing/clause-demo";
import { HeroPreview } from "@/components/landing/hero-preview";
import { Pricing } from "@/components/landing/pricing";
import { Reveal } from "@/components/landing/reveal";
import { StatBand } from "@/components/landing/stat-band";

/* ═══════════════════════════════════════════════════════════════════════════
   Landing page. Sections are 1140px-wide bands separated by hairlines, each
   led by a mono eyebrow and a single outcome-shaped headline.

   The hero copy is deliberately static — it is the LCP element, and fading it
   in from opacity 0 would both delay that paint and risk hydrating stuck. The
   hero's motion lives in the preview beside it instead.
   ═══════════════════════════════════════════════════════════════════════════ */

const SHELL = "mx-auto w-full max-w-[1140px] px-[clamp(18px,5vw,40px)]";

const FEATURES = [
  {
    icon: ScanLine,
    title: "Instant analysis",
    body: "Upload a PDF or DOCX and every clause is parsed and ranked by attention level in seconds — with a plain-language note on why.",
  },
  {
    icon: Sparkles,
    title: "Suggested wording",
    body: "Each finding comes with alternative language in plain terms. Review it, edit it, apply it to the document as a redline — or leave it.",
  },
  {
    icon: History,
    title: "History & dashboard",
    body: "Track risk across your whole portfolio and keep a versioned trail of every clause that changed.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Upload",
    body: "Drop in the contract. Lexora extracts the full text and splits it into clauses.",
  },
  {
    n: "02",
    title: "Review",
    body: "Each flagged clause gets a plain-language note and suggested wording. You decide what matters.",
  },
  {
    n: "03",
    title: "Apply & export",
    body: "Apply the suggestions you want, keep a versioned trail, and export a clean document.",
  },
];

const FOOTER_COLUMNS = [
  {
    heading: "Product",
    items: ["Analysis", "Suggested wording", "Dashboard", "Clause library"],
  },
  { heading: "Company", items: ["About", "Security", "Careers", "Contact"] },
  { heading: "Legal", items: ["Terms", "Privacy", "DPA", "Legal notice / RDG"] },
];

/** Mono eyebrow + outcome headline. The one section-head shape on the page. */
function SectionHead({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-[clamp(28px,5vw,48px)] max-w-[44ch]">
      <span className="block font-mono text-[11px] font-medium tracking-[0.14em] text-text-3 uppercase">
        {eyebrow}
      </span>
      <h2 className="mt-3.5 text-[clamp(1.8rem,4vw,2.7rem)] font-bold tracking-[-0.03em] text-balance">
        {title}
      </h2>
      {body && <p className="mt-3.5 text-[15px] text-text-2">{body}</p>}
      {children}
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <Navbar variant="bare" />

      <main id="top" className="overflow-x-hidden">
        {/* ══════════════ HERO ══════════════ */}
        <section className="relative py-[clamp(48px,9vw,104px)] pb-[clamp(40px,8vw,84px)]">
          {/* Two soft pools of colour, then a grid wash masked to the top. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(720px 340px at 78% 12%, color-mix(in oklab, var(--brand) 12%, transparent), transparent 70%), radial-gradient(560px 300px at 12% 4%, color-mix(in oklab, var(--low) 8%, transparent), transparent 72%)",
            }}
          />
          <div
            aria-hidden
            className="gridwash pointer-events-none absolute inset-0 -z-10"
          />

          <div
            className={`${SHELL} grid items-center gap-[clamp(36px,6vw,60px)] min-[1000px]:grid-cols-[1.02fr_0.98fr]`}
          >
            <div>
              <span className="mb-5.5 inline-flex items-center gap-2 rounded-full border border-border bg-surface py-[5px] pr-[5px] pl-3 text-[12.5px] text-text-2 shadow-e1">
                <span className="rounded-full border border-risk-low-line bg-risk-low-soft px-[7px] py-0.5 font-mono text-[10px] tracking-[0.06em] text-risk-low uppercase">
                  Live
                </span>
                Analyse a real clause below — no signup
              </span>

              <h1 className="text-[clamp(2.6rem,6.2vw,4.35rem)] font-bold leading-[1.08] tracking-[-0.035em] text-balance">
                Spot the clauses worth{" "}
                <span className="bg-[linear-gradient(transparent_58%,color-mix(in_oklab,var(--high)_34%,transparent)_58%)]">
                  a closer look
                </span>{" "}
                — before you sign.
              </h1>

              <p className="mt-5 max-w-[44ch] text-[clamp(1rem,2vw,1.16rem)] leading-relaxed text-text-2">
                Lexora&apos;s AI scans a contract the moment you upload it,
                points to liability, IP and indemnity language that&apos;s
                commonly negotiated, and drafts suggested wording for you to
                review.
              </p>

              <div className="mt-7.5 flex flex-wrap gap-3">
                <a
                  href="#demo"
                  className="btn-graphite inline-flex h-11.5 items-center gap-2 rounded-md border border-transparent px-5.5 text-[15px] font-medium transition-all active:translate-y-px"
                >
                  Try the demo
                  <ArrowRight className="size-4" aria-hidden />
                </a>
                <a
                  href="#features"
                  className="inline-flex h-11.5 items-center rounded-md border border-border-strong bg-surface px-5.5 text-[15px] font-medium shadow-e1 transition-all hover:bg-surface-2 active:translate-y-px"
                >
                  See how it works
                </a>
              </div>

              <p className="mt-4 flex items-center gap-2 text-[12.5px] text-text-3">
                <span
                  className="size-[5px] shrink-0 rounded-full bg-risk-low"
                  aria-hidden
                />
                41 clauses parsed in 1.2s · a tool for your own review, not legal
                advice
              </p>
            </div>

            <HeroPreview />
          </div>
        </section>

        {/* ══════════════ DEMO ══════════════ */}
        <section id="demo" className="border-t border-border py-[clamp(56px,10vw,108px)]">
          <div className={SHELL}>
            <Reveal>
              <SectionHead
                eyebrow="Play with it"
                title="Paste a clause. Watch Lexora mark it up."
                body="Pick one of the sample clauses or drop in your own. Hit analyse — language commonly negotiated is highlighted, and each finding comes with suggested wording you can adjust."
              />
            </Reveal>

            <Reveal>
              <ClauseDemo />
            </Reveal>

            <RdgDisclaimerBox className="mt-3.5" />
          </div>
        </section>

        {/* ══════════════ FEATURES ══════════════ */}
        <section
          id="features"
          className="border-t border-border py-[clamp(56px,10vw,108px)]"
        >
          <div className={SHELL}>
            <Reveal>
              <SectionHead
                eyebrow="The product"
                title="Read it, mark it up, keep the trail."
              />
            </Reveal>

            <div className="grid gap-4 min-[760px]:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <Reveal key={title} className="h-full">
                  <div className="flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-4.5 shadow-e1 transition-all hover:-translate-y-[3px] hover:shadow-e2">
                    <span className="grid size-[34px] shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-text-2 shadow-e-inset">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <h3 className="text-[15px] font-bold tracking-[-0.02em]">
                      {title}
                    </h3>
                    <p className="text-[13px] leading-[1.55] text-text-2">{body}</p>

                    <div className="mt-auto border-t border-border pt-3 text-xs leading-[1.7] text-text-3">
                      {title === "Instant analysis" && (
                        <>
                          Clause 3.2 &nbsp;·&nbsp;{" "}
                          <span className="hl hl-high">one dollar ($1)</span>{" "}
                          &nbsp;→&nbsp;{" "}
                          <span className="text-risk-high">Worth a look</span>
                        </>
                      )}
                      {title === "Suggested wording" && (
                        <>
                          <div className="font-mono text-[10.5px] text-risk-high">
                            − limited to one dollar ($1)
                          </div>
                          <div className="font-mono text-[10.5px] text-risk-low">
                            + 12-month fees; carve-outs preserved
                          </div>
                        </>
                      )}
                      {title === "History & dashboard" && (
                        <svg
                          viewBox="0 0 120 28"
                          width="100%"
                          height="28"
                          aria-hidden
                          className="block"
                        >
                          <polyline
                            points="2,8 24,12 46,7 68,16 90,20 118,23"
                            fill="none"
                            stroke="var(--low)"
                            strokeWidth="1.6"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════ HOW IT WORKS ══════════════ */}
        <section id="steps" className="border-t border-border py-[clamp(56px,10vw,108px)]">
          <div className={SHELL}>
            <Reveal>
              <SectionHead
                eyebrow="How it works"
                title="Three steps, about ninety seconds."
              />
            </Reveal>

            <Reveal>
              {/* Hairline grid: the 2px gap is the border showing through. */}
              <div className="grid gap-0.5 overflow-hidden rounded-xl border border-border bg-border min-[780px]:grid-cols-3">
                {STEPS.map(({ n, title, body }) => (
                  <div
                    key={n}
                    className="flex flex-col gap-2.5 bg-surface p-5.5"
                  >
                    <span className="font-mono text-[11px] tracking-[0.1em] text-brand">
                      {n}
                    </span>
                    <h3 className="text-[15px] font-bold tracking-[-0.02em]">
                      {title}
                    </h3>
                    <p className="text-[13px] leading-[1.55] text-text-2">{body}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ══════════════ STATS ══════════════ */}
        <section className="border-t border-border py-[clamp(56px,10vw,108px)]">
          <div className={SHELL}>
            <StatBand />
          </div>
        </section>

        {/* ══════════════ PRICING ══════════════ */}
        <section id="pricing" className="border-t border-border py-[clamp(56px,10vw,108px)]">
          <div className={SHELL}>
            <Reveal>
              <SectionHead
                eyebrow="Pricing"
                title="Priced per workspace. Cancel anytime."
              />
            </Reveal>

            <Pricing />

            <p className="mt-4.5 flex max-w-[640px] gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-3 text-xs leading-[1.55] text-text-3">
              Prices exclude VAT. Annual plans are billed yearly at the
              discounted rate. All figures shown here are illustrative for this
              design study.
            </p>
          </div>
        </section>

        {/* ══════════════ FINAL CTA ══════════════ */}
        <section className="border-t border-border py-[clamp(56px,10vw,108px)] text-center">
          <Reveal className={SHELL}>
            <h2 className="text-[clamp(2rem,5vw,3.2rem)] font-bold leading-[1.08] tracking-[-0.035em] text-balance">
              Read your next contract in minutes, not an afternoon.
            </h2>
            <p className="mx-auto mt-4 mb-6.5 max-w-[46ch] text-text-2">
              Run the demo above, or upload a real document and see every flagged
              clause — with suggested wording — for your own review.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="#demo"
                className="btn-graphite inline-flex h-11.5 items-center gap-2 rounded-md border border-transparent px-5.5 text-[15px] font-medium transition-all active:translate-y-px"
              >
                Try the demo
                <ArrowRight className="size-4" aria-hidden />
              </a>
              <a
                href="#pricing"
                className="inline-flex h-11.5 items-center rounded-md border border-border-strong bg-surface px-5.5 text-[15px] font-medium shadow-e1 transition-all hover:bg-surface-2 active:translate-y-px"
              >
                See pricing
              </a>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ══════════════ FOOTER ══════════════ */}
      <footer className="border-t border-border pt-11 pb-13">
        <div className={`${SHELL} grid gap-6.5 min-[720px]:grid-cols-[1.4fr_1fr_1fr_1fr]`}>
          <div>
            <BrandLockup />
            <p className="mt-3 max-w-[34ch] text-[13px] text-text-2">
              AI-assisted contract analysis for people who sign things — a tool
              that supports your own review, from NDAs to MSAs.
            </p>
          </div>

          {FOOTER_COLUMNS.map(({ heading, items }) => (
            <div key={heading}>
              <h4 className="mb-2.5 font-mono text-[10px] font-medium tracking-[0.12em] text-text-3 uppercase">
                {heading}
              </h4>
              <ul className="flex flex-col gap-1.5">
                {items.map((item) => (
                  <li key={item} className="text-[13px] text-text-2">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="col-span-full mt-4">
            <RdgFooterNotice />
          </div>
        </div>
      </footer>
    </>
  );
}
