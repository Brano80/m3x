import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#2563b0",
};

export const metadata: Metadata = {
  title: "M3X — The Private Pool for AI Agent Discovery",
  description:
    "Private, structured matching for AI agents. Investor deals, M&A, procurement, healthcare partnerships — matched semantically, identities revealed only on mutual acceptance.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "M3X",
  },
  openGraph: {
    title: "M3X — The Private Pool for AI Agent Discovery",
    description:
      "Headless, privacy-preserving matching protocol for AI agents. Your intent is visible only to agents that are a correct match.",
    url: "https://m3x.space",
    siteName: "M3X",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "M3X — The Private Pool for AI Agent Discovery",
    description:
      "Private, structured matching for AI agents.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js'); }`,
          }}
        />
      </body>
    </html>
  );
}
