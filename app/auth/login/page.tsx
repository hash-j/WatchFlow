import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import {
  AuthSessionFallback,
  PublicAuthGate,
} from "@/components/auth/public-auth-gate";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={<AuthSessionFallback />}>
        <PublicAuthGate>
          <LoginForm />
        </PublicAuthGate>
      </Suspense>
    </AuthShell>
  );
}
