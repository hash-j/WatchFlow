"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { revokeGoogleRefreshToken } from "@/lib/calendar/google-provider";
import { deleteGoogleCalendarConnection, readGoogleCalendarCredential } from "@/lib/calendar/oauth-store";
import { decryptCalendarRefreshToken } from "@/lib/calendar/token-encryption";
import { authenticateSettings } from "@/lib/settings/supabase-settings";
import type { SettingsActionState } from "@/lib/settings/types";

const errorState: SettingsActionState = {
  status: "error",
  message: "Your calendar setting could not be changed. Please try again.",
  fieldErrors: {},
};

export async function setCalendarSyncEnabledAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await authenticateSettings();
  if (!session) return { ...errorState, message: "Your session has expired. Sign in again." };
  const enabled = formData.get("enabled") === "true";
  const { data, error } = await session.client.rpc("watchflow_set_calendar_sync_enabled", {
    p_enabled: enabled,
  });
  if (error || data !== true) return errorState;
  revalidatePath("/settings/calendar");
  return {
    status: "success",
    message: enabled ? "Calendar sync enabled." : "Calendar sync paused.",
    fieldErrors: {},
  };
}

export async function disconnectGoogleCalendarAction() {
  const session = await authenticateSettings();
  if (!session) redirect("/auth/login");

  let revoked = false;
  try {
    const credential = await readGoogleCalendarCredential(session.user.id);
    if (credential) {
      const token = decryptCalendarRefreshToken(credential, session.user.id);
      revoked = await revokeGoogleRefreshToken(token);
    }
  } catch {
    // Revocation is best effort. Removing the local credential is authoritative.
  }

  try {
    await deleteGoogleCalendarConnection(session.user.id);
  } catch {
    redirect("/settings/calendar?calendar=disconnect_failed");
  }
  revalidatePath("/settings/calendar");
  redirect(`/settings/calendar?calendar=${revoked ? "disconnected" : "disconnected_local"}`);
}
