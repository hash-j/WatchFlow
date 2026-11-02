import type { User } from "@supabase/supabase-js";

export type ChangePasswordState = {
  status: "idle" | "success" | "error";
  message: string;
  fieldErrors: Record<string, string[]>;
};
export const INITIAL_CHANGE_PASSWORD_STATE: ChangePasswordState = { status: "idle", message: "", fieldErrors: {} };

export function supportsPasswordChange(user: Pick<User, "identities" | "app_metadata">) {
  // Auth-server identities/app_metadata only; never trust editable user_metadata.
  return user.identities?.some(identity => identity.provider === "email") ??
    (Array.isArray(user.app_metadata.providers) && user.app_metadata.providers.includes("email"));
}
export function validatePasswordChange(form: FormData) {
  const read = (name: string) => typeof form.get(name) === "string" ? form.get(name) as string : "";
  const currentPassword = read("currentPassword"), newPassword = read("newPassword"), confirmation = read("confirmPassword");
  const fieldErrors: Record<string, string[]> = {};
  if (!currentPassword || currentPassword.length > 1024) fieldErrors.currentPassword = ["Enter your current password."];
  if (newPassword.length < 8 || newPassword.length > 72 || !newPassword.trim()) fieldErrors.newPassword = ["Use a password with 8–72 characters."];
  if (!confirmation || confirmation !== newPassword) fieldErrors.confirmPassword = ["Passwords do not match."];
  if (currentPassword && currentPassword === newPassword) fieldErrors.newPassword = ["Choose a different new password."];
  return Object.keys(fieldErrors).length ? { success: false as const, fieldErrors } :
    { success: true as const, currentPassword, newPassword };
}
