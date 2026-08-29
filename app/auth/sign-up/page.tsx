import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import {
  AuthSessionFallback,
  PublicAuthGate,
} from "@/components/auth/public-auth-gate";
import { SignUpForm } from "@/components/sign-up-form";

export default function SignUpPage() {
  return (
    <AuthShell>
      <Suspense fallback={<AuthSessionFallback />}>
        <PublicAuthGate>
          <SignUpForm />
        </PublicAuthGate>
      </Suspense>
    </AuthShell>
  );
}
