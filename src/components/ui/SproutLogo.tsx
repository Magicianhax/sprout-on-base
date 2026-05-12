import Image from "next/image";

interface SproutLogoProps {
  /** Square size in pixels. */
  size: number;
  className?: string;
  /** Set to false when the logo is purely decorative beside a text
   *  label (e.g. top-left wordmark) so screen readers don't announce
   *  it twice. */
  decorative?: boolean;
  /** Extra Tailwind classes for the inner Next.js Image. */
  imgClassName?: string;
}

/**
 * Centralised wrapper around `public/icon-*.png`. Every visible use
 * of the Sprout logo in the app routes through this so:
 *
 *  1. Cross-device consistency — no more 🌱 emoji rendering as
 *     Apple's green sprout on iOS, Microsoft's grey-green blob on
 *     Windows, and a hollow square on old Android.
 *  2. One asset to update — swap the logo once in /public and every
 *     surface picks it up.
 *  3. Crisp at any DPR — Next/Image handles the srcSet + lazy load,
 *     and we always point at a size >= the rendered dimension.
 */
export function SproutLogo({
  size,
  className = "",
  decorative = false,
  imgClassName = "",
}: SproutLogoProps) {
  // Pick the smallest PNG that's >= the rendered size so we don't
  // download a 512 px master to show a 32 px header badge.
  const source =
    size <= 16
      ? "/icon-16.png"
      : size <= 32
      ? "/icon-32.png"
      : size <= 48
      ? "/icon-48.png"
      : size <= 180
      ? "/icon-180.png"
      : size <= 192
      ? "/icon-192.png"
      : "/icon-512.png";

  return (
    <span
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={source}
        alt={decorative ? "" : "Sprout"}
        aria-hidden={decorative}
        width={size}
        height={size}
        priority
        className={`w-full h-full object-contain ${imgClassName}`}
      />
    </span>
  );
}
