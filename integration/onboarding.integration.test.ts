import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const requiredEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "E2E_EXPECTED_SUPABASE_URL",
  "E2E_USER_A_EMAIL",
  "E2E_USER_A_PASSWORD",
  "E2E_USER_B_EMAIL",
  "E2E_USER_B_PASSWORD",
] as const;

function env(name: (typeof requiredEnvironment)[number]) {
  return process.env[name]?.trim() || null;
}

const enabled =
  process.env.RUN_ONBOARDING_INTEGRATION_TESTS === "true" &&
  process.env.E2E_TARGET_ENV === "development" &&
  requiredEnvironment.every((name) => env(name)) &&
  env("NEXT_PUBLIC_SUPABASE_URL")!.replace(/\/$/, "") ===
    env("E2E_EXPECTED_SUPABASE_URL")!.replace(/\/$/, "");

const integrationDescribe = enabled ? describe : describe.skip;

type QaUser = { client: SupabaseClient; id: string; original: string };

async function signIn(
  emailName: "E2E_USER_A_EMAIL" | "E2E_USER_B_EMAIL",
  passwordName: "E2E_USER_A_PASSWORD" | "E2E_USER_B_PASSWORD",
) {
  const client = createClient(
    env("NEXT_PUBLIC_SUPABASE_URL")!,
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: env(emailName)!,
    password: env(passwordName)!,
  });
  expect(error).toBeNull();
  expect(data.user?.id).toEqual(expect.any(String));
  const profile = await client
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", data.user!.id)
    .single();
  expect(profile.error).toBeNull();
  expect(profile.data?.onboarding_completed_at).toEqual(expect.any(String));
  return {
    client,
    id: data.user!.id,
    original: profile.data!.onboarding_completed_at as string,
  };
}

async function restore(user: QaUser | undefined) {
  if (!user) return;
  await user.client
    .from("profiles")
    .update({ onboarding_completed_at: user.original })
    .eq("id", user.id);
  await user.client.auth.signOut({ scope: "local" });
}

integrationDescribe("development onboarding RLS integration", () => {
  let userA: QaUser;
  let userB: QaUser;

  beforeAll(async () => {
    [userA, userB] = await Promise.all([
      signIn("E2E_USER_A_EMAIL", "E2E_USER_A_PASSWORD"),
      signIn("E2E_USER_B_EMAIL", "E2E_USER_B_PASSWORD"),
    ]);
    expect(userA.id).not.toBe(userB.id);
  });

  afterAll(async () => {
    await Promise.allSettled([restore(userA), restore(userB)]);
  });

  it("has a completed timestamp for established QA profiles after backfill", () => {
    expect(userA.original).toEqual(expect.any(String));
    expect(userB.original).toEqual(expect.any(String));
  });

  it("lets A update only A's onboarding state without changing B", async () => {
    const updateA = await userA.client
      .from("profiles")
      .update({ onboarding_completed_at: null })
      .eq("id", userA.id)
      .select("id, onboarding_completed_at")
      .single();
    expect(updateA.error).toBeNull();
    expect(updateA.data).toMatchObject({ id: userA.id, onboarding_completed_at: null });

    const readB = await userB.client
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", userB.id)
      .single();
    expect(readB.error).toBeNull();
    expect(readB.data?.onboarding_completed_at).toBe(userB.original);
  });

  it("does not let B update A's onboarding state", async () => {
    const crossUser = await userB.client
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", userA.id)
      .select("id");
    expect(crossUser.error).toBeNull();
    expect(crossUser.data).toEqual([]);
  });

  it("does not grant anonymous onboarding writes", async () => {
    const anonymous = createClient(
      env("NEXT_PUBLIC_SUPABASE_URL")!,
      env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
    const result = await anonymous
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", userA.id)
      .select("id");
    if (result.error) {
      expect(["42501", "PGRST301"]).toContain(result.error.code);
    } else {
      expect(result.data).toEqual([]);
    }
  });
});
