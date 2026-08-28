import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { CheckCircle2 } from "lucide-react";

// Isolated auth smoke-test page. If Clerk is wired correctly you land here
// signed in after sign-up/sign-in; otherwise you're bounced to /sign-in.
export default async function WelcomePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "—";
  const name = user?.fullName ?? user?.firstName ?? "there";

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <h1 className="mt-4 text-xl font-semibold">You&apos;re signed in, {name} 🎉</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Clerk authentication is working end to end.
        </p>

        <dl className="mt-6 space-y-2 rounded-lg bg-muted/50 p-4 text-left text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium">{email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Clerk user ID</dt>
            <dd className="font-mono text-xs break-all">{userId}</dd>
          </div>
        </dl>

        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Continue to dashboard
        </Link>
      </div>
    </main>
  );
}
