import { useRef, useState } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Feather,
  Images,
  LibraryBig,
  Sparkles,
  Clapperboard,
  MessageCircle,
  Wallet,
  BarChart3,
  Heart,
  Bookmark,
  Search,
  Wand2,
  ShieldCheck,
  Zap,
  Users,
  Layers,
  Code2,
  Palette,
  Compass,
  Leaf,
  Plus,
  Minus,
  Quote,
  Music2,
  Send,
  Star,
} from 'lucide-react';
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

const STATS = [
  { value: '3-in-1', label: 'feed · forge · library', icon: Layers },
  { value: '6-stage', label: 'taste-adaptive ranking', icon: Compass },
  { value: '$1 / 1k', label: 'likes → creator payout', icon: Wallet },
  { value: '9:16', label: 'true-frame reels', icon: Clapperboard },
];

const FEATURES = [
  { icon: Heart, title: 'Golden-burst likes', copy: 'Double-tap and a saffron heart blooms, radiating sparks — every appreciation feels physical.' },
  { icon: Clapperboard, title: 'Immersive Reels', copy: 'Vertical, full-frame video with a spinning audio disc, springy actions and blurred letterbox echoes.' },
  { icon: MessageCircle, title: 'Living threads', copy: '1:1 and group DMs with voice notes, stickers, shared posts, reactions, seen receipts and typing presence.' },
  { icon: Search, title: 'Keystroke search', copy: 'BM25-style, multi-field ranking that braids films, photos and manuscripts with recency decay.' },
  { icon: Wand2, title: 'The house scribe', copy: 'An AI that polishes captions, distils summaries and illuminates manuscripts — never inventing, always yours.' },
  { icon: Bookmark, title: 'Your apothecary', copy: 'Save any moment or scroll to a private shelf that travels with you across every device.' },
  { icon: BarChart3, title: 'Creator Studio', copy: 'KPIs, sparklines and monthly ladders — see which scroll earns what, and when.' },
  { icon: ShieldCheck, title: 'Calm by design', copy: 'No infinite dopamine loops. Honest empty states. Software that returns you to your life.' },
];

const JOURNEY = [
  { step: '01', icon: Sparkles, title: 'Enter the atelier', copy: 'Sign in with Google or a single magic email. Your circle, apothecary and drafts are waiting.' },
  { step: '02', icon: Images, title: 'Weave a moment', copy: 'Post a photo or video to the feed, or set a long-form scroll in the Forge with markdown, code and math.' },
  { step: '03', icon: Compass, title: 'Let the garden learn', copy: 'Every like, dwell and search tunes a personal taste spectrum — the feed slowly becomes unmistakably yours.' },
  { step: '04', icon: Wallet, title: 'Earn from the pool', copy: 'Cross 1,000 channels and every 1,000 likes across your pool becomes $1, paid via Razorpay payouts.' },
];

const AESTHETIC = [
  { icon: Leaf, title: 'Forest & turmeric', copy: 'A palette drawn from neem green, saffron, henna and stone — warm, grounded, unmistakably ayurvedic.' },
  { icon: Palette, title: 'Illuminated type', copy: 'Display serifs for majesty, monospace for the forge, and gold-leaf accents that catch the light.' },
  { icon: Compass, title: 'Mandala motion', copy: 'Slow-spinning yantras, spring physics and staggered reveals — motion that soothes rather than shouts.' },
];

const TESTIMONIALS = [
  { quote: 'It is the first feed that feels like a garden, not a slot machine. I leave calmer than I arrived.', name: 'Anaya Sharma', handle: '@anaya.veda', avatar: '/seed/avatar-anaya.jpg' },
  { quote: 'The Forge is where I finally publish long essays with real code and math. Replit-deep, beautifully warm.', name: 'Dev Kapoor', handle: '@dev.forge', avatar: '/seed/avatar-dev.jpg' },
  { quote: 'Reels here are gorgeous, and the Studio actually shows me what earns. Payouts landed without friction.', name: 'Kaberi Das', handle: '@kaberi.kathak', avatar: '/seed/avatar-kaberi.jpg' },
];

