"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { changePasswordAction } from "@/app/(app)/settings/password-actions";
import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { INITIAL_CHANGE_PASSWORD_STATE } from "@/lib/auth/change-password";
import { FormMessage } from "./form-message";

export function ChangePasswordForm({ passwordAccount }: { passwordAccount: boolean }) {
  const [state, action, pending] = useActionState(changePasswordAction, INITIAL_CHANGE_PASSWORD_STATE);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.status === "success") form.current?.reset(); }, [state]);
  return <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
    <h2 className="text-xl font-semibold">Change password</h2>
    {!passwordAccount ? <p className="mt-2 text-sm text-muted-foreground">This account uses an external sign-in provider. Manage your password with that provider. To set an email password, use <Link href="/auth/forgot-password" className="underline">password recovery</Link>.</p> :
      <form ref={form} action={action} className="mt-5 max-w-lg space-y-4">
        <PasswordField id="current-password" name="currentPassword" label="Current password" autoComplete="current-password" required maxLength={1024} disabled={pending}
          error={state.fieldErrors.currentPassword?.[0]} />
        <PasswordField id="new-password" name="newPassword" label="New password" autoComplete="new-password" required minLength={8} maxLength={72} disabled={pending}
          error={state.fieldErrors.newPassword?.[0]} />
        <p id="new-password-help" className="text-xs text-muted-foreground">Use 8–72 characters and a unique password.</p>
        <PasswordField id="confirm-new-password" name="confirmPassword" label="Confirm new password" autoComplete="new-password" required minLength={8} maxLength={72} disabled={pending}
          error={state.fieldErrors.confirmPassword?.[0]} />
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">{pending ? "Changing password…" : "Change password"}</Button>
        <p className="text-sm text-muted-foreground"><Link href="/auth/forgot-password" className="underline">Forgot your current password?</Link></p>
      </form>}
  </section>;
}
