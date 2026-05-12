import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "icons.llamao.fi" },
      { protocol: "https", hostname: "assets.coingecko.com" },
      { protocol: "https", hostname: "s2.coinmarketcap.com" },
    ],
  },
  // The Base Account sign-in flow opens a popup to keys.coinbase.com.
  // COOP must allow same-origin popups — `same-origin` (the strict
  // default that some hosts apply) breaks the popup and the user
  // sees the sign-in window freeze. `same-origin-allow-popups` keeps
  // the cross-origin isolation guarantees we want for everything
  // else while letting the wallet popup function.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
