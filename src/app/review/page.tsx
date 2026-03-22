"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link,
  Image,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Risk = "high" | "medium" | "low";

type AnalysisCard = {
  id: string;
  risk: Risk;
  title: string;
  clause: string;
};

const SAMPLE_CARDS: AnalysisCard[] = [
  {
    id: "1",
    risk: "high",
    title: "Unlimited Liability Clause",
    clause:
      "Each party's liability under this Agreement shall be limited to the total fees paid in the twelve (12) months preceding the claim, except in cases of gross negligence or wilful misconduct.",
  },
  {
    id: "2",
    risk: "high",
    title: "Unilateral Termination Right",
    clause:
      "Either party may terminate this Agreement for convenience upon thirty (30) days' written notice to the other party, with settlement of any outstanding obligations.",
  },
  {
    id: "3",
    risk: "medium",
    title: "Broad IP Assignment",
    clause:
      "All intellectual property created by either party in connection with this Agreement shall be jointly owned, with each party retaining the right to independently exploit such IP without accounting to the other.",
  },
  {
    id: "4",
    risk: "medium",
    title: "Auto-Renewal Without Notice",
    clause:
      "This Agreement shall automatically renew for successive one-year terms unless either party provides written notice of non-renewal at least sixty (60) days prior to the end of the then-current term.",
  },
  {
    id: "5",
    risk: "low",
    title: "Governing Law Ambiguity",
    clause:
      "This Agreement shall be governed by and construed in accordance with the laws of England and Wales, with disputes subject to the exclusive jurisdiction of the courts of England and Wales.",
  },
];

const PLACEHOLDER_TEXT = `SERVICE AGREEMENT

This Service Agreement ("Agreement") is entered into as of January 1, 2024 ("Effective Date") by and between Acme Corporation, a Delaware corporation ("Client"), and TechVentures Ltd., a company incorporated in England and Wales ("Service Provider").

1. SERVICES

Service Provider agrees to provide the following services ("Services") to Client: software development, technical consulting, and related professional services as further described in any Statement of Work ("SOW") executed by the parties.

2. TERM

This Agreement shall commence on the Effective Date and shall continue for an initial period of one (1) year, unless earlier terminated in accordance with Section 8 hereof. This Agreement shall automatically renew for additional one (1) year periods unless either party provides written notice of non-renewal at least thirty (30) days prior to the end of the then-current term.

3. COMPENSATION

Client shall pay Service Provider the fees set forth in each applicable SOW. All fees are due and payable within thirty (30) days of Client's receipt of invoice. Service Provider reserves the right to charge interest at the rate of 1.5% per month on any amounts not paid when due.

4. INTELLECTUAL PROPERTY

All work product, inventions, discoveries, improvements, and other intellectual property created or developed by Service Provider in connection with the Services ("Work Product") shall be the sole and exclusive property of Client upon full payment of all applicable fees.

5. CONFIDENTIALITY

Each party agrees to maintain the confidentiality of the other party's Confidential Information and to use such information solely for the purposes of this Agreement. This obligation shall survive termination of this Agreement for a period of five (5) years.

6. LIABILITY

IN NO EVENT SHALL EITHER PARTY BE LIABLE TO THE OTHER FOR ANY INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES ARISING OUT OF OR RELATED TO THIS AGREEMENT, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

7. GOVERNING LAW

This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law provisions.

8. TERMINATION

Either party may terminate this Agreement immediately upon written notice if the other party materially breaches this Agreement and fails to cure such breach within thirty (30) days after receiving written notice thereof.`;

const RISK_STYLES: Record<Risk, { border: string; badge: string; title: string; label: string }> = {
  high: {
    border: "border-l-red-500",
    badge: "bg-red-50 border-red-100 text-red-700",
    title: "text-red-700",
    label: "High Risk",
  },
  medium: {
    border: "border-l-amber-500",
    badge: "bg-amber-50 border-amber-100 text-amber-700",
    title: "text-amber-700",
    label: "Medium Risk",
  },
  low: {
    border: "border-l-blue-500",
    badge: "bg-blue-50 border-blue-100 text-blue-700",
    title: "text-blue-700",
    label: "Low Risk",
  },
};

