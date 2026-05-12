"use client";

import { usePrivy } from "@/lib/wallet";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace("/");
    }
  }, [ready, authenticated, router]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="font-heading text-2xl font-800 text-sprout-green-dark animate-pulse">sprout</div>
      </div>
    );
  }

  if (!authenticated) return null;

  return <>{children}</>;
}
