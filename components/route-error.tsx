"use client";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";

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
      <div className="w-full rounded-xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Link
            href={backHref}
            className={buttonVariants({ variant: "outline" })}
          >
            {backLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
