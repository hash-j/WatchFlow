"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { AuthSubmitButton } from "@/components/auth/submit-button";
import { Button } from "@/components/ui/button";
import {
  changeVerificationEmailAction,
  resendVerificationAction,
  verifyEmailAction,
} from "@/lib/auth/actions";
import { INITIAL_VERIFICATION_STATE, RESEND_COOLDOWN_SECONDS } from "@/lib/auth/types";
import { normalizeOtp } from "@/lib/auth/validation";
import { cn } from "@/lib/utils";

function OtpInput({ initialValue, error }: { initialValue: string; error: boolean }) {
  const [code, setCode] = useState(initialValue);
  const positions = Array.from({ length: 6 }, (_, index) => code[index] ?? "");

  return (
    <div className="space-y-3">
      <label htmlFor="verification-code" className="block text-sm font-medium">Verification code</label>
      <div className={cn("group relative grid grid-cols-6 gap-1.5 rounded-xl sm:gap-2", error && "text-destructive")}>
        {positions.map((digit, index) => (
          <span
            key={index}
            data-testid="otp-position"
            aria-hidden="true"
            className={cn(
              "grid aspect-square min-w-0 place-items-center rounded-lg border bg-background text-lg font-semibold shadow-sm transition-colors",
              "group-focus-within:border-ring group-focus-within:ring-1 group-focus-within:ring-ring",
              error && "border-destructive",
            )}
          >
            {digit}
          </span>
        ))}
        <input
          id="verification-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          aria-invalid={error}
          aria-describedby="verification-help verification-feedback"
          className="absolute inset-0 z-10 h-full w-full cursor-text rounded-xl opacity-0"
          onChange={(event) => setCode(normalizeOtp(event.target.value))}
          onPaste={(event) => {
            const pasted = normalizeOtp(event.clipboardData.getData("text"));
            if (pasted) {
              event.preventDefault();
              setCode(pasted);
            }
          }}
        />
      </div>
      <p id="verification-help" className="text-xs leading-5 text-muted-foreground">Enter the six numbers from your newest WatchFlow email. You can paste the whole code.</p>
    </div>
  );
}

export function VerifyEmailForm({ maskedEmail, resendAvailableAt: initialResendAvailableAt }: { maskedEmail: string; resendAvailableAt: number }) {
  const [verifyState, verifyAction] = useActionState(verifyEmailAction, INITIAL_VERIFICATION_STATE);
  const [resendState, resendAction] = useActionState(resendVerificationAction, INITIAL_VERIFICATION_STATE);
  const [now, setNow] = useState(() => Date.now());
  const [resendAvailableAt, setResendAvailableAt] = useState(initialResendAvailableAt);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const secondsRemaining = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));

  return (
    <div className="space-y-6">
      <form action={verifyAction} className="space-y-5">
        <OtpInput key={`${verifyState.error ?? "ready"}:${verifyState.code}`} initialValue={verifyState.code} error={Boolean(verifyState.error)} />
        <div id="verification-feedback" className="min-h-5" aria-live="polite">
          {verifyState.error && <p role="alert" className="text-sm text-destructive">{verifyState.error}</p>}
        </div>
        <AuthSubmitButton idleLabel="Verify email" pendingLabel="Verifying…" className="w-full" />
      </form>

      <div className="border-t pt-5">
        <p className="text-sm text-muted-foreground">Didn’t receive the email sent to <span className="font-medium text-foreground">{maskedEmail}</span>?</p>
        <form
          action={resendAction}
          className="mt-3"
          onSubmit={() => {
            setNow(Date.now());
            setResendAvailableAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
          }}
        >
          <Button type="submit" variant="outline" className="w-full" disabled={secondsRemaining > 0}>
            {secondsRemaining > 0 ? `Resend code in ${secondsRemaining}s` : "Resend code"}
          </Button>
        </form>
        <div className="mt-3 min-h-5" aria-live="polite">
          {resendState.error && <p role="alert" className="text-sm text-destructive">{resendState.error}</p>}
          {resendState.success && <p role="status" className="text-sm text-foreground">{resendState.success}</p>}
        </div>
      </div>

      <form action={changeVerificationEmailAction}>
        <Button type="submit" variant="ghost" className="w-full">Use a different email</Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Already verified? <Link href="/auth/login" className="font-medium text-foreground underline-offset-4 hover:underline">Return to login</Link>
      </p>
    </div>
  );
}
