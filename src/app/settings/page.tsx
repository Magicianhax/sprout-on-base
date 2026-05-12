"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@/lib/wallet";
import { Copy, Check, ExternalLink, LogOut } from "lucide-react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
import { Card } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Toggle";
import { AboutModal } from "@/components/settings/AboutModal";
import { HowItWorksModal } from "@/components/settings/HowItWorksModal";
import { usePreferences } from "@/lib/hooks/usePreferences";

function truncateAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function SettingsContent() {
  const router = useRouter();
  const { user, logout } = usePrivy();
  const { preferences, update } = usePreferences();

  const [copied, setCopied] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  const walletAddress = user?.wallet?.address ?? "";
  const email = user?.email?.address ?? "";

  const notificationsEnabled = preferences.notificationsEnabled;
  const darkModeEnabled = preferences.darkMode;

  async function handleNotificationsToggle(next: boolean) {
    setNotificationsError(null);

    if (!next) {
      update({ notificationsEnabled: false });
      return;
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationsError("Notifications aren't supported in this browser.");
      return;
    }

    try {
      const permission =
        Notification.permission === "default"
          ? await Notification.requestPermission()
          : Notification.permission;

      if (permission !== "granted") {
        setNotificationsError(
          permission === "denied"
            ? "Permission denied — enable notifications in your browser settings."
            : "Notification permission was not granted."
        );
        return;
      }

      update({ notificationsEnabled: true });
      new Notification("Sprout notifications enabled", {
        body: "We'll ping you when your yield hits new milestones.",
      });
    } catch (err) {
      setNotificationsError(
        err instanceof Error ? err.message : "Couldn't enable notifications."
      );
    }
  }

  function handleDarkModeToggle(next: boolean) {
    update({ darkMode: next });
  }

  const handleCopyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  const handleSignOut = async () => {
    await logout();
    router.replace("/");
  };

  const isPro = preferences.mode === "pro";

  return (
    <main className="min-h-dvh bg-sprout-gradient pb-28">
      <Header />

      <div className="px-5 pt-5 pb-4">
        <p className="font-heading text-2xl font-800 text-sprout-text-primary">
          Settings
        </p>
      </div>

      <div className="flex flex-col gap-4 px-5">
        {/* Account section */}
        <Card shadow="subtle">
          <p className="text-xs font-semibold text-sprout-text-muted uppercase tracking-wider mb-3">
            Account
          </p>

          {email && (
            <div className="mb-3">
              <p className="text-xs text-sprout-text-muted">Email</p>
              <p className="text-sm font-semibold text-sprout-text-primary mt-0.5 truncate">
                {email}
              </p>
            </div>
          )}

          {walletAddress && (
            <div>
              <p className="text-xs text-sprout-text-muted">Wallet</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-sm font-semibold text-sprout-text-primary font-mono">
                  {truncateAddress(walletAddress)}
                </p>
                <button
                  onClick={handleCopyAddress}
                  className="text-sprout-text-muted hover:text-sprout-green-dark transition-colors cursor-pointer"
                  aria-label="Copy wallet address"
                >
                  {copied ? (
                    <Check size={15} className="text-sprout-green-dark" />
                  ) : (
                    <Copy size={15} />
                  )}
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* Mode toggle */}
        <Card shadow="subtle">
          <p className="text-xs font-semibold text-sprout-text-muted uppercase tracking-wider mb-3">
            Mode
          </p>

          {/* Segmented control */}
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all cursor-pointer ${
                !isPro
                  ? "bg-white text-sprout-green-dark shadow-subtle"
                  : "text-sprout-text-muted"
              }`}
              onClick={() => update({ mode: "lite" })}
            >
              Lite
            </button>
            <button
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all cursor-pointer ${
                isPro
                  ? "bg-white text-sprout-green-dark shadow-subtle"
                  : "text-sprout-text-muted"
              }`}
              onClick={() => update({ mode: "pro" })}
            >
              Pro
            </button>
          </div>

          <p className="text-xs text-sprout-text-muted mt-2">
            {isPro
              ? "Pro mode shows advanced details like protocol info, chains, and vault explorer."
              : "Lite mode keeps things simple — just your balance, rate, and earnings."}
          </p>
        </Card>

        {/* Notifications toggle */}
        <Card shadow="subtle">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sprout-text-primary">
                Push Notifications
              </p>
              <p className="text-xs text-sprout-text-muted mt-0.5">
                Get alerts on earnings milestones
              </p>
            </div>
            <Toggle
              checked={notificationsEnabled}
              onChange={handleNotificationsToggle}
              ariaLabel="Toggle push notifications"
            />
          </div>
          {notificationsError && (
            <p className="text-xs text-sprout-red-stop mt-2">{notificationsError}</p>
          )}
        </Card>

        {/* Dark mode toggle */}
        <Card shadow="subtle">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sprout-text-primary">
                Dark Mode
              </p>
              <p className="text-xs text-sprout-text-muted mt-0.5">
                Easier on the eyes at night
              </p>
            </div>
            <Toggle
              checked={darkModeEnabled}
              onChange={handleDarkModeToggle}
              ariaLabel="Toggle dark mode"
            />
          </div>
        </Card>

        {/* How it works */}
        <Card shadow="subtle">
          <button
            className="flex items-center justify-between w-full cursor-pointer"
            onClick={() => setHowOpen(true)}
          >
            <p className="text-sm font-semibold text-sprout-text-primary">
              How Sprout works
            </p>
            <ExternalLink size={16} className="text-sprout-text-muted" />
          </button>
        </Card>

        {/* About */}
        <Card shadow="subtle">
          <button
            className="flex items-center justify-between w-full cursor-pointer"
            onClick={() => setAboutOpen(true)}
          >
            <p className="text-sm font-semibold text-sprout-text-primary">
              About Sprout
            </p>
            <ExternalLink size={16} className="text-sprout-text-muted" />
          </button>
        </Card>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="flex items-center justify-center gap-2 w-full py-4 text-sprout-red-stop font-semibold text-sm cursor-pointer"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>

      <BottomNav />

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <HowItWorksModal open={howOpen} onClose={() => setHowOpen(false)} />
    </main>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}
