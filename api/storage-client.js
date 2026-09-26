import { CENTRAL } from './env.js';

// Media bucket via Firebase Storage (project: ananta-ayurverse).
// Keeps the same surface posts.js expects (getPublicUrl / upload / remove)
// so delete-cleanup keeps working; bytes flow to Firebase Storage, not Supabase.
const BUCKET = CENTRAL.FIREBASE_STORAGE_BUCKET || 'ananta-ayurverse.firebasestorage.app';

async function bucket() {
  const [{ initializeApp, getApps, cert, applicationDefault }, { getStorage }] =
    await Promise.all([import('firebase-admin'), import('firebase-admin/storage')]);
  if (!getApps().length) {
    const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (svcJson) {
      initializeApp({
        credential: cert(JSON.parse(svcJson)),
        projectId: CENTRAL.FIREBASE_PROJECT_ID,
        storageBucket: BUCKET,
      });
    } else {
      initializeApp({
        credential: applicationDefault(),
        projectId: CENTRAL.FIREBASE_PROJECT_ID,
        storageBucket: BUCKET,
      });
    }
  }
  return getStorage().bucket();
}

const mediaBucket = {
  getPublicUrl: (p) => ({ data: { publicUrl: `https://storage.googleapis.com/${BUCKET}/media/${p}` } }),
  upload: async () => ({ error: { message: 'use client-side Firebase Storage upload (see src/lib/upload.ts)' } }),
  createSignedUploadUrl: async () => ({ data: null, error: { message: 'use client-side Firebase Storage upload' } }),
  remove: async (paths) => {
    try {
      const b = await bucket();
      await Promise.all((paths || []).map((p) => b.file(`media/${p}`).delete({ ignoreNotFound: true })));
      return {};
    } catch {
      return {};
    }
  },
};

export default mediaBucket;
