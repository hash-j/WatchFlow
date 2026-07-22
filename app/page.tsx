import Link from "next/link";
import { ArrowRight, CalendarDays, Library, Search } from "lucide-react";
import { Suspense } from "react";

import { AuthButton } from "@/components/auth-button";
import { AccountDeletedNotice } from "@/components/account-deleted-notice";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";

const features = [
  {
    title: "Keep one library",
    description: "Organize the movies you care about in a private workspace.",
    icon: Library,
  },
  {
    title: "Find what is next",
    description: "Turn an overflowing watchlist into a focused next-up queue.",
    icon: Search,
  },
  {
    title: "Make time to watch",
    description: "Plan movie nights and keep your viewing schedule visible.",
    icon: CalendarDays,
  },
] as const;

export default function Home() {
  return (
    <main className="min-h-svh bg-muted/30">
      <nav className="border-b bg-background/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="font-semibold tracking-tight">
            WatchFlow
          </Link>
          <div className="flex items-center gap-3">
            <Suspense
              fallback={<div className="h-8 w-36 animate-pulse rounded bg-muted" />}
            >
              <AuthButton />
            </Suspense>
            <ThemeSwitcher />
          </div>
        </div>
      </nav>

      <Suspense fallback={null}>
        <AccountDeletedNotice />
      </Suspense>

      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Your movies, in flow
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Spend less time choosing. Watch more great movies.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            WatchFlow gives you one calm place to build your library, decide
            what to watch next, and plan the perfect movie night.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/auth/sign-up">
              Create your workspace
              <ArrowRight className="ml-2 size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-4">
          {features.map(({ title, description, icon: Icon }) => (
            <div key={title} className="rounded-xl border bg-card p-5 shadow-sm">
              <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
              <h2 className="mt-3 font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
