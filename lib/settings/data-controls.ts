import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { logSupabaseError } from "@/lib/supabase/error-logging";
import { SettingsPersistenceError } from "./errors";

export async function deleteOwnedLibraryData(
  client: SupabaseClient,
  userId: string,
) {
  const { data, error } = await client
    .from("user_movies")
    .delete()
    .eq("user_id", userId)
    .select("id");

  if (error) {
    logSupabaseError("delete all user library data failed", error);
    throw new SettingsPersistenceError(
      "Your library data could not be deleted. Nothing was reported as removed.",
    );
  }

  return Array.isArray(data) ? data.length : 0;
}

export async function deleteVerifiedAuthUser(user: User) {
  // Admin construction occurs only after the caller has obtained this User
  // from the authenticated server client with auth.getUser().
  const admin = createAdminClient(user.id);
  const { error } = await admin.auth.admin.deleteUser(user.id);

  if (error) {
    logSupabaseError("authenticated account deletion failed", error);
    throw new SettingsPersistenceError(
      "Your account could not be deleted. It remains active.",
    );
  }
}

export function hasRecentServerVerifiedLogin(
  lastSignInAt: string | undefined,
  now = new Date(),
  maximumAgeMinutes = 30,
) {
  if (!lastSignInAt) {
    return false;
  }

  const signedInAt = new Date(lastSignInAt).getTime();
  return (
    Number.isFinite(signedInAt) &&
    signedInAt <= now.getTime() &&
    now.getTime() - signedInAt <= maximumAgeMinutes * 60_000
  );
}
