"use client";

import { useActionState } from "react";

import { setQueueMoviePriorityAction } from "@/app/(app)/actions/management";
import { initialLibraryActionState } from "@/lib/library/action-state";
import {
  WATCH_NEXT_PRIORITY_LABELS,
  type WatchNextPriority,
} from "@/lib/library/watch-next-priority";

import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Select } from "../ui/select";

export function QueuePriorityControl({
  libraryId,
  priority,
  title,
}: {
  libraryId: string;
  priority: WatchNextPriority;
  title: string;
}) {
  const [state, action, isPending] = useActionState(
    setQueueMoviePriorityAction,
    initialLibraryActionState,
  );
  const labelId = `watch-next-priority-${libraryId}`;

  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <input type="hidden" name="libraryId" value={libraryId} />
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={labelId} className="text-xs">
          Priority for {title}
        </Label>
        <Select
          id={labelId}
          name="priority"
          defaultValue={String(priority)}
          disabled={isPending}
          aria-describedby={state.message ? `${labelId}-feedback` : undefined}
        >
          {WATCH_NEXT_PRIORITY_LABELS.map((label, value) => (
            <option key={value} value={value}>
              {value} — {label}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? "Saving..." : "Save priority"}
      </Button>
      {state.message ? (
        <p
          id={`${labelId}-feedback`}
          className={`sm:col-span-2 text-xs ${
            state.status === "error" ? "text-destructive" : "text-muted-foreground"
          }`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
