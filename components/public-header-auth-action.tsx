import Link from "next/link";

import { hasAuthenticatedSession } from "@/lib/auth/server";

const linkClassName =
  "inline-flex min-h-11 items-center rounded-sm text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Signed-out fallback for the streamed header action. Public information pages
 * stay prerendered, so the shell ships this state and the resolved action
 * replaces it; both labels use identical markup, so nothing shifts.
 */
export function PublicHeaderSignInLink() {
  return (
    <Link href="/auth/login" className={linkClassName}>
      Log in
    </Link>
  );
}

export async function PublicHeaderAuthAction() {
  if (!(await hasAuthenticatedSession())) {
    return <PublicHeaderSignInLink />;
  }

  return (
    <Link href="/dashboard" className={linkClassName}>
      Open WatchFlow
    </Link>
  );
}
