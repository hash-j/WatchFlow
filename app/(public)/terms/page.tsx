import type { Metadata } from "next";
import Link from "next/link";

import { InformationPage, SupportContactLink } from "@/components/public-information";

export const metadata: Metadata = { title: "Terms & acceptable use" };

export default function TermsPage() {
  return (
    <InformationPage title="Terms & acceptable use" summary="Simple rules for using WatchFlow, a private movie organizer operated under the name WatchFlow.">
      <section><h2>Using the service</h2><p>Use WatchFlow to organize your own movie information. WatchFlow v1.0 manages movies; it does not stream films or provide viewing rights. Keep your sign-in details secure and use only accounts and information you are authorized to access.</p></section>
      <section><h2>Acceptable use</h2><ul><li>Do not access another person&apos;s private data, bypass access controls, abuse authentication or interfere with the service.</li><li>Do not upload unlawful material, malware or artwork you do not have permission to use.</li><li>Do not scrape or automate requests in a way that bypasses limits, overloads WatchFlow or violates a provider&apos;s terms.</li><li>Do not use WatchFlow to infringe someone else&apos;s rights or misrepresent affiliation with WatchFlow or its data providers.</li></ul></section>
      <section><h2>Your content and provider content</h2><p>You remain responsible for the reviews, notes and artwork you supply. WatchFlow processes that content to operate your private workspace; this does not transfer ownership of your content to WatchFlow. Movie metadata, posters, trailers and third-party marks remain subject to their owners&apos; rights and applicable provider terms. See <Link href="/about">About & credits</Link>.</p></section>
      <section><h2>Availability and optional integrations</h2><p>Features depend on internet access and external services and may be unavailable or change. Search results, metadata, schedules, calendar synchronization and notifications may be delayed or inaccurate. Reminders are a convenience and are not a guaranteed alert service. Keep a separate copy of information you need; private exports are available in Settings.</p></section>
      <section><h2>Privacy, leaving and support</h2><p>The <Link href="/privacy">Privacy Policy</Link> describes information processing. You can stop using WatchFlow and follow the <Link href="/data-deletion">account-deletion instructions</Link> at any time. For support, email <SupportContactLink /> or visit <Link href="/support">Help & contact</Link>. Material changes to these rules will be posted here with an updated date.</p></section>
    </InformationPage>
  );
}
