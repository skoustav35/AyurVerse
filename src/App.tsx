import { useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import AppShell from './components/shell/AppShell';
import Landing from './components/Landing';
import ToastHost from './components/common/Toast';
import { LotusMark } from './components/common/Mandala';

function Splash() {
  return (
    <div className="h-screen grid place-items-center bg-[radial-gradient(120%_90%_at_50%_0%,#1b4230,#0c1b13)]">
      <div className="text-center">
        <div className="text-gold-400 animate-pulse mx-auto w-fit">
          <LotusMark className="w-14 h-14" />
        </div>
        <p className="font-display font-bold text-2xl text-parchment mt-4">
          Ayur<span className="text-saffron-400">Verse</span>
        </p>
        <p className="text-[10px] uppercase tracking-[0.3em] text-sand-200/60 mt-2">boiling the decoction…</p>
      </div>
    </div>
  );
}

function Root() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  return user ? <AppShell /> : <Landing />;
}

export default function App() {
  // --vvh = live visualViewport height; real mobile URL-bars overlay the bottom
  // of a fixed body, so the app shell sizes itself to what is actually visible.
  useEffect(() => {
    const apply = () =>
      document.documentElement.style.setProperty(
        '--vvh',
        `${window.visualViewport?.height ?? window.innerHeight}px`,
      );
    apply();
    window.visualViewport?.addEventListener('resize', apply);
    window.visualViewport?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    return () => {
      window.visualViewport?.removeEventListener('resize', apply);
      window.visualViewport?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
    };
  }, []);

  return (
    <AuthProvider>
      <ErrorBoundary>
        <Root />
      </ErrorBoundary>
      <ToastHost />
    </AuthProvider>
  );
}
