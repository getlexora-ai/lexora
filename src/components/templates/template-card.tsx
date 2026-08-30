"use client";

import { useRouter } from "next/navigation";
import { Eye, Pencil, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ApprovalBadge } from "@/components/clauses/approval-badge";
import type { ContractTemplate } from "@/lib/contract-templates";

export function TemplateCard({
  template,
  onPreview,
  onEdit,
}: {
  template: ContractTemplate;
  onPreview: (t: ContractTemplate) => void;
  onEdit?: (t: ContractTemplate) => void;
}) {
  const router = useRouter();
  const canEdit = !template.readonly && !!onEdit;

  return (
    <Card className="justify-between">
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-[14px] leading-snug">{template.name}</CardTitle>
          <ApprovalBadge approved={template.is_approved} />
        </div>
        {template.description && (
          <p className="line-clamp-2 text-[12.5px] text-text-3">{template.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="pill pill-none"><i />{template.contract_type}</span>
          <span className="rounded-sm border border-border px-1.5 font-mono text-[10px] tracking-[0.06em] text-text-3 uppercase">
            {template.language}
          </span>
          <span className="font-mono text-[11px] text-text-3">
            {template.sections?.length ?? 0} §-clauses · {template.variables?.length ?? 0} vars
          </span>
          <span className="font-mono text-[11px] text-text-3">
            {template.readonly ? "Curated" : "Mine"}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => router.push(`/dashboard?generate=1&template=${template.id}`)}
        >
          <Sparkles className="size-3.5" /> Use
        </Button>
        <Button size="sm" variant="outline" onClick={() => onPreview(template)}>
          <Eye className="size-3.5" /> Preview
        </Button>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={() => onEdit!(template)}>
            <Pencil className="size-3.5" /> Edit
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
