"use client";

import { useActionState } from "react";

import { completeOnboardingAction } from "@/app/onboarding/actions";
import { INITIAL_ONBOARDING_ACTION_STATE } from "@/lib/onboarding/types";
import { PendingButton } from "./pending-button";

export function FinishSetupForm() {
  const [state, action] = useActionState(
    completeOnboardingAction,
    INITIAL_ONBOARDING_ACTION_STATE,
  );

  return (
    <form action={action} className="min-w-0">
      <PendingButton
        type="submit"
        idleLabel="Finish setup"
        pendingLabel="Finishing..."
        className="w-full min-[420px]:w-auto"
      />
      {state.status === "error" ? (
        <p className="mt-2 max-w-md text-sm text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
