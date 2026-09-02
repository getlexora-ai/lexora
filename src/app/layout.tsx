import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import type { Metadata } from "next";
import { Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CookieConsent } from "@/components/cookie-consent";

/* Two-face system:
   — Figtree         workhorse. All UI, all body, all data-dense surfaces.
   — JetBrains Mono  metadata register: clause refs, keys, counts, eyebrows. */
const sans = Figtree({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lexora · Contract review",
  description:
    "Lexora flags the clauses worth a closer look and drafts suggested wording for your own review, before you sign.",
};

/* The Clerk widget inherits the palette through @clerk/ui/themes/shadcn.css,
   which reads the same tokens as the rest of the app, so it re-themes with the
   toggle. Only the shape, type face and primary need pointing at our values. */
const clerkAppearance = {
  theme: shadcn,
  variables: {
    colorPrimary: "var(--btn-primary-solid)",
    colorBackground: "var(--surface)",
    colorText: "var(--text)",
    colorTextSecondary: "var(--text-2)",
    colorInputBackground: "var(--surface-2)",
    colorInputText: "var(--text)",
    colorNeutral: "var(--text)",
    colorDanger: "var(--high)",
    colorSuccess: "var(--low)",
    colorWarning: "var(--med)",
    borderRadius: "7px",
    fontFamily: "var(--font-sans)",
  },
};

/* Applied before first paint so an explicit theme choice never flashes the
   other palette. No choice stored → nothing set → the OS preference wins. */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("lexora-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        {/* Quill snow theme — loaded from CDN to avoid bundler processing issues */}
        <link
          rel="stylesheet"
          href="https://cdn.quilljs.com/2.0.3/quill.snow.css"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ClerkProvider appearance={clerkAppearance}>
          <TooltipProvider>{children}</TooltipProvider>
          <CookieConsent />
        </ClerkProvider>
      </body>
    </html>
  );
}
