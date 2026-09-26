interface MandalaProps {
  className?: string;
  petals?: number;
}

/**
 * Serene Ayurvedic Lotus (Padma)
 * Minimalist, elegant, and peaceful — broad sculpted petals with soft
 * translucent fills, completely devoid of complex wireframe concentric lines.
 */
export default function Mandala({ className = '', petals = 8 }: MandalaProps) {
  // Graceful 8-fold lotus geometry — tranquil and uncluttered
  const count = Math.min(12, Math.max(6, petals > 8 ? 8 : petals));
  const step = 360 / count;
  const offset = step / 2;

  return (
    <svg viewBox="0 0 500 500" fill="none" className={className} aria-hidden="true">
      {/* Tier 1: Broad Primary Blooming Lotus Petals with soft translucent body */}
      {Array.from({ length: count }).map((_, i) => (
        <path
          key={`lotus-outer-${i}`}
          d="M 250 45 C 305 125, 300 200, 250 250 C 200 200, 195 125, 250 45 Z"
          fill="currentColor"
          fillOpacity="0.08"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
          transform={`rotate(${i * step} 250 250)`}
        />
      ))}

      {/* Tier 2: Interleaved Inner Lotus Petals creating organic blossom depth */}
      {Array.from({ length: count }).map((_, i) => (
        <path
          key={`lotus-inner-${i}`}
          d="M 250 95 C 290 150, 285 205, 250 250 C 215 205, 210 150, 250 95 Z"
          fill="currentColor"
          fillOpacity="0.12"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
          transform={`rotate(${i * step + offset} 250 250)`}
        />
      ))}

      {/* Tier 3: Core Rosette & Golden Bindu Jewel */}
      <circle
        cx="250"
        cy="250"
        r="40"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle
        cx="250"
        cy="250"
        r="17"
        fill="currentColor"
        fillOpacity="0.75"
      />
      <circle
        cx="250"
        cy="250"
        r="5"
        fill="#ffffff"
        fillOpacity="0.95"
      />
    </svg>
  );
}

export function LotusMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <path
        d="M24 6 C 28 14, 28 20, 24 26 C 20 20, 20 14, 24 6 Z"
        fill="currentColor"
        opacity="0.95"
      />
      <path d="M10 14 C 17 18, 20 23, 21 30 C 14 28, 10 22, 10 14 Z" fill="currentColor" opacity="0.75" />
      <path d="M38 14 C 31 18, 28 23, 27 30 C 34 28, 38 22, 38 14 Z" fill="currentColor" opacity="0.75" />
      <path d="M4 28 C 12 30, 18 33, 24 40 C 30 33, 36 30, 44 28 C 40 38, 32 43, 24 43 C 16 43, 8 38, 4 28 Z" fill="currentColor" opacity="0.9" />
    </svg>
  );
}
