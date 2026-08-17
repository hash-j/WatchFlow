"use client";

import Link from "next/link";
import { useActionState } from "react";

import { PasswordField } from "@/components/auth/password-field";
import { AuthSubmitButton } from "@/components/auth/submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction } from "@/lib/auth/actions";
import { INITIAL_SIGN_UP_STATE } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

export function SignUpForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [state, action] = useActionState(signUpAction, INITIAL_SIGN_UP_STATE);

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="space-y-2 pb-5">
          <p className="text-sm font-medium text-muted-foreground">Start your private library</p>
          <CardTitle as="h1" className="text-2xl sm:text-3xl">Create your account</CardTitle>
          <CardDescription>Use a password to sign in. We’ll verify your email with a 6-digit code.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} noValidate className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="full-name">Full name</Label>
              <Input id="full-name" name="fullName" autoComplete="name" required maxLength={100} defaultValue={state.values.fullName} aria-invalid={Boolean(state.fields.fullName)} aria-describedby={state.fields.fullName ? "full-name-error" : undefined} />
              {state.fields.fullName && <p id="full-name-error" className="text-sm text-destructive">{state.fields.fullName}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required maxLength={254} placeholder="you@example.com" defaultValue={state.values.email} aria-invalid={Boolean(state.fields.email)} aria-describedby={state.fields.email ? "email-error" : undefined} />
              {state.fields.email && <p id="email-error" className="text-sm text-destructive">{state.fields.email}</p>}
            </div>
            <PasswordField id="password" name="password" label="Password" autoComplete="new-password" required minLength={8} maxLength={72} error={state.fields.password} />
            <p className="-mt-3 text-xs leading-5 text-muted-foreground">Use 8–72 characters. A longer, unique password is safest.</p>
            <PasswordField id="confirm-password" name="confirmPassword" label="Confirm password" autoComplete="new-password" required minLength={8} maxLength={72} error={state.fields.confirmPassword} />

            <div className="min-h-5" aria-live="polite">
              {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
            </div>
            <AuthSubmitButton idleLabel="Create account" pendingLabel="Creating account…" className="w-full" />
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/login" className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Log in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
