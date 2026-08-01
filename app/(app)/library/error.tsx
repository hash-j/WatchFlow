"use client";

import { RouteError } from "@/components/route-error";

export default function LibraryError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      title="Your library could not be loaded"
      description="Your private movie data is still safe. Retry the request or return to the dashboard."
      reset={reset}
    />
  );
}
