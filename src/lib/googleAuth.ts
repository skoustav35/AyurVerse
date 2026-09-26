import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import { firebaseAuth } from './firebase';

/**
 * Google sign-in — pure Firebase Auth (project: ananta-ayurverse).
 * Replaces the retired designarena.ai proxy + Supabase lane.
 *
 * Popup first (fast); if the browser blocks it, fall back to full-page
 * redirect, which always works. Redirect results are completed by
 * handleGoogleRedirect() at app boot (see main.tsx).
 */
export interface GoogleStartResult {
  ok: boolean;
  url: string | null;
  reason?: 'blocked' | 'config' | 'error';
  message?: string;
}

export function friendlyAuthError(e: any): string {
  const code = e?.code || '';
  const msg = String(e?.message || '');
  if (code === 'auth/configuration-not-found' || /CONFIGURATION_NOT_FOUND/i.test(msg)) {
    return 'Sign-in is not switched on yet — open Firebase Console → Authentication → Get started, then enable Google and Email/Password for project ananta-ayurverse.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'This sign-in method is disabled — enable it in Firebase Console → Authentication → Sign-in method.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized — in Firebase Console → Authentication → Settings → Authorized domains, add localhost and your deploy domain.';
  }
  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'Wrong email or password.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'That email already has an account — sign in instead.';
  }
  if (code === 'auth/weak-password') {
    return 'Password needs at least 6 characters.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'The Google popup was closed — try again.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network hiccup — check your connection and retry.';
  }
  return msg || 'Sign-in failed — try again.';
}

export async function signInWithGoogle(): Promise<GoogleStartResult> {
  if (!firebaseAuth) {
    return { ok: false, url: null, reason: 'config', message: 'Firebase Auth is not configured in this build.' };
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(firebaseAuth, provider);
    return { ok: true, url: null };
  } catch (e: any) {
    const code = e?.code || '';
    if (code === 'auth/popup-blocked' || code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      // Popup didn't survive — redirect always does.
      try {
        await signInWithRedirect(firebaseAuth, provider);
        return { ok: true, url: null };
      } catch (e2: any) {
        return { ok: false, url: null, reason: 'error', message: friendlyAuthError(e2) };
      }
    }
    return { ok: false, url: null, reason: 'error', message: friendlyAuthError(e) };
  }
}

/** Completes a redirect sign-in when the user returns from Google. */
export async function handleGoogleRedirect() {
  if (!firebaseAuth) return;
  try {
    await getRedirectResult(firebaseAuth);
  } catch {
    /* the error resurfaces with context on the next explicit sign-in */
  }
}
