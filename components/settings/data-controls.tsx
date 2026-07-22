"use client";

import { useActionState } from "react";
import { AlertTriangle, Download, Trash2, UserX } from "lucide-react";

import {
  deleteAccountAction,
  deleteLibraryDataAction,
} from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INITIAL_SETTINGS_ACTION_STATE } from "@/lib/settings/types";
import { FieldError, FormMessage } from "./form-message";

export function ExportControls() {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-semibold">Export your data</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Exports are generated on demand and are not stored by WatchFlow.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">Movie library CSV</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Spreadsheet-ready movie metadata and your personal library fields.
          </p>
          <Button asChild variant="outline" className="mt-4 min-h-10 w-full">
            <a href="/settings/data/export/csv">
              <Download className="size-4" aria-hidden="true" />
              Export movie library as CSV
            </a>
          </Button>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="font-semibold">Complete account JSON</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Profile, preferences, library, queue, and schedule data in JSON.
          </p>
          <Button asChild variant="outline" className="mt-4 min-h-10 w-full">
            <a href="/settings/data/export/json">
              <Download className="size-4" aria-hidden="true" />
              Export complete account data
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function DeleteLibraryControl({ count }: { count: number }) {
  const [state, action, isPending] = useActionState(
    deleteLibraryDataAction,
    INITIAL_SETTINGS_ACTION_STATE,
  );

  return (
    <form action={action} className="rounded-xl border border-destructive/40 p-5 sm:p-6">
      <div className="flex gap-3">
        <AlertTriangle
          className="mt-0.5 size-5 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div>
          <h3 className="font-semibold">Delete all movies from my library</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This will remove {count} {count === 1 ? "record" : "records"}. This
            removes your statuses, ratings, reviews, queue positions, and
            schedules. Your account will remain active.
          </p>
        </div>
      </div>

      <div className="mt-5 max-w-md space-y-2">
        <Label htmlFor="delete-library-confirmation">
          Type <strong>DELETE MOVIES</strong> to confirm
        </Label>
        <Input
          id="delete-library-confirmation"
          name="confirmation"
          autoComplete="off"
          disabled={count === 0 || isPending}
          aria-invalid={Boolean(state.fieldErrors.confirmation)}
        />
        <FieldError
          errors={state.fieldErrors.confirmation}
          id="delete-library-confirmation-error"
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="submit"
          variant="destructive"
          disabled={count === 0 || isPending}
          className="min-h-10"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {isPending ? "Deleting library..." : "Permanently delete library data"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DeleteAccountControl() {
  const [state, action, isPending] = useActionState(
    deleteAccountAction,
    INITIAL_SETTINGS_ACTION_STATE,
  );

  return (
    <form action={action} className="rounded-xl border border-destructive p-5 sm:p-6">
      <div className="flex gap-3">
        <AlertTriangle
          className="mt-0.5 size-5 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div>
          <h3 className="font-semibold">Delete my WatchFlow account</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This permanently removes your profile, preferences, personal movie
            library, ratings, reviews, queue, schedules, import-related user
            data, and authentication account. Shared movie metadata remains.
          </p>
          <p className="mt-2 text-sm font-medium">
            You must have signed in within the last 30 minutes.
          </p>
        </div>
      </div>

      <div className="mt-5 max-w-md space-y-2">
        <Label htmlFor="delete-account-confirmation">
          Type <strong>DELETE</strong> to confirm
        </Label>
        <Input
          id="delete-account-confirmation"
          name="confirmation"
          autoComplete="off"
          disabled={isPending}
          aria-invalid={Boolean(state.fieldErrors.confirmation)}
        />
        <FieldError
          errors={state.fieldErrors.confirmation}
          id="delete-account-confirmation-error"
        />
      </div>

      <label className="mt-4 flex min-h-12 max-w-xl cursor-pointer items-start gap-3 rounded-lg border p-3 focus-within:ring-2 focus-within:ring-ring">
        <input
          type="checkbox"
          name="confirmed"
          disabled={isPending}
          className="mt-0.5 size-4 rounded border-input accent-destructive"
        />
        <span className="text-sm font-medium">
          I understand this action is permanent and cannot be undone.
        </span>
      </label>
      <FieldError errors={state.fieldErrors.confirmed} id="delete-account-checkbox-error" />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="submit"
          variant="destructive"
          disabled={isPending}
          className="min-h-10"
        >
          <UserX className="size-4" aria-hidden="true" />
          {isPending ? "Deleting account..." : "Permanently delete my account"}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
