import { Film, ListVideo, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-svh bg-muted/30 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(440px,0.8fr)]">
      <section className="hidden min-h-svh overflow-hidden bg-foreground p-10 text-background lg:flex lg:flex-col lg:justify-between xl:p-14">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-3 rounded-md text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-background/10">
            <Film aria-hidden="true" className="size-5" />
          </span>
          WatchFlow
        </Link>

        <div className="max-w-xl space-y-8">
          <div className="space-y-4">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-background/70">
              <Sparkles aria-hidden="true" className="size-4" />
              Your movie life, organized
            </p>
            <h2 className="text-balance text-4xl font-semibold leading-tight xl:text-5xl">
              Spend less time choosing. Enjoy more great movies.
            </h2>
            <p className="max-w-lg text-base leading-7 text-background/70">
              Keep a private library, shape your Watch Next queue, and plan the
              perfect movie night in one calm place.
            </p>
          </div>

          <ul className="grid gap-4 text-sm text-background/80 sm:grid-cols-2">
            <li className="flex items-center gap-3">
              <ListVideo aria-hidden="true" className="size-5" />
              One private movie library
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck aria-hidden="true" className="size-5" />
              Protected account data
            </li>
          </ul>
        </div>

        <p className="text-xs text-background/50">Private by design. Built for movie lovers.</p>
      </section>

      <section className="flex min-h-svh min-w-0 flex-col px-4 py-6 sm:px-6 sm:py-8 lg:justify-center lg:px-10">
        <Link
          href="/"
          className="mb-8 inline-flex w-fit items-center gap-2 rounded-md font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <span className="grid size-9 place-items-center rounded-lg bg-foreground text-background">
            <Film aria-hidden="true" className="size-4" />
          </span>
          WatchFlow
        </Link>
        <div className="mx-auto my-auto w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
