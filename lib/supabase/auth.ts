import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { getRequestSupabaseClient } from "@/lib/supabase/request";

function getProfileName(profile: Record<string, unknown> | null) {
  if (!profile) {
    return null;
  }

  for (const field of ["display_name", "full_name", "username", "name"]) {
    const value = profile[field];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export const getAuthContext = cache(async () => {
  const supabase = await getRequestSupabaseClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect("/auth/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", claims.sub)
    .maybeSingle();

  const profileRecord = profileError
    ? null
    : (profile as Record<string, unknown> | null);

  return {
    user: {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
    },
    profile: profileRecord,
    profileLoadFailed: Boolean(profileError),
    profileName: getProfileName(profileRecord),
    client: supabase,
  };
});
