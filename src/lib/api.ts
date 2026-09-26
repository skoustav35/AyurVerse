import { firebaseAuth } from './firebase';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * apiFetch — attaches the Firebase Auth ID token (project: ananta-ayurverse)
 * as `Authorization: Bearer <idToken>` so Vercel /api/* routes can verify
 * the caller via Firebase Admin `verifyIdToken()`.
 * Falls back to an unauthenticated request when signed out.
 */
export async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  let idToken: string | null = null;
  try {
    idToken = (await firebaseAuth?.currentUser?.getIdToken()) || null;
  } catch {
    idToken = null;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;

  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* keep default message */
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
