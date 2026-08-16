import { CENTRAL } from './env.js';

const PROJECT_REF = CENTRAL.PROJECT_REF;
const RESTORE_URL = CENTRAL.RESTORE_API_URL;

let _restoreTriggered = false;

export function triggerRestore() {
  if (_restoreTriggered || !PROJECT_REF || !RESTORE_URL) return;
  _restoreTriggered = true;
  fetch(RESTORE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_ref: PROJECT_REF }),
  }).catch(() => {});
  setTimeout(() => { _restoreTriggered = false; }, 60000);
}
