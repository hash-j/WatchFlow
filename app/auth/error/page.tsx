import Link from "next/link";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthErrorReasonMessage } from "@/lib/auth/errors";

async function ErrorContent({ searchParams }: { searchParams: Promise<{ reason?: string | string[] }> }) {
  const params = await searchParams;
  return <p className="text-sm leading-6 text-muted-foreground" role="alert">{getAuthErrorReasonMessage(params?.reason)}</p>;
}

export default function AuthErrorPage({ searchParams }: { searchParams: Promise<{ reason?: string | string[] }> }) {
  return (
    <AuthShell>
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="space-y-2 pb-5">
          <p className="text-sm font-medium text-muted-foreground">Authentication help</p>
          <CardTitle as="h1" className="text-2xl sm:text-3xl">We couldn’t complete that request</CardTitle>
          <CardDescription>Your account remains secure. Choose a safe next step below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Checking the request…</p>}>
            <ErrorContent searchParams={searchParams} />
          </Suspense>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button asChild><Link href="/auth/login">Return to login</Link></Button>
            <Button asChild variant="outline"><Link href="/auth/forgot-password">Reset password</Link></Button>
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
