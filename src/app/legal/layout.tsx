import type { Metadata } from "next";

/* Scopes a title template to /legal/* and keeps the four documents grouped. */
export const metadata: Metadata = {
  title: { default: "Legal", template: "%s · Lexora" },
};

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
