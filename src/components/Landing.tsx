import { useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Feather, Images, LibraryBig, Sparkles } from 'lucide-react';
import AuthModal from './auth/AuthModal';
import Mandala, { LotusMark } from './common/Mandala';

const PILLARS = [
  {
    icon: Images,
    eyebrow: 'Module A',
    title: 'The Visual Feed',
    copy: 'An Instagram-blooded stream of moments — infinite, gesture-alive, with golden bursts when you like, and story rings that glow saffron to neem.',
    mock: (
      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-[conic-gradient(from_210deg,#ee8a1f,#f4c430,#c05a2e,#2e6b4e,#ee8a1f)] p-[2px]">
            <span className="block w-full h-full rounded-full bg-neem-800" />
          </span>
          <div className="space-y-1">
            <div className="h-1.5 w-20 rounded bg-sand-300" />
            <div className="h-1.5 w-12 rounded bg-sand-200" />
          </div>
        </div>
        <div className="h-24 rounded-xl bg-[linear-gradient(130deg,#1b4230,#7a4a12)]" />
        <div className="flex gap-2.5">
          <span className="w-4 h-4 rounded-full bg-terra-500" />
          <span className="w-4 h-4 rounded-full border-2 border-sand-300" />
          <span className="w-4 h-4 rounded-full border-2 border-sand-300" />
        </div>
      </div>
    ),
  },
  {
    icon: Feather,
    eyebrow: 'Module B',
    title: 'The Tech / Code Forge',
    copy: 'Replit-blooded long-form scrolls. Markdown manuscripts, syntax-warm code, live mathematics — set in type made for hours of deep reading.',
    mock: (
      <div className="space-y-2.5">
        <div className="h-2 w-24 rounded bg-gold-500/70" />
        <div className="h-2 w-full rounded bg-sand-300" />
        <div className="h-2 w-5/6 rounded bg-sand-300" />
        <div className="rounded-lg bg-neem-950 p-2.5 font-mono text-[9px] leading-relaxed">
          <span className="text-[#f0a35e]">def</span> <span className="text-[#8fd0a5]">attend</span><span className="text-[#eadfc4]">(q, k, v):</span>
          <br />
          <span className="text-[#eadfc4]">{'  '}return softmax(q @ k.T)</span>
        </div>
        <div className="h-2 w-2/3 rounded bg-sand-300" />
      </div>
    ),
  },
  {
    icon: LibraryBig,
    eyebrow: 'Module C',
    title: 'The Search Library',
    copy: 'YouTube-blooded querying. Keystroke-live results that braid films, photographs and manuscripts — one breath, every medium.',
    mock: (
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 rounded-lg border border-sand-300 bg-parchment px-2.5 py-1.5">
          <span className="w-3 h-3 rounded-full border-2 border-gold-500" />
          <span className="font-display italic text-[10px] text-ink-500">bengali poetry recitation</span>
        </div>
        <div className="flex gap-2 items-center">
          <div className="w-16 h-10 rounded-lg bg-[linear-gradient(120deg,#12291c,#9a700b)] grid place-items-center">
            <span className="w-0 h-0 border-y-4 border-y-transparent border-l-[7px] border-l-parchment ml-0.5" />
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="h-1.5 w-full rounded bg-sand-300" />
            <div className="h-1.5 w-2/3 rounded bg-sand-200" />
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <div className="w-16 h-10 rounded-lg bg-saffron-500/25 border border-saffron-500/40 grid place-items-center">
            <Feather size={12} className="text-saffron-700" />
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="h-1.5 w-4/5 rounded bg-sand-300" />
            <div className="h-1.5 w-1/2 rounded bg-sand-200" />
          </div>
        </div>
      </div>
    ),
  },
];

const MARQUEE = ['bengali poetry', 'transformers', 'turmeric rites', 'bm25 ranking', 'kathak spins', 'euler identities', 'river ghats', 'dosha-balanced models', 'kazi nazrul', 'golden hour film'];

export default function Landing() {
  const [authOpen, setAuthOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ container: rootRef, target: heroRef, offset: ['start start', 'end start'] });
  const heroTextY = useTransform(scrollYProgress, [0, 1], [0, 130]);
  const mandalaY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const heroFade = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  return (
    <div ref={rootRef} className="overflow-y-auto lg:overflow-visible scroll-smooth bg-parchment" style={{ height: 'var(--vvh, 100%)' }}>
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50">
        <div className="max-w-6xl mx-auto px-5 pt-4">
          <div className="glass-warm rounded-2xl px-4 py-2.5 flex items-center justify-between">
            <span className="flex items-center gap-2.5">
              <span className="text-gold-600">
                <LotusMark className="w-7 h-7" />
              </span>
              <span className="font-display font-bold text-[19px] text-neem-950">
                Ayur<span className="text-saffron-600">Verse</span>
              </span>
            </span>
            <button
              onClick={() => setAuthOpen(true)}
              className="rounded-full bg-neem-900 text-parchment text-[13px] font-semibold px-5 py-2 hover:bg-neem-800 transition-colors"
            >
              Enter the Atelier
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header ref={heroRef} className="relative min-h-[100svh] overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,#1b4230_0%,#12291c_52%,#0c1b13_100%)]">
        <motion.div style={{ y: mandalaY }} className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <Mandala className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] text-gold-400/[0.16] animate-spin-slower" />
          <Mandala className="absolute -left-40 -bottom-52 w-[560px] h-[560px] text-saffron-500/[0.14] animate-spin-rev" petals={12} />
          <Mandala className="absolute -right-48 -top-40 w-[520px] h-[520px] text-neem-300/[0.12] animate-spin-rev" petals={20} />
        </motion.div>

        <motion.div
          style={{ y: heroTextY, opacity: heroFade }}
          className="relative z-10 max-w-4xl mx-auto px-6 pt-[24vh] pb-24 text-center"
        >
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.7 }}
            className="inline-flex items-center gap-2 rounded-full border border-gold-500/40 bg-gold-500/10 text-gold-300 text-[11px] font-semibold uppercase tracking-[0.24em] px-4 py-1.5"
          >
            <Sparkles size={12} />
            A super-app of feed, forge &amp; library
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="font-display font-semibold text-parchment text-[44px] leading-[1.04] sm:text-[64px] lg:text-[76px] mt-6 tracking-tight"
          >
            Where the feed
            <br />
            becomes a{' '}
            <span className="italic bg-gradient-to-r from-saffron-400 via-gold-400 to-saffron-300 bg-clip-text text-transparent">
              garden
            </span>
            <span className="text-gold-400">.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.7 }}
            className="text-sand-200/90 text-[15.5px] sm:text-lg leading-relaxed max-w-2xl mx-auto mt-6"
          >
            Instagram’s gaze, Replit’s depth and YouTube’s recall — grafted onto one warm, living plane of
            forest green, saffron and stone. Scroll, write, search; the atelier keeps your place.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.7 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-9"
          >
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setAuthOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-saffron-600 via-saffron-500 to-gold-500 text-parchment font-semibold text-[15px] px-8 py-3.5 shadow-[0_16px_40px_-12px_rgba(232,129,42,0.65)] hover:brightness-105"
            >
              Begin the journey
              <ArrowRight size={17} />
            </motion.button>
            <a
              href="#pillars"
              className="inline-flex items-center gap-2 rounded-full border border-sand-200/30 text-sand-100 font-medium text-[15px] px-7 py-3.5 hover:bg-parchment/10 transition-colors"
            >
              Walk the three pillars
            </a>
          </motion.div>
        </motion.div>

        {/* Marquee */}
        <div className="absolute bottom-0 inset-x-0 z-10 border-t border-parchment/10 bg-neem-950/40 backdrop-blur-sm overflow-hidden">
          <motion.div
            animate={{ x: ['0%', '-50%'] }}
            transition={{ repeat: Infinity, duration: 34, ease: 'linear' }}
            className="flex whitespace-nowrap py-3"
          >
            {[...MARQUEE, ...MARQUEE].map((m, i) => (
              <span key={i} className="mx-5 text-[12px] uppercase tracking-[0.22em] text-gold-400/80 font-medium">
                {m} <span className="text-saffron-500/70 ml-5">॥</span>
              </span>
            ))}
          </motion.div>
        </div>
      </header>

      {/* Pillars */}
      <section id="pillars" className="relative py-20 lg:py-28 overflow-hidden">
        <Mandala className="absolute -left-56 top-24 w-[520px] h-[520px] text-neem-600/10 animate-spin-rev pointer-events-none" />
        <div className="max-w-6xl mx-auto px-5 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7 }}
            className="text-center max-w-2xl mx-auto"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-saffron-700">The three pillars</p>
            <h2 className="font-display font-semibold text-[32px] sm:text-[42px] text-neem-950 mt-3 leading-tight">
              One account, three temples
            </h2>
            <p className="text-ink-600 text-[15px] leading-relaxed mt-3">
              Built like a courtyard: the feed flows in the middle, the forge burns on one side, the library
              remembers everything on the other.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-5 mt-14">
            {PILLARS.map((p, i) => (
              <motion.article
                key={p.title}
                initial={{ opacity: 0, y: 44 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.65, delay: i * 0.14, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -6 }}
                className="card-warm p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-saffron-500/20 to-gold-500/20 border border-saffron-500/30 text-saffron-600">
                    <p.icon size={19} />
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-400">{p.eyebrow}</span>
                </div>
                <h3 className="font-display font-semibold text-[22px] text-neem-950 mt-4">{p.title}</h3>
                <p className="text-[13.5px] text-ink-600 leading-relaxed mt-2">{p.copy}</p>
                <div className="mt-5 rounded-2xl border border-sand-300/80 bg-parchment-deep/60 p-4">{p.mock}</div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative pb-20 lg:pb-28 px-5">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7 }}
          className="relative max-w-4xl mx-auto overflow-hidden rounded-[32px] bg-[radial-gradient(110%_120%_at_50%_0%,#1b4230,#0c1b13)] px-6 py-16 lg:py-20 text-center"
        >
          <Mandala className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] text-gold-400/15 animate-spin-slower pointer-events-none" />
          <div className="relative z-10">
            <div className="mx-auto w-fit text-gold-400">
              <LotusMark className="w-12 h-12" />
            </div>
            <h2 className="font-display font-semibold text-parchment text-[30px] sm:text-[40px] mt-5 leading-tight">
              The water is warm.
            </h2>
            <p className="text-sand-200/85 text-[15px] leading-relaxed max-w-lg mx-auto mt-3">
              Sign in with Google or a single magic email. Your apothecary, your circle and your scrolls travel
              with you from the first breath.
            </p>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setAuthOpen(true)}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-saffron-600 via-saffron-500 to-gold-500 text-parchment font-semibold text-[15px] px-9 py-3.5 shadow-[0_16px_40px_-12px_rgba(232,129,42,0.65)] hover:brightness-105"
            >
              Enter the Atelier
              <ArrowRight size={17} />
            </motion.button>
          </div>
        </motion.div>
      </section>

      <footer className="border-t border-sand-300/70 py-8 text-center">
        <p className="font-display italic text-ink-500">॥ इति — and thus, it ends where it begins ॥</p>
        <p className="text-[11px] uppercase tracking-[0.22em] text-ink-400 mt-2">AyurVerse Atelier</p>
      </footer>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
