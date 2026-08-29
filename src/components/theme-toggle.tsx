"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

const KEY = "lexora-theme";

function currentTheme(): Theme {
  const set = document.documentElement.getAttribute("data-theme");
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
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
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  function toggle() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode — the toggle still works for this page view */
    }
    setTheme(next);
  }

  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch colour theme"
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-2.5",
        "font-mono text-[10px] uppercase tracking-[0.12em] text-text-3 shadow-e1",
        "transition-colors hover:text-foreground",
        floating && "fixed right-3.5 bottom-3.5 z-40",
        className
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span className="hidden sm:inline">Theme</span>
    </button>
  );
}
