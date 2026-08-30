"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  BookOpen,
  ChevronDown,
  FileText,
  LayoutGrid,
  Plus,
  Settings,
  Shield,
  Sparkles,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  icon: typeof FileText;
  href: string;
  soon?: boolean;
  count?: number;
};

const WORKSPACE_NAV: NavItem[] = [
  { label: "Contracts", icon: FileText, href: "/dashboard" },
  { label: "Clause library", icon: BookOpen, href: "/clauses" },
  { label: "Templates", icon: LayoutGrid, href: "/templates" },
  { label: "Playbooks", icon: Shield, href: "/playbooks" },
];

const INSIGHTS_NAV: NavItem[] = [
  { label: "Risk dashboard", icon: BarChart3, href: "/risk", soon: true },
  { label: "Activity", icon: Activity, href: "/activity", soon: true },
];

/** Section label above each nav group. */
function NavLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pt-3 pb-1 text-[10.5px] font-semibold tracking-[0.07em] text-text-3 uppercase">
      {children}
    </p>
  );
}

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const { label, icon: Icon, count, soon } = item;

  const body = (
    <>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
      {soon ? (
        <span className="ml-auto rounded-sm border border-border px-1.5 font-mono text-[9px] tracking-[0.06em] text-text-3 uppercase">
          Soon
        </span>
      ) : count != null ? (
        <span className="ml-auto font-mono text-[11px] tabular-nums text-text-3">
          {count}
        </span>
      ) : null}
    </>
  );

  if (soon) {
    return (
      <div
        className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-text-3 select-none"
        aria-disabled
      >
        {body}
      </div>
    );
  }

  // The active row is the only nav item that reads as a raised surface — a
  // hairline + bevel lifts it out of the flat sidebar ground.
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
        active
          ? "border border-[var(--accent-line)] bg-[var(--accent-wash)] px-2 py-[5px] font-semibold text-foreground shadow-e1"
          : "text-text-2 hover:bg-surface-3 hover:text-foreground"
      )}
    >
      {body}
    </Link>
  );
}

/**
 * The compact brand row that replaces the sidebar below 940px, so the
 * workspace name and the ⌘K affordance survive on narrow screens.
 */
export function MobileBrandBar({ workspace }: { workspace?: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5 min-[940px]:hidden">
      <BrandMark size={22} />
      <strong className="truncate text-[13px]">
        {workspace ?? "My workspace"}
      </strong>
      <span className="flex-1" />
      <kbd className="kbd">⌘K</kbd>
    </div>
  );
}

export function Sidebar({ contractCount }: { contractCount?: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss the New menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function go(query: string) {
    setMenuOpen(false);
    router.push(`/dashboard?${query}`);
  }

  const workspaceNav = WORKSPACE_NAV.map((n) =>
    n.href === "/dashboard" ? { ...n, count: contractCount } : n
  );

  return (
    <aside className="sticky top-0 hidden h-screen w-[252px] shrink-0 flex-col gap-1 border-r border-border bg-surface-2 p-3 min-[940px]:flex">
      {/* Workspace switcher */}
      <div className="mb-1.5 flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 shadow-e1">
        <BrandMark size={22} />
        <span className="flex-1 truncate text-[13px] font-semibold">
          {(user?.publicMetadata?.workspace as string | undefined) ??
            "My workspace"}
        </span>
        <ChevronDown className="size-4 text-text-3" aria-hidden />
      </div>

      {/* New ▾ */}
      <div className="relative mb-2.5" ref={menuRef}>
        <Button
          className="w-full justify-between"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="flex items-center gap-1.5">
            <Plus className="size-4" />
            New
          </span>
          <ChevronDown className="size-4 opacity-60" />
        </Button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute inset-x-0 top-[calc(100%+6px)] z-20 rounded-lg border border-border-strong bg-surface p-1.5 shadow-e3"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => go("upload=1")}
              className="flex w-full items-start gap-2.5 rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
            >
              <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Upload contract
                <span className="block text-[11px] text-text-3">
                  PDF or DOCX — analysed on upload
                </span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => go("generate=1")}
              className="flex w-full items-start gap-2.5 rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
            >
              <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Generate with AI
                <span className="block text-[11px] text-text-3">
                  Draft an NDA, MSA or SaaS agreement
                </span>
              </span>
            </button>
            <div className="mx-0.5 my-1 h-px bg-border" />
            <button
              type="button"
              role="menuitem"
              onClick={() => go("generate=1&template=1")}
              className="flex w-full items-start gap-2.5 rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
            >
              <BookOpen className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                New from template
                <span className="block text-[11px] text-text-3">
                  Start from a saved contract skeleton
                </span>
              </span>
            </button>
          </div>
        )}
      </div>

      <NavLabel>Workspace</NavLabel>
      <nav className="flex flex-col gap-0.5">
        {workspaceNav.map((item) => (
          <NavRow key={item.href} item={item} active={pathname === item.href} />
        ))}
      </nav>

      <NavLabel>Insights</NavLabel>
      <nav className="flex flex-col gap-0.5">
        {INSIGHTS_NAV.map((item) => (
          <NavRow key={item.href} item={item} active={false} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1">
        <NavRow
          item={{
            label: "Settings",
            icon: Settings,
            href: "/settings",
            soon: true,
          }}
          active={false}
        />
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 shadow-e1">
          <span className="size-6 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-[#8b8b80] to-[#5c5c54]">
            {user?.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.imageUrl}
                alt=""
                className="size-full object-cover"
              />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-semibold">
              {user?.fullName ?? user?.firstName ?? "Guest"}
            </span>
            <span className="block truncate text-[11px] text-text-3">
              {user?.primaryEmailAddress?.emailAddress ?? "Not signed in"}
            </span>
          </span>
        </div>
      </div>
    </aside>
  );
}
