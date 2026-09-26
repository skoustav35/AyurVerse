import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  KeyRound, Sparkles, X, Feather, Images, Clapperboard, LibraryBig,
  Heart, TrendingUp, ShieldCheck, Orbit, MessageCircle, Bookmark, Eye,
  Mail, Lock, ArrowRight, Loader2,
} from 'lucide-react';
import supabase from '../../lib/supabase';
import { friendlyAuthError, signInWithGoogle } from '../../lib/googleAuth';
import Mandala, { LotusMark } from '../common/Mandala';
import { useUI } from '../../store/ui';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

/* ============================================================
   The living showcase — right half of the sign-in window.
   ============================================================ */

const ease = [0.22, 1, 0.36, 1] as const;

const SLIDES: { icon: typeof Images; title: string; line: string }[] = [
  { icon: Images, title: 'The Visual Feed', line: 'Infinite moments, gesture-alive — a golden burst on every like.' },
  { icon: Feather, title: 'The Code Forge', line: 'Long-form scrolls with markdown, live math and warm syntax.' },
  { icon: Clapperboard, title: 'True-frame Reels', line: 'Cinematic 9:16 reels, made for the small hours.' },
  { icon: LibraryBig, title: 'The Search Library', line: 'One query braids films, photographs and manuscripts.' },
];

const STATS: { icon: typeof Heart; label: string; to: number }[] = [
  { icon: Heart, label: 'Likes today', to: 1284 },
  { icon: Feather, label: 'Scrolls woven', to: 312 },
  { icon: Orbit, label: 'Weavers online', to: 86 },
];

function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const dur = 1400;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n.toLocaleString()}</>;
}

