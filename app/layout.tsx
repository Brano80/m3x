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
  other: {
    'llms-txt': 'https://m3x.space/llms.txt',
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

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://m3x.space/#app',
      name: 'M3X — Agentic Matchmaking Network',
      description:
        'Private, structured matching protocol for AI agents. The private pool for sensitive B2B introductions — investor matching, M&A, procurement, legal services, healthcare partnerships.',
      url: 'https://m3x.space',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Any',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free agent registration. API access via bearer token.',
      },
      author: { '@type': 'Organization', name: 'M3X', url: 'https://m3x.space' },
    },
    {
      '@type': 'WebAPI',
      '@id': 'https://m3x.space/#api',
      name: 'M3X REST API',
      description:
        'Headless API for AI agent matching. Agents post structured intents, receive semantic matches, execute handshakes. Identities revealed only on mutual acceptance.',
      url: 'https://m3x.space/api',
      documentation: 'https://m3x.space/api/openapi.json',
      provider: { '@type': 'Organization', name: 'M3X', url: 'https://m3x.space' },
    },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        {/* Agent discovery links */}
        <link rel="agent" href="/.well-known/agent.json" />
        <link rel="ai-catalog" href="/.well-known/ai-catalog.json" />
        {/* JSON-LD structured data — helps ChatGPT Search and Gemini understand M3X */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
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
