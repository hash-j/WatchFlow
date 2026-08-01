"use client";

import { RouteError } from "@/components/route-error";

export default function Error({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <RouteError
      title="Unable to load this page"
      description="WatchFlow could not load your account data. Please try again."
      reset={reset}
    />
  );
}
