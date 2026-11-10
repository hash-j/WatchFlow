import type { Metadata } from "next";
import Link from "next/link";

import { InformationPage, SupportContactLink } from "@/components/public-information";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <InformationPage title="Privacy Policy" summary="How WatchFlow uses information to provide your private movie workspace.">
      <section>
        <h2>Who operates WatchFlow</h2>
        <p>The operator name is WatchFlow. For support, privacy questions or a data request, email <SupportContactLink /> or see <Link href="/support">Help & contact</Link>.</p>
      </section>
      <section>
        <h2>Account and movie information</h2>
        <p>We use your email and authentication information to create and secure your account and send verification or password-recovery emails. Supabase Auth handles authentication. Your profile may contain your name, country, timezone and optional profile picture.</p>
        <p>WatchFlow stores the movies you add, statuses, favourites, ratings, reviews, watched dates, Watch Next order, private lists, list covers, schedule times and notes, and display, search and notification preferences. Imported movie rows are processed to match movies and save the choices you confirm. These records provide your library, recommendations, statistics and other account views.</p>
        <p>Uploaded profile and list artwork is validated and re-encoded before storage in private Supabase Storage. Personal library records and artwork are associated with your account; they are not published as a public profile or shared list.</p>
      </section>
      <section>
        <h2>Movie search and external links</h2>
        <p>Movie searches and metadata lookups are sent from our server to The Movie Database (TMDB), using your search terms and relevant search preferences. Shared movie metadata is stored separately from your personal library. Poster requests go to TMDB image services, sometimes through our image optimizer; direct image requests expose normal request information such as your IP address to that service.</p>
        <p>Trailer links open YouTube when selected. Those sites apply their own privacy policies. See <Link href="/about">About & credits</Link> for TMDB attribution.</p>
      </section>
      <section>
        <h2>Optional Google Calendar connection</h2>
        <p>If you connect Google Calendar, Google supplies your account identifier, verified email and authorization grant. The requested permissions include identity, email and calendar event access. WatchFlow stores connection details, encrypted refresh credentials and mappings for its movie events, and uses short-lived access tokens to synchronize those events with your primary Google calendar.</p>
        <p>The integration creates, reads, updates or deletes the WatchFlow movie events needed for synchronization. It does not import your general calendar into your movie library. Event information sent to Google includes the movie title, scheduled time, timezone and viewing duration. Google data is used for this connection and synchronization, not advertising or training AI models.</p>
        <p>WatchFlow&apos;s use and transfer of information received from Google APIs follows the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including its Limited Use requirements. You can turn synchronization off or disconnect in <Link href="/settings/calendar">Settings → Calendar</Link>, and revoke access through your Google Account. Read the <Link href="/data-deletion">deletion guidance</Link> before deleting a connected WatchFlow account.</p>
      </section>
      <section>
        <h2>Notifications and reminders</h2>
        <p>WatchFlow stores account notifications and their read state. If you enable browser push, it stores your browser&apos;s push endpoint, subscription keys, expiry information and browser user-agent metadata to send encrypted notifications through the browser&apos;s push service. Notifications can contain movie titles and activity or reminder details and may appear on your lock screen.</p>
        <p>Notification preferences and browser permissions are under your control. Scheduled reminders and calendar processing depend on the deployment&apos;s background delivery configuration; delivery is not guaranteed. Where configured, Upstash QStash triggers background processing and handles delivery metadata.</p>
      </section>
      <section>
        <h2>Cookies, local storage and service providers</h2>
        <p>Authentication uses cookies to keep you signed in. Short-lived cookies also support verification and authorization flows. Your browser stores your color-theme choice. The service worker caches public static files and a generic offline page, not your private library pages or account data.</p>
        <p>This release includes no advertising network or third-party analytics integration. Vercel hosting, Supabase database/Auth/Storage, configured authentication-email delivery, TMDB, Google when connected, and browser push services process information needed for the functions described above. Hosting and delivery providers may also process IP addresses, request metadata and security or operational logs. This operational processing is separate from analytics.</p>
      </section>
      <section>
        <h2>Retention, security and your choices</h2>
        <p>Account data is kept to provide your workspace until you remove it or delete your account. You can edit your profile, remove artwork or movies, change preferences, and export CSV or JSON from <Link href="/settings/data">Settings → Data & Account</Link>. Follow <Link href="/data-deletion">Account & data deletion</Link> to remove an account or just its library.</p>
        <p>Deletion removes active account records and owned artwork through the account-deletion flow. Shared movie catalogue records remain. Downloads you saved, notifications already displayed and events already held by Google are separate copies. Provider backups and operational logs may persist separately; the application does not define a fixed retention period for those systems. Ask WatchFlow for the applicable retention details at <SupportContactLink />.</p>
        <p>Access controls, private storage and encrypted calendar credentials help protect account data. No online system can promise absolute security. Changes to these practices will be reflected on this page with an updated date.</p>
      </section>
    </InformationPage>
  );
}
