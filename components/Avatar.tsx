import Image from "next/image";
import { avatarSrc } from "@/lib/avatars";

/**
 * Renders a user avatar. If `value` is one of the known avatar slugs
 * ("liam", "olivia", etc.), an SVG illustration from /public/avatars is
 * shown. Otherwise the value is treated as an emoji and rendered as text.
 *
 * Background gradient is rendered behind so emoji fallbacks still feel
 * branded. SVG avatars are framed in a circle.
 */
export function Avatar({
  value,
  size = "md",
  className = "",
}: {
  value: string | null | undefined;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const src = avatarSrc(value);

  const dim = {
    xs: 24,
    sm: 36,
    md: 48,
    lg: 64,
    xl: 96,
  }[size];

  const fontSize = {
    xs: "0.95rem",
    sm: "1.4rem",
    md: "1.85rem",
    lg: "2.4rem",
    xl: "3.2rem",
  }[size];

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full overflow-hidden bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] shrink-0 ${className}`}
      style={{ width: dim, height: dim }}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          width={dim}
          height={dim}
          className="w-full h-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="leading-none select-none"
          style={{ fontSize }}
        >
          {value || "🎮"}
        </span>
      )}
    </span>
  );
}
