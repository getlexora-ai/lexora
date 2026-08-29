"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleDot, Upload } from "lucide-react";
import { AuthTopBar } from "@/components/auth-shell";
import { RdgOnboardingNote } from "@/components/rdg-notice";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
   First-run onboarding: Profile → Workspace → First contract → Done.

   Entirely client-side and entirely presentational — nothing here writes to
   the database or touches the auth flow. The last step reads the choices back
   as a summary so the wizard closes the loop it opened, and carries the RDG
   note in full before anyone analyses anything.
   ═══════════════════════════════════════════════════════════════════════════ */

const STEPS = ["Profile", "Workspace", "First contract", "Done"] as const;
const MAX = STEPS.length;

const ROLES = [
  {
    val: "counsel",
    t: "In-house counsel",
    d: "Review, redline and approve contracts for the business",
  },
  {
    val: "founder",
    t: "Founder / operator",
    d: "Sign a lot of contracts, not a lawyer",
  },
  {
    val: "ops",
    t: "Legal ops / procurement",
    d: "Run the intake queue and vendor paperwork",
  },
  { val: "other", t: "Something else", d: "Just exploring" },
];

const TEAMS = ["Just me", "2–10", "11–50", "50+"];

const PLAYBOOKS = [
  { val: "balanced", t: "Balanced", d: "Market-standard positions on both sides" },
  {
    val: "buyer",
    t: "Protect the buyer",
    d: "You're usually the customer / recipient",
  },
  {
    val: "seller",
    t: "Protect the seller",
    d: "You're usually the vendor / provider",
  },
  { val: "strict", t: "Conservative", d: "Flag aggressively, escalate early" },
];

const TYPES = ["NDA", "MSA", "DPA", "SaaS", "Employment", "Reseller"];

/** Radio-style card. The ring, not a fill, marks the choice. */
function Option({
  t,
  d,
  selected,
  onSelect,
}: {
  t: string;
  d: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border bg-surface p-3 text-left shadow-e-inset transition-colors",
        selected
          ? "border-ring shadow-[var(--hl-top),inset_0_0_0_1px_var(--ring)]"
          : "border-border hover:border-border-strong"
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
          selected ? "border-ring" : "border-border-strong"
        )}
        aria-hidden
      >
        {selected && <span className="size-2 rounded-full bg-ring" />}
      </span>
      <span>
        <span className="block text-[13px] font-semibold">{t}</span>
        <span className="mt-0.5 block text-[11.5px] leading-[1.45] text-text-3">
          {d}
        </span>
      </span>
    </button>
  );
}

function Chip({
  label,
  selected,
  onSelect,
  multi,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  multi?: boolean;
}) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[12.5px] font-medium shadow-e-inset transition-colors",
        selected
          ? "btn-graphite border-transparent"
          : "border-border-strong bg-surface hover:bg-surface-2"
      )}
    >
      {label}
    </button>
  );
}

function FieldCap({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block font-mono text-[10px] tracking-[0.1em] text-text-3 uppercase">
      {children}
    </span>
  );
}

