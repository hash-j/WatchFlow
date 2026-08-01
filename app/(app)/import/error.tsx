"use client";

import { RouteError } from "@/components/route-error";

export default function ImportError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      title="The importer could not be loaded"
      description="No uploaded file was stored. Retry, or return to your library."
      reset={reset}
      backHref="/library"
      backLabel="Return to Library"
    />
  );
}
