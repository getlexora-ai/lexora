"use client";

import { ShieldCheck, TriangleAlert } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * RDG control surface. A curated or user clause is "Unreviewed" until a human
 * confirms a licensed lawyer has checked the wording. The tooltip carries the
 * same substance as src/components/rdg-notice.tsx — kept short here, not a
 * restatement of the full notice.
 */
export function ApprovalBadge({
  approved,
  className,
}: {
  approved: boolean;
  className?: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          className={cn("pill", approved ? "pill-low" : "pill-none", className)}
        >
          {approved ? (
            <ShieldCheck className="size-3" aria-hidden />
          ) : (
            <TriangleAlert className="size-3" aria-hidden />
          )}
          {approved ? "Lawyer-reviewed" : "Unreviewed"}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {approved
            ? "Someone on your team has confirmed a licensed lawyer (Rechtsanwältin/Rechtsanwalt) reviewed this wording."
            : "AI-generated / user wording, for your own review. Lexora gives no legal advice within the meaning of the RDG. Have a licensed lawyer check it before you rely on it."}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
