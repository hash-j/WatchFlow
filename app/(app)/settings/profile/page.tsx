import { redirect } from "next/navigation";

import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { formatUserDate } from "@/lib/settings/formatting";
import { getSettingsPageData } from "@/lib/settings/supabase-settings";

function initials(name: string, email: string | undefined) {
  const source = name || email || "W";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default async function ProfileSettingsPage() {
  const data = await getSettingsPageData();
  if (!data) redirect("/auth/login");

  const createdAt = data.user.created_at ?? data.profile.createdAt;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div
            className="grid size-16 shrink-0 place-items-center rounded-full border bg-muted text-xl font-semibold"
            aria-label="Profile initials"
          >
            {initials(data.profile.fullName, data.user.email)}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">Profile</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage the personal details and timezone WatchFlow uses for you.
            </p>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2 sm:gap-x-8">
              <div>
                <dt className="text-muted-foreground">Account email</dt>
                <dd className="break-all font-medium">
                  {data.user.email ?? "Email unavailable"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Account created</dt>
                <dd className="font-medium">
                  {createdAt
                    ? formatUserDate(
                        createdAt,
                        data.profile.timezone,
                        data.preferences.dateFormat,
                      )
                    : "Unavailable"}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-6 border-t pt-6">
          <ProfileSettingsForm profile={data.profile} />
        </div>
      </section>

      <aside className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Profile photos are not available yet. WatchFlow uses your initials in
        the meantime.
      </aside>
    </div>
  );
}
