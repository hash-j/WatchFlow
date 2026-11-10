import type { Metadata } from "next";
import Link from "next/link";

import { InformationPage, SupportContactLink } from "@/components/public-information";

export const metadata: Metadata = { title: "Help & contact" };

export default function SupportPage() {
  return (
    <InformationPage title="Help & contact" summary="Account help, privacy requests and support information for WatchFlow.">
      <section><h2>Operator and support contact</h2><p>Operator name: WatchFlow.</p><p>Public support contact: <SupportContactLink />.</p><p>Use this contact for account-access problems, privacy/data requests, deletion help or bug reports. Do not send passwords, verification codes, authentication tokens or private exported files in a support request.</p></section>
      <section><h2>Account access</h2><p><Link href="/auth/login">Log in</Link> to your existing account. If you cannot sign in, use <Link href="/auth/forgot-password">password recovery</Link>. For privacy questions, read the <Link href="/privacy">Privacy Policy</Link>.</p></section>
      <section><h2>Exports and deletion</h2><p>You can export data or delete your account from the web app without installing a mobile app. See <Link href="/data-deletion">Account & data deletion</Link> for the steps, including what to do before deleting a Google-connected account. If recovery does not restore access, use the support contact above for deletion assistance.</p></section>
    </InformationPage>
  );
}
