"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl items-center justify-center">
      <div className="w-full rounded-xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold">Unable to load this page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          WatchFlow could not load your account data. Please try again.
        </p>
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
