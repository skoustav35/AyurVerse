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

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
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
