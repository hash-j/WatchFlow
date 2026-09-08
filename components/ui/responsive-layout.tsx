import * as React from "react";
import { Clapperboard } from "lucide-react";

import { cn } from "@/lib/utils";

export function PageContainer({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mx-auto w-full min-w-0 max-w-7xl", className)}
      {...props}
    />
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-7 flex min-w-0 flex-col gap-4 sm:mb-9 sm:gap-6 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary/80">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 max-w-4xl text-balance break-words text-3xl font-semibold tracking-[-0.025em] sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-3xl break-words text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <ResponsiveActions className="md:w-auto md:justify-end">
          {actions}
        </ResponsiveActions>
      ) : null}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
  className,
  titleId,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  titleId?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h2
          id={titleId}
          className="text-balance break-words text-xl font-semibold tracking-tight sm:text-2xl"
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-3xl break-words text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <ResponsiveActions>{actions}</ResponsiveActions> : null}
    </div>
  );
}

export function ResponsiveActions({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col gap-2 [&>*]:w-full min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:[&>*]:w-auto",
        className,
      )}
      {...props}
    />
  );
}

export function ResponsiveGrid({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5 xl:grid-cols-3",
        className,
      )}
      {...props}
    />
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 space-y-6", className)}>
      <div>
        <h2 className="break-words text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-2xl border border-border bg-surface px-4 py-8 text-center shadow-[0_1px_2px_hsl(var(--foreground)/0.03)] sm:px-8 sm:py-10",
        className,
      )}
    >
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-rating text-rating-foreground shadow-sm">
        {icon ?? <Clapperboard className="size-6" aria-hidden="true" />}
      </div>
      <h2 className="mt-4 break-words text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-lg break-words text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {actions ? (
        <ResponsiveActions className="mx-auto mt-5 max-w-md justify-center">
          {actions}
        </ResponsiveActions>
      ) : null}
    </section>
  );
}

export function MobileToolbar({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "sticky bottom-3 z-20 min-w-0 rounded-2xl border border-border/70 bg-card/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:static sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none",
        className,
      )}
      {...props}
    />
  );
}

export function DataScrollRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-xs text-muted-foreground sm:hidden">
        Swipe horizontally inside the data table to see more columns.
      </p>
      <div
        data-horizontal-scroll="approved"
        role="region"
        aria-label={label}
        tabIndex={0}
        className={cn(
          "max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-border/70 bg-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
