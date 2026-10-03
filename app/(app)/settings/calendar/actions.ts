"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requestGoogleCalendarDisconnect } from "@/lib/calendar/oauth-store";
import { readGoogleCalendarCredential } from "@/lib/calendar/oauth-store";
import { revokeGoogleRefreshToken } from "@/lib/calendar/google-provider";
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
  if (!session) {
    return {
      ...errorState,
      message: "Your session has expired. Sign in again.",
    };
  }
  const enabled = formData.get("enabled") === "true";
  const { data, error } = await session.client.rpc(
    "watchflow_set_calendar_sync_enabled",
    { p_enabled: enabled },
  );
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

  let refreshToken: string | null = null;
  try {
    const credential = await readGoogleCalendarCredential(session.user.id);
    if (credential) {
      refreshToken = decryptCalendarRefreshToken(
        credential,
        session.user.id,
      );
    }
  } catch {
    // Durable cleanup remains authoritative when the credential is unreadable.
  }

  try {
    await requestGoogleCalendarDisconnect(session.user.id);
  } catch {
    redirect("/settings/calendar?calendar=disconnect_failed");
  }
  const { data: pending, error: pendingError } = await session.client
    .from("calendar_connections")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("provider", "google")
    .maybeSingle();
  if (!pendingError && !pending && refreshToken) {
    await revokeGoogleRefreshToken(refreshToken);
  }
  revalidatePath("/settings/calendar");
  redirect(
    `/settings/calendar?calendar=${pending || pendingError ? "disconnect_pending" : "disconnected"}`,
  );
}
