/**
 * Avatar registry. Each entry has a slug we store in profiles.avatar_emoji
 * (column name predates this — it now also accepts these slugs) and the
 * relative path to its SVG in /public/avatars.
 *
 * If the stored value is a single emoji glyph instead of one of these
 * slugs, the Avatar component falls back to rendering the emoji as text —
 * preserves backwards compatibility with users who picked an emoji
 * earlier.
 */
export const AVATARS = [
  { slug: "ava", label: "Ava", src: "/avatars/ava.svg" },
  { slug: "charlotte", label: "Charlotte", src: "/avatars/charlotte.svg" },
  { slug: "ethan", label: "Ethan", src: "/avatars/ethan.svg" },
  { slug: "isabella", label: "Isabella", src: "/avatars/isabella.svg" },
  { slug: "liam", label: "Liam", src: "/avatars/liam.svg" },
  { slug: "logan", label: "Logan", src: "/avatars/logan.svg" },
  { slug: "lucas", label: "Lucas", src: "/avatars/lucas.svg" },
  { slug: "mason", label: "Mason", src: "/avatars/mason.svg" },
  { slug: "mia", label: "Mia", src: "/avatars/mia.svg" },
  { slug: "noah", label: "Noah", src: "/avatars/noah.svg" },
  { slug: "olivia", label: "Olivia", src: "/avatars/olivia.svg" },
  { slug: "sophia", label: "Sophia", src: "/avatars/sophia.svg" },
] as const;

export type AvatarSlug = (typeof AVATARS)[number]["slug"];

const AVATAR_BY_SLUG = new Map(AVATARS.map((a) => [a.slug, a]));

/** True when the stored value is a custom uploaded avatar URL rather than
 *  one of the preset slugs or an emoji. */
export function isCustomAvatarUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith("http://") || value.startsWith("https://");
}

/** Returns the loadable image src for a stored avatar value. Custom URLs
 *  pass through; preset slugs map to local SVGs; everything else (emoji)
 *  returns null and is rendered as text by the Avatar component. */
export function avatarSrc(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isCustomAvatarUrl(value)) return value;
  return AVATAR_BY_SLUG.get(value as AvatarSlug)?.src ?? null;
}

/** Default avatar slug for new accounts. */
export const DEFAULT_AVATAR: AvatarSlug = "liam";
