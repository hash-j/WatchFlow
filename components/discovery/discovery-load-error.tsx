import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  DiscoveryAuthorizationError,
  DiscoveryPersistenceError,
  DiscoveryRelationshipError,
  DiscoverySchemaError,
} from "@/lib/discovery/errors";

export function getSafeDiscoveryLoadError(error: unknown) {
  if (error instanceof DiscoverySchemaError) {
    return "Discovery is unavailable because required library fields are missing.";
  }

  if (error instanceof DiscoveryRelationshipError) {
    return "Movie metadata could not be linked to your library. Please try again.";
  }

  if (error instanceof DiscoveryAuthorizationError) {
    return "Your private library could not be accessed. Please sign in again.";
  }

  if (error instanceof DiscoveryPersistenceError) {
    return "Your movie library could not be loaded. Please try again.";
  }

  return "WatchFlow could not load this private discovery page. Please try again.";
}

export function DiscoveryLoadError({
  message,
  retryHref,
}: {
  message: string;
  retryHref: string;
}) {
  return (
    <div
      className="rounded-xl border border-destructive/40 bg-destructive/10 p-6"
      role="alert"
    >
      <AlertCircle className="size-6 text-destructive" aria-hidden="true" />
      <h2 className="mt-3 text-lg font-semibold">Discovery is unavailable</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={retryHref} className={buttonVariants()}>
          Try again
        </Link>
        <Link
          href="/library"
          className={buttonVariants({ variant: "outline" })}
        >
          Open Library
        </Link>
      </div>
    </div>
  );
}
