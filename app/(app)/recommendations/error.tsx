"use client";

import { RouteError } from "@/components/route-error";

export default function RecommendationsError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <RouteError
      title="Recommendations are unavailable"
      description="WatchFlow could not calculate private rule-based suggestions. Please retry."
      reset={reset}
      backHref="/library"
      backLabel="Open Library"
    />
  );
}
