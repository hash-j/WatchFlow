import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

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
