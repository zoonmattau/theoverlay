import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";

import { Suspense } from "react";

import Image from "next/image";
import { LaunchOffer } from "@/components/LaunchOffer";
import { HorseSearch } from "@/components/HorseSearch";
import { PageView } from "@/components/PageView";
import { MetaPixel } from "@/components/MetaPixel";
import { NavUser } from "@/components/NavUser";
import { SocialLinks } from "@/components/SocialLinks";
import { BRAND_SOCIAL } from "@/lib/social";
import { TopbarOffset } from "@/components/TopbarOffset";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const plex = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://theoverlay.com.au"),
  title: {
    default: "The Overlay: data-driven racing tips",
    template: "%s · The Overlay",
  },
  description:
    "Benchmark ratings, a pace map and a rated price for every runner in Australian racing.",
  openGraph: {
    title: "The Overlay",
    description: "The market has an opinion. We have the data.",
    url: "https://theoverlay.com.au",
    siteName: "The Overlay",
    locale: "en_AU",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "The Overlay", description: "The market has an opinion. We have the data." },
  keywords: ["horse racing tips", "Australian racing ratings", "rated prices", "overlay betting", "Saturday racing tips", "benchmark ratings"],
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
};

const NAV = [
  { href: "/", label: "Today" },
  { href: "/tips", label: "Tips" },
  { href: "/pricing", label: "Pricing" },
  { href: "/tipsters", label: "Tipsters" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-AU"
      className={`${archivo.variable} ${plex.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <MetaPixel />
          <PageView />
        </Suspense>
        <TopbarOffset />
        <header className="site-head">
        <nav className="topbar" aria-label="Main navigation">
          <Link href="/" className="topbar-brand">
            <Image
              src="/brand/lockup-dark.png"
              alt="The Overlay"
              width={1252}
              height={322}
              priority
              className="h-10 w-auto"
            />
          </Link>
          <HorseSearch />
          <div className="topbar-links">
            <Suspense
              fallback={NAV.map((item) => (
                <Link key={item.href} href={item.href} className="topbar-link">
                  {item.label}
                </Link>
              ))}
            >
              <NavUser links={NAV} />
            </Suspense>
          </div>
        </nav>
        <Suspense fallback={null}>
          <LaunchOffer />
        </Suspense>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-line mt-16 bg-panel">
          <div className="page py-8 text-xs text-ink-soft space-y-4">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Link href="/method" className="hover:text-ink-secondary">How it works</Link>
              <Link href="/faq" className="hover:text-ink-secondary">Questions</Link>
              <Link href="/tipsters" className="hover:text-ink-secondary">Tipsters</Link>
              <Link href="/responsible-gambling" className="hover:text-ink-secondary">
                Responsible gambling
              </Link>
              <Link href="/terms" className="hover:text-ink-secondary">Terms</Link>
              <Link href="/privacy" className="hover:text-ink-secondary">Privacy</Link>
              <Link href="/invite" className="hover:text-ink-secondary">Invite a friend</Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <SocialLinks discord={BRAND_SOCIAL.discord} instagram={BRAND_SOCIAL.instagram} twitter={BRAND_SOCIAL.twitter} labels />
              <span>
                Contact{" "}
                <a href="mailto:hello@theoverlay.com.au" className="text-ink hover:text-blue">
                  hello@theoverlay.com.au
                </a>
              </span>
            </div>

            <p className="max-w-3xl leading-relaxed">
              The Overlay publishes opinion and statistical analysis, not financial advice, and no outcome is guaranteed.
            </p>

            <p>
              18+ only. Gamble responsibly. Set a deposit limit. Chances are you&apos;re
              about to lose. For free and confidential support call{" "}
              <span className="text-ink">1800 858 858</span> or visit{" "}
              <a
                href="https://www.gamblinghelponline.org.au"
                className="text-ink underline underline-offset-2 hover:text-blue"
                rel="noopener noreferrer"
                target="_blank"
              >
                gamblinghelponline.org.au
              </a>
              .
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