function Motes({ count = 16 }: { count?: number }) {
  const motes = useRef(
    Array.from({ length: count }, (_, i) => ({
      left: (i * 61 + 13) % 100,
      delay: (i * 1.35) % 12,
      duration: 8 + ((i * 7) % 8),
      size: 2 + ((i * 5) % 3.5),
    })),
  ).current;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {motes.map((m, i) => (
        <span
          key={i}
          className="absolute bottom-[-20px] rounded-full text-gold-400 animate-rise"
          style={
            {
              left: `${m.left}%`,
              width: m.size,
              height: m.size,
              background: 'currentColor',
              boxShadow: '0 0 10px 1px currentColor',
              animationDuration: `${m.duration}s`,
              animationDelay: `${m.delay}s`,
              '--rise-opacity': 0.6,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function Showcase() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 4200);
    return () => clearInterval(t);
  }, []);
  const slide = SLIDES[idx];
  return (
    <div className="relative hidden lg:flex lg:w-[54%] flex-col overflow-hidden bg-[radial-gradient(120%_120%_at_80%_-10%,#1b4230_0%,#12291c_55%,#0c1b13_100%)] text-parchment">
      {/* layered mandalas */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <Mandala className="absolute -left-24 -top-24 w-[420px] h-[420px] text-gold-400/[0.14] animate-spin-slower" petals={16} />
        <Mandala className="absolute right-[-90px] bottom-[-90px] w-[380px] h-[380px] text-saffron-400/[0.12] animate-spin-rev" petals={12} />
        <Mandala className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] text-gold-400/[0.05] animate-spin-slowest" petals={24} />
      </div>
      <div className="absolute inset-x-0 top-0 h-44 bg-[linear-gradient(180deg,rgb(236_195_78/0.12),transparent)]" aria-hidden="true" />
      <div className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full bg-[radial-gradient(circle,rgb(236_195_78/0.14),transparent_62%)] animate-glow-pulse" aria-hidden="true" />
      <Motes />

      <div className="relative z-10 flex flex-col h-full p-8">
        {/* crest */}
        <div className="flex items-center gap-3">
          <span className="relative grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-br from-saffron-500 to-gold-500 text-parchment shadow-[0_10px_28px_-8px_rgba(232,129,42,0.7)]">
            <LotusMark className="w-6 h-6" />
            <span className="absolute -inset-1 rounded-2xl border border-gold-400/40 animate-ping-slow" aria-hidden="true" />
          </span>
          <div>
            <p className="font-display font-semibold text-[18px] leading-tight">AyurVerse</p>
            <p className="text-[10px] uppercase tracking-[0.28em] text-sand-300/70">the social atelier</p>
          </div>
        </div>

        {/* headline */}
        <div className="mt-auto">
          <motion.h2 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.7, ease }}
            className="font-display font-semibold text-[34px] leading-[1.06] tracking-tight">
            Weave, read &amp;{' '}
            <span className="italic bg-[linear-gradient(100deg,#f4b866,#ecc34e_40%,#fdf3e3_55%,#e8812a_75%,#ecc34e)] bg-[length:220%_100%] bg-clip-text text-transparent animate-shimmer-gold">
              remember
            </span>
            <span className="text-gold-400">.</span>
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28, duration: 0.7, ease }}
            className="mt-3 text-sand-200/85 text-[13.5px] leading-relaxed max-w-[280px]">
            One warm plane for the feed, the forge and the library — calm by design, alive by craft.
          </motion.p>
        </div>

        {/* cycling feature reel */}
        <div className="mt-6 rounded-2xl border border-parchment/15 bg-parchment/[0.04] backdrop-blur-sm p-4">
          <AnimatePresence mode="wait">
            <motion.div key={idx} initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }} transition={{ duration: 0.4, ease }} className="flex items-start gap-3">
              <span className="grid place-items-center w-10 h-10 rounded-xl bg-gradient-to-br from-saffron-500/25 to-gold-500/20 border border-gold-500/30 text-gold-300 shrink-0">
                <slide.icon size={18} />
              </span>
              <div className="min-w-0">
                <p className="font-display font-semibold text-[15px] leading-tight">{slide.title}</p>
                <p className="text-[11.5px] text-sand-200/75 leading-snug mt-1">{slide.line}</p>
              </div>
            </motion.div>
          </AnimatePresence>
          <div className="mt-3 flex gap-1.5">
            {SLIDES.map((s, i) => (
              <button key={s.title} onClick={() => setIdx(i)} aria-label={s.title}
                className="group relative h-1 flex-1 rounded-full overflow-hidden bg-parchment/15">
                {i === idx && (
                  <motion.span key={idx} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 4.2, ease: 'linear' }}
                    className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-saffron-400 to-gold-300" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* counters */}
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-xl border border-parchment/12 bg-parchment/[0.03] px-3 py-2.5 text-center">
              <s.icon size={13} className="mx-auto text-gold-400" />
              <p className="font-display font-semibold text-[16px] mt-1 tabular-nums"><CountUp to={s.to} /></p>
              <p className="text-[9px] uppercase tracking-[0.16em] text-sand-300/60 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* live-feed whisper */}
        <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-parchment/12 bg-parchment/[0.03] px-3.5 py-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-neem-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-neem-400" />
          </span>
          <p className="text-[10.5px] text-sand-200/70 truncate">
            <span className="text-gold-300 font-semibold">Vaidya Meera</span> just set a scroll in the Forge
          </p>
          <Eye size={12} className="ml-auto text-sand-300/50 shrink-0" />
        </div>
      </div>
    </div>
  );
}

/**
 * Login / signup gateway — Firebase Auth only (project: ananta-ayurverse).
 * Email+password via the compat facade, Google via Firebase popup
 * (full-page redirect fallback when popups are blocked).
 */
export default function AuthModal({ open, onClose }: AuthModalProps) {
  const pushToast = useUI((s) => s.pushToast);
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  const startGoogle = async () => {
    setError(null);
    setGoogleBusy(true);
    try {
      const r = await signInWithGoogle();
      if (r.ok) {
        pushToast('Welcome to the atelier.');
        onClose();
      } else {
        setError(r.message || 'Google sign-in failed — try again.');
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  const reset = () => {
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'reset') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email);
        if (err) throw err;
        pushToast('Password recovery scroll sent! Check your inbox.', 'neem');
        setMode('signin');
        return;
      }
      if (mode === 'signup') {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        pushToast('Welcome, new weaver. The garden opens for you.');
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        pushToast('Welcome back to the atelier.');
      }
      onClose();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[80] bg-neem-950/55 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-[85] grid place-items-center p-3 sm:p-6 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 26 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="pointer-events-auto glass-warm rounded-[26px] w-full max-w-[440px] sm:max-w-[480px] lg:max-w-[900px] lg:h-[620px] max-h-[92dvh] relative overflow-hidden flex flex-col lg:flex-row ring-1 ring-gold-500/25 shadow-[0_40px_90px_-28px_rgba(12,27,19,0.65)]"
            >
              {/* LEFT — the sign-in form */}
              <div className="relative w-full lg:w-[46%] p-6 sm:p-7 overflow-hidden bg-[radial-gradient(120%_100%_at_0%_0%,#fdf9ef_0%,#f2ead8_58%,#eaddc4_100%)]">
              <div className="absolute -top-20 -right-20 w-56 h-56 text-saffron-500/15 pointer-events-none" aria-hidden="true">
                <svg viewBox="0 0 100 100" className="w-full h-full animate-spin-slower" fill="none">
                  <circle cx="50" cy="50" r="46" stroke="currentColor" strokeDasharray="2 5" />
                  <circle cx="50" cy="50" r="28" stroke="currentColor" />
                </svg>
              </div>

              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-full text-ink-500 hover:bg-sand-200/70 transition-colors"
                aria-label="Close"
              >
                <X size={17} />
              </button>

              <div className="relative w-fit text-gold-600">
                <span className="absolute -inset-3 rounded-full bg-gold-400/20 blur-md animate-glow-pulse" aria-hidden="true" />
                <LotusMark className="relative w-11 h-11 drop-shadow-[0_4px_10px_rgba(224,170,31,0.4)]" />
              </div>
              <h2 className="font-display font-semibold text-[27px] leading-[1.1] text-neem-950 mt-4 tracking-tight">
                {mode === 'signin' ? 'Return to the atelier' : mode === 'signup' ? 'Take your seat' : 'Restore access'}
              </h2>
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.7, delay: 0.25, ease }}
                className="origin-left mt-2.5 h-px w-20 bg-gradient-to-r from-gold-500/90 via-gold-400/50 to-transparent"
                aria-hidden="true"
              />
              <p className="text-[13.5px] text-ink-600 mt-3 leading-relaxed">
                {mode === 'signin'
                  ? 'The feed kept your place by the water.'
                  : mode === 'signup'
                  ? 'One account for the feed, the forge and the library.'
                  : 'Enter your email address and we will send you a recovery scroll.'}
              </p>

              <form onSubmit={submit} className="mt-6 space-y-3.5">
                <label className="block">
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-500 inline-flex items-center gap-1.5"><Mail size={11} className="text-saffron-600" /> Email</span>
                  <div className="relative mt-1.5">
                    <Mail size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 transition-colors" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@somewhere.earth"
                      className="peer w-full rounded-2xl border border-sand-300/90 bg-parchment/90 pl-11 pr-4 py-3 text-[14px] text-ink-800 placeholder:text-ink-400 shadow-[inset_0_1px_0_rgb(255_252_240/0.65),0_1px_2px_rgb(78_55_14/0.04)] focus:outline-none focus:ring-[3px] focus:ring-gold-400/45 focus:border-gold-400 focus:bg-parchment transition-all"
                    />
                  </div>
                </label>

                {mode !== 'reset' && (
                  <label className="block">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Password</span>
                      {mode === 'signin' && (
                        <button
                          type="button"
                          onClick={() => {
                            setMode('reset');
                            reset();
                          }}
                          className="text-[11.5px] text-saffron-700 hover:text-saffron-600 font-medium"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative mt-1.5">
                      <Lock size={15} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="at least 6 characters"
                        className="w-full rounded-2xl border border-sand-300/90 bg-parchment/90 pl-11 pr-4 py-3 text-[14px] text-ink-800 placeholder:text-ink-400 shadow-[inset_0_1px_0_rgb(255_252_240/0.65),0_1px_2px_rgb(78_55_14/0.04)] focus:outline-none focus:ring-[3px] focus:ring-gold-400/45 focus:border-gold-400 focus:bg-parchment transition-all"
                      />
                    </div>
                  </label>
                )}

                {error && (
                  <p className="text-[12.5px] text-terra-600 bg-terra-500/10 border border-terra-500/30 rounded-xl px-3.5 py-2.5">
                    {error}
                  </p>
                )}

                <motion.button
                  whileHover={{ scale: 1.015, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  type="submit"
                  disabled={busy}
                  className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-saffron-600 via-saffron-500 to-gold-500 text-parchment font-semibold text-[14px] py-3 mt-0.5 shadow-[0_16px_36px_-12px_rgba(217,111,16,0.65)] hover:shadow-[0_22px_44px_-12px_rgba(217,111,16,0.8)] hover:brightness-105 transition-all disabled:opacity-50 disabled:shadow-none"
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.32),transparent)] transition-transform duration-700 group-hover:translate-x-full" aria-hidden="true" />
                  <span className="relative inline-flex items-center gap-2">
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                    {busy ? 'Weaving…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send recovery scroll'}
                    {!busy && <ArrowRight size={15} className="transition-transform duration-300 group-hover:translate-x-0.5" />}
                  </span>
                </motion.button>
              </form>

              {mode !== 'reset' && (
                <>
                  <div className="flex items-center gap-3 my-4">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-sand-300 to-sand-300" />
                    <span className="w-1.5 h-1.5 rotate-45 bg-gold-400/80 shrink-0" aria-hidden="true" />
                    <span className="text-[10px] uppercase tracking-[0.24em] text-ink-400">or</span>
                    <span className="w-1.5 h-1.5 rotate-45 bg-gold-400/80 shrink-0" aria-hidden="true" />
                    <div className="h-px flex-1 bg-gradient-to-l from-transparent via-sand-300 to-sand-300" />
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={startGoogle}
                    disabled={googleBusy}
                    className="w-full rounded-2xl border border-sand-300/90 bg-parchment font-medium text-[14px] py-3 shadow-[0_8px_20px_-12px_rgba(12,27,19,0.25)] hover:bg-sand-100 hover:shadow-[0_14px_28px_-12px_rgba(12,27,19,0.35)] transition-all inline-flex items-center justify-center gap-2.5 text-ink-800 disabled:opacity-60"
                  >
                    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
                      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z" />
                      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3.01c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.72-4.96H1.28v3.11A12 12 0 0 0 12 24z" />
                      <path fill="#FBBC05" d="M5.28 14.27A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.27V6.62H1.28a12 12 0 0 0 0 10.76l4-3.11z" />
                      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.28 6.62l4 3.11c.94-2.85 3.59-4.96 6.72-4.96z" />
                    </svg>
                    {googleBusy ? 'Opening Google…' : 'Continue with Google'}
                  </motion.button>
                </>
              )}

              {mode === 'reset' ? (
                <p className="text-center text-[12.5px] text-ink-500 mt-4">
                  Remembered your password?{' '}
                  <button
                    onClick={() => {
                      setMode('signin');
                      reset();
                    }}
                    className="font-semibold text-saffron-700 hover:text-saffron-600"
                  >
                    Sign in
                  </button>
                </p>
              ) : (
                <p className="text-center text-[12.5px] text-ink-500 mt-4">
                  {mode === 'signin' ? 'New to the atelier?' : 'Already a weaver?'}{' '}
                  <button
                    onClick={() => {
                      setMode(mode === 'signin' ? 'signup' : 'signin');
                      reset();
                    }}
                    className="font-semibold text-saffron-700 hover:text-saffron-600"
                  >
                    {mode === 'signin' ? 'Create an account' : 'Sign in'}
                  </button>
                </p>
              )}

              {mode === 'signin' && (
                <button
                  onClick={() => {
                    setEmail('demo@ayurverse.app');
                    setPassword('password123');
                    pushToast('Demo credentials filled — press Sign in', 'neem');
                  }}
                  className="mt-4 w-full text-center text-[12px] text-ink-500 hover:text-gold-600 transition-colors inline-flex items-center justify-center gap-1.5 rounded-full border border-dashed border-sand-300/80 py-2 hover:border-gold-400/60 hover:bg-gold-500/5"
                >
                  <Sparkles size={12} />
                  Use the demo account (demo@ayurverse.app)
                </button>
              )}
              </div>
              {/* blended seam — a golden hairline melting the two halves */}
              <div className="hidden lg:block absolute left-[46%] top-5 bottom-5 w-px bg-gradient-to-b from-transparent via-gold-500/45 to-transparent" aria-hidden="true" />
              <div className="hidden lg:block absolute left-[46%] top-0 bottom-0 w-16 -translate-x-1/2 pointer-events-none bg-gradient-to-r from-transparent via-parchment/[0.06] to-transparent" aria-hidden="true" />
              {/* RIGHT — the living showcase (desktop) */}
              <Showcase />
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
