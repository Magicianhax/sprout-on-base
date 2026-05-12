import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ["Gabarito", "sans-serif"],
        body: ["Figtree", "sans-serif"],
      },
      colors: {
        sprout: {
          green: {
            primary: "#4CAF50",
            dark: "#2E7D32",
            light: "#E8F5E9",
            DEFAULT: "#4CAF50",
          },
          amber: {
            warm: "#FFF8E1",
            dark: "#B45309",
          },
          red: {
            stop: "#EF4444",
          },
          text: {
            primary: "#1a1a2e",
            secondary: "#6B7280",
            muted: "#9CA3AF",
          },
          card: "#FFFFFF",
          border: "#E5E7EB",
        },
      },
      borderRadius: {
        card: "24px",
        button: "18px",
        pill: "20px",
        input: "14px",
      },
      boxShadow: {
        card: "0 4px 24px rgba(76,175,80,0.1)",
        subtle: "0 2px 12px rgba(0,0,0,0.04)",
        glow: "0 4px 16px rgba(76,175,80,0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
