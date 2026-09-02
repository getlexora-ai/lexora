import type { Metadata } from "next";
import Link from "next/link";
import { LegalShell, type TocItem } from "@/components/legal/legal-shell";
import { Fill } from "@/components/legal/fill";
import { COMPANY } from "@/lib/legal/policies";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The terms governing use of Lexora: the service, accounts and trials, pricing, withdrawal rights, liability, and termination.",
};

const TOC: TocItem[] = [
  { id: "scope", label: "1. Scope" },
  { id: "definitions", label: "2. Definitions" },
  { id: "service", label: "3. The service" },
  { id: "conclusion", label: "4. Conclusion of contract" },
  { id: "account", label: "5. Registration and account" },
  { id: "trial", label: "6. Trial" },
  { id: "pricing", label: "7. Plans, prices, payment" },
  { id: "withdrawal", label: "8. Right of withdrawal (consumers)" },
  { id: "term", label: "9. Term and termination" },
  { id: "availability", label: "10. Availability" },
  { id: "use", label: "11. Your responsibilities and acceptable use" },
  { id: "content", label: "12. Rights to your content" },
  { id: "ip", label: "13. Intellectual property" },
  { id: "ai-output", label: "14. AI output" },
  { id: "warranty", label: "15. Warranty for defects" },
  { id: "liability", label: "16. Liability" },
  { id: "data-protection", label: "17. Data protection" },
  { id: "confidentiality", label: "18. Confidentiality" },
  { id: "changes", label: "19. Changes to these terms" },
  { id: "final", label: "20. Final provisions" },
];

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="AGB"
      title="Terms of service"
      aka="Allgemeine Geschäftsbedingungen (AGB)"
      toc={TOC}
      intro={
        <p>
          These terms govern the contract between{" "}
          <Fill value={COMPANY.legalName}>Registered company name</Fill> (
          &quot;Lexora&quot;, &quot;we&quot;) and you for the use of the Lexora
          website and product.
        </p>
      }
    >
      <div className="legal-prose">
        <h2 id="scope">1. Scope</h2>
        <p>
          1.1 These terms apply to every contract for the use of Lexora, whether
          on a free or paid plan. They apply in the version current at the time
          the contract is concluded.
        </p>
        <p>
          1.2 We do not recognise conflicting or supplementary terms of yours
          unless we have agreed to them in writing.
        </p>
        <p>
          1.3 A <strong>consumer</strong> is any natural person entering into the
          contract for purposes that are mainly outside their trade, business, or
          profession (section 13 of the German Civil Code, BGB). An{" "}
          <strong>entrepreneur</strong> is a natural or legal person acting in
          the exercise of their trade, business, or profession (section 14 BGB).
        </p>

        <h2 id="definitions">2. Definitions</h2>
        <ul>
          <li>
            <strong>Service</strong>: the Lexora web application and related
            features that analyse contract documents, propose wording, and keep a
            version history.
          </li>
          <li>
            <strong>Account</strong>: the access credentials and workspace we
            create for you.
          </li>
          <li>
            <strong>Your content</strong>: documents you upload and text you
            enter, together with the analysis outputs generated for you.
          </li>
          <li>
            <strong>Output</strong>: risk flags, notes, and suggested wording the
            Service generates automatically.
          </li>
        </ul>

        <h2 id="service">3. The service</h2>
        <p>
          3.1 Lexora is a <strong>software tool</strong> that supports your own
          review of contracts. It parses a document, highlights language that is
          commonly negotiated, and drafts alternative wording for you to
          consider.
        </p>
        <p>
          3.2 Lexora <strong>does not provide legal advice</strong> within the
          meaning of the German Legal Services Act
          (Rechtsdienstleistungsgesetz, RDG). It performs no legal assessment of
          your individual case, is not a law firm, and does not replace a lawyer.
          No lawyer-client relationship arises between you and us. For advice on
          your situation, consult a licensed lawyer
          (Rechtsanwältin/Rechtsanwalt).
        </p>
        <p>
          3.3 We may change, add to, or discontinue features. We will not
          materially reduce the core functionality of a paid plan during a paid
          term without giving you the right to terminate for the remaining term
          and refunding fees paid for the unused period.
        </p>

        <h2 id="conclusion">4. Conclusion of contract</h2>
        <p>
          4.1 Presenting the Service and the plans on our website is an
          invitation to you to make an offer, not a binding offer by us.
        </p>
        <p>
          4.2 By completing the registration or order form and submitting it, you
          make a binding offer to conclude the contract. The contract is
          concluded when we confirm it or provide access, whichever is earlier.
        </p>
        <p>
          4.3 Before submitting an order you can review and correct your entries.
          The contract text is not stored by us in a form separately accessible
          to you after conclusion; these terms remain available on this page.
        </p>

        <h2 id="account">5. Registration and account</h2>
        <p>
          5.1 You must provide accurate registration details and keep them up to
          date. You must be at least 18 years old.
        </p>
        <p>
          5.2 You are responsible for keeping your credentials confidential and
          for activity under your account, unless the activity results from a
          circumstance you are not responsible for. Tell us without delay if you
          suspect unauthorised use.
        </p>
        <p>
          5.3 If you register on behalf of an organisation, you confirm you are
          authorised to bind it, and &quot;you&quot; means that organisation.
        </p>

        <h2 id="trial">6. Trial</h2>
        <p>
          6.1 We may offer a time-limited trial. Unless stated otherwise, no
          payment details are required to start it, and it does not convert into
          a paid plan automatically.
        </p>
        <p>
          6.2 We may change or end trial offers at any time. Trials are provided
          &quot;as is&quot; to the extent permitted by section 16.
        </p>

        <h2 id="pricing">7. Plans, prices, payment</h2>
        <p>
          7.1 Prices are those shown on the order page at the time of your order.
          As the provider is a small business within the meaning of section 19 of
          the German VAT Act (Kleinunternehmer), no value added tax is shown or
          charged. Should this status change, prices to entrepreneurs will be net
          of statutory value added tax and prices to consumers will be shown
          inclusive of it.
        </p>
        <p>
          7.2 Fees for a paid plan are due in advance for the billing period
          chosen (monthly or yearly). Payment is processed by the payment
          provider named in the order process.
        </p>
        <p>
          7.3 We may change prices for a future billing period. We will give you
          notice at least 30 days before the
          change takes effect. If you do not accept the change, you may terminate
          with effect from the end of the current billing period.
        </p>
        <p>
          7.4 If a payment fails or is charged back, we may suspend access until
          payment is made. Statutory rights on default apply.
        </p>

        <h2 id="withdrawal">8. Right of withdrawal for consumers</h2>
        <p>
          If you are a consumer, you have a statutory right of withdrawal. The
          following instruction applies.
        </p>
        <h3>Right of withdrawal</h3>
        <p>
          You have the right to withdraw from this contract within 14 days
          without giving any reason. The withdrawal period is 14 days from the
          day of the conclusion of the contract.
        </p>
        <p>
          To exercise the right of withdrawal, you must inform us (
          <Fill value={COMPANY.legalName}>Registered company name</Fill>,{" "}
          <Fill value={COMPANY.email}>contact address</Fill>) of your decision to
          withdraw from this contract by a clear statement, for example a letter
          sent by post or an email. You may use the model withdrawal form below,
          but it is not obligatory. To meet the withdrawal deadline, it is
          sufficient for you to send your communication concerning the exercise
          of the right of withdrawal before the withdrawal period has expired.
        </p>
        <h3>Effects of withdrawal</h3>
        <p>
          If you withdraw from this contract, we shall reimburse all payments
          received from you without undue delay and no later than 14 days from
          the day on which we are informed of your decision to withdraw. We will
          use the same means of payment as you used for the initial transaction,
          unless expressly agreed otherwise; in no event will you be charged fees
          for the reimbursement.
        </p>
        <p>
          If you requested that the provision of services begin during the
          withdrawal period, you shall pay us an amount which is in proportion to
          what has been provided until you informed us of your withdrawal,
          compared with the full coverage of the contract.
        </p>
        <h3>Early expiry of the right of withdrawal</h3>
        <p>
          For a contract for the supply of digital content not on a tangible
          medium, the right of withdrawal expires if we have begun to perform the
          contract after you have expressly consented to performance beginning
          before the end of the withdrawal period and have acknowledged that you
          thereby lose your right of withdrawal, and we have provided you with
          confirmation of the contract.
        </p>
        <h3>Model withdrawal form</h3>
        <p>
          (If you want to withdraw from the contract, please fill in this form
          and send it back.)
        </p>
        <ul>
          <li>
            To <Fill value={COMPANY.legalName}>Registered company name</Fill>,{" "}
            <Fill value={COMPANY.email}>contact address</Fill>:
          </li>
          <li>
            I/We hereby give notice that I/We withdraw from my/our contract for
            the provision of the following service:
          </li>
          <li>Ordered on:</li>
          <li>Name of consumer(s):</li>
          <li>Address of consumer(s):</li>
          <li>Signature of consumer(s) (only if this form is notified on paper):</li>
          <li>Date:</li>
        </ul>

        <h2 id="term">9. Term and termination</h2>
        <p>
          9.1 Unless a fixed term is agreed, the contract runs for an indefinite
          period.
        </p>
        <p>
          9.2 A monthly plan may be terminated by either party with effect from
          the end of the current billing month. A yearly plan may be terminated
          with effect from the end of the current billing year. Termination of a
          plan can be carried out in the account settings or by a message in text
          form.
        </p>
        <p>
          9.3 The right of either party to terminate for good cause without
          notice remains unaffected. Good cause for us includes a serious or
          repeated breach of section 11 that you do not cure within a reasonable
          period after notice.
        </p>
        <p>
          9.4 On termination your access ends. You can export your content before
          the end of the contract. We delete your content in line with our{" "}
          <Link href="/legal/privacy">privacy policy</Link> and the{" "}
          <Link href="/legal/dpa">data processing agreement</Link>.
        </p>

        <h2 id="availability">10. Availability</h2>
        <p>
          10.1 We aim for high availability but do not owe a specific uptime
          figure unless a separate service level agreement is agreed in writing.
        </p>
        <p>
          10.2 Maintenance, security measures, and events outside our reasonable
          control may cause temporary interruptions. We will keep planned
          downtime to a minimum and, where practicable, announce it in advance.
        </p>

        <h2 id="use">11. Your responsibilities and acceptable use</h2>
        <p>You agree that you will:</p>
        <ul>
          <li>
            use the Service only in line with applicable law and these terms;
          </li>
          <li>
            upload only documents you are entitled to process, and hold a legal
            basis for any personal data they contain;
          </li>
          <li>
            not upload content that is unlawful, infringing, or malicious, and
            not attempt to introduce malware;
          </li>
          <li>
            not probe, scan, or test the vulnerability of the Service, or breach
            or circumvent its security or authentication;
          </li>
          <li>
            not use automated means to access the Service outside a documented
            interface, or in a way that places an unreasonable load on it, or to
            circumvent usage limits;
          </li>
          <li>
            not resell or provide the Service to a third party as a service
            bureau without our written agreement; and
          </li>
          <li>
            not use the Output as a substitute for advice from a qualified
            lawyer.
          </li>
        </ul>

        <h2 id="content">12. Rights to your content</h2>
        <p>
          12.1 You keep all rights in your content. You grant us a
          non-exclusive, worldwide, non-transferable right to host, process, and
          display your content, and to pass it to the processors listed in the{" "}
          <Link href="/legal/privacy">privacy policy</Link>, solely to provide
          and support the Service for you. This right ends when the content is
          deleted, except for backups pending rotation.
        </p>
        <p>
          12.2 You are responsible for the lawfulness of your content and for
          keeping your own copies.
        </p>
        <p>
          12.3 As between the parties, the Output generated for you is yours to
          use for any lawful purpose. We give no warranty that the Output is
          original or free of third-party rights, and section 14 applies.
        </p>

        <h2 id="ip">13. Intellectual property</h2>
        <p>
          13.1 The Service, its software, design, and documentation are protected
          by law and remain our property or that of our licensors. Nothing in
          these terms transfers ownership of the Service to you.
        </p>
        <p>
          13.2 We grant you, for the term of the contract, a non-exclusive,
          non-transferable right to use the Service for your internal business or
          personal purposes.
        </p>
        <p>
          13.3 If you send us feedback, we may use it to improve the Service
          without obligation to you.
        </p>

        <h2 id="ai-output">14. AI output</h2>
        <p>
          14.1 The Output is generated automatically. It may be incomplete,
          inaccurate, or unsuitable for your situation. It is not legal advice
          (section 3.2).
        </p>
        <p>
          14.2 You must review the Output and decide for yourself whether and how
          to use it. We do not warrant that the Output is correct, complete, or
          fit for a particular purpose, and we are not liable for decisions you
          take on the basis of it, subject to the mandatory liability rules in
          section 16.
        </p>
        <p>
          14.3 Similar or identical Output may be generated for other users. The
          Output is not represented as unique.
        </p>

        <h2 id="warranty">15. Warranty for defects</h2>
        <p>
          15.1 We provide the Service in the quality owed under the contract. The
          statutory provisions on warranty apply, with the modifications in this
          section and in section 16.
        </p>
        <p>
          15.2 For a free plan or a trial, our liability for defects is limited
          to defects we concealed fraudulently.
        </p>
        <p>
          15.3 Minor deviations from the owed quality do not constitute a defect.
          A defect that we can remedy does not entitle you to reduce fees or
          withdraw before we have had a reasonable opportunity to remedy it.
        </p>

        <h2 id="liability">16. Liability</h2>
        <p>
          16.1 We are liable without limitation for damage arising from injury to
          life, body, or health caused by our negligent or intentional breach of
          duty, and for damage caused by our intent or gross negligence.
        </p>
        <p>
          16.2 For the negligent breach of a material contractual obligation (an
          obligation whose fulfilment makes the proper performance of the
          contract possible in the first place and on whose fulfilment you may
          regularly rely), our liability is limited to the foreseeable damage
          typical for this kind of contract.
        </p>
        <p>
          16.3 Any further liability for simple negligence is excluded.
        </p>
        <p>
          16.4 The limitations in this section do not apply to liability under
          the German Product Liability Act, to liability under an express
          guarantee, or to any other liability that cannot be limited by
          agreement.
        </p>
        <p>
          16.5 Where our liability is limited or excluded, this also applies to
          the personal liability of our legal representatives, employees, and
          agents.
        </p>

        <h2 id="data-protection">17. Data protection</h2>
        <p>
          Our processing of personal data is described in the{" "}
          <Link href="/legal/privacy">privacy policy</Link>. Where we process
          personal data in your documents on your behalf, the{" "}
          <Link href="/legal/dpa">data processing agreement</Link> applies and
          forms part of this contract.
        </p>

        <h2 id="confidentiality">18. Confidentiality</h2>
        <p>
          Each party will keep confidential the other party&apos;s non-public
          information disclosed in connection with the contract, use it only to
          perform the contract, and protect it with at least reasonable care.
          This does not apply to information that is or becomes public without
          breach, was lawfully known before disclosure, or must be disclosed by
          law or a public authority.
        </p>

        <h2 id="changes">19. Changes to these terms</h2>
        <p>
          19.1 We may change these terms where there is a valid reason, for
          example a change in the law, in case law, in the Service, or in our
          processors, provided the change is reasonable for you taking our
          interests into account.
        </p>
        <p>
          19.2 We will notify you of the new version in text form at least 30 days before it
          takes effect. If you do not object in text form before the new version
          takes effect, your continued use counts as acceptance; we will point
          this out in the notice. If you object, either party may terminate the
          contract with effect from the date the new version would have taken
          effect.
        </p>

        <h2 id="final">20. Final provisions</h2>
        <p>
          20.1 The contract is governed by the law of the Federal Republic of
          Germany, excluding the UN Convention on Contracts for the International
          Sale of Goods. For consumers, this choice of law does not deprive you
          of the protection of mandatory provisions of the law of your country of
          habitual residence.
        </p>
        <p>
          20.2 If you are an entrepreneur, a legal person under public law, or a
          special fund under public law, the place of jurisdiction for all
          disputes arising from the contract is our registered seat as stated in
          our <Link href="/legal/impressum">legal notice</Link>. We may also sue
          at your general place of jurisdiction.
        </p>
        <p>
          20.3 These terms are provided in English. If we provide a German
          version and there is a conflict, the English version prevails; this
          choice does not affect mandatory consumer protection in your language.
        </p>
        <p>
          20.4 Should any provision be or become invalid, the validity of the
          remaining provisions is not affected.
        </p>
      </div>
    </LegalShell>
  );
}
