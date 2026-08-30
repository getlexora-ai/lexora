"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, Plus, Shield, Star } from "lucide-react";
import { SignInButton, useUser } from "@clerk/nextjs";
import { RdgNoticeBar } from "@/components/rdg-notice";
import { Button } from "@/components/ui/button";
import { ApprovalBadge } from "@/components/clauses/approval-badge";
import { PlaybookList } from "@/components/playbooks/playbook-list";
import { RuleTable } from "@/components/playbooks/rule-table";
import { RuleDrawer } from "@/components/playbooks/rule-drawer";
import type { PlaybookRule, PlaybookSummary } from "@/components/playbooks/types";

export default function PlaybooksPage() {
  const { isLoaded, isSignedIn } = useUser();

  const [playbooks, setPlaybooks] = useState<PlaybookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [detail, setDetail] = useState<{ playbook: PlaybookSummary; rules: PlaybookRule[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeRule, setActiveRule] = useState<PlaybookRule | null>(null);
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/playbooks");
      const data = await res.json();
      const list: PlaybookSummary[] = data.playbooks ?? [];
      setPlaybooks(list);
      setSelectedId((cur) => cur ?? list[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) void loadList();
  }, [isLoaded, isSignedIn, loadList]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/playbooks/${id}`);
      const data = await res.json();
      if (res.ok) setDetail({ playbook: data.playbook, rules: data.rules ?? [] });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const readOnly = !!detail?.playbook.readonly;

  async function patchPlaybook(patch: Record<string, unknown>) {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/playbooks/${detail.playbook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (res.ok) {
        setDetail((d) => (d ? { ...d, playbook: data.playbook } : d));
        void loadList();
      }
    } finally {
      setBusy(false);
    }
  }

  async function clone() {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/playbooks/${detail.playbook.id}/clone`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        await loadList();
        setSelectedId(data.playbook.id);
      }
    } finally {
      setBusy(false);
    }
  }

  async function createBlank() {
    const name = window.prompt("New playbook name");
    if (!name?.trim()) return;
    const res = await fetch("/api/playbooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      await loadList();
      setSelectedId(data.playbook.id);
    }
  }

  function onRuleSaved(rule: PlaybookRule) {
    setDetail((d) => {
      if (!d) return d;
      const i = d.rules.findIndex((r) => r.id === rule.id);
      const rules = i === -1 ? [...d.rules, rule] : d.rules.map((r) => (r.id === rule.id ? rule : r));
      rules.sort((a, b) => a.sort_order - b.sort_order);
      return { ...d, rules };
    });
  }
  function onRuleDeleted(id: string) {
    setDetail((d) => (d ? { ...d, rules: d.rules.filter((r) => r.id !== id) } : d));
  }

  if (isLoaded && !isSignedIn) {
    return (
      <div className="flex w-full max-w-[1120px] flex-col gap-4.5 p-[clamp(16px,3vw,28px)]">
        <RdgNoticeBar />
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-2 px-6 py-16 text-center">
          <Shield className="size-6 text-text-3" />
          <p className="text-[15px] font-semibold">Sign in to use playbooks</p>
          <p className="max-w-sm text-[13px] text-text-3">
            Encode your own review positions and grade every analysis against them.
          </p>
          <SignInButton mode="modal">
            <Button size="sm">Sign in</Button>
          </SignInButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[1120px] flex-col gap-4.5 p-[clamp(16px,3vw,28px)]">
      <RdgNoticeBar />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">Playbooks</h1>
          <p className="max-w-2xl text-[13px] text-text-3">
            Playbooks encode your own review positions. Lexora applies them mechanically; it
            does not assess whether they are legally correct.
          </p>
        </div>
        <Button size="sm" onClick={createBlank}>
          <Plus className="size-4" /> New playbook
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-text-3">
          <Loader2 className="mx-auto size-4 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[300px_1fr]">
          <PlaybookList
            playbooks={playbooks}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          <div className="min-w-0">
            {detailLoading || !detail ? (
              <div className="py-16 text-center text-text-3">
                <Loader2 className="mx-auto size-4 animate-spin" />
              </div>
            ) : (
              <div className="flex flex-col gap-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[16px] font-semibold">{detail.playbook.name}</h2>
                      <ApprovalBadge approved={detail.playbook.is_approved} />
                    </div>
                    {detail.playbook.description && (
                      <p className="mt-1 max-w-xl text-[12.5px] text-text-3">
                        {detail.playbook.description}
                      </p>
                    )}
                  </div>

                  {readOnly ? (
                    <Button size="sm" onClick={clone} disabled={busy}>
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
                      Clone to edit
                    </Button>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={detail.playbook.is_default ? "default" : "secondary"}
                        onClick={() => patchPlaybook({ is_default: !detail.playbook.is_default })}
                        disabled={busy}
                      >
                        <Star className={detail.playbook.is_default ? "size-4 fill-current" : "size-4"} />
                        {detail.playbook.is_default ? "Default" : "Make default"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => patchPlaybook({ is_approved: !detail.playbook.is_approved })}
                        disabled={busy}
                      >
                        {detail.playbook.is_approved ? "Mark unreviewed" : "Mark lawyer-reviewed"}
                      </Button>
                    </div>
                  )}
                </div>

                {readOnly && (
                  <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px] text-text-3">
                    This is a system-curated playbook. Clone it to change any position.
                  </p>
                )}

                <RuleTable
                  rules={detail.rules}
                  readOnly={readOnly}
                  onOpen={(r) => {
                    setActiveRule(r);
                    setDrawerOpen(true);
                  }}
                  onAdd={() => {
                    setActiveRule(null);
                    setDrawerOpen(true);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {detail && (
        <RuleDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          playbookId={detail.playbook.id}
          rule={activeRule}
          readOnly={readOnly}
          onSaved={onRuleSaved}
          onDeleted={onRuleDeleted}
        />
      )}
    </div>
  );
}