const FAQ = [
  { q: 'What exactly is AyurVerse?', a: 'A single "super-app" that fuses three temples: an Instagram-style visual feed, a Replit-style deep reading & writing Forge, and a YouTube-style ranked search library — plus real messaging, Reels and a creator Studio.' },
  { q: 'How does the personalized feed work?', a: 'A six-stage, taste-adaptive ranker learns from your likes, saves, comments, dwell time and searches. It weights tags, authors, freshness and quality with a gentle exploration term, then diversifies so no author or medium repeats back-to-back.' },
  { q: 'How do creators get paid?', a: 'Once a channel passes 1,000 followers, every 1,000 likes across the whole video pool is worth $1. Earnings show per month, per year and all-time in the Studio, and withdrawals are disbursed through Razorpay payouts.' },
  { q: 'Is my data private and secure?', a: 'Authentication is handled by Supabase with email/password and Google sign-in. Your apothecary, circle and drafts are tied to your account and travel with you across devices.' },
  { q: 'Do I need anything to start?', a: 'Nothing but an email. Sign in and the atelier remembers your place — the feed, forge, library, threads and studio are all there from the first breath.' },
];

const MARQUEE = ['bengali poetry', 'transformers', 'turmeric rites', 'bm25 ranking', 'kathak spins', 'euler identities', 'river ghats', 'dosha-balanced models', 'kazi nazrul', 'golden hour film'];

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7 }}
      className="text-center max-w-2xl mx-auto"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-saffron-700">{eyebrow}</p>
      <h2 className="font-display font-semibold text-[30px] sm:text-[42px] text-neem-950 mt-3 leading-tight">{title}</h2>
      {copy && <p className="text-ink-600 text-[15px] leading-relaxed mt-3">{copy}</p>}
    </motion.div>
  );
}

