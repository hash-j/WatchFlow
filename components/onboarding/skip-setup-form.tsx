"use client";

import { useActionState } from "react";

import { skipOnboardingAction } from "@/app/onboarding/actions";
import { INITIAL_ONBOARDING_ACTION_STATE } from "@/lib/onboarding/types";
import { PendingButton } from "./pending-button";

export function SkipSetupForm() {
  const [state, action] = useActionState(
    skipOnboardingAction,
    INITIAL_ONBOARDING_ACTION_STATE,
  );

  return (
    <form action={action} className="min-w-0">
      <PendingButton
        type="submit"
        variant="ghost"
        idleLabel="Skip setup"
        pendingLabel="Skipping..."
        className="w-full sm:w-auto"
      />
      {state.status === "error" ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
