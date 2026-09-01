import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
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
    return new URL("https://overlandcoin-app.vercel.app");
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} font-sans antialiased`}>
        <Header />
        <main className="min-h-[70vh]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
