import { AlertTriangle } from "lucide-react";

import {
  ListsAuthorizationError,
  ListsMissingColumnError,
  ListsMissingRpcError,
  ListsMissingTableError,
  ListsNotFoundError,
  ListsPersistenceError,
  ListsSchemaCacheError,
  ListsValidationError,
} from "@/lib/lists/errors";

export function getSafeListLoadError(error: unknown) {
  return error instanceof ListsAuthorizationError ||
    error instanceof ListsMissingColumnError ||
    error instanceof ListsMissingRpcError ||
    error instanceof ListsMissingTableError ||
    error instanceof ListsNotFoundError ||
    error instanceof ListsPersistenceError ||
    error instanceof ListsSchemaCacheError ||
    error instanceof ListsValidationError
    ? error.message
    : "Your custom lists could not be loaded. Please try again.";
}

export function ListLoadError({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl border border-destructive/40 bg-card p-6 text-center shadow-sm"
      role="alert"
    >
      <AlertTriangle
        className="mx-auto size-8 text-destructive"
        aria-hidden="true"
      />
      <h2 className="mt-3 text-lg font-semibold">Custom lists unavailable</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
