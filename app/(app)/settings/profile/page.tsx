import { redirect } from "next/navigation";

import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { createClient } from "@/lib/supabase/server";
import { supportsPasswordChange } from "@/lib/auth/change-password";
import { UserAvatar } from "@/components/artwork/user-avatar";
import { ArtworkEditor } from "@/components/artwork/artwork-editor";
import { ownsArtworkPath } from "@/lib/artwork/paths";
import { formatUserDate } from "@/lib/settings/formatting";
import { getSettingsPageData } from "@/lib/settings/supabase-settings";

export default async function ProfileSettingsPage() {
  const data = await getSettingsPageData();
  if (!data) redirect("/auth/login");
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || user.id !== data.user.id) redirect("/auth/login");

  const createdAt = data.user.created_at ?? data.profile.createdAt;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <UserAvatar ownerId={user.id} path={data.profile.avatarUrl} name={data.profile.fullName} email={data.user.email} className="size-16 text-xl" />
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
          <ArtworkEditor target={{ kind: "avatar" }} hasImage={ownsArtworkPath(data.profile.avatarUrl, user.id, { kind: "avatar" })} />
        </div>
        <div className="mt-6 border-t pt-6">
          <ProfileSettingsForm profile={data.profile} />
        </div>
      </section>

      <ChangePasswordForm passwordAccount={supportsPasswordChange(user)} />
    </div>
  );
}
