import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailForm } from "@/components/verify-email-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPendingVerification } from "@/lib/auth/pending-verification";
import { redirectAuthenticatedUser } from "@/lib/auth/server";
import { maskEmail } from "@/lib/auth/validation";

export default async function VerifyEmailPage() {
  await redirectAuthenticatedUser();
  const pending = await getPendingVerification();

  return (
    <AuthShell>
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="space-y-2 pb-5">
          <p className="text-sm font-medium text-muted-foreground">One quick step</p>
          <CardTitle as="h1" className="text-2xl sm:text-3xl">Check your email</CardTitle>
          <CardDescription>
            {pending
              ? "We sent a 6-digit verification code to your email."
              : "Your verification details are no longer available on this device."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending ? (
            <VerifyEmailForm
              maskedEmail={maskEmail(pending.email)}
              resendAvailableAt={pending.resendAvailableAt}
            />
          ) : (
            <div className="space-y-4">
              <p role="alert" className="text-sm leading-6 text-muted-foreground">
                For your security, pending verification details expire after 15 minutes. Start signup again or return to login.
              </p>
              <Button asChild className="w-full"><Link href="/auth/sign-up">Return to signup</Link></Button>
              <Button asChild variant="outline" className="w-full"><Link href="/auth/login">Return to login</Link></Button>
            </div>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