function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-border px-3.5 py-2.5 text-[12.5px] first:border-t-0">
      <span className="font-mono text-[11px] tracking-[0.04em] text-text-3">
        {k}
      </span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<string | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState("My workspace");
  const [playbook, setPlaybook] = useState<string | null>(null);
  const [types, setTypes] = useState<string[]>([]);

  const go = (n: number) => {
    setStep(Math.max(1, Math.min(MAX, n)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const label = (list: { val: string; t: string }[], val: string | null) =>
    list.find((o) => o.val === val)?.t ?? "—";

  return (
    <>
      <AuthTopBar />

      <div className="mx-auto max-w-[640px] px-[clamp(20px,5vw,32px)] pt-[clamp(26px,6vw,56px)] pb-20">
        {/* Stepper */}
        <ol className="flex items-center">
          {STEPS.map((s, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <li key={s} className="contents">
                {i > 0 && (
                  <span
                    className="mx-2 h-px min-w-3 flex-1 bg-border"
                    aria-hidden
                  />
                )}
                <div
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-2 text-xs whitespace-nowrap",
                    active ? "font-semibold text-foreground" : "text-text-3"
                  )}
                >
                  <span
                    className={cn(
                      "grid size-5.5 place-items-center rounded-full border font-mono text-[10.5px] shadow-e-inset",
                      done && "border-risk-low-line bg-risk-low-soft text-risk-low",
                      active && "btn-graphite border-transparent",
                      !done && !active && "border-border-strong"
                    )}
                  >
                    {done ? <Check className="size-3" aria-hidden /> : n}
                  </span>
                  <span className="max-[620px]:hidden">{s}</span>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Progress */}
        <div
          className="my-4.5 mb-6.5 h-[3px] overflow-hidden rounded-full bg-surface-3"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={MAX}
          aria-label="Onboarding progress"
        >
          <span
            className="block h-full rounded-full bg-[image:var(--btn-primary)] transition-[width] duration-[380ms] ease-[cubic-bezier(.2,.7,.2,1)]"
            style={{ width: `${(step / MAX) * 100}%` }}
          />
        </div>

        {/* ── Step 1: Profile ── */}
        {step === 1 && (
          <section>
            <h2 className="text-[19px] font-semibold tracking-[-0.025em]">
              Tell us who you are
            </h2>
            <p className="mt-1.5 text-[13px] text-text-2">
              We&apos;ll tune the default playbook and how sensitively clauses
              get flagged to match.
            </p>

            <div className="mt-5.5 flex flex-col gap-4">
              <div>
                <FieldCap>Your role</FieldCap>
                <div className="grid gap-2" role="radiogroup" aria-label="Your role">
                  {ROLES.map((o) => (
                    <Option
                      key={o.val}
                      {...o}
                      selected={role === o.val}
                      onSelect={() => setRole(o.val)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <FieldCap>Team size</FieldCap>
                <div
                  className="flex flex-wrap gap-2"
                  role="radiogroup"
                  aria-label="Team size"
                >
                  {TEAMS.map((t) => (
                    <Chip
                      key={t}
                      label={t}
                      selected={team === t}
                      onSelect={() => setTeam(t)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Step 2: Workspace ── */}
        {step === 2 && (
          <section>
            <h2 className="text-[19px] font-semibold tracking-[-0.025em]">
              Set up your workspace
            </h2>
            <p className="mt-1.5 text-[13px] text-text-2">
              Name it, then pick the stance your playbook should start from.
            </p>

            <div className="mt-5.5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ws" className="font-mono text-[10px] tracking-[0.1em] text-text-3 uppercase">
                  Workspace name
                </label>
                <input
                  id="ws"
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  className="h-10.5 w-full rounded-md border border-border-strong bg-surface-2 px-3 text-sm shadow-e-inset transition-colors focus:border-ring focus-visible:outline-none"
                />
              </div>

              <div>
                <FieldCap>Playbook baseline</FieldCap>
                <div
                  className="grid gap-2 min-[520px]:grid-cols-2"
                  role="radiogroup"
                  aria-label="Playbook baseline"
                >
                  {PLAYBOOKS.map((o) => (
                    <Option
                      key={o.val}
                      {...o}
                      selected={playbook === o.val}
                      onSelect={() => setPlaybook(o.val)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Step 3: First contract ── */}
        {step === 3 && (
          <section>
            <h2 className="text-[19px] font-semibold tracking-[-0.025em]">
              Bring in your first contract
            </h2>
            <p className="mt-1.5 text-[13px] text-text-2">
              Upload one now, or start from a sample. You can always do this
              later.
            </p>

            <div className="mt-5.5 flex flex-col gap-4">
              <div className="flex flex-col items-center gap-1.5 rounded-lg border-[1.5px] border-dashed border-border-strong px-4 py-5.5 text-center">
                <span className="grid size-7.5 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--brand)_20%,var(--surface))] text-brand">
                  <Upload className="size-4" aria-hidden />
                </span>
                <span className="text-[13.5px] font-semibold">
                  Drop a PDF or DOCX
                </span>
                <span className="font-mono text-[10px] tracking-[0.06em] text-text-3 uppercase">
                  or browse — 20 MB max
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => go(step + 1)}>
                  Use a sample MSA
                </Button>
                <Button variant="outline" size="sm" onClick={() => go(step + 1)}>
                  Skip for now
                </Button>
              </div>

              <div>
                <FieldCap>Contract types you deal with</FieldCap>
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Contract types you deal with"
                >
                  {TYPES.map((t) => (
                    <Chip
                      key={t}
                      label={t}
                      multi
                      selected={types.includes(t)}
                      onSelect={() =>
                        setTypes((prev) =>
                          prev.includes(t)
                            ? prev.filter((x) => x !== t)
                            : [...prev, t]
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Step 4: Done ── */}
        {step === 4 && (
          <section>
            <div className="pt-2 pb-1 text-center">
              <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full border border-risk-low-line bg-risk-low-soft text-risk-low">
                <Check className="size-5.5" aria-hidden />
              </div>
              <h2 className="text-[19px] font-semibold tracking-[-0.025em]">
                You&apos;re all set
              </h2>
              <p className="mt-1.5 text-[13px] text-text-2">
                Here&apos;s what we&apos;ve configured — you can change any of it
                in Settings.
              </p>
            </div>

            <div className="mt-5.5 flex flex-col gap-4">
              <div className="overflow-hidden rounded-lg border border-border">
                <SummaryRow k="Role" v={label(ROLES, role)} />
                <SummaryRow k="Team" v={team ?? "—"} />
                <SummaryRow k="Workspace" v={workspace || "Untitled"} />
                <SummaryRow k="Playbook" v={label(PLAYBOOKS, playbook)} />
                <SummaryRow
                  k="Contract types"
                  v={types.length ? types.join(" · ") : "None yet"}
                />
              </div>

              <ul className="flex flex-col gap-2">
                {[
                  "Upload your first contract to analyse",
                  "Invite a teammate to your workspace",
                  "Tune your playbook positions",
                ].map((c) => (
                  <li
                    key={c}
                    className="flex items-center gap-2.5 text-[12.5px] text-text-2"
                  >
                    <CircleDot className="size-3.5 shrink-0 text-text-3" aria-hidden />
                    {c}
                  </li>
                ))}
              </ul>

              <RdgOnboardingNote />
            </div>
          </section>
        )}

        {/* Nav row */}
        <div className="mt-7 flex items-center gap-2.5">
          {step > 1 && (
            <Button variant="outline" size="lg" onClick={() => go(step - 1)}>
              Back
            </Button>
          )}
          <span className="flex-1" />
          {step < MAX ? (
            <Button size="lg" onClick={() => go(step + 1)}>
              Continue
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button size="lg" render={<Link href="/dashboard" />}>
              Open workspace
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
