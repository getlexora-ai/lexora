import Link from "next/link";
import { POLICY_VERSION } from "@/lib/legal/policies";

/* Shown under the sign-up form. Creating an account is the consent action; the
   acceptance itself is written to consent_events once the user reaches the
   workspace (see RecordConsent). */
export function SignupConsent() {
  return (
    <p className="mt-3 text-center text-[11px] leading-relaxed text-text-3">
      By creating an account you agree to Lexora&apos;s{" "}
      <Link href="/legal/terms" className="text-brand hover:underline">
        Terms of Service
      </Link>
      ,{" "}
      <Link href="/legal/privacy" className="text-brand hover:underline">
        Privacy Policy
      </Link>
      , and{" "}
      <Link href="/legal/dpa" className="text-brand hover:underline">
        Data Processing Agreement
      </Link>{" "}
      (version {POLICY_VERSION}), and you confirm that Lexora is an informational
      tool, not legal advice within the meaning of the RDG.
    </p>
  );
}
