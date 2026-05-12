"use client";

import { usePathname, useRouter } from "next/navigation";
import { Home, PieChart, Settings, Compass, History } from "lucide-react";
import { usePreferences } from "@/lib/hooks/usePreferences";
import { PoweredByLifi } from "@/components/ui/PoweredByLifi";

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { preferences } = usePreferences();

  const isPro = preferences.mode === "pro";
  const homeLabel = isPro ? "Explore" : "Home";
  const HomeIcon = isPro ? Compass : Home;

  const tabs = [
    { label: homeLabel, icon: HomeIcon, path: "/home" },
    { label: "Portfolio", icon: PieChart, path: "/portfolio" },
    ...(isPro
      ? [{ label: "Activity", icon: History, path: "/activity" }]
      : []),
    { label: "Settings", icon: Settings, path: "/settings" },
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-sprout-border flex flex-col z-50">
      <PoweredByLifi className="py-1 text-[10px]" />
      <div className="flex py-2 pb-5 border-t border-sprout-border/50">
        {tabs.map((tab) => {
          const isActive = pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => router.push(tab.path)}
              className="flex-1 flex flex-col items-center gap-1 cursor-pointer"
            >
              <tab.icon
                size={24}
                className={isActive ? "text-sprout-green-primary" : "text-gray-300"}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span
                className={`text-[10px] ${
                  isActive
                    ? "text-sprout-green-primary font-bold"
                    : "text-sprout-text-muted"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
