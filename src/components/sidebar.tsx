"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, BookOpen, Scale, Settings, HelpCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Dashboard",     icon: LayoutDashboard, href: "/dashboard", soon: false },
  { label: "Clause Library", icon: BookOpen,        href: "/clauses",   soon: true  },
  { label: "Policies",      icon: Scale,            href: "/policies",  soon: true  },
];

const bottomLinks = [
  { label: "Settings", icon: Settings,   href: "/settings", soon: true },
  { label: "Support",  icon: HelpCircle, href: "/support",  soon: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-sidebar-border bg-sidebar sticky top-16 h-[calc(100vh-64px)]">
      {/* Main nav */}
      <div className="flex-1 overflow-y-auto p-3 pt-6">
        <p className="eyebrow px-3 mb-3">AI Analysis</p>
        <nav className="space-y-0.5">
          {navLinks.map(({ label, icon: Icon, href, soon }) =>
            soon ? (
              <div
                key={href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground/50 cursor-not-allowed select-none"
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span>{label}</span>
                <span className="ml-auto eyebrow text-[9px] rounded border border-border px-1.5 py-0.5 text-muted-foreground/70">
                  Soon
                </span>
              </div>
            ) : (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  pathname === href
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-e1 ring-1 ring-sidebar-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span>{label}</span>
              </Link>
            )
          )}
        </nav>
      </div>

      {/* Bottom — Generate Report + Settings + Support */}
      <div className="p-3 border-t border-sidebar-border space-y-3">
        <Button
          className="w-full gap-2 bg-brand text-brand-foreground hover:bg-brand/90"
          size="sm"
          onClick={() => router.push("/dashboard?generate=1")}
        >
          <Sparkles className="h-4 w-4" />
          Generate Contract
        </Button>
        <nav className="space-y-0.5">
          {bottomLinks.map(({ label, icon: Icon, href }) => (
            <div
              key={href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground/50 cursor-not-allowed select-none"
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="font-medium">{label}</span>
              <span className="ml-auto eyebrow text-[9px] rounded border border-border px-1.5 py-0.5 text-muted-foreground/70">
                Soon
              </span>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
