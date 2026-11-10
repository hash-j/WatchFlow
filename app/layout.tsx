import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "next-themes";

import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { PublicFooter } from "@/components/public-information";

import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: {
    default: "WatchFlow",
    template: "%s | WatchFlow",
  },
  description: "A private workspace for organizing what you want to watch.",
  applicationName: "WatchFlow",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/watchflow-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/watchflow-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/watchflow-apple-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WatchFlow",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

const geistSans = localFont({
  src: "./fonts/geist-latin.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-geist-sans",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <PublicFooter />
        </ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
