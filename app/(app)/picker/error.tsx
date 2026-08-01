"use client";

import { RouteError } from "@/components/route-error";

export default function PickerError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      title="The movie picker is unavailable"
      description="WatchFlow could not prepare a private pick. Retry or review your library."
      reset={reset}
      backHref="/library"
      backLabel="Open Library"
    />
  );
}
