import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell } from "@/components/legal/legal-shell";
import { Fill, FillLines } from "@/components/legal/fill";
import { COMPANY } from "@/lib/legal/policies";

export const metadata: Metadata = {
  title: "Legal notice (Impressum)",
  description:
    "Provider identification for Lexora under section 5 DDG and section 18 MStV.",
};

export default function ImpressumPage() {
  return (
    <LegalShell
      eyebrow="Impressum"
      title="Legal notice"
      aka="Impressum"
      intro={
        <p>
          Information required under section 5 of the German Digital Services Act
          (Digitale-Dienste-Gesetz, DDG) and section 18(2) of the German State
          Media Treaty (Medienstaatsvertrag, MStV).
        </p>
      }
    >
      <div className="legal-prose">
        <h2 id="provider">Service provider</h2>
        <p>
          Lexora is operated as a sole proprietorship (Einzelunternehmen). Lexora
          is a trade name; the provider is the natural person named below, who
          acts personally.
        </p>
        <dl>
          <dt>Provider</dt>
          <dd>
            <Fill value={COMPANY.legalName}>Operator&rsquo;s full name</Fill>
            {COMPANY.legalName ? " (trading as Lexora)" : ""}
          </dd>
          <dt>Address</dt>
          <dd>
            <FillLines value={COMPANY.addressLines}>
              Street and number, postal code and city, country
            </FillLines>
          </dd>
        </dl>

        <h2 id="contact">Contact</h2>
        <dl>
          <dt>Email</dt>
          <dd>
            <Fill value={COMPANY.email}>contact address</Fill>
          </dd>
          <dt>Contact form</dt>
          <dd>
            <Link href="/contact">lexora contact form</Link>
          </dd>
        </dl>
        <p>
          For rapid and direct communication, write to the email address above
          or use our <Link href="/contact">contact form</Link>; messages sent
          through the form are delivered to the same address. We answer
          enquiries within two business days.
        </p>

        <h2 id="register">Commercial register and VAT</h2>
        <p>
          As a sole proprietorship that is not a registered merchant, the
          provider is not entered in the commercial register
          (Handelsregister); there is therefore no register court or register
          number.
        </p>
        <p>
          {COMPANY.smallBusiness ? (
            <>
              Under section 19 of the German VAT Act (UStG), the provider is
              treated as a small business (Kleinunternehmer). No value added tax
              is charged and no VAT identification number (USt-IdNr. under
              section 27a UStG) has been issued.
            </>
          ) : (
            <>
              VAT identification number (USt-IdNr. under section 27a of the
              German VAT Act):{" "}
              <Fill value={COMPANY.vatId}>USt-IdNr.</Fill>
            </>
          )}
        </p>

        <h2 id="responsible">Responsible for editorial content</h2>
        <p>
          Responsible for the content of this website under section 18(2) MStV
          is the provider named above, at the address given above.
        </p>

        <h2 id="not-a-law-firm">No legal services</h2>
        <p>
          Lexora is a software product. It is not a law firm, provides no legal
          advice within the meaning of the German Legal Services Act
          (Rechtsdienstleistungsgesetz, RDG), and creates no lawyer-client
          relationship. No member bar (Rechtsanwaltskammer) or professional
          liability insurance for legal services applies. For advice on your
          situation, consult a licensed lawyer (Rechtsanwältin/Rechtsanwalt).
        </p>

        <h2 id="dispute-resolution">Consumer dispute resolution</h2>
        <p>
          The European Commission provides a platform for online dispute
          resolution (ODR):{" "}
          <a
            href="https://ec.europa.eu/consumers/odr/"
            target="_blank"
            rel="noopener noreferrer"
          >
            ec.europa.eu/consumers/odr
          </a>
          . Our email address is given above.
        </p>
        <p>
          We are neither obliged nor willing to take part in dispute resolution
          proceedings before a consumer arbitration board within the meaning of
          the German Act on Consumer Dispute Resolution (VSBG).
        </p>

        <h2 id="hosting">Hosting</h2>
        <p>
          This website is operated on infrastructure provided by{" "}
          <Fill value={COMPANY.hostingProvider}>hosting provider</Fill>. Details
          of the data processing involved are set out in our{" "}
          <Link href="/legal/privacy">privacy policy</Link>.
        </p>

        <h2 id="liability-content">Liability for content</h2>
        <p>
          As a service provider we are responsible for our own content on these
          pages under the general laws, in accordance with section 7(1) DDG.
          Under sections 8 to 10 DDG, however, we are not obliged to monitor
          transmitted or stored third-party information, or to investigate
          circumstances that indicate unlawful activity. Obligations to remove or
          block the use of information under the general laws remain unaffected.
          Liability in this respect is only possible from the point in time at
          which we become aware of a specific infringement. On becoming aware of
          such infringements, we will remove the content concerned without delay.
        </p>

        <h2 id="liability-links">Liability for links</h2>
        <p>
          Our pages may contain links to external websites over whose content we
          have no control. We therefore accept no liability for that third-party
          content. The respective provider or operator of the linked pages is
          always responsible for their content. The linked pages were checked for
          possible legal infringements at the time of linking; unlawful content
          was not recognisable at that time. Permanent monitoring of the content
          of linked pages is not reasonable without concrete evidence of an
          infringement. On becoming aware of infringements, we will remove such
          links without delay.
        </p>

        <h2 id="copyright">Copyright</h2>
        <p>
          The content and works created by the site operator on these pages are
          subject to German copyright law. Duplication, processing, distribution,
          and any kind of use outside the limits of copyright require the written
          consent of the respective author or creator. Downloads and copies of
          this site are permitted for private, non-commercial use only. Insofar
          as the content on this site was not created by the operator, the
          copyrights of third parties are respected; third-party content is
          marked as such. Should you nevertheless become aware of a copyright
          infringement, please let us know. On becoming aware of infringements,
          we will remove such content without delay.
        </p>
      </div>
    </LegalShell>
  );
}
