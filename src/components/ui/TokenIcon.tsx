"use client";

import Image from "next/image";
import { useState } from "react";
import { getTokenLogoUrl, getChainLogoUrl, getProtocolLogoUrl } from "@/lib/api/icons";

type IconType = "token" | "chain" | "protocol";

interface TokenIconProps {
  type: IconType;
  identifier: string | number;
  size?: number;
  className?: string;
}

function getUrl(type: IconType, identifier: string | number): string {
  switch (type) {
    case "token": return getTokenLogoUrl(String(identifier));
    case "chain": return getChainLogoUrl(Number(identifier));
    case "protocol": return getProtocolLogoUrl(String(identifier));
  }
}

export function TokenIcon({ type, identifier, size = 40, className = "" }: TokenIconProps) {
  const [errored, setErrored] = useState(false);
  const url = getUrl(type, identifier);

  if (errored) {
    return (
      <div
        className={`rounded-xl bg-sprout-green-light flex items-center justify-center text-sprout-green-dark font-bold text-xs ${className}`}
        style={{ width: size, height: size }}
      >
        {String(identifier).slice(0, 3).toUpperCase()}
      </div>
    );
  }

  return (
    <Image
      src={url}
      alt={String(identifier)}
      width={size}
      height={size}
      className={`rounded-xl ${className}`}
      onError={() => setErrored(true)}
      unoptimized
    />
  );
}
