import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell, type TocItem } from "@/components/legal/legal-shell";
import { Fill } from "@/components/legal/fill";
import { COMPANY, SUBPROCESSORS } from "@/lib/legal/policies";

export const metadata: Metadata = {
  title: "Data processing agreement",
  description:
    "The Article 28 GDPR data processing agreement between you as controller and Lexora as processor for personal data in your documents.",
};

const TOC: TocItem[] = [
  { id: "subject", label: "1. Parties and subject matter" },
  { id: "scope", label: "2. Scope, nature, purpose, duration" },
  { id: "categories", label: "3. Data and data subjects" },
  { id: "instructions", label: "4. Controller instructions" },
  { id: "processor-obligations", label: "5. Processor obligations" },
  { id: "toms", label: "6. Technical and organisational measures" },
  { id: "subprocessors", label: "7. Sub-processors" },
  { id: "assistance", label: "8. Assistance to the controller" },
  { id: "breach", label: "9. Personal data breaches" },
  { id: "deletion", label: "10. Deletion and return" },
  { id: "audits", label: "11. Audits and evidence" },
  { id: "transfers", label: "12. International transfers" },
  { id: "liability", label: "13. Liability, term, final provisions" },
  { id: "annex-subprocessors", label: "Annex 1: sub-processors" },
  { id: "annex-toms", label: "Annex 2: measures" },
];

