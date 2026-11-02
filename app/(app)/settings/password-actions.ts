"use server";

import { createClient as createAuthClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { supportsPasswordChange, validatePasswordChange, type ChangePasswordState } from "@/lib/auth/change-password";

export async function changePasswordAction(_previous: ChangePasswordState, form: FormData): Promise<ChangePasswordState> {
  const parsed = validatePasswordChange(form);
  const failure = (message: string, fieldErrors: Record<string, string[]> = {}): ChangePasswordState => ({ status: "error", message, fieldErrors });
  if (!parsed.success) return failure("Check the highlighted fields.", parsed.fieldErrors);
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.email) return failure("Your session has expired. Sign in again.");
    if (!supportsPasswordChange(user)) return failure("This account uses an external sign-in provider. Manage your password with that provider.");

    // Verify with Supabase's existing email/password flow, without replacing the
    // active SSR session (including any MFA assurance) or persisting verifier tokens.
    const verifier = createAuthClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: verified, error: verificationError } = await verifier.auth.signInWithPassword({ email: user.email, password: parsed.currentPassword });
    if (verificationError || verified.user?.id !== user.id || !verified.session) {
      return failure("Current password could not be verified. Check it and try again.", { currentPassword: ["Current password could not be verified."] });
    }
    const { error: updateError } = await client.auth.updateUser({ password: parsed.newPassword, current_password: parsed.currentPassword });
    if (updateError) {
      if (updateError.code === "reauthentication_needed" || updateError.code === "reauthentication_not_valid") {
        return failure("Supabase requires a fresh sign-in before changing this password. Sign out, sign in again and retry.");
      }
      return failure("Password could not be changed. Use a stronger password or sign in again and retry.");
    }
    return { status: "success", message: "Password changed. Use your new password the next time you sign in.", fieldErrors: {} };
  } catch {
    // Never return/log provider errors or submitted passwords.
    return failure("Password could not be changed. Please try again.");
  }
}
