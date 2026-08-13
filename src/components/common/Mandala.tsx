interface MandalaProps {
  className?: string;
  petals?: number;
}

export default function Mandala({ className = '', petals = 16 }: MandalaProps) {
  const outer = Array.from({ length: petals });
  const inner = Array.from({ length: Math.max(6, petals / 2) });
  const outerStep = 360 / petals;
  const innerStep = 360 / inner.length;

  return (
    <svg viewBox="0 0 400 400" fill="none" className={className} aria-hidden="true">
      <circle cx="200" cy="200" r="196" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 7" />
      <circle cx="200" cy="200" r="164" stroke="currentColor" strokeWidth="1" opacity="0.8" />
      <circle cx="200" cy="200" r="118" stroke="currentColor" strokeWidth="1" strokeDasharray="1 6" />
      {outer.map((_, i) => (
        <g key={`o-${i}`} transform={`rotate(${i * outerStep} 200 200)`}>
          <path
            d="M200 42 C 228 88, 228 130, 200 158 C 172 130, 172 88, 200 42 Z"
            stroke="currentColor"
            strokeWidth="1"
          />
        </g>
      ))}
      {inner.map((_, i) => (
        <g key={`i-${i}`} transform={`rotate(${i * innerStep + innerStep / 2} 200 200)`}>
          <path
            d="M200 108 C 216 136, 216 160, 200 176 C 184 160, 184 136, 200 108 Z"
            stroke="currentColor"
            strokeWidth="0.9"
          />
          <circle cx="200" cy="98" r="2.4" fill="currentColor" />
        </g>
      ))}
      <circle cx="200" cy="200" r="52" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="200" cy="200" r="30" stroke="currentColor" strokeWidth="0.9" strokeDasharray="3 4" />
      <circle cx="200" cy="200" r="7" fill="currentColor" />
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