export default function DpaPage() {
  return (
    <LegalShell
      eyebrow="Auftragsverarbeitung"
      title="Data processing agreement"
      aka="Auftragsverarbeitungsvertrag (AVV)"
      toc={TOC}
      intro={
        <p>
          This agreement is concluded under Article 28(3) GDPR. It applies
          whenever Lexora processes personal data on your behalf, in particular
          the personal data contained in documents you upload. It forms part of
          your <Link href="/legal/terms">terms of service</Link>. A version
          signed by both parties is available on request from{" "}
          <Fill value={COMPANY.privacyEmail ?? COMPANY.email}>
            our contact address
          </Fill>
          .
        </p>
      }
    >
      <div className="legal-prose">
        <h2 id="subject">1. Parties and subject matter</h2>
        <p>
          1.1 The <strong>controller</strong> is the customer, meaning you or the
          organisation you registered for.
        </p>
        <p>
          1.2 The <strong>processor</strong> is{" "}
          <Fill value={COMPANY.legalName}>Registered company name</Fill>,{" "}
          <Fill value={COMPANY.email}>contact address</Fill>.
        </p>
        <p>
          1.3 The processor processes personal data only on behalf of the
          controller and in accordance with this agreement, unless required to do
          otherwise by Union or Member State law, in which case the processor
          will inform the controller of that legal requirement before processing,
          unless the law prohibits it.
        </p>

        <h2 id="scope">2. Scope, nature, purpose, and duration</h2>
        <dl>
          <dt>Nature and purpose</dt>
          <dd>
            hosting, text extraction, and automated analysis of contract
            documents to produce risk flags and suggested wording, plus storage
            and version history, all to provide the Lexora service to the
            controller
          </dd>
          <dt>Processing operations</dt>
          <dd>
            collection, storage, organisation, retrieval, transmission to
            sub-processors, and erasure
          </dd>
          <dt>Duration</dt>
          <dd>
            for the term of the controller&apos;s contract for the service, and
            until deletion or return of the data under section 10
          </dd>
        </dl>

        <h2 id="categories">3. Types of personal data and categories of data subjects</h2>
        <p>
          3.1 <strong>Types of personal data</strong>: data contained in the
          documents and text the controller submits, which may include names,
          contact details, signatory and representative details, job titles,
          financial and commercial terms, and any other personal data the
          controller chooses to include. The controller decides the content and
          must avoid including special categories of data (Article 9 GDPR) unless
          separately agreed.
        </p>
        <p>
          3.2 <strong>Categories of data subjects</strong>: the controller&apos;s
          contracting counterparties and their staff, signatories,
          representatives, employees, and any other individuals named in the
          submitted documents.
        </p>

        <h2 id="instructions">4. Rights and instructions of the controller</h2>
        <p>
          4.1 The controller is responsible for the lawfulness of the processing
          and for having a legal basis for submitting the data, including meeting
          information duties towards data subjects under Articles 13 and 14 GDPR.
        </p>
        <p>
          4.2 The processor acts only on documented instructions from the
          controller. This agreement, the terms of service, and the
          controller&apos;s use of the product&apos;s features are the initial
          documented instructions. Further instructions must be given in text
          form.
        </p>
        <p>
          4.3 The processor will inform the controller without undue delay if it
          considers an instruction to infringe the GDPR or other data protection
          law. The processor may suspend the affected processing until the
          instruction is confirmed or changed.
        </p>

        <h2 id="processor-obligations">5. Obligations of the processor</h2>
        <p>The processor will:</p>
        <ul>
          <li>
            process the personal data only as set out in section 4 and for no
            other purpose;
          </li>
          <li>
            ensure that persons authorised to process the data have committed
            themselves to confidentiality or are under an appropriate statutory
            obligation of confidentiality;
          </li>
          <li>
            implement and maintain the technical and organisational measures
            required by Article 32 GDPR (section 6 and Annex 2);
          </li>
          <li>
            respect the conditions for engaging sub-processors in section 7;
          </li>
          <li>
            assist the controller as set out in sections 8 and 9;
          </li>
          <li>
            delete or return the personal data as set out in section 10;
          </li>
          <li>
            make available the information necessary to demonstrate compliance
            with Article 28 GDPR and allow for and contribute to audits as set
            out in section 11;
          </li>
          <li>
            appoint a contact for data protection questions, reachable at{" "}
            <Fill value={COMPANY.privacyEmail ?? COMPANY.email}>
              data protection contact address
            </Fill>
            .
          </li>
        </ul>

        <h2 id="toms">6. Technical and organisational measures</h2>
        <p>
          The processor maintains the measures described in Annex 2, taking into
          account the state of the art, the costs of implementation, and the
          nature, scope, context, and purposes of processing, as well as the
          risk to data subjects. The processor may update the measures provided
          the level of protection is not reduced.
        </p>

        <h2 id="subprocessors">7. Sub-processors</h2>
        <p>
          7.1 The controller gives general authorisation for the processor to
          engage sub-processors. Those engaged at the date of this agreement are
          listed in Annex 1.
        </p>
        <p>
          7.2 The processor will impose on each sub-processor, by contract, data
          protection obligations equivalent to those in this agreement, in
          particular sufficient guarantees to implement appropriate technical and
          organisational measures. The processor remains fully liable to the
          controller for the performance of each sub-processor&apos;s
          obligations.
        </p>
        <p>
          7.3 The processor will inform the controller of any intended addition
          or replacement of a sub-processor at least{" "}
          <Fill value={null}>notice period, for example 30 days</Fill> in
          advance, giving the controller the opportunity to object on reasonable
          data protection grounds. If the controller objects and the parties
          cannot agree, the controller may terminate the affected service for the
          future.
        </p>

        <h2 id="assistance">8. Assistance to the controller</h2>
        <p>
          8.1 Taking into account the nature of the processing, the processor
          will assist the controller by appropriate technical and organisational
          measures, insofar as possible, in fulfilling the controller&apos;s
          obligation to respond to requests from data subjects exercising their
          rights under Chapter III GDPR. If a data subject contacts the processor
          directly, the processor will forward the request to the controller
          without undue delay and not respond on its own.
        </p>
        <p>
          8.2 The processor will assist the controller in ensuring compliance
          with Articles 32 to 36 GDPR (security, breach notification, data
          protection impact assessments, prior consultation), taking into account
          the information available to the processor.
        </p>

        <h2 id="breach">9. Personal data breaches</h2>
        <p>
          The processor will notify the controller without undue delay after
          becoming aware of a personal data breach affecting the controller&apos;s
          data. The notification will describe, as far as known, the nature of
          the breach, the categories and approximate number of data subjects and
          records concerned, the likely consequences, and the measures taken or
          proposed. The processor will support the controller&apos;s own
          notification duties under Articles 33 and 34 GDPR.
        </p>

        <h2 id="deletion">10. Deletion and return</h2>
        <p>
          On termination of the provision of the service, and at the
          controller&apos;s choice, the processor will delete or return all
          personal data processed on the controller&apos;s behalf and delete
          existing copies, unless Union or Member State law requires storage.
          Where deletion cannot be immediate for backups, the data is isolated
          from further processing and deleted on the next backup rotation, within{" "}
          <Fill value={null}>backup retention period</Fill>. The processor will
          confirm deletion in text form on request.
        </p>

        <h2 id="audits">11. Audits and evidence</h2>
        <p>
          11.1 The processor will make available to the controller information
          necessary to demonstrate compliance with Article 28 GDPR, including
          summaries of relevant certifications, test results, or audit reports
          where available.
        </p>
        <p>
          11.2 The controller may carry out an audit, including inspections, once
          per year and additionally where there is a specific cause, on
          reasonable prior notice of at least{" "}
          <Fill value={null}>notice period, for example 14 days</Fill>, during
          business hours, without disproportionate disruption to the
          processor&apos;s operations, and subject to confidentiality. The
          controller bears its own audit costs.
        </p>

        <h2 id="transfers">12. International transfers</h2>
        <p>
          Any transfer of the controller&apos;s personal data to a country
          outside the European Economic Area takes place only where an adequacy
          decision applies or appropriate safeguards under Article 46 GDPR are in
          place, in particular the European Commission&apos;s Standard
          Contractual Clauses, together with any additional measures required.
          The relevant transfers and safeguards for current sub-processors are
          shown in Annex 1.
        </p>

        <h2 id="liability">13. Liability, term, and final provisions</h2>
        <p>
          13.1 Liability under this agreement follows Article 82 GDPR and the
          liability provisions of the <Link href="/legal/terms">terms of
          service</Link>.
        </p>
        <p>
          13.2 This agreement takes effect with the contract for the service and
          ends when that contract ends and the obligations in section 10 are
          fulfilled.
        </p>
        <p>
          13.3 If a provision of this agreement is invalid, the remaining
          provisions are unaffected. In case of conflict between this agreement
          and the terms of service on data protection matters, this agreement
          prevails.
        </p>

        <hr />

        <h2 id="annex-subprocessors">Annex 1: sub-processors</h2>
        <table>
          <thead>
            <tr>
              <th>Sub-processor</th>
              <th>Processing carried out</th>
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
            <tr>
              <td>
                <Fill value={COMPANY.hostingProvider}>Hosting provider</Fill>
              </td>
              <td>Hosting the web application and storing application data</td>
              <td>
                <Fill value={null}>region</Fill>
              </td>
              <td>
                <Fill value={null}>safeguard, if outside the EEA</Fill>
              </td>
            </tr>
            <tr>
              <td>
                <Fill value={COMPANY.emailProvider}>Email provider</Fill>
              </td>
              <td>Sending transactional email tied to the account</td>
              <td>
                <Fill value={null}>region</Fill>
              </td>
              <td>
                <Fill value={null}>safeguard, if outside the EEA</Fill>
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          <small>
            This annex mirrors the recipients table in the{" "}
            <Link href="/legal/privacy">privacy policy</Link> and is kept in sync
            with it.
          </small>
        </p>

        <h2 id="annex-toms">Annex 2: technical and organisational measures</h2>
        <p>
          The processor maintains measures appropriate to the risk, including the
          following. The detail of each measure is confirmed as part of the
          counsel review and kept current.
        </p>
        <ul>
          <li>
            <strong>Encryption</strong>: transport encryption (TLS) for all data
            in transit; encryption at rest for the application database and
            backups.
          </li>
          <li>
            <strong>Access control</strong>: authentication through a dedicated
            identity provider; role-based access to production systems on a
            least-privilege basis; access reviews; unique accounts; no shared
            credentials.
          </li>
          <li>
            <strong>Tenant separation</strong>: each account&apos;s data is
            logically separated and access is scoped to the owning account in the
            application layer.
          </li>
          <li>
            <strong>Pseudonymisation and minimisation</strong>: the uploaded
            original file is not retained by default; only extracted text needed
            for the analysis is stored;{" "}
            <Fill value={null}>
              state whether direct identifiers are masked before transmission to
              the AI provider, once that feature ships
            </Fill>
            .
          </li>
          <li>
            <strong>Availability and resilience</strong>: managed, redundant
            database hosting; regular backups; monitoring and alerting.
          </li>
          <li>
            <strong>Integrity</strong>: change management for production
            deployments; audit logging of security-relevant events; rate
            limiting and abuse protection.
          </li>
          <li>
            <strong>Restore</strong>: documented procedure to restore access to
            data after an incident;{" "}
            <Fill value={null}>restore objective, for example RPO and RTO</Fill>.
          </li>
          <li>
            <strong>Vendor management</strong>: data processing agreements with
            all sub-processors; review of their security posture before
            onboarding.
          </li>
          <li>
            <strong>Evaluation</strong>: periodic review and, where appropriate,
            testing of these measures.
          </li>
        </ul>
      </div>
    </LegalShell>
  );
}
