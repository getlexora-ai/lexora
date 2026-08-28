import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import type { Metadata } from "next";
import { Inter, Fragment_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { TooltipProvider } from "@/components/ui/tooltip";

/* Three-face system:
   — Inter        workhorse. All UI, all body, all data-dense surfaces.
   — Fragment Mono  metadata register: clause types, statuses, counts, eyebrows.
   — Instrument Serif  editorial register: hero and section openers only.     */
const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = Fragment_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

const serif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lexora — Contract intelligence",
  description:
    "Read every clause, flag every risk, and rewrite what needs rewriting — before you sign.",
};

const clerkAppearance = {
  theme: shadcn,
  variables: {
    colorPrimary: "oklch(0.23 0.01 68)",
    colorBackground: "oklch(0.992 0.004 85)",
    colorText: "oklch(0.19 0.008 75)",
    colorTextSecondary: "oklch(0.46 0.012 70)",
    colorInputBackground: "oklch(0.992 0.004 85)",
    colorDanger: "oklch(0.475 0.185 25)",
    colorSuccess: "oklch(0.455 0.09 155)",
    colorWarning: "oklch(0.475 0.115 62)",
    borderRadius: "0.7rem",
    fontFamily: "var(--font-sans)",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${serif.variable} h-full antialiased`}
    >
      <head>
        {/* Quill snow theme — loaded from CDN to avoid bundler processing issues */}
        <link
          rel="stylesheet"
          href="https://cdn.quilljs.com/2.0.3/quill.snow.css"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ClerkProvider appearance={clerkAppearance}>
          <TooltipProvider>
            <Navbar />
            {children}
          </TooltipProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
