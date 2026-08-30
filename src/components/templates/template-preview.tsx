"use client";

import { useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { ApprovalBadge } from "@/components/clauses/approval-badge";
import { markdownToHtml } from "@/lib/markdown";
import type { ContractTemplate } from "@/lib/contract-templates";

/** Read-only preview of a template body, rendered through the Markdown pipeline. */
export function TemplatePreview({
  template,
  open,
  onClose,
}: {
  template: ContractTemplate | null;
  open: boolean;
  onClose: () => void;
}) {
  const html = useMemo(
    () => (template ? markdownToHtml(template.body) : ""),
    [template],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {template?.name ?? "Template"}
            {template && <ApprovalBadge approved={template.is_approved} />}
          </DialogTitle>
          <DialogDescription>
            {template?.contract_type} · {template?.language?.toUpperCase()} ·{" "}
            {template?.sections?.length ?? 0} sections ·{" "}
            {template?.variables?.length ?? 0} variables. Placeholders are shown as{" "}
            <code className="font-mono text-[12px]">{"{{like_this}}"}</code>.
          </DialogDescription>
        </DialogHeader>

        <div
          className="prose-contract min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-background p-4 text-[13px] leading-relaxed [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_p]:my-2"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </DialogContent>
    </Dialog>
  );
}
