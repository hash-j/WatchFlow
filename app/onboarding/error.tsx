"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function OnboardingError({ reset }: { reset: () => void }) {
  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 p-4">
      <section className="w-full max-w-lg rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold">Setup is temporarily unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your saved preferences and movies are safe. Try loading this step again, or continue to your Dashboard.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button type="button" onClick={reset}>Try again</Button>
          <Button asChild variant="outline"><Link href="/dashboard">Open Dashboard</Link></Button>
        </div>
      </section>
    </main>
  );
}
