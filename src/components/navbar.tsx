"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, SlidersHorizontal, FileText } from "lucide-react";
import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { BrandLockup } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const BARE_PAGES = ["/"];

const MARKETING_LINKS = [
  { href: "#demo", label: "Demo" },
  { href: "#features", label: "Product" },
  { href: "#pricing", label: "Pricing" },
  { href: "#steps", label: "How it works" },
];

/** Sign in / sign up / dashboard controls. Identical behaviour to before —
 *  only the surfaces changed. */
function AuthControls({ bare }: { bare: boolean }) {
  const { isLoaded, isSignedIn } = useUser();

  // Reserve the avatar's box while Clerk loads so the bar doesn't reflow.
  if (!isLoaded) return <div className="size-8" aria-hidden />;

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-2.5">
        {bare && (
          <Button size="sm" render={<Link href="/dashboard" />}>
            Go to dashboard
          </Button>
        )}
        <UserButton />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <SignInButton mode="modal">
        <Button size="sm" variant="ghost" className="hidden sm:inline-flex">
          Sign in
        </Button>
      </SignInButton>
      <SignUpButton mode="modal">
        <Button size="sm">Get started</Button>
      </SignUpButton>
    </div>
  );
}

/**
 * `bare` — the marketing bar on the landing page: 60px sticky hairline over a
 * blurred, part-transparent ground, brand lockup, section anchors, theme
 * switch, auth.
 * `app` — the 52px workspace top bar that sits inside the main column beside
 * the sidebar: breadcrumb, ⌘K search field, filter, avatar. No theme switch
 * here — on app screens it floats bottom-right, as the artifacts show it.
 */
export function Navbar({
  variant,
  crumb = "Contracts",
  crumbSub = "/ All",
}: {
  variant?: "bare" | "app";
  crumb?: string;
  crumbSub?: string;
}) {
  const pathname = usePathname();
  const resolved = variant ?? (BARE_PAGES.includes(pathname) ? "bare" : "app");

  if (resolved === "app") {
    return (
      <header className="sticky top-0 z-20 flex h-13 items-center gap-2.5 border-b border-border bg-[color-mix(in_oklab,var(--bg)_80%,transparent)] px-4 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium">
          <FileText className="size-4 shrink-0 text-text-3" aria-hidden />
          <span className="truncate">{crumb}</span>
          <span className="shrink-0 font-normal text-text-3">{crumbSub}</span>
        </div>
        <span className="flex-1" />
        <div className="hidden h-8 w-[min(320px,42vw)] items-center gap-2 rounded-md border border-border-strong bg-surface px-2.5 text-[13px] text-text-3 shadow-e1 sm:flex">
          <Search className="size-4" aria-hidden />
          <span className="flex-1 truncate">Search contracts &amp; clauses</span>
          <kbd className="kbd">⌘K</kbd>
        </div>
        <Button variant="outline" size="icon" aria-label="Filter">
          <SlidersHorizontal className="size-4" />
        </Button>
        <AuthControls bare={false} />
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-[color-mix(in_oklab,var(--bg)_78%,transparent)] backdrop-blur-[9px]">
      <div className="mx-auto flex h-15 max-w-[1140px] items-center gap-3.5 px-[clamp(18px,5vw,40px)]">
        <Link href="/" aria-label="Lexora home">
          <BrandLockup />
        </Link>
        <nav className="ml-2.5 hidden gap-[22px] min-[880px]:flex">
          {MARKETING_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-[13.5px] text-text-2 transition-colors hover:text-foreground"
            >
              {label}
            </a>
          ))}
        </nav>
        <span className="flex-1" />
        <ThemeToggle />
        <AuthControls bare />
      </div>
    </header>
  );
}
