import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ??
  "https://gaiasenses-web.vercel.app";

/**
 * The site had no robots.txt, so crawlers were left to guess — including about
 * preview deployments, which are public (deployment protection is off so
 * musicians can audition patch PRs without an account).
 *
 * A preview indexed alongside production would compete with it in search results
 * and expose work in progress as if it were the project. Vercel sets
 * NEXT_PUBLIC_VERCEL_ENV, so previews and local builds say "index nothing" and
 * only production invites crawlers.
 */
export default function robots(): MetadataRoute.Robots {
  const ehProducao = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";

  if (!ehProducao) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /controller depends on a socket server that no longer answers, and
      // /gaiaball is a sensor debugging surface. Neither is something to send a
      // visitor arriving from a search engine into.
      disallow: ["/api/", "/pt/controller", "/en/controller", "/pt/gaiaball", "/en/gaiaball"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
