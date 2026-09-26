import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const requiredEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
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

const enabled =
  process.env.RUN_SUPABASE_INTEGRATION_TESTS === "true" &&
  process.env.E2E_TARGET_ENV === "development" &&
  requiredEnvironment.every((name) => environmentValue(name)) &&
  environmentValue("NEXT_PUBLIC_SUPABASE_URL")!.replace(/\/$/, "") ===
    environmentValue("E2E_EXPECTED_SUPABASE_URL")!.replace(/\/$/, "");

const integrationDescribe = enabled ? describe : describe.skip;
const categoryColumns = [
  "notification_movie_status_enabled",
  "notification_watch_next_enabled",
  "notification_custom_lists_enabled",
  "notification_imports_enabled",
] as const;

async function authenticate(kind: "A" | "B") {
  const client = createClient(
    environmentValue("NEXT_PUBLIC_SUPABASE_URL")!,
    environmentValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: environmentValue(`E2E_USER_${kind}_EMAIL`)!,
    password: environmentValue(`E2E_USER_${kind}_PASSWORD`)!,
  });
  expect(error).toBeNull();
  expect(data.user).not.toBeNull();
  return { client, userId: data.user!.id };
}

integrationDescribe.sequential("Part 18H live database acceptance", () => {
  it("persists owner category choices and preserves preference isolation", async () => {
    const [userA, userB] = await Promise.all([authenticate("A"), authenticate("B")]);
    const original = await userB.client
      .from("user_preferences")
      .select(categoryColumns.join(","))
      .eq("user_id", userB.userId)
      .single();
    expect(original.error).toBeNull();

    try {
      const disabled = Object.fromEntries(
        categoryColumns.map((column) => [column, false]),
      );
      const update = await userB.client
        .from("user_preferences")
        .update(disabled)
        .eq("user_id", userB.userId)
        .select(categoryColumns.join(","))
        .single();
      expect(update.error).toBeNull();
      const updatedPreferences = update.data as unknown as Record<
        string,
        unknown
      >;
      expect(
        categoryColumns.every(
          (column) => updatedPreferences[column] === false,
        ),
      ).toBe(true);

      const reloaded = await userB.client
        .from("user_preferences")
        .select(categoryColumns.join(","))
        .eq("user_id", userB.userId)
        .single();
      expect(reloaded.error).toBeNull();
      const reloadedPreferences = reloaded.data as unknown as Record<
        string,
        unknown
      >;
      expect(
        categoryColumns.every(
          (column) => reloadedPreferences[column] === false,
        ),
      ).toBe(true);

      const crossOwner = await userA.client
        .from("user_preferences")
        .select("user_id")
        .eq("user_id", userB.userId);
      expect(crossOwner.error).toBeNull();
      expect(crossOwner.data).toEqual([]);

      const reenabled = await userB.client
        .from("user_preferences")
        .update(Object.fromEntries(categoryColumns.map((column) => [column, true])))
        .eq("user_id", userB.userId)
        .select(categoryColumns.join(","))
        .single();
      expect(reenabled.error).toBeNull();
      const reenabledPreferences = reenabled.data as unknown as Record<
        string,
        unknown
      >;
      expect(
        categoryColumns.every(
          (column) => reenabledPreferences[column] === true,
        ),
      ).toBe(true);
    } finally {
      if (original.data) {
        const restore = await userB.client
          .from("user_preferences")
          .update(original.data)
          .eq("user_id", userB.userId);
        expect(restore.error).toBeNull();
      }
      await Promise.allSettled([
        userA.client.auth.signOut(),
        userB.client.auth.signOut(),
      ]);
    }
  });

  it("persists read state, prevents duplicates, enforces RLS, and cleans fixtures", async () => {
    const [userA, userB] = await Promise.all([authenticate("A"), authenticate("B")]);
    const admin = createClient(
      environmentValue("NEXT_PUBLIC_SUPABASE_URL")!,
      environmentValue("SUPABASE_SECRET_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const runId = `part18h-${randomUUID()}`;
    const userAId = randomUUID();
    const userBFirstId = randomUUID();
    const userBSecondId = randomUUID();
    const fixtureIds = [userAId, userBFirstId, userBSecondId];

    try {
      const inserted = await admin.from("notifications").insert([
        {
          id: userAId,
          user_id: userA.userId,
          type: "system",
          title: "Part 18H owner isolation",
          body: "Controlled QA notification.",
          action_path: "/notifications",
          metadata: { qa_run_id: runId, category: "imports" },
        },
        {
          id: userBFirstId,
          user_id: userB.userId,
          type: "system",
          title: "Part 18H movie context",
          body: "Arrival was added to your Watch Next queue.",
          action_path: "/watch-next",
          metadata: {
            qa_run_id: runId,
            category: "watch_next",
            movie_title: "Arrival",
            movie_poster_path: "/arrival.jpg",
          },
        },
        {
          id: userBSecondId,
          user_id: userB.userId,
          type: "system",
          title: "Part 18H mark all",
          body: "Controlled QA notification.",
          action_path: "/library",
          metadata: { qa_run_id: runId, category: "movie_status" },
        },
      ]);
      expect(inserted.error).toBeNull();

      const duplicate = await admin
        .from("notifications")
        .upsert(
          {
            id: userBFirstId,
            user_id: userB.userId,
            type: "system",
            title: "Duplicate must not be created",
            body: "Duplicate must not be created.",
            metadata: { qa_run_id: runId },
          },
          { onConflict: "id", ignoreDuplicates: true },
        )
        .select("id");
      expect(duplicate.error).toBeNull();
      expect(duplicate.data).toEqual([]);

      const own = await userB.client
        .from("notifications")
        .select("id, read_at, action_path, metadata")
        .eq("metadata->>qa_run_id", runId)
        .order("created_at", { ascending: true });
      expect(own.error).toBeNull();
      expect(own.data).toHaveLength(2);
      expect(own.data?.[0]?.metadata).toMatchObject({
        category: "watch_next",
        movie_title: "Arrival",
        movie_poster_path: "/arrival.jpg",
      });

      const markOne = await userB.client.rpc("watchflow_mark_notification_read", {
        p_notification_id: userBFirstId,
      });
      expect(markOne).toMatchObject({ data: true, error: null });
      const persistedOne = await userB.client
        .from("notifications")
        .select("read_at")
        .eq("id", userBFirstId)
        .single();
      expect(persistedOne.error).toBeNull();
      expect(persistedOne.data?.read_at).toEqual(expect.any(String));

      const markAll = await userB.client.rpc("watchflow_mark_all_notifications_read");
      expect(markAll.error).toBeNull();
      expect(markAll.data).toBeGreaterThanOrEqual(1);
      const unread = await userB.client
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("metadata->>qa_run_id", runId)
        .is("read_at", null);
      expect(unread.error).toBeNull();
      expect(unread.count).toBe(0);

      const crossOwner = await userA.client
        .from("notifications")
        .select("id")
        .in("id", [userBFirstId, userBSecondId]);
      expect(crossOwner.error).toBeNull();
      expect(crossOwner.data).toEqual([]);

      const anonymous = createClient(
        environmentValue("NEXT_PUBLIC_SUPABASE_URL")!,
        environmentValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")!,
        { auth: { persistSession: false } },
      );
      const anonymousRead = await anonymous.from("notifications").select("id").limit(1);
      expect(anonymousRead.error).not.toBeNull();
    } finally {
      const cleanup = await admin
        .from("notifications")
        .delete()
        .in("id", fixtureIds)
        .in("user_id", [userA.userId, userB.userId]);
      expect(cleanup.error).toBeNull();
      const remaining = await admin
        .from("notifications")
        .select("id")
        .in("id", fixtureIds);
      expect(remaining.error).toBeNull();
      expect(remaining.data).toEqual([]);
      await Promise.allSettled([
        userA.client.auth.signOut(),
        userB.client.auth.signOut(),
      ]);
    }
  });
});
