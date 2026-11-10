import type { Metadata } from "next";
import Link from "next/link";

import { InformationPage, SupportContactLink } from "@/components/public-information";

export const metadata: Metadata = { title: "Account & data deletion" };

export default function DataDeletionPage() {
  return (
    <InformationPage title="Account & data deletion" summary="Delete your WatchFlow account or just your movie library from your browser. No mobile installation is needed.">
      <section><h2>Before deleting</h2><p>Download any CSV or JSON export you want to keep from <Link href="/settings/data">Settings → Data & Account</Link>. Deletion is permanent.</p><p>If Google Calendar is connected, open <Link href="/settings/calendar">Settings → Calendar</Link>, disconnect and wait for the cleanup to complete before deleting your account if you want WatchFlow&apos;s calendar events removed. Turning sync off alone does not remove existing events. If cleanup fails, use Google Calendar to remove those events and your Google Account&apos;s connected-app controls to revoke access.</p></section>
      <section><h2>Delete your account</h2><ol><li><Link href="/auth/login">Log in</Link> to the account you want to delete. You must have signed in within the last 30 minutes; sign out and back in if asked.</li><li>Open <Link href="/settings/data">Settings → Data & Account</Link> and choose <strong>Review permanent account deletion</strong>.</li><li>Type <strong>DELETE</strong>, check the permanent-deletion acknowledgement and submit the deletion.</li><li>Successful deletion signs you out and returns you to the homepage. If an error is shown, deletion has not been confirmed; follow the message or seek <Link href="/support">support</Link>.</li></ol></section>
      <section><h2>What is removed and what remains</h2><p>The account-deletion flow removes owned artwork and your sign-in account, with associated private profile, preferences, library, ratings, reviews, lists, queue, schedules, notifications, push-subscription records and local calendar-connection data removed through account relationships. Shared movie catalogue information remains available to other users.</p><p>Deleting a WatchFlow account alone does not guarantee deletion of Google Calendar events or revoke authorization at Google. Browser permissions, notifications already displayed, exports you downloaded and copies at external providers are not removed from your device or those services by this action. Backups and operational logs may persist separately as described in the <Link href="/privacy">Privacy Policy</Link>.</p></section>
      <section><h2>Delete only your library</h2><p>In <Link href="/settings/data">Settings → Data & Account</Link>, use the library-deletion control and type <strong>DELETE MOVIES</strong>. This removes your library relationships and associated membership/schedule information; it keeps your account, profile, preferences and custom list containers. It does not delete shared catalogue movies. Calendar cleanup may require background processing.</p></section>
      <section><h2>If you cannot sign in</h2><p>Try <Link href="/auth/forgot-password">password recovery</Link> first. If you still need assistance, email <SupportContactLink /> or see <Link href="/support">Help & contact</Link>.</p></section>
    </InformationPage>
  );
}
