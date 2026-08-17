"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getControlledAuthErrorMessage } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function UpdatePasswordForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleUpdatePassword(event: React.FormEvent) {
    event.preventDefault();
    if (isLoading) return;
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace("/dashboard");
      router.refresh();
    } catch (caught: unknown) {
      setError(getControlledAuthErrorMessage(caught, "password-update"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="space-y-2 pb-5">
          <p className="text-sm font-medium text-muted-foreground">Secure your account</p>
          <CardTitle as="h1" className="text-2xl sm:text-3xl">Choose a new password</CardTitle>
          <CardDescription>Use a strong password you haven’t used for this account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdatePassword} className="space-y-5">
            <PasswordField id="password" name="password" label="New password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={(event) => setPassword(event.target.value)} />
            <p className="-mt-3 text-xs leading-5 text-muted-foreground">Use 8–72 characters. A longer, unique password is safest.</p>
            <PasswordField id="confirm-password" name="confirmPassword" label="Confirm new password" autoComplete="new-password" minLength={8} maxLength={72} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            <div className="min-h-5" aria-live="polite">{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>
            <Button type="submit" className="w-full" disabled={isLoading}>{isLoading ? "Saving password…" : "Save new password"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
