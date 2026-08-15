"use client";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { ResponsiveActions } from "@/components/ui/responsive-layout";

export function RouteError({
  title,
  description,
  reset,
  backHref = "/dashboard",
  backLabel = "Return to Dashboard",
}: {
  title: string;
  description: string;
  reset: () => void;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div
      className="mx-auto flex min-h-[45vh] max-w-xl items-center justify-center"
      role="alert"
      aria-live="assertive"
    >
      <div className="min-w-0 w-full rounded-xl border bg-card p-4 text-center shadow-sm sm:p-8">
        <h1 className="break-words text-xl font-semibold sm:text-2xl">{title}</h1>
        <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">{description}</p>
        <ResponsiveActions className="mx-auto mt-6 max-w-md justify-center">
          <Button onClick={reset}>Try again</Button>
          <Link
            href={backHref}
            className={buttonVariants({ variant: "outline" })}
          >
            {backLabel}
          </Link>
        </ResponsiveActions>
      </div>
    </div>
  );
}
