import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { TooltipProvider } from "@/components/ui/tooltip";

const openSans = Open_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Lexora",
  description: "AI Legal Contract Manager",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${openSans.variable} h-full antialiased`}
    >
      <head>
        {/* Quill snow theme — loaded from CDN to avoid bundler processing issues */}
        <link
          rel="stylesheet"
          href="https://cdn.quilljs.com/2.0.3/quill.snow.css"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>
          <Navbar />
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
