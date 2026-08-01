"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  logoutAction,
  type LogoutActionState,
} from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: LogoutActionState = { message: null };

function LogoutSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button variant="outline" size="sm" type="submit" disabled={pending}>
      {pending ? "Signing out..." : "Sign out"}
    </Button>
  );
}

export function LogoutButton() {
  const [state, action] = useActionState(logoutAction, INITIAL_STATE);

  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <LogoutSubmitButton />
      {state.message ? (
        <p className="max-w-40 text-xs text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
