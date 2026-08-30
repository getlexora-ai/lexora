import { SignIn } from "@clerk/nextjs";
import {
  AuthBrandPanel,
  AuthFormColumn,
  AuthSplit,
  AuthTopBar,
  CLERK_FLUSH_APPEARANCE,
} from "@/components/auth-shell";
import { RdgMicro } from "@/components/rdg-notice";

export default function SignInPage() {
  return (
    <>
      <AuthTopBar />
      <AuthSplit>
        <AuthFormColumn
          title="Sign in to Lexora"
          lede="Pick up where you left off. Your contracts and review history are waiting."
        >
          <SignIn appearance={CLERK_FLUSH_APPEARANCE} />

          <p className="mt-4 text-center font-mono text-[10px] tracking-[0.05em] text-text-3">
            SOC 2 TYPE II · GDPR · ENCRYPTED AT REST
          </p>
          <RdgMicro variant="signin" />
        </AuthFormColumn>

        <AuthBrandPanel
          quote={
            <>
              “It caught a{" "}
              <span className="hl hl-high">$1 liability cap</span> on page 11
              that three of us had read straight past.”
            </>
          }
          by="Head of Legal, Series B SaaS"
          snippet={
            <>
              <span className="font-mono text-[10px] text-text-3">
                § 3.2 · Limitation of Liability
              </span>
              <br />
              …Provider&apos;s aggregate liability shall be limited to{" "}
              <span className="hl hl-high">one dollar ($1)</span>, whether in
              contract or tort…
            </>
          }
          stats={[
            { n: "1.2s", k: "to first flag" },
            { n: "41", k: "clauses parsed" },
            { n: "6", k: "issues found" },
          ]}
        />
      </AuthSplit>
    </>
  );
}
