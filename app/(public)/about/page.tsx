import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { InformationPage, SupportContactLink } from "@/components/public-information";

export const metadata: Metadata = { title: "About & credits" };

export default function AboutPage() {
  return (
    <InformationPage title="About & credits" summary="WatchFlow helps you organize movies in a private library, choose what to watch next and plan movie nights.">
      <section><h2>Movie data and images</h2><a href="https://www.themoviedb.org/" className="inline-block py-3" aria-label="The Movie Database (TMDB)"><Image src="/brand/tmdb-logo.svg" width={489} height={35} unoptimized alt="The Movie Database (TMDB)" className="h-auto w-40 max-w-full" /></a><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p><p>Movie metadata and poster images are supplied through TMDB. The TMDB logo is displayed in its original colors and proportions. Movie data and images remain subject to their respective owners&apos; rights. Trailer links open YouTube.</p></section>
      <section><h2>Fonts and service information</h2><p>WatchFlow uses Geist, licensed under the <a href="/licenses/geist-OFL.txt">SIL Open Font License</a>. The <Link href="/privacy">Privacy Policy</Link> describes the services used to operate WatchFlow. For account help, email <SupportContactLink /> or visit <Link href="/support">Help & contact</Link>.</p></section>
    </InformationPage>
  );
}
