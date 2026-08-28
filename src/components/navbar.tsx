"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const BARE_PAGES = ["/"];

export function Navbar() {
  const pathname = usePathname();

  // Landing page — minimal bar
  if (BARE_PAGES.includes(pathname)) {
    return (
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center">
            <Image src="/logo.svg" alt="Lexora" width={100} height={32} priority />
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Go to dashboard
          </Link>
        </div>
      </header>
    );
  }

  // App pages — full navbar
  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-8">
        <Link href="/dashboard" className="flex items-center">
          <Image src="/logo.svg" alt="Lexora" width={100} height={32} priority />
        </Link>
      </div>
    </header>
  );
}
