import supabase from './supabase';
import { ENV } from './env';

const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export interface GoogleStartResult {
  ok: boolean;
  url: string | null;
  reason?: 'blocked' | 'config';
}

function urlFromParts(
  clientId: string | null | undefined,
  redirectUri: string | null | undefined,
  supabaseUrl: string | null | undefined,
  supabaseAnonKey: string | null | undefined,
  appName: string,
): string | null {
  if (!clientId || !redirectUri) return null;
  const state = btoa(JSON.stringify({ origin: window.location.origin, appName, supabaseUrl, supabaseAnonKey }));
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

let cachedRuntimeUrl: string | null = null;

export async function getGoogleAuthUrl(appName: string): Promise<string | null> {
  const direct = urlFromParts(
    ENV.GOOGLE_CLIENT_ID,
    ENV.GOOGLE_AUTH_PROXY,
    ENV.SUPABASE_URL,
    ENV.SUPABASE_ANON_KEY,
    appName,
  );
  if (direct) return direct;
  if (cachedRuntimeUrl) return cachedRuntimeUrl;
  try {
    const res = await fetch('/api/auth-config');
    if (!res.ok) return null;
    const cfg = await res.json();
    const url = urlFromParts(
      cfg.clientId,
      cfg.redirectUri,
      cfg.supabaseUrl || ENV.SUPABASE_URL,
      cfg.supabaseAnonKey || ENV.SUPABASE_ANON_KEY,
      appName,
    );
    cachedRuntimeUrl = url;
    return url;
  } catch {
    return null;
  }
}

let listenerBound = false;

function bindAuthListener() {
  if (listenerBound) return;
  listenerBound = true;
  window.addEventListener('message', async (event: MessageEvent) => {
    if (event.data?.type === 'google-auth-denied') return;
    if (event.data?.type !== 'google-auth-success') return;
    if (event.data.access_token && event.data.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: event.data.access_token,
        refresh_token: event.data.refresh_token,
      });
      if (error) console.error('[google-auth] setSession failed:', error.message);
    } else if (event.data.id_token) {
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: event.data.id_token });
      if (error) console.error('[google-auth] signInWithIdToken failed:', error.message);
    }
  });
}

// Bound at module load so the fallback-anchor path (target=_blank) can also
// deliver credentials via postMessage from the popup tab.
bindAuthListener();

/**
 * Starts Google SSO. Sandboxed iframes and popup blockers silently kill
 * window.open — when that happens this returns the auth URL so callers can
 * render a real target=_blank anchor (user-activated anchor clicks bypass the
 * blockers).
 */
export async function signInWithGoogle(appName = 'AyurVerse'): Promise<GoogleStartResult> {
  const url = await getGoogleAuthUrl(appName);
  if (!url) return { ok: false, url: null, reason: 'config' };

  let win: Window | null = null;
  try {
    win = window.open(url, 'google-auth', isMobile() ? '' : 'width=520,height=640,left=200,top=80');
  } catch {
    win = null;
  }
  if (!win || win.closed) return { ok: false, url, reason: 'blocked' };
  return { ok: true, url };
}

export async function handleGoogleRedirect() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('google_id_token');
  if (!token) return;
  window.history.replaceState({}, '', window.location.pathname);
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token });
  if (error) {
    console.error('[google-auth] signInWithIdToken failed:', error.message);
    return;
  }
  try {
    window.close();
  } catch {
    /* noop */
  }
}
