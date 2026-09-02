/**
 * Single source of truth for the legal pages and for consent capture.
 *
 * POLICY_VERSION is stamped on every legal page and stored with every recorded
 * consent event, so changing it is what triggers a fresh consent prompt. Bump
 * it together with POLICY_EFFECTIVE_DATE whenever the Terms, Privacy policy or
 * DPA change in a way a user has to accept.
 */
export const POLICY_VERSION = "2026-09-02";
export const POLICY_EFFECTIVE_DATE = "2 September 2026";

/** The documents a user accepts when they create an account. */
export const CONSENT_DOCS = ["terms", "privacy", "dpa"] as const;
export type ConsentDoc = (typeof CONSENT_DOCS)[number];

export type LegalDoc = {
  slug: ConsentDoc | "impressum";
  title: string;
  /** The German legal name, shown as a subtitle. */
  aka: string;
  blurb: string;
};

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "impressum",
    title: "Legal notice",
    aka: "Impressum",
    blurb:
      "Who operates Lexora, how to reach us, and the register and tax details required by German law.",
  },
  {
    slug: "privacy",
    title: "Privacy policy",
    aka: "Datenschutzerklärung",
    blurb:
      "What personal data we process, why, on what legal basis, who receives it, and the rights you hold under the GDPR.",
  },
  {
    slug: "terms",
    title: "Terms of service",
    aka: "Allgemeine Geschäftsbedingungen (AGB)",
    blurb:
      "The rules for using Lexora: the service, accounts and trials, pricing, liability, and how the contract can end.",
  },
  {
    slug: "dpa",
    title: "Data processing agreement",
    aka: "Auftragsverarbeitungsvertrag (AVV)",
    blurb:
      "Where you are the controller and Lexora processes personal data in your documents on your behalf under Article 28 GDPR.",
  },
];

/**
 * Operator and contact details used across the legal pages. Every field starts
 * as null: a null renders as an amber "complete before launch" placeholder via
 * <Fill>, so an incomplete Impressum cannot ship by accident. Fill these in one
 * place and all four pages update.
 *
 * Set `reviewed` to the date counsel signed the documents off. Until then a
 * banner on every legal page marks them as a draft.
 */
export const COMPANY = {
  reviewed: "2 September 2026" as string | null,

  /**
   * Legal form of the operator. Currently a sole proprietorship
   * (Einzelunternehmen), pending final confirmation. If this becomes a GmbH or
   * UG, restore the commercial-register fields below and the register section of
   * the Impressum, and revisit the VAT wording (Kleinunternehmer no longer
   * applies once turnover crosses the section 19 UStG threshold).
   */
  legalForm: "Einzelunternehmen" as "Einzelunternehmen" | "GmbH" | "UG",

  /**
   * Small business under section 19 UStG: no VAT is shown or charged and no
   * USt-IdNr. is issued. Set to false once the operator opts into (or is
   * required to charge) VAT, then fill `vatId`.
   */
  smallBusiness: true,

  legalName: "Ajay Vaidhyanathan Swaminathan", // sole trader: the operator's full personal name
  tradeName: "Lexora",
  representedBy: null as string | null, // sole trader: same as legalName

  // Rendered line-by-line by <FillLines>, so this must stay an array of strings.
  addressLines: ["Karl-Marx-Ring 90", "81735 München", "Germany"],

  // Not applicable while `legalForm` is "Einzelunternehmen" (no Handelsregister
  // entry). Fill and re-enable the Impressum register section on incorporation.
  registerCourt: null as string | null, // Registergericht, e.g. "Amtsgericht München"
  registerNumber: null as string | null, // e.g. "HRB 123456"
  vatId: null as string | null, // USt-IdNr. per section 27a UStG; null while smallBusiness

  email: "hello@getlexora.de", // general contact
  privacyEmail: "hello@getlexora.de", // data protection contact; falls back to `email`
  // Deliberately omitted from the Impressum: rapid, direct contact is provided
  // by the email address above plus the /contact form (both reach the same
  // inbox). Set a number here to add a "Telephone" row back to the Impressum.
  phone: null as string | null,

  /** Data protection officer, or null if none is legally required. */
  dpo: null as string | null,

  /** Competent data protection supervisory authority for the registered seat. */
  supervisoryAuthority:
    "Bayerisches Landesamt für Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach, Germany" as
      | string
      | null,

  /** Where the production app is hosted. */
  hostingProvider: "Railway Corp." as string | null,
  /** Payment processor, once billing is live (planned: Polar). */
  billingProvider: null as string | null,
  /** Transactional email provider, if any beyond the auth provider's own mail. */
  emailProvider: null as string | null,
} as const;

export type SubProcessor = {
  name: string;
  purpose: string;
  location: string;
  safeguard: string;
};

/**
 * Sub-processors engaged today. Keep this list in sync with the DPA annex and
 * confirm each entry against the current signed agreements before launch.
 */
export const SUBPROCESSORS: SubProcessor[] = [
  {
    name: "Railway Corp.",
    purpose: "Hosting the web application and storing application data",
    location: "USA, with EU (Amsterdam) deployment region",
    safeguard: "EU Standard Contractual Clauses",
  },
  {
    name: "Clerk, Inc.",
    purpose: "User authentication and account management",
    location: "USA",
    safeguard: "EU Standard Contractual Clauses",
  },
  {
    name: "Neon, Inc.",
    purpose: "Managed PostgreSQL hosting for application data",
    location: "USA, with EU processing region",
    safeguard: "EU Standard Contractual Clauses",
  },
  {
    name: "Google (Gemini API, Google Ireland Ltd. / Google LLC)",
    purpose: "AI analysis of contract text and generation of suggested wording",
    location: "EU and USA",
    safeguard: "EU Standard Contractual Clauses",
  },
  {
    name: "Unstract, Inc. (LLMWhisperer)",
    purpose: "Text extraction from uploaded PDF and DOCX files",
    location: "EU processing endpoint",
    safeguard: "EU Standard Contractual Clauses",
  },
];

/** Absolute-ish path helper for links between the documents. */
export const legalPath = (slug: LegalDoc["slug"] | "") =>
  slug ? `/legal/${slug}` : "/legal";
