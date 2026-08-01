"use client";

import { RouteError } from "@/components/route-error";

export default function StatisticsError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      title="Statistics are unavailable"
      description="WatchFlow could not calculate your private viewing statistics. Retry the request or return to the dashboard."
      reset={reset}
    />
  );
}
