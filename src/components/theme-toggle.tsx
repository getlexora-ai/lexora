"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

const KEY = "lexora-theme";
const MQ = "(prefers-color-scheme: dark)";

/* The theme lives in two places React does not own: the `data-theme` attribute
   on <html> (written by the pre-paint bootstrap in layout.tsx and by this
   toggle) and the OS preference. That makes it external state, so it is read
   through useSyncExternalStore rather than mirrored into an effect — the
   toggle then also tracks an OS-level switch while the tab is open. */

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const mq = window.matchMedia(MQ);
  mq.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    mq.removeEventListener("change", onChange);
  };
}

function getSnapshot(): Theme {
  const set = document.documentElement.getAttribute("data-theme");
  if (set === "light" || set === "dark") return set;
  return window.matchMedia(MQ).matches ? "dark" : "light";
}

/* Dark-first: with no explicit choice the bare :root palette is dark, so that
   is what the server renders. Hydration swaps in the real value. */
function getServerSnapshot(): Theme {
  return "dark";
}

/**
 * Theme switch. The choice is written to <html data-theme> and persisted;
 * with nothing stored the OS preference is what the tokens follow.
 * `floating` pins it bottom-right the way the app artifacts show it.
 */
export function ThemeToggle({
  floating = false,
  className,
}: {
  floating?: boolean;
  className?: string;
}) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next: Theme = getSnapshot() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode — the toggle still works for this page view */
    }
    emit();
  }

  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-surface px-2.5",
        "font-mono text-text-3 uppercase",
        "transition-colors hover:text-foreground",
        floating
          ? // App screens: a 30px puck pinned bottom-right, lifted off the
            // content with the full ambient pool so it survives over a table.
            "fixed right-3.5 bottom-3.5 z-40 h-[30px] text-[10.5px] tracking-[0.1em] shadow-e2"
          : "h-[34px] text-[10px] tracking-[0.12em] shadow-e1",
        className
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span className="hidden sm:inline">Theme</span>
    </button>
  );
}
