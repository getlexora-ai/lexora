"use client";

import { useState } from "react";
import { Loader2, Send, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const FIELD =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

type Status = "idle" | "sending" | "sent" | "error";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    name.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    message.trim().length >= 10 &&
    status !== "sending";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, website }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!res.ok) {
        throw new Error(
          data.message ?? "Something went wrong. Please try again.",
        );
      }
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (status === "sent") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4.5 shadow-e1">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
        <div>
          <p className="text-[15px] font-bold tracking-[-0.02em] text-foreground">
            Message sent
          </p>
          <p className="mt-1 text-[13px] leading-[1.55] text-text-2">
            Thanks — we&apos;ve got it and will reply to {email} within two
            business days.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cf-name" className="text-sm font-medium text-foreground">
          Name
        </label>
        <input
          id="cf-name"
          className={FIELD}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          autoComplete="name"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="cf-email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <input
          id="cf-email"
          type="email"
          className={FIELD}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={200}
          autoComplete="email"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="cf-message"
          className="text-sm font-medium text-foreground"
        >
          Message
        </label>
        <textarea
          id="cf-message"
          className={`${FIELD} resize-y`}
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={5000}
          required
        />
      </div>

      {/* Honeypot: visually hidden, off the tab order. Bots fill it; people don't. */}
      <div aria-hidden className="hidden">
        <label htmlFor="cf-website">Leave this field empty</label>
        <input
          id="cf-website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {status === "error" && error && (
        <p className="text-[13px] text-risk-high" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!canSubmit}>
          {status === "sending" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Sending…
            </>
          ) : (
            <>
              <Send className="size-4" /> Send message
            </>
          )}
        </Button>
        <span className="text-[12px] leading-[1.5] text-text-3">
          By sending this you agree to our{" "}
          <a href="/legal/privacy" className="text-brand hover:underline">
            privacy policy
          </a>
          .
        </span>
      </div>
    </form>
  );
}
