import Link from "next/link";
import { CalendarDays, Library, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getAuthContext } from "@/lib/supabase/auth";

const quickActions = [
  {
    href: "/search",
    title: "Find a movie",
    description: "Search will connect to TMDB in Phase 2.",
    icon: Search,
  },
  {
    href: "/library",
    title: "Open your library",
    description: "Your saved movies will live here.",
    icon: Library,
  },
  {
    href: "/schedule",
    title: "Plan a watch",
    description: "Scheduling tools are ready for a later phase.",
    icon: CalendarDays,
  },
] as const;

export default async function DashboardPage() {
  const { user, profile, profileLoadFailed, profileName } =
    await getAuthContext();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Dashboard</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          Welcome{profileName ? `, ${profileName}` : " to WatchFlow"}
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Your private workspace for organizing what you want to watch.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {quickActions.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-foreground/20"
          >
            <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-4 font-semibold group-hover:underline">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </Link>
        ))}
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-lg font-semibold">Account</h2>
            <p className="text-sm text-muted-foreground">
              Authentication and profile data are loaded securely on the server.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings">Settings</Link>
          </Button>
        </div>

        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-muted/60 p-4">
            <dt className="text-muted-foreground">Signed-in email</dt>
            <dd className="mt-1 break-all font-medium">
              {user.email ?? "Email unavailable"}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/60 p-4">
            <dt className="text-muted-foreground">Profile record</dt>
            <dd className="mt-1 font-medium">
              {profileLoadFailed
                ? "Temporarily unavailable"
                : profile
                  ? "Connected"
                  : "Not created yet"}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
