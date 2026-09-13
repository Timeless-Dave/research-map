import type { Metadata } from "next";
// Self-hosted rather than next/font/google: production builds must not depend
// on fonts.googleapis.com being reachable. The `geist` package ships the same
// typefaces as local woff2 files.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "UAPB Campus Research Map",
  description: "Interactive campus research map for the University of Arkansas at Pine Bluff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning prevents false positives from browser extensions injecting attributes */}
      <body className="h-full overflow-hidden" suppressHydrationWarning>{children}</body>
    </html>
  );
}
