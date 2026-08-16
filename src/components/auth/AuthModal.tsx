import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { KeyRound, Mail, Sparkles, X } from 'lucide-react';
import supabase from '../../lib/supabase';
import { signInWithGoogle } from '../../lib/googleAuth';
import { LotusMark } from '../common/Mandala';
import { useUI } from '../../store/ui';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

export default function AuthModal({ open, onClose }: AuthModalProps) {
  const pushToast = useUI((s) => s.pushToast);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleUrl, setGoogleUrl] = useState<string | null>(null);

  const startGoogle = async () => {
    setGoogleUrl(null);
    setError(null);
    setGoogleBusy(true);
    try {
      const r = await signInWithGoogle('AyurVerse');
      if (!r.ok && r.reason === 'blocked' && r.url) {
        setGoogleUrl(r.url);
      } else if (!r.ok) {
        setError('Google sign-in is not configured on this build — email or the demo account will carry you in.');
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  const reset = () => {
    setError(null);
    setMagicSent(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
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
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendMagic = async () => {
    if (!email) {
      setError('Enter your email first');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (err) throw err;
      setMagicSent(true);
    } catch (err) {
      setError((err as Error).message);
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
          <div className="fixed inset-0 z-[85] grid place-items-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 26 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="pointer-events-auto glass-warm rounded-[26px] w-full max-w-[420px] p-7 relative overflow-hidden"
            >
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

              <div className="text-gold-600">
                <LotusMark className="w-10 h-10" />
              </div>
              <h2 className="font-display font-semibold text-[26px] text-neem-950 mt-3">
                {mode === 'signin' ? 'Return to the atelier' : 'Take your seat'}</h2>
              <p className="text-[13.5px] text-ink-600 mt-1.5">
                {mode === 'signin'
                  ? 'The feed kept your place by the water.'
                  : 'One account for the feed, the forge and the library.'}
              </p>

              <form onSubmit={submit} className="mt-6 space-y-3">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Email</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@somewhere.earth"
                    className="mt-1 w-full rounded-xl border border-sand-300 bg-parchment/80 px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Password</span>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="at least 6 characters"
                    className="mt-1 w-full rounded-xl border border-sand-300 bg-parchment/80 px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400"
                  />
                </label>

                {error && (
                  <p className="text-[12.5px] text-terra-600 bg-terra-500/10 border border-terra-500/30 rounded-xl px-3.5 py-2.5">
                    {error}
                  </p>
                )}
                {magicSent && (
                  <p className="text-[12.5px] text-neem-800 bg-neem-500/10 border border-neem-600/30 rounded-xl px-3.5 py-2.5">
                    A magic link is on its way — check your inbox and follow it here.
                  </p>
                )}

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment font-semibold text-sm py-3 disabled:opacity-50 hover:brightness-105 transition-all shadow-[0_10px_26px_-10px_rgba(217,111,16,0.6)]"
                >
                  <span className="inline-flex items-center gap-2">
                    <KeyRound size={15} />
                    {busy ? 'Weaving…' : mode === 'signin' ? 'Sign in' : 'Create account'}
                  </span>
                </motion.button>

                <button
                  type="button"
                  onClick={sendMagic}
                  disabled={busy}
                  className="w-full rounded-xl border border-sand-300 text-ink-700 font-medium text-sm py-2.5 hover:bg-sand-200/60 transition-colors inline-flex items-center justify-center gap-2"
                >
                  <Mail size={14} />
                  Email me a magic link
                </button>
              </form>

              <div className="flex items-center gap-3 my-4">
                <div className="h-px flex-1 bg-sand-300" />
                <span className="text-[10.5px] uppercase tracking-[0.2em] text-ink-400">or</span>
                <div className="h-px flex-1 bg-sand-300" />
              </div>

              <button
                onClick={startGoogle}
                disabled={googleBusy}
                className="w-full rounded-xl border border-sand-300 bg-parchment/70 font-medium text-sm py-2.5 hover:bg-sand-100 transition-colors inline-flex items-center justify-center gap-2.5 text-ink-800 disabled:opacity-60"
              >
                <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
                  <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3.01c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.78-2.11-6.72-4.96H1.28v3.11A12 12 0 0 0 12 24z" />
                  <path fill="#FBBC05" d="M5.28 14.27A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.27V6.62H1.28a12 12 0 0 0 0 10.76l4-3.11z" />
                  <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.28 6.62l4 3.11c.94-2.85 3.59-4.96 6.72-4.96z" />
                </svg>
                {googleBusy ? 'Opening Google…' : 'Continue with Google'}
              </button>

              <AnimatePresence>
                {googleUrl && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="mt-3 rounded-xl border border-gold-400/50 bg-gold-500/10 px-4 py-3"
                  >
                    <p className="text-[12.5px] text-ink-700 leading-relaxed">
                      Your browser held the popup shut. Continue in a fresh tab — the atelier
                      receives you signed-in.
                    </p>
                    <a
                      href={googleUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-neem-800 px-3.5 py-2 text-[12px] font-semibold text-parchment hover:bg-neem-900 transition-colors"
                    >
                      Open Google sign-in in a new tab
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>

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

              <button
                onClick={() => {
                  setEmail('demo@ayurverse.app');
                  setPassword('password123');
                  pushToast('Demo credentials filled — press Sign in', 'neem');
                }}
                className="mt-3 w-full text-center text-[11.5px] text-ink-400 hover:text-gold-600 transition-colors inline-flex items-center justify-center gap-1.5"
              >
                <Sparkles size={12} />
                Use the demo account (demo@ayurverse.app)
              </button>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
