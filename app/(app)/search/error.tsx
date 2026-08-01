"use client";

import { RouteError } from "@/components/route-error";

export default function SearchError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      title="Movie search is unavailable"
      description="The search service could not complete this request. Please retry in a moment."
      reset={reset}
    />
  );
}
