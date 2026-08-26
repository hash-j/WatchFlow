"use client";

import { Check, Eye, Plus } from "lucide-react";
import { useActionState } from "react";

import { addOnboardingMovieAction } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { INITIAL_ONBOARDING_ACTION_STATE } from "@/lib/onboarding/types";

export function OnboardingMovieAddForm({
  tmdbId,
  title,
  existingStatus,
}: {
  tmdbId: number;
  title: string;
  existingStatus: string | null;
}) {
  const [state, action, isPending] = useActionState(
    addOnboardingMovieAction,
    INITIAL_ONBOARDING_ACTION_STATE,
  );
  const added = existingStatus !== null || state.status === "success";

  return (
    <form action={action} className="mt-auto space-y-2 pt-4">
      <input type="hidden" name="tmdbId" value={tmdbId} />
      {added ? (
        <div className="flex min-h-11 items-center justify-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium" role="status">
          <Check aria-hidden="true" />
          In your Library
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="submit"
            name="status"
            value="want_to_watch"
            size="sm"
            disabled={isPending}
            aria-label={`Add ${title} as Want to Watch`}
          >
            <Plus aria-hidden="true" />
            Want to Watch
          </Button>
          <Button
            type="submit"
            name="status"
            value="watched"
            size="sm"
            variant="outline"
            disabled={isPending}
            aria-label={`Add ${title} as Watched`}
          >
            <Eye aria-hidden="true" />
            Watched
          </Button>
        </div>
      )}
      <div className="min-h-5" aria-live="polite">
        {isPending ? (
          <p className="text-xs text-muted-foreground">Adding {title}...</p>
        ) : state.message ? (
          <p
            className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : existingStatus ? (
          <p className="text-xs text-muted-foreground">
            Saved as {existingStatus === "watched" ? "Watched" : "Want to Watch"}.
          </p>
        ) : null}
      </div>
    </form>
  );
}
