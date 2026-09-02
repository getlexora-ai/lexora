"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { X } from "lucide-react";

const KEY = "lexora-cookie-consent";
const VERSION = 1;

/**
 * Flip to true once a non-essential cookie (analytics, marketing, and so on) is
 * introduced. It switches the banner from a plain notice to an accept / decline
 * choice, and makes hasCookieConsent("analytics") meaningful.
 */
const OPTIONAL_COOKIES = false;

type Choice = "acknowledged" | "all" | "necessary";
type Stored = { v: number; choice: Choice; ts: string };

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (parsed && parsed.v === VERSION && typeof parsed.choice === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function write(choice: Choice) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: VERSION, choice, ts: new Date().toISOString() }),
    );
  } catch {
    /* private mode: the banner reappears next visit, which is acceptable */
  }
}

/**
 * Gate for any future non-essential script. "necessary" is always allowed;
 * "analytics" (or any optional category) needs a stored "all" choice, and only
 * once OPTIONAL_COOKIES is turned on.
 */
export function hasCookieConsent(
  category: "necessary" | "analytics" = "necessary",
): boolean {
  if (category === "necessary") return true;
  if (!OPTIONAL_COOKIES) return false;
  return read()?.choice === "all";
}

/* The "decided" flag lives in localStorage, which React does not own, so it is
   read through useSyncExternalStore (the same pattern as the theme toggle). The
   server and first client paint report "decided" so nothing flashes; the store
   corrects it after hydration. */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function hasDecided(): boolean {
  return read() !== null;
}

function hasDecidedOnServer(): boolean {
  return true;
}

export function CookieConsent() {
  const decided = useSyncExternalStore(
    subscribe,
    hasDecided,
    hasDecidedOnServer,
  );

  if (decided) return null;

  function choose(choice: Choice) {
    write(choice);
    for (const l of listeners) l();
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-[560px] rounded-xl border border-border bg-surface p-4 shadow-e3 sm:inset-x-auto sm:right-4 sm:bottom-4"
    >
      <div className="flex items-start gap-3">
        <p className="flex-1 text-[13px] leading-[1.6] text-text-2">
          <span className="font-semibold text-foreground">Cookies.</span> Lexora
          uses only cookies that are necessary for the site to work: sign-in,
          security, and your theme choice. We do not use tracking or advertising
          cookies. See the{" "}
          <Link
            href="/legal/privacy#cookies"
            className="text-brand hover:underline"
          >
            privacy policy
          </Link>
          .
        </p>
        {!OPTIONAL_COOKIES && (
          <button
            type="button"
            onClick={() => choose("acknowledged")}
            aria-label="Dismiss"
            className="-mt-1 -mr-1 shrink-0 rounded-md p-1 text-text-3 transition-colors hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {OPTIONAL_COOKIES ? (
          <>
            <button
              type="button"
              onClick={() => choose("all")}
              className="btn-graphite inline-flex h-9 items-center rounded-md border border-transparent px-3.5 text-[13px] font-medium transition-all active:translate-y-px"
            >
              Accept all
            </button>
            <button
              type="button"
              onClick={() => choose("necessary")}
              className="inline-flex h-9 items-center rounded-md border border-border-strong bg-surface px-3.5 text-[13px] font-medium shadow-e1 transition-all hover:bg-surface-2 active:translate-y-px"
            >
              Only necessary
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => choose("acknowledged")}
            className="btn-graphite inline-flex h-9 items-center rounded-md border border-transparent px-3.5 text-[13px] font-medium transition-all active:translate-y-px"
          >
            Got it
          </button>
        )}
      </div>
    </div>
  );
}