const NAV_TABS = ["Review", "Compare", "History", "Approval"];

function ReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileName = searchParams.get("file") ?? "Document";
  const contractType = searchParams.get("type") ?? "";

  const [activeTab, setActiveTab] = useState("Review");
  const [cards] = useState<AnalysisCard[]>(SAMPLE_CARDS);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Sub-header */}
      <header className="sticky top-16 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
            >
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
              Back
            </button>
            <div className="h-4 w-px bg-border" />
            <span className="text-sm font-semibold truncate max-w-[280px]">{fileName}</span>
            {contractType && (
              <span className="rounded bg-muted px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {contractType}
              </span>
            )}
          </div>

          {/* Tab nav */}
          <nav className="flex items-center gap-1">
            {NAV_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Export Report
            </Button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="border-b bg-muted/30 px-6 py-2 flex items-center gap-1 flex-wrap">
            {[
              { icon: Bold, label: "Bold" },
              { icon: Italic, label: "Italic" },
              { icon: Underline, label: "Underline" },
            ].map(({ icon: Icon, label }) => (
              <button
                key={label}
                title={label}
                className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
            <div className="w-px h-5 bg-border mx-1" />
            {[
              { icon: List, label: "Bullet list" },
              { icon: ListOrdered, label: "Numbered list" },
            ].map(({ icon: Icon, label }) => (
              <button
                key={label}
                title={label}
                className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
            <div className="w-px h-5 bg-border mx-1" />
            {[
              { icon: Link, label: "Insert link" },
              { icon: Image, label: "Insert image" },
            ].map(({ icon: Icon, label }) => (
              <button
                key={label}
                title={label}
                className="flex h-8 w-8 items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>

          {/* Editor area */}
          <div className="flex-1 overflow-y-auto px-12 py-10">
            <div className="max-w-3xl mx-auto">
              <div
                contentEditable
                suppressContentEditableWarning
                className="min-h-full outline-none text-sm leading-7 text-foreground font-[inherit] whitespace-pre-wrap"
              >
                {PLACEHOLDER_TEXT}
              </div>
            </div>
          </div>
        </div>

        {/* Right: AI cards sidebar */}
        <aside className="w-[400px] border-l flex flex-col bg-muted/20 overflow-hidden">
          <div className="px-5 py-4 border-b bg-background">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold">AI Analysis</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{cards.length} issues found</p>
              </div>
              <div className="flex gap-1.5">
                {(["high", "medium", "low"] as Risk[]).map(r => (
                  <span
                    key={r}
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${RISK_STYLES[r].badge}`}
                  >
                    {cards.filter(c => c.risk === r).length} {r}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {cards.map(card => {
              const style = RISK_STYLES[card.risk];
              return (
                <div
                  key={card.id}
                  className={`rounded-lg border border-l-4 bg-card shadow-sm ${style.border}`}
                >
                  <div className="px-4 pt-4 pb-3">
                    {/* Risk badge + title */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span
                        className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shrink-0 ${style.badge}`}
                      >
                        {style.label}
                      </span>
                    </div>
                    <h4 className={`text-sm font-semibold mb-2 ${style.title}`}>{card.title}</h4>

                    {/* Recommended clause */}
                    <div className="rounded-md bg-muted/50 border px-3 py-2.5 mb-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Recommended Clause
                      </p>
                      <p className="text-xs text-foreground leading-5">{card.clause}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs h-8 gap-1"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                        Replace in doc
                      </Button>
                      <Button size="sm" className="flex-1 text-xs h-8 gap-1">
                        <Sparkles className="h-3.5 w-3.5" />
                        Refine
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense>
      <ReviewContent />
    </Suspense>
  );
}