function FaqRow({ item, index }: { item: { q: string; a: string }; index: number }) {
  const [open, setOpen] = useState(index === 0);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5 }}
      className="card-warm overflow-hidden"
    >
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left">
        <span className="font-display font-semibold text-[16px] text-neem-950">{item.q}</span>
        <span className={`grid place-items-center w-7 h-7 rounded-full shrink-0 transition-colors ${open ? 'bg-saffron-500/20 text-saffron-700' : 'bg-sand-200/70 text-ink-500'}`}>
          {open ? <Minus size={15} /> : <Plus size={15} />}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <p className="px-5 pb-5 text-[14px] text-ink-600 leading-relaxed">{item.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

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
            <div className="hidden md:flex items-center gap-6 text-[13px] font-medium text-ink-600">
              <a href="#pillars" className="hover:text-neem-900 transition-colors">Pillars</a>
              <a href="#features" className="hover:text-neem-900 transition-colors">Features</a>
              <a href="#studio" className="hover:text-neem-900 transition-colors">Studio</a>
              <a href="#faq" className="hover:text-neem-900 transition-colors">FAQ</a>
            </div>
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
          className="relative z-10 max-w-4xl mx-auto px-6 pt-[22vh] pb-28 text-center"
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

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.8 }}
            className="mt-10 flex items-center justify-center gap-1.5 text-gold-300/80"
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={13} className="fill-gold-400 text-gold-400" />
            ))}
            <span className="ml-2 text-[12px] text-sand-200/70">loved by weavers, readers &amp; makers</span>
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

      {/* Stats band */}
      <section className="relative bg-neem-950 py-10 lg:py-12">
        <div className="max-w-6xl mx-auto px-5 grid grid-cols-2 lg:grid-cols-4 gap-6">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.55, delay: i * 0.1 }}
              className="text-center"
            >
              <span className="grid place-items-center w-10 h-10 mx-auto rounded-xl bg-gold-500/10 border border-gold-500/30 text-gold-400">
                <s.icon size={18} />
              </span>
              <p className="font-display font-semibold text-parchment text-[26px] sm:text-[30px] mt-3">{s.value}</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-sand-300/70 mt-1">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Pillars */}
      <section id="pillars" className="relative py-20 lg:py-28 overflow-hidden">
        <Mandala className="absolute -left-56 top-24 w-[520px] h-[520px] text-neem-600/10 animate-spin-rev pointer-events-none" />
        <div className="max-w-6xl mx-auto px-5 relative z-10">
          <SectionHeading
            eyebrow="The three pillars"
            title="One account, three temples"
            copy="Built like a courtyard: the feed flows in the middle, the forge burns on one side, the library remembers everything on the other."
          />

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

      {/* Reels showcase */}
      <section className="relative py-20 lg:py-24 overflow-hidden bg-gradient-to-b from-parchment to-parchment-deep/40">
        <div className="max-w-6xl mx-auto px-5 grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7 }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-saffron-700 inline-flex items-center gap-2">
              <Clapperboard size={13} /> Reels, reimagined
            </p>
            <h2 className="font-display font-semibold text-[30px] sm:text-[40px] text-neem-950 mt-3 leading-tight">
              Vertical stories that breathe
            </h2>
            <p className="text-ink-600 text-[15px] leading-relaxed mt-4">
              Tap any video in the feed and it opens instantly, full-frame, in the immersive Reels player. Every clip
              shows its true 9:16 shape over a soft blurred echo — nothing cropped, nothing lost.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                { icon: Heart, t: 'Springy, glassy like · comment · share · save rail' },
                { icon: Music2, t: 'Spinning audio disc and rolling counters' },
                { icon: Users, t: 'Channel handle with an animated follow pill' },
                { icon: Zap, t: 'Snap-scroll, keyboard nav and progress bar' },
              ].map((f) => (
                <li key={f.t} className="flex items-center gap-3 text-[14px] text-ink-700">
                  <span className="grid place-items-center w-8 h-8 rounded-full bg-saffron-500/15 text-saffron-600 shrink-0">
                    <f.icon size={15} />
                  </span>
                  {f.t}
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Phone mock */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.75 }}
            className="flex justify-center"
          >
            <div className="relative w-[240px] h-[480px] rounded-[36px] border-[6px] border-neem-950 bg-neem-950 shadow-[0_40px_80px_-30px_rgba(12,27,19,0.7)] overflow-hidden">
              <div className="absolute inset-0 bg-[linear-gradient(160deg,#12291c,#7a4a12)]" />
              <div className="absolute inset-0 bg-neem-950/25" />
              <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-neem-950/70 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-neem-950/90 to-transparent" />
              {/* right rail */}
              <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4">
                {[Heart, MessageCircle, Send, Bookmark].map((Ic, i) => (
                  <span key={i} className="grid place-items-center w-9 h-9 rounded-full bg-neem-950/40 border border-parchment/10 text-parchment">
                    <Ic size={16} className={i === 0 ? 'fill-terra-500 text-terra-500' : ''} />
                  </span>
                ))}
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, ease: 'linear', duration: 6 }}
                  className="grid place-items-center w-8 h-8 rounded-full overflow-hidden border-2 border-parchment/70 bg-neem-900"
                >
                  <Music2 size={12} className="text-parchment" />
                </motion.span>
              </div>
              {/* channel row */}
              <div className="absolute bottom-6 left-4 right-16">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-[conic-gradient(from_210deg,#ee8a1f,#f4c430,#c05a2e,#2e6b4e,#ee8a1f)] p-[2px]">
                    <span className="block w-full h-full rounded-full bg-neem-800" />
                  </span>
                  <span className="text-parchment text-[11px] font-semibold">@kaberi.kathak</span>
                  <span className="rounded-full bg-parchment text-neem-950 text-[9px] font-bold px-2 py-0.5">Follow</span>
                </div>
                <div className="h-1.5 w-32 rounded bg-parchment/70 mt-2.5" />
                <div className="h-1.5 w-20 rounded bg-parchment/40 mt-1.5" />
              </div>
              <div className="absolute bottom-0 inset-x-0 h-[3px] bg-parchment/20">
                <div className="h-full w-2/3 bg-gradient-to-r from-saffron-500 to-gold-400" />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Feature grid */}
      <section id="features" className="relative py-20 lg:py-28 overflow-hidden">
        <Mandala className="absolute -right-52 top-40 w-[480px] h-[480px] text-saffron-500/10 animate-spin-slower pointer-events-none" />
        <div className="max-w-6xl mx-auto px-5 relative z-10">
          <SectionHeading
            eyebrow="Everything in one plane"
            title="A feature for every ritual"
            copy="From the first double-tap to your first payout, each corner of the atelier is finished with the same care."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-14">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.55, delay: (i % 4) * 0.08 }}
                whileHover={{ y: -5 }}
                className="card-warm p-5"
              >
                <span className="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-neem-500/15 to-gold-500/15 border border-neem-500/25 text-neem-700">
                  <f.icon size={19} />
                </span>
                <h3 className="font-display font-semibold text-[17px] text-neem-950 mt-4">{f.title}</h3>
                <p className="text-[13px] text-ink-600 leading-relaxed mt-1.5">{f.copy}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Personalization / ranking */}
      <section className="relative py-20 lg:py-24 bg-gradient-to-b from-parchment-deep/40 to-parchment overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7 }}
            className="order-2 lg:order-1"
          >
            <div className="card-warm p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-400">Your taste spectrum</p>
              <div className="mt-4 space-y-3">
                {[
                  { tag: '#ayurveda', w: 92, c: 'from-saffron-500 to-gold-500' },
                  { tag: '#poetry', w: 74, c: 'from-neem-600 to-neem-500' },
                  { tag: '#mathematics', w: 61, c: 'from-terra-500 to-saffron-500' },
                  { tag: '#kathak', w: 48, c: 'from-gold-500 to-saffron-400' },
                  { tag: '#river', w: 33, c: 'from-neem-500 to-gold-500' },
                ].map((row, i) => (
                  <div key={row.tag}>
                    <div className="flex justify-between text-[12px] text-ink-600 mb-1">
                      <span className="font-medium">{row.tag}</span>
                      <span className="tabular-nums text-ink-400">{row.w}</span>
                    </div>
                    <div className="h-2 rounded-full bg-sand-200/70 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: `${row.w}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.9, delay: i * 0.12, ease: 'easeOut' }}
                        className={`h-full bg-gradient-to-r ${row.c}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7 }}
            className="order-1 lg:order-2"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-saffron-700 inline-flex items-center gap-2">
              <Compass size={13} /> A feed that learns you
            </p>
            <h2 className="font-display font-semibold text-[30px] sm:text-[40px] text-neem-950 mt-3 leading-tight">
              Taste-adaptive, never manipulative
            </h2>
            <p className="text-ink-600 text-[15px] leading-relaxed mt-4">
              A six-stage ranker reads your likes, saves, comments, dwell time and searches — decaying old signals
              with a nine-day half-life — then blends affinity, freshness and quality with a gentle exploration term.
              Business rules keep the same author or medium from repeating back-to-back.
            </p>
            <div className="grid grid-cols-3 gap-3 mt-6">
              {[
                { k: 'Recall', v: '400 posts' },
                { k: 'Half-life', v: '9 days' },
                { k: 'Diversity', v: 'no repeats' },
              ].map((s) => (
                <div key={s.k} className="card-warm !rounded-xl p-3 text-center">
                  <p className="font-display font-semibold text-[17px] text-neem-900">{s.v}</p>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-ink-400 mt-0.5">{s.k}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Studio / payouts */}
      <section id="studio" className="relative py-20 lg:py-28 overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 relative z-10">
          <SectionHeading
            eyebrow="Creator Studio"
            title="See what grows. Earn what you've grown."
            copy="Analytics, developer tools and payouts in one calm workshop — with your targets and earnings laid out per month, per year and all-time."
          />

          <div className="grid lg:grid-cols-3 gap-5 mt-14">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6 }}
              className="card-warm p-6 lg:col-span-2"
            >
              <div className="flex items-center gap-3">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-neem-500/15 border border-neem-500/25 text-neem-700"><BarChart3 size={18} /></span>
                <h3 className="font-display font-semibold text-[19px] text-neem-950">Analytics that read like a garden log</h3>
              </div>
              <p className="text-[13.5px] text-ink-600 leading-relaxed mt-3">
                KPIs for posts, likes, views, reflections and channels; a 14-day sparkline per scroll; and monthly
                ladders that show which video gives you what, and when.
              </p>
              <div className="mt-5 flex items-end gap-1.5 h-28">
                {[30, 52, 41, 68, 60, 84, 72, 96, 88, 100, 76, 92].map((h, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    whileInView={{ height: `${h}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: i * 0.04, ease: 'easeOut' }}
                    className={`flex-1 rounded-t-md ${i === 9 ? 'bg-saffron-500' : 'bg-neem-500/60'}`}
                  />
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, delay: 0.12 }}
              className="card-warm p-6 bg-gradient-to-br from-saffron-500/10 to-gold-400/5 border-saffron-500/30"
            >
              <div className="flex items-center gap-3">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-saffron-500/20 border border-saffron-500/30 text-saffron-700"><Wallet size={18} /></span>
                <h3 className="font-display font-semibold text-[19px] text-neem-950">Razorpay payouts</h3>
              </div>
              <p className="text-[13.5px] text-ink-600 leading-relaxed mt-3">
                Pass 1,000 followers and every 1,000 likes across your pool becomes <span className="font-semibold text-saffron-700">$1</span>.
              </p>
              <div className="mt-5 space-y-3">
                <div>
                  <div className="flex justify-between text-[12px] text-ink-600 mb-1">
                    <span>This month</span><span className="font-semibold text-saffron-700">$128.00</span>
                  </div>
                  <div className="h-2 rounded-full bg-sand-200/70 overflow-hidden">
                    <motion.div initial={{ width: 0 }} whileInView={{ width: '64%' }} viewport={{ once: true }} transition={{ duration: 0.9 }} className="h-full bg-gradient-to-r from-saffron-500 to-gold-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-parchment/70 border border-sand-300 p-2.5 text-center">
                    <p className="font-display font-semibold text-[16px] text-neem-900">$1,292</p>
                    <p className="text-[9.5px] uppercase tracking-[0.14em] text-ink-400">all-time</p>
                  </div>
                  <div className="rounded-xl bg-parchment/70 border border-sand-300 p-2.5 text-center">
                    <p className="font-display font-semibold text-[16px] text-neem-900">1,232</p>
                    <p className="text-[9.5px] uppercase tracking-[0.14em] text-ink-400">channels</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mt-5">
            {[
              { icon: BarChart3, t: 'Analytics', c: 'KPIs, sparklines, monthly bars and per-post performance.' },
              { icon: Wallet, t: 'Payouts', c: 'Targets, monthly earnings curve and a withdrawals ledger.' },
              { icon: Code2, t: 'Developer', c: 'Copyable curl, realtime snippets and a secrets catalog.' },
            ].map((s, i) => (
              <motion.div
                key={s.t}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="card-warm p-5 flex items-start gap-3"
              >
                <span className="grid place-items-center w-9 h-9 rounded-xl bg-gold-500/15 border border-gold-500/30 text-gold-700 shrink-0"><s.icon size={16} /></span>
                <div>
                  <h4 className="font-display font-semibold text-[15px] text-neem-950">{s.t}</h4>
                  <p className="text-[12.5px] text-ink-600 leading-relaxed mt-0.5">{s.c}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* AI scribe band */}
      <section className="relative py-20 lg:py-24 bg-neem-950 overflow-hidden">
        <Mandala className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[720px] text-gold-400/[0.08] animate-spin-slower pointer-events-none" />
        <div className="max-w-4xl mx-auto px-5 relative z-10 text-center">
          <span className="inline-grid place-items-center w-14 h-14 rounded-2xl bg-gold-500/15 border border-gold-500/30 text-gold-300 mx-auto">
            <Wand2 size={24} />
          </span>
          <h2 className="font-display font-semibold text-parchment text-[30px] sm:text-[40px] mt-6 leading-tight">
            The house scribe, at your side
          </h2>
          <p className="text-sand-200/85 text-[15px] leading-relaxed max-w-2xl mx-auto mt-4">
            An AI that polishes captions, distils a summary into one luminous line, and illuminates your markdown
            manuscripts — preserving every fact, name and equation. It never invents; it only helps your voice shine.
          </p>
          <div className="mt-8 grid sm:grid-cols-3 gap-4 text-left">
            {[
              { t: 'Polish a caption', c: 'Two warm, regal sentences — hashtags and Bengali lines kept exactly.' },
              { t: 'Distil a summary', c: 'One breath that carries the whole scroll, under 180 characters.' },
              { t: 'Illuminate a manuscript', c: 'Headers, a sutra callout, rules and tidy lists — code and math untouched.' },
            ].map((s) => (
              <div key={s.t} className="rounded-2xl border border-parchment/10 bg-parchment/[0.04] p-4">
                <p className="text-gold-300 text-[13px] font-semibold inline-flex items-center gap-1.5"><Sparkles size={12} /> {s.t}</p>
                <p className="text-sand-200/70 text-[12.5px] leading-relaxed mt-1.5">{s.c}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Journey */}
      <section className="relative py-20 lg:py-28 overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 relative z-10">
          <SectionHeading eyebrow="The journey" title="From first breath to first payout" copy="Four unhurried steps — the atelier keeps your place through all of them." />
          <div className="relative grid md:grid-cols-4 gap-5 mt-14">
            {JOURNEY.map((j, i) => (
              <motion.div
                key={j.step}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.6, delay: i * 0.12 }}
                className="relative card-warm p-6"
              >
                <span className="font-display font-bold text-[42px] text-sand-300/70 leading-none">{j.step}</span>
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-saffron-500/15 border border-saffron-500/30 text-saffron-600 mt-3">
                  <j.icon size={18} />
                </span>
                <h3 className="font-display font-semibold text-[18px] text-neem-950 mt-4">{j.title}</h3>
                <p className="text-[13px] text-ink-600 leading-relaxed mt-1.5">{j.copy}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Aesthetic / philosophy */}
      <section className="relative py-20 lg:py-24 bg-gradient-to-b from-parchment to-parchment-deep/40 overflow-hidden">
        <div className="max-w-6xl mx-auto px-5">
          <SectionHeading eyebrow="Ayurvedic by design" title="A calm, majestic aesthetic" copy="Every pixel is chosen to soothe — warm colour, illuminated type and mandala motion." />
          <div className="grid md:grid-cols-3 gap-5 mt-14">
            {AESTHETIC.map((a, i) => (
              <motion.div
                key={a.title}
                initial={{ opacity: 0, y: 36 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.6, delay: i * 0.12 }}
                className="card-warm p-6 text-center"
              >
                <span className="grid place-items-center w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-gold-500/20 to-saffron-500/15 border border-gold-500/30 text-saffron-600">
                  <a.icon size={20} />
                </span>
                <h3 className="font-display font-semibold text-[18px] text-neem-950 mt-4">{a.title}</h3>
                <p className="text-[13px] text-ink-600 leading-relaxed mt-2">{a.copy}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="relative py-20 lg:py-28 overflow-hidden">
        <Mandala className="absolute -left-52 bottom-10 w-[460px] h-[460px] text-neem-600/10 animate-spin-rev pointer-events-none" />
        <div className="max-w-6xl mx-auto px-5 relative z-10">
          <SectionHeading eyebrow="Voices from the atelier" title="Loved by those who weave here" />
          <div className="grid md:grid-cols-3 gap-5 mt-14">
            {TESTIMONIALS.map((t, i) => (
              <motion.figure
                key={t.name}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.6, delay: i * 0.12 }}
                className="card-warm p-6 flex flex-col"
              >
                <Quote size={22} className="text-gold-500/70" />
                <blockquote className="text-[14.5px] text-ink-700 leading-relaxed mt-3 flex-1">“{t.quote}”</blockquote>
                <figcaption className="flex items-center gap-3 mt-5 pt-4 border-t border-sand-300/70">
                  <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full object-cover" />
                  <div>
                    <p className="font-display font-semibold text-[14px] text-neem-950">{t.name}</p>
                    <p className="text-[12px] text-saffron-700">{t.handle}</p>
                  </div>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative py-20 lg:py-24 bg-gradient-to-b from-parchment-deep/40 to-parchment overflow-hidden">
        <div className="max-w-3xl mx-auto px-5">
          <SectionHeading eyebrow="Questions, answered" title="Everything you might ask" />
          <div className="mt-12 space-y-3">
            {FAQ.map((item, i) => (
              <FaqRow key={item.q} item={item} index={i} />
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

      {/* Footer */}
      <footer className="border-t border-sand-300/70 bg-parchment-deep/30">
        <div className="max-w-6xl mx-auto px-5 py-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <span className="flex items-center gap-2.5">
              <span className="text-gold-600"><LotusMark className="w-7 h-7" /></span>
              <span className="font-display font-bold text-[18px] text-neem-950">
                Ayur<span className="text-saffron-600">Verse</span>
              </span>
            </span>
            <p className="text-[13px] text-ink-500 leading-relaxed mt-3 max-w-xs">
              A super-app where the feed becomes a garden — Instagram’s gaze, Replit’s depth and YouTube’s recall on
              one warm, ayurvedic plane.
            </p>
          </div>
          {[
            { h: 'The temples', links: ['Visual Feed', 'Code Forge', 'Search Library', 'Reels'] },
            { h: 'For creators', links: ['Analytics', 'Payouts', 'Developer', 'The house scribe'] },
            { h: 'The atelier', links: ['Threads', 'Apothecary', 'Your circle', 'Taste spectrum'] },
          ].map((col) => (
            <div key={col.h}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">{col.h}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l}>
                    <button onClick={() => setAuthOpen(true)} className="text-[13.5px] text-ink-600 hover:text-saffron-700 transition-colors">
                      {l}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-sand-300/60 py-6 text-center">
          <p className="font-display italic text-ink-500">॥ इति — and thus, it ends where it begins ॥</p>
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink-400 mt-2">AyurVerse Atelier · woven with saffron &amp; neem</p>
        </div>
      </footer>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
