"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SignInButton,
  SignUpButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";

const BARE_PAGES = ["/"];

export function Navbar() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useUser();

  const authControls = (
    <div className="flex items-center gap-3">
      {!isLoaded ? null : isSignedIn ? (
        <>
          {BARE_PAGES.includes(pathname) && (
            <Link
              href="/dashboard"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85"
            >
              Go to dashboard
            </Link>
          )}
          <UserButton />
        </>
      ) : (
        <>
          <SignInButton mode="modal">
            <button className="rounded-lg px-3.5 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground">
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85">
              Sign up
            </button>
          </SignUpButton>
        </>
      )}
    </div>
  );

  // Landing page — minimal bar
  if (BARE_PAGES.includes(pathname)) {
    return (
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center">
            <Image src="/logo.svg" alt="Lexora" width={104} height={33} priority />
          </Link>
          {authControls}
        </div>
      </header>
    );
  }

  // App pages — full navbar
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-8">
        <Link href="/dashboard" className="flex items-center">
          <Image src="/logo.svg" alt="Lexora" width={104} height={33} priority />
        </Link>
        {authControls}
      </div>
    </header>
  );
}
