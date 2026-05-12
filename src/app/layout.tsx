import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { WalletProvider } from "@/lib/wallet";
import { LifiSdkProvider } from "@/components/providers/LifiSdkProvider";
import { ThemeSync } from "@/components/providers/ThemeSync";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sprout — Earn on Base",
  description:
    "A savings app on Base. One-tap deposits into the best Base yield vaults via LI.FI Earn.",
  icons: {
    icon: [
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon-32.png",
    apple: [
      { url: "/icon-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    title: "Sprout — Earn on Base",
    description:
      "A savings app on Base. One-tap deposits into the best Base yield vaults via LI.FI Earn.",
    images: ["/icon-512.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sprout — Earn on Base",
    description:
      "A savings app on Base. One-tap deposits into the best Base yield vaults via LI.FI Earn.",
    images: ["/icon-512.png"],
  },
  // Base.dev registration identifier. Public; rendered as <meta> in
  // <head> so Base App can match this deployment to the registered
  // Sprout entry. Fixed per app — if you fork sprout-base, replace
  // this with your own ID from base.dev > Settings.
  other: {
    "base:app_id": "6a0378cf7651490b2dee3644",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#4CAF50",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Static theme-init script served from /public — applies the
            dark class before React hydrates so the first paint matches
            the saved preference (no flash of light mode). */}
        <script src="/theme-init.js" async={false} />
      </head>
      <body className="font-body bg-sprout-gradient min-h-dvh">
        <WalletProvider>
          <LifiSdkProvider>
            <ThemeSync />
            {children}
          </LifiSdkProvider>
        </WalletProvider>
        <Analytics />
      </body>
    </html>
  );
}
