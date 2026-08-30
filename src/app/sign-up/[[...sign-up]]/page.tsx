import { SignUp } from "@clerk/nextjs";
import {
  AuthBrandPanel,
  AuthFormColumn,
  AuthSplit,
  AuthTopBar,
  CLERK_FLUSH_APPEARANCE,
} from "@/components/auth-shell";
import { RdgMicro } from "@/components/rdg-notice";

export default function SignUpPage() {
  return (
    <>
      <AuthTopBar />
      <AuthSplit>
        <AuthFormColumn
          title="Create your account"
          lede="Start a 14-day trial. No card required. Analyse contracts, see suggested wording, keep the trail."
        >
          <SignUp appearance={CLERK_FLUSH_APPEARANCE} />
          <RdgMicro variant="signup" />
        </AuthFormColumn>

        <AuthBrandPanel
          quote={
            <>
              Every contract, read line by line and{" "}
              <span className="hl hl-low">flagged, with suggested wording</span>,
              the moment you upload it.
            </>
          }
          by="What the tool does on day one"
          stats={[
            { n: "3", k: "steps to set up" },
            { n: "~90s", k: "to first analysis" },
            { n: "0", k: "card required" },
          ]}
        />
      </AuthSplit>
    </>
  );
}
