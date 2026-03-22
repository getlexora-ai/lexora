"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Compare", href: "/compare" },
  { label: "Version History", href: "/history" },
  { label: "Approval", href: "/approval" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-8">
        {/* Left — logo + nav */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center">
            <Image src="/logo.svg" alt="Lexora" width={120} height={40} priority />
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-foreground",
                  pathname === link.href
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Right — actions */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger>
              <Button variant="ghost" size="icon">
                <History className="h-[18px] w-[18px]" />
                <span className="sr-only">History</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>History</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <Button variant="ghost" size="icon">
                <Share2 className="h-[18px] w-[18px]" />
                <span className="sr-only">Share</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Share</TooltipContent>
          </Tooltip>

          {/* Placeholder — to be defined */}
          <Button variant="outline" className="ml-2">
            {/* blank for now */}
          </Button>
        </div>
      </div>
    </header>
  );
}
