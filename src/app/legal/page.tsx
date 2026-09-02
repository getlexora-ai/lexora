import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { LegalShell } from "@/components/legal/legal-shell";
import { LEGAL_DOCS } from "@/lib/legal/policies";

export const metadata: Metadata = {
  title: "Legal",
  description:
    "Lexora's legal notice, privacy policy, terms of service, and data processing agreement.",
};

export default function LegalIndexPage() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Legal documents"
      intro={
        <p>
          Everything that governs your use of Lexora, in one place. These
          documents are written for a German-law context. They are in English
          for now; German versions will follow.
        </p>
      }
    >
      <ul className="flex flex-col gap-3">
        {LEGAL_DOCS.map((doc) => (
          <li key={doc.slug}>
            <Link
              href={`/legal/${doc.slug}`}
              className="group flex items-start gap-3 rounded-xl border border-border bg-surface p-4.5 shadow-e1 transition-all hover:-translate-y-[2px] hover:shadow-e2"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[15px] font-bold tracking-[-0.02em] text-foreground">
                    {doc.title}
                  </span>
                  <span className="font-mono text-[11px] tracking-[0.04em] text-text-3">
                    {doc.aka}
                  </span>
                </span>
                <span className="mt-1 block text-[13px] leading-[1.55] text-text-2">
                  {doc.blurb}
                </span>
              </span>
              <ArrowUpRight
                className="mt-0.5 size-4 shrink-0 text-text-3 transition-colors group-hover:text-foreground"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-[13px] leading-[1.6] text-text-3">
        Lexora is a software tool that supports your own contract review. It does
        not provide legal advice within the meaning of the German Legal Services
        Act (Rechtsdienstleistungsgesetz, RDG) and does not replace a lawyer.
      </p>
    </LegalShell>
  );
}
