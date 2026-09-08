import { Film } from "lucide-react";

import type { OnboardingStep } from "@/lib/onboarding/types";
import { OnboardingProgress } from "./progress";

export function OnboardingShell({
  step,
  children,
}: {
  step: OnboardingStep;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-svh bg-background px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex min-w-0 items-center justify-between gap-4">
          <div className="inline-flex min-w-0 items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-rating text-rating-foreground">
              <Film className="size-4" aria-hidden="true" />
            </span>
            <span className="truncate">WatchFlow</span>
          </div>
          <p className="text-sm text-muted-foreground">About 12 minutes</p>
        </header>

        <OnboardingProgress step={step} />
        <div className="mx-auto mt-6 w-full max-w-4xl sm:mt-8">{children}</div>
      </div>
    </main>
  );
}
