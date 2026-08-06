import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";

/**
 * next-intl request configuration.
 *
 * This file used to be `./i18n.ts` at the repository root. `createNextIntlPlugin()`
 * looks for `./i18n/request.ts` by default and only falls back to the old path,
 * with a deprecation warning, so moving it here is what the plugin already
 * expects — and one less thing to change when next-intl 4 removes the fallback.
 *
 * The callback also stopped taking `locale` directly. It receives `requestLocale`,
 * a promise, because the locale is resolved per request rather than passed in.
 * The returned config must now name the `locale` it resolved to; without it,
 * next-intl cannot tell which one was chosen.
 *
 * `requestLocale` can be undefined — a request that does not match a locale
 * segment reaches this file with nothing to work from — so the check below
 * covers both an unknown locale and a missing one.
 */
const locales = ["en", "pt"];

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  if (!requested || !locales.includes(requested)) notFound();

  return {
    locale: requested,
    messages: (await import(`../messages/${requested}.json`)).default,
  };
});
