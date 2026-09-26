import { useMemo } from 'react';
import Mandala from './Mandala';
import { useUI } from '../../store/ui';

interface Ember {
  left: number;
  size: number;
  duration: number;
  delay: number;
  color: string;
  opacity: number;
}

const DARK_EMBER_COLORS = [
  '#f6dc8a', // gold leaf
  '#ecc34e', // bright gold
  '#f09e3f', // saffron glow
  '#e8812a', // deep saffron
  '#8fd0a5', // neem auric green
];

const LIGHT_EMBER_COLORS = [
  '#d4a017', // warm gold
  '#b3935e', // sand amber
  '#cf7046', // terra
  '#3d7a5a', // neem
  '#e8812a', // saffron
];

export default function AppBackground() {
  const theme = useUI((s) => s.theme);
  const isDark = theme !== 'light';

  // 24 floating embers with harmonic distribution across the viewport
  const embers: Ember[] = useMemo(() => {
    const palette = isDark ? DARK_EMBER_COLORS : LIGHT_EMBER_COLORS;
    return Array.from({ length: 24 }, (_, i) => ({
      left: (i * 39 + 11) % 96,
      size: 2.2 + ((i * 7) % 3),
      duration: 12 + ((i * 5) % 9),
      delay: (i * 1.4) % 11,
      color: palette[i % palette.length],
      opacity: isDark ? 0.5 + ((i * 3) % 5) * 0.1 : 0.35 + ((i * 2) % 4) * 0.08,
    }));
  }, [isDark]);

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none transition-colors duration-500"
      aria-hidden="true"
    >
      {/* 1. Base Canvas */}
      <div
        className={`absolute inset-0 transition-colors duration-700 ${
          isDark ? 'bg-[#070d09]' : 'bg-[#f2ead8]'
        }`}
      />

      {/* 2. Living Ambient Auric Nebulae (Prominent Breathing Orbs) */}
      {isDark ? (
        <>
          <div
            className="absolute -top-32 -left-20 w-[640px] h-[640px] rounded-full blur-[100px] opacity-70 animate-aurora-1 will-change-transform"
            style={{
              background: 'radial-gradient(circle, rgba(34, 84, 61, 0.5) 0%, rgba(18, 41, 28, 0.3) 50%, transparent 75%)',
            }}
          />
          <div
            className="absolute top-1/4 -right-36 w-[720px] h-[720px] rounded-full blur-[110px] opacity-60 animate-aurora-2 will-change-transform"
            style={{
              background: 'radial-gradient(circle, rgba(212, 160, 23, 0.4) 0%, rgba(192, 143, 14, 0.22) 50%, transparent 75%)',
            }}
          />
          <div
            className="absolute -bottom-28 left-1/3 w-[680px] h-[680px] rounded-full blur-[105px] opacity-55 animate-aurora-3 will-change-transform"
            style={{
              background: 'radial-gradient(circle, rgba(217, 111, 16, 0.35) 0%, rgba(180, 85, 12, 0.2) 50%, transparent 75%)',
            }}
          />
        </>
      ) : (
        <>
          <div
            className="absolute -top-24 -left-16 w-[560px] h-[560px] rounded-full blur-[90px] opacity-45 animate-aurora-1 will-change-transform"
            style={{
              background: 'radial-gradient(circle, rgba(224, 170, 31, 0.25) 0%, rgba(201, 173, 124, 0.15) 50%, transparent 75%)',
            }}
          />
          <div
            className="absolute top-1/3 -right-28 w-[600px] h-[600px] rounded-full blur-[95px] opacity-40 animate-aurora-2 will-change-transform"
            style={{
              background: 'radial-gradient(circle, rgba(61, 122, 90, 0.18) 0%, rgba(141, 177, 143, 0.1) 50%, transparent 75%)',
            }}
          />
        </>
      )}

      {/* 3. Serene Blooming Lotus Motifs (Minimalist Ayurvedic Padma) */}
      {/* Primary Golden Lotus (Top-Left) */}
      <div className="absolute -left-32 -top-32 w-[580px] h-[580px] pointer-events-none">
        <Mandala
          className={`w-full h-full animate-spin-slower transition-opacity duration-500 ${
            isDark
              ? 'text-gold-400/[0.24] drop-shadow-[0_0_35px_rgba(236,195,78,0.18)]'
              : 'text-sand-500/[0.22]'
          }`}
          petals={8}
        />
      </div>

      {/* Secondary Healing Neem Lotus (Right-Center) */}
      <div className="absolute -right-40 top-[22%] w-[640px] h-[640px] pointer-events-none">
        <Mandala
          className={`w-full h-full animate-spin-rev transition-opacity duration-500 ${
            isDark
              ? 'text-neem-400/[0.20] drop-shadow-[0_0_35px_rgba(78,148,110,0.16)]'
              : 'text-neem-600/[0.18]'
          }`}
          petals={8}
        />
      </div>

      {/* 4. Luminous Rising Embers / Celestial Fireflies */}
      {embers.map((m, i) => (
        <span
          key={i}
          className="absolute bottom-[-24px] rounded-full animate-rise-and-sway"
          style={{
            left: `${m.left}%`,
            width: `${m.size}px`,
            height: `${m.size}px`,
            backgroundColor: m.color,
            boxShadow: isDark
              ? `0 0 ${m.size * 3}px ${m.size * 0.8}px ${m.color}`
              : `0 0 ${m.size * 2}px ${m.size * 0.4}px ${m.color}`,
            animationDuration: `${m.duration}s`,
            animationDelay: `${m.delay}s`,
            ['--ember-opacity' as any]: m.opacity,
          }}
        />
      ))}

      {/* 5. Celestial Starlight Texture Overlay */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${
          isDark
            ? 'opacity-35 [background-image:radial-gradient(rgba(236,195,78,0.16)_1px,transparent_1.6px)] [background-size:26px_26px]'
            : 'opacity-25 [background-image:radial-gradient(rgba(96,74,32,0.08)_1px,transparent_1.6px)] [background-size:24px_24px]'
        }`}
      />

      {/* 6. Cinematic Ambient Vignette (Frames the center stream with intense depth in dark mode) */}
      {isDark && (
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(4, 8, 6, 0.75) 100%)',
          }}
        />
      )}
    </div>
  );
}
