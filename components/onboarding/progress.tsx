import { Check } from "lucide-react";

import type { OnboardingStep } from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";

const steps = ["Welcome", "Personalize", "First movies"] as const;

export function OnboardingProgress({ step }: { step: OnboardingStep }) {
  return (
    <nav aria-label="Onboarding progress" className="mt-6 sm:mt-8">
      <p className="sr-only" aria-live="polite">
        Step {step} of 3: {steps[step - 1]}
      </p>
      <ol className="grid grid-cols-3 gap-2">
        {steps.map((label, index) => {
          const number = index + 1;
          const current = number === step;
          const complete = number < step;

          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className="min-w-0"
            >
              <div
                className={cn(
                  "h-1.5 rounded-full bg-border",
                  (current || complete) && "bg-foreground",
                )}
              />
              <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs sm:text-sm">
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold",
                    (current || complete) &&
                      "border-foreground bg-foreground text-background",
                  )}
                  aria-hidden="true"
                >
                  {complete ? <Check className="size-3" /> : number}
                </span>
                <span className={cn("truncate", current && "font-semibold")}>
                  <span className="sm:hidden">{number} of 3</span>
                  <span className="hidden sm:inline">{label}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
