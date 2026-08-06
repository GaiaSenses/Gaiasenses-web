import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  "https://gaiasenses-web.vercel.app";

const LOCALES = ["pt", "en"] as const;

/**
 * Only the two pages a visitor should land on: the locale entry, which redirects
 * into the app, and the app itself. /gaiaball is deliberately absent for the
 * same reason robots.ts excludes it.
 *
 * Each entry declares the other language through `alternates.languages`, so a
 * search engine can serve whichever one the reader wants instead of guessing.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const idiomas = Object.fromEntries(
    LOCALES.map((l) => [l, `${SITE_URL}/${l}/map3`]),
  );

  return LOCALES.flatMap((locale) => [
    {
      url: `${SITE_URL}/${locale}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
      alternates: { languages: idiomas },
    },
    {
      url: `${SITE_URL}/${locale}/map3`,
      changeFrequency: "daily" as const,
      priority: 1,
      alternates: { languages: idiomas },
    },
  ]);
}
