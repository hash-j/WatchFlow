"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getLoginErrorPresentation,
  type LoginErrorPresentation,
} from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function LoginForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<LoginErrorPresentation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setFeedback(null);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLocaleLowerCase("en-US"),
        password,
      });
      if (signInError) throw signInError;
      router.replace("/dashboard");
      router.refresh();
    } catch (caught: unknown) {
      const nextFeedback = getLoginErrorPresentation(caught);
      setFeedback(nextFeedback);

      if (nextFeedback.kind === "invalid_credentials") {
        setPassword("");
        window.requestAnimationFrame(() => passwordRef.current?.focus());
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="space-y-2 pb-5">
          <p className="text-sm font-medium text-muted-foreground">Welcome back</p>
          <CardTitle as="h1" className="text-2xl sm:text-3xl">Log in to WatchFlow</CardTitle>
          <CardDescription>Continue with the email and password for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" inputMode="email" placeholder="you@example.com" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <PasswordField
              id="password"
              name="password"
              label="Password"
              inputRef={passwordRef}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              labelAction={<Link href="/auth/forgot-password" className="text-sm font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Forgot password?</Link>}
            />
            <div
              className={cn(
                feedback?.kind !== "invalid_credentials" && "min-h-5",
              )}
              aria-live="polite"
            >
              {feedback?.kind === "invalid_credentials" ? (
                <Feedback variant="error" title={feedback.title}>
                  <p>{feedback.message}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                    <Link
                      href="/auth/sign-up"
                      className="font-semibold text-foreground underline underline-offset-4"
                    >
                      Create an account
                    </Link>
                    <Link
                      href="/auth/forgot-password"
                      className="font-semibold text-foreground underline underline-offset-4"
                    >
                      Reset password
                    </Link>
                  </div>
                </Feedback>
              ) : feedback ? (
                <p role="alert" className="text-sm text-destructive">
                  {feedback.message}
                </p>
              ) : null}
            </div>
            <Button type="submit" className="w-full" disabled={isLoading} aria-disabled={isLoading}>
              {isLoading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            New to WatchFlow?{" "}
            <Link href="/auth/sign-up" className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Create account</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
