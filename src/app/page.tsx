"use client";

import { usePrivy } from "@/lib/wallet";
import { SignInWithBaseButton } from "@base-org/account-ui/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Sparkles, ShieldCheck, Zap } from "lucide-react";
import { SproutLogo } from "@/components/ui/SproutLogo";
import { loadPreferences } from "@/stores/preferences";

export default function LandingPage() {
  const { login, ready, authenticated } = usePrivy();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && authenticated) {
      const prefs = loadPreferences();
      router.replace(prefs.onboardingComplete ? "/home" : "/onboarding");
    }
  }, [ready, authenticated, router]);

  async function handleSignIn() {
    setSignInError(null);
    setSigningIn(true);
    try {
      await login();
      // The useEffect above handles the redirect once `authenticated`
      // flips to true on the next render.
    } catch (err) {
      // User cancelled, popup blocked, or wallet returned an error.
      // We surface the message inline rather than a toast so the user
      // can see exactly what to retry.
      const message =
        err instanceof Error ? err.message : "Sign in failed. Please try again.";
      setSignInError(message);
    } finally {
      setSigningIn(false);
    }
  }

  // Loading / auto-redirect splash — shown while Privy is booting
  // OR while we're redirecting an authenticated user to /home.
  if (!ready || authenticated) {
    return (
      <main className="flex flex-col items-center justify-center min-h-dvh px-5 bg-sprout-gradient">
        <div className="relative">
          <div className="absolute inset-0 rounded-[32px] bg-sprout-green-primary/25 blur-2xl sprout-glow" />
          <SproutLogo
            size={112}
            className="relative shadow-glow sprout-pulse rounded-[28px]"
          />
        </div>
        <h1 className="font-heading text-4xl font-800 text-sprout-green-dark text-center mt-8">
          sprout
        </h1>
        <div className="flex gap-1.5 mt-6">
          <span className="w-2 h-2 rounded-full bg-sprout-green-primary dot-pulse" style={{ animationDelay: "0s" }} />
          <span className="w-2 h-2 rounded-full bg-sprout-green-primary dot-pulse" style={{ animationDelay: "0.2s" }} />
          <span className="w-2 h-2 rounded-full bg-sprout-green-primary dot-pulse" style={{ animationDelay: "0.4s" }} />
        </div>
        <style>{`
          @keyframes sprout-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
          .sprout-pulse { animation: sprout-pulse 2.4s ease-in-out infinite; }
          @keyframes sprout-glow { 0%,100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 0.9; transform: scale(1.15); } }
          .sprout-glow { animation: sprout-glow 2.4s ease-in-out infinite; }
          @keyframes dot-pulse { 0%,100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
          .dot-pulse { animation: dot-pulse 1.2s ease-in-out infinite; }
        `}</style>
      </main>
    );
  }

  return (
    <main className="relative flex flex-col min-h-dvh bg-sprout-gradient overflow-hidden">
      {/* Ambient blurred gradient blobs — adds depth without assets. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 rounded-full bg-sprout-green-primary/20 blur-[96px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -right-24 w-[28rem] h-[28rem] rounded-full bg-sprout-green-light/40 blur-[112px]"
      />

      {/* Top wordmark — anchors the brand in the top-left so the
          hero section has a reference point instead of floating
          mid-screen. */}
      <div className="relative flex items-center gap-2 px-5 pt-6">
        <SproutLogo
          size={32}
          decorative
          className="shadow-subtle rounded-lg"
        />
        <span className="font-heading text-lg font-800 text-sprout-green-dark">
          sprout
        </span>
      </div>

      {/* Hero — centered vertically in the remaining space. */}
      <section className="relative flex-1 flex flex-col items-center justify-center px-5 text-center">
        <div className="relative mb-8 landing-rise">
          <div className="absolute inset-0 rounded-[36px] bg-sprout-green-primary/30 blur-3xl" />
          <SproutLogo
            size={128}
            className="relative shadow-glow rounded-[32px]"
          />
        </div>

        <h1 className="font-heading text-[44px] leading-[1.05] font-900 text-sprout-text-primary landing-rise-delay-1">
          Your money,
          <br />
          <span className="text-sprout-green-dark">growing every day.</span>
        </h1>

        <p className="font-body text-base text-sprout-text-secondary mt-4 max-w-[320px] leading-relaxed landing-rise-delay-2">
          Earn on your crypto as easily as opening a savings account. One tap
          to start. No DeFi jargon.
        </p>

        {/* Feature strip — three actual product truths, no fake stats. */}
        <div className="flex items-center gap-4 mt-8 landing-rise-delay-3">
          <Feature icon={<Zap size={14} />} label="One tap" />
          <Feature icon={<ShieldCheck size={14} />} label="Non-custodial" />
          <Feature icon={<Sparkles size={14} />} label="Base-native" />
        </div>
      </section>

      {/* CTA docked near the bottom so it's reachable without a stretch.
          Uses Base's official Sign In With Base button — required by
          Base brand guidelines for any registered Base App, and gives
          users the wallet-recognition cue they're used to. */}
      <div className="relative px-5 pb-10 pt-4 landing-rise-delay-4">
        <div className="w-full max-w-[400px] mx-auto flex flex-col items-center gap-3">
          <SignInWithBaseButton
            colorScheme="light"
            size="large"
            variant="solid"
            onClick={handleSignIn}
            disabled={signingIn || !ready}
          />
          {signInError && (
            <p className="text-center text-[12px] text-red-600 max-w-[320px]">
              {signInError}
            </p>
          )}
        </div>
        <p className="text-center text-[11px] text-sprout-text-muted mt-5">
          Powered by <span className="font-bold">Base</span> &amp;{" "}
          <span className="font-bold">LI.FI</span>
        </p>
      </div>

      <style>{`
        @keyframes landing-rise {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .landing-rise { animation: landing-rise 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) both; }
        .landing-rise-delay-1 { animation: landing-rise 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) 0.08s both; }
        .landing-rise-delay-2 { animation: landing-rise 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) 0.16s both; }
        .landing-rise-delay-3 { animation: landing-rise 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) 0.24s both; }
        .landing-rise-delay-4 { animation: landing-rise 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) 0.32s both; }
      `}</style>
    </main>
  );
}

function Feature({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-sprout-card/70 backdrop-blur-sm rounded-pill border border-sprout-border/60 shadow-subtle">
      <span className="text-sprout-green-primary">{icon}</span>
      <span className="text-[11px] font-bold text-sprout-text-primary">
        {label}
      </span>
    </div>
  );
}
