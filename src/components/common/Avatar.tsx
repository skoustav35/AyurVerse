import { useState } from 'react';
import { hueFor } from '../../lib/format';

interface AvatarProps {
  url?: string | null;
  name: string;
  size?: number;
  className?: string;
}

export default function Avatar({ url, name, size = 40, className = '' }: AvatarProps) {
  const initial = (name || 'A').trim().charAt(0).toUpperCase();
  const hue = hueFor(name || 'ayur');
  // A broken URL (expired host, CSP, dead link) must never paint the browser's
  // torn-page glyph — fall back to the letter-mark, always.
  const [broken, setBroken] = useState(false);

  if (url && !broken) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setBroken(true)}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`rounded-full shrink-0 grid place-items-center font-display font-semibold text-parchment ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.44,
        background: `linear-gradient(135deg, ${hue}, #12291c)`,
      }}
      aria-label={name}
    >
      {initial}
    </div>
  );
}
