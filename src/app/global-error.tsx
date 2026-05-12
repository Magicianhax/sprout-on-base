"use client";

import { useEffect } from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// Fallback for errors that bubble all the way out of the root layout.
// Must render its own <html>/<body> since it replaces the layout.
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[sprout] global error", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "linear-gradient(180deg, #E8F5E9 0%, #FFF8E1 40%, #FFFFFF 100%)",
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.25rem",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt=""
            width={72}
            height={72}
            style={{
              marginBottom: "0.75rem",
              borderRadius: 16,
              boxShadow: "0 4px 24px rgba(76,175,80,0.2)",
            }}
          />
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1a1a2e", margin: 0 }}>
            Sprout hit a snag
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#6B7280",
              marginTop: "0.5rem",
              lineHeight: 1.5,
            }}
          >
            Something broke before the app could load. Your funds are safe —
            try reloading.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.75rem 1.5rem",
              borderRadius: "18px",
              background: "linear-gradient(135deg, #4CAF50 0%, #66BB6A 100%)",
              color: "white",
              fontWeight: 700,
              fontSize: "0.875rem",
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
