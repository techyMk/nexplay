/**
 * Per-game SVG pattern overlay. Each game's slug deterministically picks
 * one of several geometric textures — dots, grid, diagonals, waves,
 * triangles, hexes — so tiles look distinct even when their gradients
 * don't tell them apart.
 *
 * Patterns are rendered as inline SVG with white at ~10-20% alpha to
 * sit subtly on top of the gradient.
 */

const PATTERNS = [
  // 0: dots
  ({ id }: { id: string }) => (
    <pattern id={id} width="32" height="32" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="3" r="1.5" fill="rgba(255,255,255,0.35)" />
    </pattern>
  ),
  // 1: grid
  ({ id }: { id: string }) => (
    <pattern id={id} width="40" height="40" patternUnits="userSpaceOnUse">
      <path
        d="M40 0H0V40"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1"
      />
    </pattern>
  ),
  // 2: diagonal stripes
  ({ id }: { id: string }) => (
    <pattern
      id={id}
      width="14"
      height="14"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <line x1="0" y1="0" x2="0" y2="14" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
    </pattern>
  ),
  // 3: waves
  ({ id }: { id: string }) => (
    <pattern id={id} width="40" height="20" patternUnits="userSpaceOnUse">
      <path
        d="M0 10 Q 10 0, 20 10 T 40 10"
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1.5"
      />
    </pattern>
  ),
  // 4: triangles
  ({ id }: { id: string }) => (
    <pattern id={id} width="36" height="32" patternUnits="userSpaceOnUse">
      <polygon
        points="18,4 32,28 4,28"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1.2"
      />
    </pattern>
  ),
  // 5: hexagons
  ({ id }: { id: string }) => (
    <pattern id={id} width="32" height="56" patternUnits="userSpaceOnUse">
      <polygon
        points="16,4 28,12 28,28 16,36 4,28 4,12"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1"
      />
      <polygon
        points="32,32 44,40 44,56 32,64 20,56 20,40"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1"
      />
    </pattern>
  ),
  // 6: crosses
  ({ id }: { id: string }) => (
    <pattern id={id} width="28" height="28" patternUnits="userSpaceOnUse">
      <path
        d="M14 6v16M6 14h16"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </pattern>
  ),
  // 7: zig-zag
  ({ id }: { id: string }) => (
    <pattern id={id} width="40" height="20" patternUnits="userSpaceOnUse">
      <polyline
        points="0,15 10,5 20,15 30,5 40,15"
        fill="none"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="1.5"
      />
    </pattern>
  ),
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function TilePattern({ slug }: { slug: string }) {
  const idx = hash(slug) % PATTERNS.length;
  const Pattern = PATTERNS[idx];
  const id = `pattern-${slug}`;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden
    >
      <defs>
        <Pattern id={id} />
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
