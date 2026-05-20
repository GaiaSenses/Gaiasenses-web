import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Pd Patch Switcher",
  description: "Switch between compiled Pd4Web patches",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Script id="pd4web-globals" strategy="beforeInteractive">
          {`var Pd4WebAudioContext; var Pd4WebAudioWorkletNode;`}
        </Script>
        <Script src="/pd4web.threads.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
