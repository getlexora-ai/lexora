"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { POLICY_VERSION } from "@/lib/legal/policies";

const GUARD_KEY = `lexora-consent-${POLICY_VERSION}`;

/**
 * Fires once per browser per policy version: once the user is signed in, ask the
 * server to record their acceptance of the legal documents in force. The server
 * route is idempotent, and the localStorage guard keeps this to a single call
 * in the common case. Renders nothing.
 */
export function RecordConsent() {
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    try {
      if (localStorage.getItem(GUARD_KEY) === "1") return;
    } catch {
      /* private mode: fall through, worst case is one extra idempotent POST */
    }

    const controller = new AbortController();
    fetch("/api/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: "signup" }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) return;
        try {
          localStorage.setItem(GUARD_KEY, "1");
        } catch {
          /* ignore: it will simply try again on the next navigation */
        }
      })
      .catch(() => {
        /* transient network error: retried on the next navigation */
      });

    return () => controller.abort();
  }, [isLoaded, isSignedIn]);

  return null;
}
