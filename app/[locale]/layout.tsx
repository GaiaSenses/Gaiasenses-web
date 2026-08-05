import "../globals.css";
import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { NextIntlClientProvider, useMessages } from "next-intl";
import { getTranslations } from "next-intl/server";
import Script from "next/script";
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

// const poppins = Poppins({
//   subsets: ["latin"],
//   variable: "--font-poppins",
//   weight: "400",
// });

/**
 * Canonical origin, used to turn the relative paths below into the absolute URLs
 * that Open Graph requires. Override with NEXT_PUBLIC_SITE_URL if the site moves
 * to its own domain — the value has to be the address people actually share, not
 * the per-deployment Vercel URL, or every preview would advertise itself as the
 * canonical one.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  "https://gaiasenses-web.vercel.app";

const OUTRO_LOCALE: Record<string, string> = { pt: "en", en: "pt" };

/**
 * Until now the whole site described itself as "Web version of GaiaSensesApp",
 * with no Open Graph tags at all — so a shared link rendered as a bare URL with
 * no title, summary or image. That matters here more than for most sites: this is
 * how the project reaches people who have not seen it, and preview links get
 * passed around during patch review.
 *
 * Both languages get their own title and description, and hreflang points each at
 * the other so a search engine can offer the right one.
 */
export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "Index.meta" });
  const title = t("title");
  const description = t("description");
  const outro = OUTRO_LOCALE[locale] ?? "en";

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    applicationName: "GaiaSenses",
    alternates: {
      canonical: `/${locale}/map3`,
      languages: {
        [locale]: `/${locale}/map3`,
        [outro]: `/${outro}/map3`,
      },
    },
    openGraph: {
      type: "website",
      siteName: "GaiaSenses",
      title,
      description,
      url: `/${locale}/map3`,
      locale: locale === "pt" ? "pt_BR" : "en_US",
      images: [{ url: "/icon.png", width: 500, height: 500, alt: "GaiaSenses" }],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: ["/icon.png"],
    },
  };
}

export default function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const msg = useMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${montserrat.className}`} id="the-container">
        {/* <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
        </ThemeProvider> */}
        <Script id="pd4web-globals" strategy="beforeInteractive">
          {`var Pd4WebAudioContext; var Pd4WebAudioWorkletNode;`}
        </Script>
        <Script
          src="/pd4webShared/pd4web.threads.js"
          strategy="beforeInteractive"
        />
        <NextIntlClientProvider locale={locale} messages={msg}>
          {children}
        </NextIntlClientProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
