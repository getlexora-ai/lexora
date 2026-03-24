"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, Scale, Settings, HelpCircle } from "lucide-react";
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

  return (
    <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r bg-muted/20 sticky top-16 h-[calc(100vh-64px)]">
      {/* Main nav */}
      <div className="flex-1 overflow-y-auto p-4 pt-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 px-2">
          AI Analysis
        </p>
        <nav className="space-y-0.5">
          {navLinks.map(({ label, icon: Icon, href, soon }) =>
            soon ? (
              <div
                key={href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-muted-foreground/50 cursor-not-allowed select-none"
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span>{label}</span>
                <span className="ml-auto text-[9px] font-bold uppercase tracking-widest border border-border rounded px-1 py-0.5">
                  Soon
                </span>
              </div>
            ) : (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                  pathname === href
                    ? "bg-accent text-accent-foreground font-semibold border border-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
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
      <div className="p-4 border-t bg-background/50 space-y-3">
        <Button className="w-full" size="sm">
          Generate Report
        </Button>
        <nav className="space-y-0.5">
          {bottomLinks.map(({ label, icon: Icon, href }) => (
            <div
              key={href}
              className="flex items-center gap-3 px-2 py-2 rounded-md text-sm text-muted-foreground/50 cursor-not-allowed select-none"
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="font-medium">{label}</span>
              <span className="ml-auto text-[9px] font-bold uppercase tracking-widest border border-border rounded px-1 py-0.5">
                Soon
              </span>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
