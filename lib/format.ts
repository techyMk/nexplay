/**
 * Compact number formatter: 1234 -> "1.2k", 999 -> "999", 1500000 -> "1.5M".
 * Tries native Intl first, falls back to manual computation for older
 * runtimes.
 */
export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  try {
    return new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    if (n < 1000) return n.toString();
    if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
}
