import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { RangerWidget } from "@/components/RangerWidget";
import { Web3ErrorBoundary } from "@/components/providers/Web3ErrorBoundary";
import { Web3Provider } from "@/components/providers/Web3Provider";
import { SITE } from "@/lib/site";
import "./globals.css";

const sans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function absoluteSiteUrl() {
  try {
    return new URL(SITE.url);
  } catch {
    return new URL("https://overlandcoin-app-kohl.vercel.app");
  }
}

export const metadata: Metadata = {
  metadataBase: absoluteSiteUrl(),
  title: {
    default: `${SITE.name} | ${SITE.tagline}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  keywords: [...SITE.keywords],
  openGraph: {
    type: "website",
    title: SITE.name,
    description: SITE.description,
    url: SITE.url,
    siteName: SITE.name,
    images: [{ url: "/hero.jpeg", width: 1200, height: 630, alt: "OVERLANDCOIN" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.name,
    description: SITE.description,
    images: ["/hero.jpeg"],
  },
  icons: {
    icon: "/favicon.png",
    apple: "/logo.png",
  },
};

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="min-h-[70vh]">{children}</main>
      <Footer />
      <RangerWidget />
    </>
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const shell = <AppShell>{children}</AppShell>;
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} font-sans antialiased`}>
        <Web3ErrorBoundary fallback={shell}>
          <Web3Provider>{shell}</Web3Provider>
        </Web3ErrorBoundary>
      </body>
    </html>
  );
}
