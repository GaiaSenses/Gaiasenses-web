import "../globals.css";
import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { NextIntlClientProvider, useMessages } from "next-intl";
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

export const metadata: Metadata = {
  title: "GaiaSenses",
  description: "Web version of GaiaSensesApp",
};

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
