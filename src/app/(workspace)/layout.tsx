import { Navbar } from "@/components/navbar";
import { MobileBrandBar, Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { RecordConsent } from "@/components/legal/record-consent";

/**
 * The workspace frame: a 252px sidebar above 940px, the compact brand row
 * below it, and the 52px top bar inside the main column. The theme switch
 * floats bottom-right here rather than sitting in the bar, as the workspace
 * artifact shows it.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBrandBar />
        <Navbar variant="app" />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <ThemeToggle floating />
      <RecordConsent />
    </div>
  );
}
