import { createClient } from "@supabase/supabase-js";

import { getQaCredentials, type QaCredentialKind } from "./environment";

function publicConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Public Supabase QA configuration is unavailable.");
  }
  return { url, key };
}

export async function setOwnOnboardingCompletion(
  kind: Extract<QaCredentialKind, "A" | "B">,
  completedAt: string | null,
) {
  const { url, key } = publicConfiguration();
  const credentials = getQaCredentials(kind);
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword(credentials);
  if (signInError || !signedIn.user) {
    throw new Error(`QA ${kind} could not establish its onboarding control session.`);
  }

  try {
    const { data, error } = await client
      .from("profiles")
      .update({ onboarding_completed_at: completedAt })
      .eq("id", signedIn.user.id)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      throw new Error(`QA ${kind} could not update its own onboarding state.`);
    }
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}
