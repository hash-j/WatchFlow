import "server-only";

import { redirectAuthenticatedUser } from "@/lib/auth/server";

export async function PublicAuthGate({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectAuthenticatedUser();
  return children;
}

export function AuthSessionFallback() {
  return (
    <div
      role="status"
      className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm"
    >
      Checking your session…
    </div>
  );
}
