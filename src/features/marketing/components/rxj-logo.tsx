import Image from "next/image";
import { cn } from "@/lib/utils";

// The crop made by scripts/generate-brand-assets.mjs: the letters, and the
// margin of the logo's own background around them
const LETTERS = { width: 784, height: 322 };
const MARGIN = 64;

type RxjLogoProps = {
  // Height of the letters in pixels
  height?: number;
  // On a light surface: the logo on a dark tile, because its letters are
  // white and its background is not transparent
  tile?: boolean;
  priority?: boolean;
  className?: string;
};

/**
 * The RXJ logo. It is drawn for a dark background, so use it on a dark
 * surface, or with `tile` anywhere else.
 */
export const RxjLogo = ({
  height = 26,
  tile = false,
  priority = false,
  className,
}: RxjLogoProps) => {
  const scale = height / LETTERS.height;

  const logo = (
    <span
      className={cn("relative block shrink-0", !tile && className)}
      style={{ width: Math.round(LETTERS.width * scale), height }}
    >
      <Image
        src="/brand/rxj-wordmark.png"
        alt="RXJ"
        width={Math.round((LETTERS.width + MARGIN * 2) * scale)}
        height={Math.round((LETTERS.height + MARGIN * 2) * scale)}
        priority={priority}
        className="m-logo-img absolute max-w-none"
        style={{ left: -MARGIN * scale, top: -MARGIN * scale }}
      />
    </span>
  );

  if (!tile) return logo;

  return (
    <span
      className={cn(
        "inline-flex rounded-xl bg-[#03031a] shadow-sm ring-1 ring-black/10",
        className,
      )}
      style={{
        padding: `${Math.round(height * 0.45)}px ${Math.round(height * 0.6)}px`,
      }}
    >
      {logo}
    </span>
  );
};
