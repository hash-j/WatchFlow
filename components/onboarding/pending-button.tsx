"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui/button";

export function PendingButton({
  idleLabel,
  pendingLabel,
  ...props
}: Omit<ButtonProps, "children" | "disabled"> & {
  idleLabel: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} disabled={pending} aria-disabled={pending}>
      {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}
