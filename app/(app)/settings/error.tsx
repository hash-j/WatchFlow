"use client";

import { RouteError } from "@/components/route-error";

export default function SettingsError({ reset }: { reset: () => void }) {
  return (
    <RouteError
      title="Settings could not be loaded"
      description="WatchFlow could not load your private settings. Please retry."
      reset={reset}
    />
  );
}
