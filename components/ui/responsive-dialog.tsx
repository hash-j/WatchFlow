"use client";

import * as React from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const ResponsiveDialog = React.forwardRef<
  HTMLDialogElement,
  React.DialogHTMLAttributes<HTMLDialogElement>
>(({ className, onClick, ...props }, ref) => (
  <dialog
    ref={ref}
    className={cn(
      "max-h-[calc(100svh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface-elevated p-0 text-card-foreground shadow-2xl backdrop:bg-black/65 backdrop:backdrop-blur-sm sm:max-h-[calc(100svh-2rem)] sm:w-[calc(100vw-2rem)]",
      className,
    )}
    onClick={(event) => {
      onClick?.(event);
      if (!event.defaultPrevented && event.target === event.currentTarget) {
        event.currentTarget.close();
      }
    }}
    {...props}
  />
));
ResponsiveDialog.displayName = "ResponsiveDialog";

export function DialogCloseButton({
  onClick,
  label = "Close dialog",
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      aria-label={label}
      title={label}
      className={cn("absolute right-2 top-2 z-10", className)}
      onClick={onClick}
    >
      <X aria-hidden="true" />
    </Button>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative border-b border-border bg-surface-elevated px-5 py-5 pr-14 sm:px-6 sm:py-6 sm:pr-16",
        className,
      )}
      {...props}
    />
  );
}

export function DialogBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 p-5 sm:p-6", className)} {...props} />;
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border bg-surface-elevated/95 p-4 backdrop-blur [&>*]:w-full sm:flex-row sm:justify-end sm:px-6 sm:[&>*]:w-auto",
        className,
      )}
      {...props}
    />
  );
}
