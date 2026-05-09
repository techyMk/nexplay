import Image from "next/image";
import { avatarSrc, isCustomAvatarUrl } from "@/lib/avatars";

/**
 * Renders a user avatar. If `value` is one of the known avatar slugs
 * ("liam", "olivia", etc.), an SVG illustration from /public/avatars is
 * shown. If it's an http(s) URL it's a user-uploaded image from Supabase
 * Storage. Otherwise the value is treated as an emoji and rendered as
 * text. Background gradient sits behind so emoji fallbacks still feel
 * branded.
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
  const isUpload = isCustomAvatarUrl(value);

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
        isUpload ? (
          // Custom-uploaded URL — use a plain <img> so we don't need to
          // whitelist the Supabase Storage origin in next.config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            width={dim}
            height={dim}
            className="w-full h-full object-cover"
          />
        ) : (
          <Image
            src={src}
            alt=""
            width={dim}
            height={dim}
            className="w-full h-full object-cover"
          />
        )
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
