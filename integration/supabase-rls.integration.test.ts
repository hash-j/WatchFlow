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

function environmentValue(name: (typeof requiredEnvironment)[number]) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

const integrationEnabled =
  process.env.RUN_SUPABASE_INTEGRATION_TESTS === "true" &&
  process.env.E2E_TARGET_ENV === "development" &&
  requiredEnvironment.every((name) => environmentValue(name)) &&
  environmentValue("NEXT_PUBLIC_SUPABASE_URL")!.replace(/\/$/, "") ===
    environmentValue("E2E_EXPECTED_SUPABASE_URL")!.replace(/\/$/, "");

const integrationDescribe = integrationEnabled ? describe : describe.skip;

type AuthenticatedQaClient = {
  client: SupabaseClient;
  userId: string;
};

async function authenticateQaUser(
  emailName: "E2E_USER_A_EMAIL" | "E2E_USER_B_EMAIL",
  passwordName: "E2E_USER_A_PASSWORD" | "E2E_USER_B_PASSWORD",
): Promise<AuthenticatedQaClient> {
  const client = createClient(
    environmentValue("NEXT_PUBLIC_SUPABASE_URL")!,
    environmentValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: environmentValue(emailName)!,
    password: environmentValue(passwordName)!,
  });

  expect(error?.code ?? null).toBeNull();
  expect(data.user?.id).toEqual(expect.any(String));

  return { client, userId: data.user!.id };
}

function expectNoRows(data: unknown, error: { code?: string } | null) {
  if (error) {
    expect(["42501", "PGRST301"]).toContain(error.code);
    return;
  }

  expect(data).toEqual([]);
}

integrationDescribe("development Supabase RLS integration", () => {
  let userA: AuthenticatedQaClient;
  let userB: AuthenticatedQaClient;

  beforeAll(async () => {
    [userA, userB] = await Promise.all([
      authenticateQaUser("E2E_USER_A_EMAIL", "E2E_USER_A_PASSWORD"),
      authenticateQaUser("E2E_USER_B_EMAIL", "E2E_USER_B_PASSWORD"),
    ]);
    expect(userA.userId).not.toBe(userB.userId);
  });

  afterAll(async () => {
    await Promise.allSettled([
      userA?.client.auth.signOut({ scope: "local" }),
      userB?.client.auth.signOut({ scope: "local" }),
    ]);
  });

  it("allows each user to read their profile and hides it from the other user", async () => {
    const own = await userA.client
      .from("profiles")
      .select("id")
      .eq("id", userA.userId)
      .maybeSingle();
    expect(own.error).toBeNull();
    expect(own.data?.id).toBe(userA.userId);

    const crossUser = await userB.client
      .from("profiles")
      .select("id")
      .eq("id", userA.userId);
    expect(crossUser.error).toBeNull();
    expect(crossUser.data).toEqual([]);
  });

  it("isolates private preferences, library rows, and lists", async () => {
    for (const table of ["user_preferences", "user_movies", "lists"] as const) {
      const own = await userA.client
        .from(table)
        .select("user_id")
        .eq("user_id", userA.userId)
        .limit(10);
      expect(own.error, table).toBeNull();
      expect(
        (own.data ?? []).every((row) => row.user_id === userA.userId),
        table,
      ).toBe(true);

      const crossUser = await userB.client
        .from(table)
        .select("user_id")
        .eq("user_id", userA.userId);
      expect(crossUser.error, table).toBeNull();
      expect(crossUser.data, table).toEqual([]);
    }
  });

  it("isolates list memberships when QA User A has a list", async () => {
    const lists = await userA.client
      .from("lists")
      .select("id")
      .eq("user_id", userA.userId)
      .limit(1);
    expect(lists.error).toBeNull();

    const listId = lists.data?.[0]?.id;
    if (!listId) return;

    const crossUser = await userB.client
      .from("list_movies")
      .select("id")
      .eq("list_id", listId);
    expect(crossUser.error).toBeNull();
    expect(crossUser.data).toEqual([]);
  });

  it("isolates push subscriptions and derives the owner in the save RPC", async () => {
    const endpoint = `https://push.example.test/watchflow-part18e/${crypto.randomUUID()}`;
    const initialPreference = await userA.client
      .from("user_preferences")
      .select("push_notifications_enabled")
      .eq("user_id", userA.userId)
      .single();
    expect(initialPreference.error).toBeNull();

    try {
      const saved = await userA.client.rpc("watchflow_save_push_subscription", {
        p_endpoint: endpoint,
        p_p256dh: "A".repeat(64),
        p_auth_key: "B".repeat(24),
        p_expiration_time: null,
        p_user_agent: "WatchFlow Part 18E RLS acceptance",
      });
      expect(saved.error).toBeNull();
      expect(saved.data).toEqual(expect.any(String));

      const own = await userA.client
        .from("push_subscriptions")
        .select("user_id, endpoint")
        .eq("endpoint", endpoint);
      expect(own.error).toBeNull();
      expect(own.data).toEqual([{ user_id: userA.userId, endpoint }]);

      const crossUser = await userB.client
        .from("push_subscriptions")
        .select("user_id, endpoint")
        .eq("endpoint", endpoint);
      expect(crossUser.error).toBeNull();
      expect(crossUser.data).toEqual([]);

      const crossDelete = await userB.client
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", endpoint)
        .select("id");
      expect(crossDelete.error).toBeNull();
      expect(crossDelete.data).toEqual([]);
    } finally {
      await userA.client
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", endpoint);
      await userA.client
        .from("user_preferences")
        .update({
          push_notifications_enabled:
            initialPreference.data?.push_notifications_enabled === true,
        })
        .eq("user_id", userA.userId);
    }
  });

  it("denies anonymous reads of every user-owned table", async () => {
    const anonymous = createClient(
      environmentValue("NEXT_PUBLIC_SUPABASE_URL")!,
      environmentValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );

    for (const table of [
      "profiles",
      "user_preferences",
      "user_movies",
      "lists",
      "list_movies",
      "push_subscriptions",
    ] as const) {
      const { data, error } = await anonymous.from(table).select("*").limit(1);
      expectNoRows(data, error);
    }
  });

  it("allows authenticated reads of shared movie metadata", async () => {
    const result = await userA.client.from("movies").select("id").limit(1);
    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
  });
});
