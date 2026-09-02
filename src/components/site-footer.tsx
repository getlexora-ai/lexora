import Link from "next/link";
import { BrandLockup } from "@/components/brand-mark";
import { RdgFooterNotice } from "@/components/rdg-notice";

/* The marketing footer. Extracted from the landing page so the legal pages
   carry the same one and the legal links live in a single place. */

const SHELL = "mx-auto w-full max-w-[1140px] px-[clamp(18px,5vw,40px)]";

type FooterLink = { label: string; href: string };

const COLUMNS: { heading: string; items: (string | FooterLink)[] }[] = [
  {
    heading: "Product",
    items: ["Analysis", "Suggested wording", "Dashboard", "Clause library"],
  },
  { heading: "Company", items: ["About", "Security", "Careers", "Contact"] },
  {
    heading: "Legal",
    items: [
      { label: "Legal notice (Impressum)", href: "/legal/impressum" },
      { label: "Privacy policy", href: "/legal/privacy" },
      { label: "Terms of service (AGB)", href: "/legal/terms" },
      { label: "Data processing (DPA)", href: "/legal/dpa" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border pt-11 pb-13">
      <div
        className={`${SHELL} grid gap-6.5 min-[720px]:grid-cols-[1.4fr_1fr_1fr_1fr]`}
      >
        <div>
          <BrandLockup />
          <p className="mt-3 max-w-[34ch] text-[13px] text-text-2">
            AI-assisted contract analysis for people who sign things. A tool that
            supports your own review, from NDAs to MSAs.
          </p>
        </div>

        {COLUMNS.map(({ heading, items }) => (
          <div key={heading}>
            <h4 className="mb-2.5 font-mono text-[10px] font-medium tracking-[0.12em] text-text-3 uppercase">
              {heading}
            </h4>
            <ul className="flex flex-col gap-1.5">
              {items.map((item) => {
                const link = typeof item === "string" ? null : item;
                return (
                  <li
                    key={link ? link.href : (item as string)}
                    className="text-[13px] text-text-2"
                  >
                    {link ? (
                      <Link
                        href={link.href}
                        className="transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      (item as string)
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="col-span-full mt-4">
          <RdgFooterNotice />
        </div>
      </div>
    </footer>
  );
}
