import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ server: vi.fn(), verifier: vi.fn(), getUser: vi.fn(), signIn: vi.fn(), update: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.server }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.verifier }));
import { changePasswordAction } from "../../app/(app)/settings/password-actions";
import { INITIAL_CHANGE_PASSWORD_STATE, supportsPasswordChange, validatePasswordChange } from "./change-password";

const user = { id: "owner", email: "owner@example.invalid", app_metadata: { providers: ["email"] }, identities: [{ provider: "email" }] } as User;
function form(current = "old-password", next = "new-password", confirm = next) {
  const result = new FormData(); result.set("currentPassword", current); result.set("newPassword", next); result.set("confirmPassword", confirm); return result;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.server.mockResolvedValue({ auth: { getUser: mocks.getUser, updateUser: mocks.update } });
  mocks.verifier.mockReturnValue({ auth: { signInWithPassword: mocks.signIn } });
  mocks.getUser.mockResolvedValue({ data: { user }, error: null });
  mocks.signIn.mockResolvedValue({ data: { user, session: { access_token: "memory-only" } }, error: null });
  mocks.update.mockResolvedValue({ data: { user }, error: null });
});
describe("profile password change", () => {
  it.each([["", "", ""], ["old", "short", "short"], ["old", "new-password", "different"], ["same-password", "same-password", "same-password"]])("rejects empty, invalid or mismatching credentials", async (current, next, confirm) => {
    const input = form(current, next, confirm); expect(validatePasswordChange(input).success).toBe(false);
    const result = await changePasswordAction(INITIAL_CHANGE_PASSWORD_STATE, input);
    expect(result.status).toBe("error"); expect(mocks.server).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("currentPassword"); expect(result).not.toHaveProperty("newPassword");
  });
  it("verifies the current password with the server-verified email, keeps the SSR session and updates only auth", async () => {
    const input = form(); input.set("email", "attacker@example.invalid"); input.set("userId", "attacker");
    expect((await changePasswordAction(INITIAL_CHANGE_PASSWORD_STATE, input)).status).toBe("success");
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.signIn).toHaveBeenCalledWith({ email: user.email, password: "old-password" });
    expect(mocks.verifier.mock.calls[0][2]).toEqual({ auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    expect(mocks.update).toHaveBeenCalledWith({ password: "new-password", current_password: "old-password" });
    expect(mocks.signIn.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0]);
  });
  it.each(["wrong-password", "another-owner", "missing-session"])("fails closed on reauthentication: %s", async reason => {
    mocks.signIn.mockResolvedValue({ data: { user: reason === "another-owner" ? { ...user, id: "other" } : user,
      session: reason === "missing-session" ? null : {} }, error: reason === "wrong-password" ? { message: "SECRET_RAW_ERROR" } : null });
    const result = await changePasswordAction(INITIAL_CHANGE_PASSWORD_STATE, form());
    expect(result.status).toBe("error"); expect(mocks.update).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain("SECRET_RAW_ERROR");
  });
  it("rejects an expired session and an OAuth-only account without offering fake verification", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: {} });
    expect((await changePasswordAction(INITIAL_CHANGE_PASSWORD_STATE, form())).status).toBe("error");
    const oauth = { ...user, identities: [{ provider: "google" }], app_metadata: { providers: ["google"] } } as User;
    expect(supportsPasswordChange(oauth)).toBe(false);
    mocks.getUser.mockResolvedValueOnce({ data: { user: oauth }, error: null });
    expect((await changePasswordAction(INITIAL_CHANGE_PASSWORD_STATE, form())).message).toContain("external sign-in provider");
    expect(mocks.signIn).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("sanitizes update/network failures and handles fresh-login requirements", async () => {
    mocks.update.mockResolvedValueOnce({ error: { code: "reauthentication_needed", message: "SECRET" } });
    expect((await changePasswordAction(INITIAL_CHANGE_PASSWORD_STATE, form())).message).toContain("fresh sign-in");
    mocks.update.mockRejectedValueOnce(new Error("SECRET"));
    const result = await changePasswordAction(INITIAL_CHANGE_PASSWORD_STATE, form());
    expect(result.status).toBe("error"); expect(JSON.stringify(result)).not.toContain("SECRET");
  });
});
