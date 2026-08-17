import { CENTRAL } from './env.js';

const PROJECT_REF = CENTRAL.PROJECT_REF;
const RESTORE_URL = CENTRAL.RESTORE_API_URL;

let _restoreTriggered = new Map();

export function triggerRestore(ref = PROJECT_REF) {
  if (!ref || !RESTORE_URL) return;
  const last = _restoreTriggered.get(ref) || 0;
  if (Date.now() - last < 60000) return;
  _restoreTriggered.set(ref, Date.now());
  fetch(RESTORE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_ref: ref }),
  }).catch(() => {});
}
