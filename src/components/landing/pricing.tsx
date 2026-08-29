"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { cn } from "@/lib/utils";

/* Three plans, one billing switch. Annual is 12% off the monthly rate and is
   still quoted per month, because that is the number people compare — the
   cycle line underneath carries the "billed annually" caveat. */

type Plan = {
  name: string;
  monthly: number;
  annual: number;
  features: string[];
  cta: string;
  popular?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Starter",
    monthly: 149,
    annual: 131,
    features: [
      "20 contract analyses / month",
      "Suggested wording & redline export",
      "Risk dashboard & version history",
      "1 workspace · up to 3 seats",
    ],
    cta: "Start 14-day trial",
  },
  {
    name: "Team",
    monthly: 189,
    annual: 166,
    popular: true,
    features: [
      "Unlimited analyses",
      "Shared clause library & playbooks",
      "Roles & audit log",
      "Up to 15 seats",
    ],
    cta: "Start 14-day trial",
  },
  {
    name: "Business",
    monthly: 250,
    annual: 220,
    features: [
      "Everything in Team",
      "SSO / SAML, DPA, EU data residency",
      "Custom playbooks & priority support",
      "Unlimited seats",
    ],
    cta: "Talk to sales",
  },
];

export function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <>
      <div className="mt-4 inline-flex flex-wrap items-center gap-2.5">
        <div className="seg" role="tablist" aria-label="Billing period">
          <button
            type="button"
            role="tab"
            aria-selected={!annual}
            className="seg-btn"
            onClick={() => setAnnual(false)}
          >
            Monthly
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={annual}
            className="seg-btn"
            onClick={() => setAnnual(true)}
          >
            Annual
          </button>
        </div>
        <span className="rounded-full border border-risk-low-line bg-risk-low-soft px-2 py-[3px] font-mono text-[10.5px] tracking-[0.03em] text-risk-low">
          Save 12% annually
        </span>
      </div>

      <div className="mt-8 grid gap-4 min-[820px]:grid-cols-3">
        {PLANS.map((plan) => (
          <Reveal key={plan.name}>
            <div
              className={cn(
                "relative flex h-full flex-col gap-3.5 rounded-xl border bg-surface p-5",
                plan.popular
                  ? "border-border-strong shadow-e2"
                  : "border-border shadow-e1"
              )}
            >
              {plan.popular && (
                <span className="btn-graphite absolute -top-px right-3.5 -translate-y-1/2 rounded-full px-2 py-[3px] font-mono text-[9.5px] tracking-[0.08em] uppercase">
                  Most popular
                </span>
              )}

              <div className="text-[13px] font-semibold">{plan.name}</div>

              <div className="text-[30px] font-bold tracking-[-0.04em] tabular-nums">
                €{annual ? plan.annual : plan.monthly}
                <span className="block text-xs font-medium tracking-normal text-text-3">
                  {annual ? "per month, billed annually" : "per month"}
                </span>
              </div>

              <ul className="flex flex-col gap-[7px]">
                {plan.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-[7px] text-[12.5px] text-text-2"
                  >
                    <Check
                      className="mt-0.5 size-3.5 shrink-0 text-risk-low"
                      aria-hidden
                    />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href="#demo"
                className={cn(
                  "mt-auto inline-flex h-10 items-center justify-center rounded-md border text-sm font-medium transition-all active:translate-y-px",
                  plan.popular
                    ? "btn-graphite border-transparent"
                    : "border-border-strong bg-surface text-foreground shadow-e1 hover:bg-surface-2"
                )}
              >
                {plan.cta}
              </a>
            </div>
          </Reveal>
        ))}
      </div>
    </>
  );
}
