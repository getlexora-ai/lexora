import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell, type TocItem } from "@/components/legal/legal-shell";
import { Fill, FillLines } from "@/components/legal/fill";
import { COMPANY, SUBPROCESSORS } from "@/lib/legal/policies";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "How Lexora processes personal data, the legal bases, recipients, international transfers, and your rights under the GDPR.",
};

const TOC: TocItem[] = [
  { id: "controller", label: "Controller and contact" },
  { id: "dpo", label: "Data protection officer" },
  { id: "rights", label: "Your rights" },
  { id: "website", label: "Visiting the website" },
  { id: "cookies", label: "Cookies and local storage" },
  { id: "account", label: "Creating an account" },
  { id: "analysis", label: "Analysing your contracts" },
  { id: "third-parties", label: "Personal data in your documents" },
  { id: "automated", label: "Automated processing" },
  { id: "billing", label: "Billing" },
  { id: "support", label: "Support and messages" },
  { id: "security", label: "Security and rate limiting" },
  { id: "recipients", label: "Recipients and sub-processors" },
  { id: "transfers", label: "Transfers outside the EEA" },
  { id: "retention", label: "Retention" },
  { id: "required", label: "Is provision required" },
  { id: "changes", label: "Changes to this policy" },
  { id: "complaints", label: "Complaints" },
];

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Datenschutzerklärung"
      title="Privacy policy"
      aka="Datenschutzerklärung"
      toc={TOC}
      intro={
        <p>
          This policy explains what personal data Lexora processes when you use
          our website and product, why we process it, the legal bases, who
          receives it, and the rights you hold under the General Data Protection
          Regulation (GDPR) and the German Federal Data Protection Act (BDSG).
        </p>
      }
    >
      <div className="legal-prose">
        <h2 id="controller">1. Controller and contact</h2>
        <p>The controller for processing described here is:</p>
        <dl>
          <dt>Company</dt>
          <dd>
            <Fill value={COMPANY.legalName}>Registered company name</Fill>
          </dd>
          <dt>Address</dt>
          <dd>
            <FillLines value={COMPANY.addressLines}>
              Street and number, postal code and city, country
            </FillLines>
          </dd>
          <dt>Data protection contact</dt>
          <dd>
            <Fill value={COMPANY.privacyEmail ?? COMPANY.email}>
              data protection contact address
            </Fill>
          </dd>
        </dl>
        <p>
          Full provider details are in our{" "}
          <Link href="/legal/impressum">legal notice</Link>.
        </p>

        <h2 id="dpo">2. Data protection officer</h2>
        <p>
          {COMPANY.dpo ? (
            <Fill value={COMPANY.dpo}>data protection officer contact</Fill>
          ) : (
            <>
              We are not required to appoint a data protection officer under
              Article 37 GDPR or section 38 of the German Federal Data Protection
              Act (BDSG), and have not appointed one voluntarily. For any data
              protection matter, contact us using the details in section 1.
            </>
          )}
        </p>

        <h2 id="rights">3. Your rights</h2>
        <p>Subject to the conditions in the GDPR, you have the right to:</p>
        <ul>
          <li>access your personal data (Article 15);</li>
          <li>rectification of inaccurate data (Article 16);</li>
          <li>erasure (Article 17);</li>
          <li>restriction of processing (Article 18);</li>
          <li>data portability (Article 20);</li>
          <li>
            object to processing based on our legitimate interests, on grounds
            relating to your particular situation, and to object at any time to
            processing for direct marketing (Article 21); and
          </li>
          <li>
            withdraw consent at any time, with effect for the future, where
            processing is based on your consent (Article 7(3)).
          </li>
        </ul>
        <p>
          To exercise any of these rights, write to the data protection contact
          above. You also have the right to lodge a complaint with a supervisory
          authority (see section 18).
        </p>

        <h2 id="website">4. Visiting the website</h2>
        <p>
          When you open our website, your browser sends technical data that our
          hosting provider processes to deliver the pages and keep the service
          secure: your IP address, the date and time of the request, the page
          requested, the referring page, and your browser and operating system
          identifiers. This data is kept in server log files.
        </p>
        <dl>
          <dt>Purpose</dt>
          <dd>
            delivering the website, ensuring stability and security, diagnosing
            faults
          </dd>
          <dt>Legal basis</dt>
          <dd>
            Article 6(1)(f) GDPR (our legitimate interest in a secure, working
            website)
          </dd>
          <dt>Retention</dt>
          <dd>
            7 days, then deletion or anonymisation
          </dd>
          <dt>Recipients</dt>
          <dd>
            <Fill value={COMPANY.hostingProvider}>hosting provider</Fill> as our
            processor
          </dd>
        </dl>

        <h2 id="cookies">5. Cookies and local storage</h2>
        <p>
          Lexora uses only cookies and browser storage that are necessary for the
          site to function: a theme preference, a dismissed-banner flag for this
          consent notice, and the session and security cookies set by our
          authentication provider when you sign in. These are used on the basis
          of section 25(2) of the German Telecommunications Digital Services Data
          Protection Act (TDDDG), because they are strictly necessary to provide
          the service you requested, and Article 6(1)(f) GDPR.
        </p>
        <p>
          We do not use analytics, advertising, or tracking cookies. If that ever
          changes, we will ask for your consent (section 25(1) TDDDG, Article
          6(1)(a) GDPR) through the banner before any such cookie is set, and you
          will be able to withdraw that consent at any time.
        </p>

        <h2 id="account">6. Creating and managing an account</h2>
        <p>
          To create an account you provide an email address and a password, or
          you sign in through a third-party identity provider. Our authentication
          provider (Clerk) processes your email address, your name if you give
          one, authentication credentials or federated identifiers, session
          tokens, and the IP address and device information tied to each sign-in,
          so that we can create and secure your account.
        </p>
        <dl>
          <dt>Purpose</dt>
          <dd>account creation, authentication, account security, support</dd>
          <dt>Legal basis</dt>
          <dd>
            Article 6(1)(b) GDPR (performance of the contract of use), and
            Article 6(1)(f) GDPR for account security
          </dd>
          <dt>Retention</dt>
          <dd>for the life of the account, then deletion (see section 15)</dd>
        </dl>

        <h2 id="analysis">7. Analysing your contracts</h2>
        <p>
          When you upload a document, the following happens:
        </p>
        <ul>
          <li>
            the file is transmitted to our text-extraction provider (Unstract,
            via an EU processing endpoint), which returns the plain text;
          </li>
          <li>
            the extracted text is split into clauses and sent to our AI provider
            (the Google Gemini API) to produce risk flags and suggested wording;
          </li>
          <li>
            the extracted text, the analysis, and any edits you make are stored
            in our database so you can return to them.
          </li>
        </ul>
        <p>
          By default the uploaded original file is <strong>not</strong> retained.
          Only the extracted text is kept, unless an administrator of your
          workspace enables original-file storage.
        </p>
        <p>
          Our AI provider states that content submitted through its API is not
          used to train its general models. Contract text is processed only to
          generate the analysis you asked for.
        </p>
        <dl>
          <dt>Purpose</dt>
          <dd>
            providing the contract analysis, suggested wording, versioning, and
            portfolio views you use the product for
          </dd>
          <dt>Legal basis</dt>
          <dd>
            Article 6(1)(b) GDPR where the document concerns you as account
            holder. Where the document contains other people&apos;s personal
            data, see section 8.
          </dd>
          <dt>Retention</dt>
          <dd>
            until you delete the document, or until your account is closed (see
            section 15)
          </dd>
        </dl>

        <h2 id="third-parties">
          8. Personal data of third parties in your documents
        </h2>
        <p>
          Contracts you upload often contain the personal data of other people,
          such as counterparties, signatories, or employees. For that data{" "}
          <strong>you (or your organisation) are the controller</strong> and
          Lexora acts as your processor under Article 28 GDPR. Our{" "}
          <Link href="/legal/dpa">data processing agreement</Link> governs that
          processing and forms part of your contract with us.
        </p>
        <p>
          Because that data reaches us from you rather than from the individuals
          concerned, the information duty under Article 14 GDPR rests with you as
          controller. You are responsible for having a legal basis to upload the
          document and, where required, for informing those individuals.
        </p>

        <h2 id="automated">9. Automated processing</h2>
        <p>
          Lexora analyses contract text automatically and proposes wording. These
          are suggestions for your review. The product does not take decisions
          that produce legal effects concerning a person, or similarly
          significantly affect a person, based solely on automated processing
          within the meaning of Article 22 GDPR. A human, namely you, decides
          what to do with every finding.
        </p>

        <h2 id="billing">10. Billing</h2>
        <p>
          Paid plans are not offered yet, so no billing data is processed today.
          This section describes what will happen once billing goes live. We will
          update this policy, and name the payment provider, before any charge is
          taken.
        </p>
        <p>
          If you take a paid plan, we process your billing name and address, your
          VAT identification number where applicable, the plan and amount, and
          payment metadata returned by our payment provider. We do not receive or
          store full card numbers.
        </p>
        <dl>
          <dt>Purpose</dt>
          <dd>processing payments, invoicing, meeting tax and accounting duties</dd>
          <dt>Legal basis</dt>
          <dd>
            Article 6(1)(b) GDPR (the paid contract) and Article 6(1)(c) GDPR
            (statutory retention duties)
          </dd>
          <dt>Recipients</dt>
          <dd>
            {COMPANY.billingProvider ?? "the payment provider named at checkout"},
            our tax advisers, and the tax authorities where required
          </dd>
          <dt>Retention</dt>
          <dd>
            invoices and accounting records for up to 10 years under section 147
            of the German Fiscal Code (AO) and section 257 of the German
            Commercial Code (HGB)
          </dd>
        </dl>

        <h2 id="support">11. Support and messages</h2>
        <p>
          If you contact us by email or through a support channel, we process the
          content of your message and your contact details to answer it and, if
          relevant, to follow up.
        </p>
        <p>
          If you use the <Link href="/contact">contact form</Link> on our
          website, we process the name, email address, and message you enter.
          Each submission is stored in our database (Neon, see section 13) and a
          copy is delivered to our mailbox by our email delivery provider,
          Resend (Resend, Inc., United States), acting as our processor under
          Standard Contractual Clauses. We also record the IP address the
          submission was sent from, for the abuse prevention described in
          section 12.
        </p>
        <dl>
          <dt>Legal basis</dt>
          <dd>
            Article 6(1)(b) GDPR where the request relates to the contract,
            otherwise Article 6(1)(f) GDPR (our interest in answering enquiries
            and keeping the form free of abuse)
          </dd>
          <dt>Retention</dt>
          <dd>
            for as long as needed to handle the request and any follow-up, and
            in any case deleted within 12 months of the matter being closed,
            subject to statutory retention duties
          </dd>
        </dl>

        <h2 id="security">12. Security and rate limiting</h2>
        <p>
          To protect the service against abuse and overload, we count requests
          against a key derived from your IP address and, when you are signed in,
          your user ID, and we log blocked requests. This data is short-lived and
          is used only for abuse prevention and capacity planning.
        </p>
        <dl>
          <dt>Legal basis</dt>
          <dd>
            Article 6(1)(f) GDPR (our legitimate interest in a secure, available
            service)
          </dd>
          <dt>Retention</dt>
          <dd>
            counters expire within their time window; block logs are kept for a
            short period, then deleted
          </dd>
        </dl>

        <h2 id="recipients">13. Recipients and sub-processors</h2>
        <p>
          We use the following processors. Each is bound by a data processing
          agreement that meets Article 28 GDPR. This list is also an annex to our{" "}
          <Link href="/legal/dpa">data processing agreement</Link>.
        </p>
        <table>
          <thead>
            <tr>
              <th>Processor</th>
              <th>Purpose</th>
              <th>Location</th>
              <th>Transfer safeguard</th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td>{p.purpose}</td>
                <td>{p.location}</td>
                <td>{p.safeguard}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Transactional email tied to your account (for example sign-in links and
          security notices) is sent by our authentication provider, Clerk, listed
          above. We do not currently use a separate email-marketing provider.
          Paid plans are not yet available; when billing goes live we will add
          the payment provider to this list and to the{" "}
          <Link href="/legal/dpa">data processing agreement</Link> before any
          charge is taken.
        </p>

        <h2 id="transfers">14. Transfers outside the EEA</h2>
        <p>
          Some of the processors above are located in, or process data in, the
          United States. Where personal data is transferred outside the European
          Economic Area, we rely on the European Commission&apos;s Standard
          Contractual Clauses under Article 46(2)(c) GDPR, together with
          additional technical and organisational measures where needed, or on an
          adequacy decision where one applies. You can request a copy of the
          relevant safeguards from the data protection contact above.
        </p>

        <h2 id="retention">15. Retention</h2>
        <p>
          We keep personal data only as long as needed for the purpose it was
          collected for, or as long as a statutory retention period requires.
        </p>
        <ul>
          <li>
            Account data is deleted within 30 days after you close your account.
          </li>
          <li>
            Documents and their extracted text are deleted when you delete them,
            or when your account is closed.
          </li>
          <li>
            Backups are rotated and overwritten within 30 days.
          </li>
          <li>
            Invoices and accounting records are kept for the statutory periods
            described in section 10.
          </li>
        </ul>

        <h2 id="required">16. Is provision required</h2>
        <p>
          Providing an email address and password is necessary to create an
          account; without it we cannot provide the service. Uploading a document
          is voluntary, but the analysis features cannot work without one.
          Billing data is required only for paid plans.
        </p>

        <h2 id="changes">17. Changes to this policy</h2>
        <p>
          We may update this policy as the product or the law changes. The
          version and effective date are shown at the top of the page. For
          changes that affect you, we will give notice through the product or by
          email before the new version takes effect.
        </p>

        <h2 id="complaints">18. Complaints to a supervisory authority</h2>
        <p>
          If you believe our processing of your personal data infringes the GDPR,
          you can lodge a complaint with a supervisory authority, in particular
          in the Member State of your habitual residence, your place of work, or
          the place of the alleged infringement. The authority competent for us
          is{" "}
          <Fill value={COMPANY.supervisoryAuthority}>
            competent supervisory authority for the registered seat
          </Fill>
          .
        </p>
      </div>
    </LegalShell>
  );
}
