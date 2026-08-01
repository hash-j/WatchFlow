"use server";

import "server-only";

import { redirect } from "next/navigation";

import { logSupabaseError } from "@/lib/supabase/error-logging";
import { createClient } from "@/lib/supabase/server";

export type LogoutActionState = {
  message: string | null;
};

export async function logoutAction(
  previousState: LogoutActionState,
): Promise<LogoutActionState> {
  void previousState;
  let client: Awaited<ReturnType<typeof createClient>>;

  try {
    client = await createClient();
    await client.auth.getUser();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) {
      logSupabaseError("authenticated sign-out failed", error);
      return { message: "Unable to sign out. Please try again." };
    }
  } catch {
    return { message: "Unable to sign out. Please try again." };
  }

  redirect("/auth/login");
}
