"use client";

import { RouteError } from "@/components/route-error";

export default function ListsError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      title="Custom lists are unavailable"
      description="WatchFlow could not load your private lists. Please retry."
      reset={reset}
      backHref="/library"
      backLabel="Return to Library"
    />
  );
}
