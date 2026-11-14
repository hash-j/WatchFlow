import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Reports whether the current request already carries a WatchFlow session.
 * Public pages use this to label their header action; it never redirects, and
 * an auth outage is reported as "signed out" so public content still renders.
 */
export async function hasAuthenticatedSession() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    return Boolean(data?.claims?.sub);
  } catch {
    return false;
  }
}

export async function redirectAuthenticatedUser() {
  let authenticated = false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    authenticated = Boolean(data?.claims?.sub);
  } catch {
    // Public auth pages remain available during a temporary auth outage.
  }

  if (authenticated) redirect("/dashboard");
}
