import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { SiteFooter } from "@/components/site-footer";
import { ContactForm } from "@/components/contact-form";
import { COMPANY } from "@/lib/legal/policies";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with Lexora. Send a message and we reply within two business days.",
};

const SHELL = "mx-auto w-full max-w-[760px] px-[clamp(18px,5vw,40px)]";

const CONTACT_EMAIL = COMPANY.email ?? "hello@getlexora.de";

export default function ContactPage() {
  return (
    <>
      <Navbar variant="bare" />

      <main className="overflow-x-hidden">
        <section className="border-b border-border py-[clamp(36px,7vw,72px)]">
          <div className={SHELL}>
            <span className="block font-mono text-[11px] font-medium tracking-[0.14em] text-text-3 uppercase">
              Lexora · Contact
            </span>
            <h1 className="mt-3.5 text-[clamp(1.9rem,4.5vw,2.8rem)] font-bold tracking-[-0.03em] text-balance">
              Contact us
            </h1>
            <div className="mt-5 text-[15px] leading-[1.7] text-text-2">
              <p>
                Questions about the product, your account, a privacy request, or
                anything legal — send a message below and it reaches us at{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-brand hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>
                . We reply within two business days. You can also email that
                address directly.
              </p>
            </div>
          </div>
        </section>

        <section className="py-[clamp(32px,6vw,56px)]">
          <div className={SHELL}>
            <ContactForm />

            <p className="mt-14 border-t border-border pt-5 text-[13px] text-text-3">
              For who operates Lexora and how we handle your data, see the{" "}
              <Link
                href="/legal/impressum"
                className="text-brand hover:underline"
              >
                legal notice
              </Link>{" "}
              and{" "}
              <Link href="/legal/privacy" className="text-brand hover:underline">
                privacy policy
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
