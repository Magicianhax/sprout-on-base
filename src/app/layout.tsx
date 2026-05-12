import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { WalletProvider } from "@/lib/wallet";
import { LifiSdkProvider } from "@/components/providers/LifiSdkProvider";
import { ThemeSync } from "@/components/providers/ThemeSync";
import { ServiceWorkerRegister } from "@/components/providers/ServiceWorkerRegister";
import { InstallPrompt } from "@/components/providers/InstallPrompt";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sprout — Earn on Base",
  description:
    "A savings app on Base. One-tap deposits into the best Base yield vaults via LI.FI Earn.",
  manifest: "/manifest.json",
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
        <meta
          name="talentapp:project_verification"
          content="84c63c64fe80e869e4174e6cb0da0a437030b315c71af4ab030e62b26292a935e7a9c845736939fb739c8ccbd9928eb3209330b15d8084e2a736e94b9fa77279"
        />
        {/* Static theme-init script served from /public — applies the
            dark class before React hydrates so the first paint matches
            the saved preference (no flash of light mode). */}
        <script src="/theme-init.js" async={false} />
      </head>
      <body className="font-body bg-sprout-gradient min-h-dvh">
        <WalletProvider>
          <LifiSdkProvider>
            <ThemeSync />
            <ServiceWorkerRegister />
            <InstallPrompt />
            {children}
          </LifiSdkProvider>
        </WalletProvider>
        <Analytics />
      </body>
    </html>
  );
}
