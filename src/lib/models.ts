/* The Vaidya mind menu — mirrors api/vaidya.js's capability contract. */

export interface ModelMeta {
  id: string;
  label: string;
  house: string;
  note: string;
  reasoning: 'full' | 'ignored' | 'omit';
  defaultEffort?: 'low' | 'medium' | 'high' | 'max';
  swift?: boolean;
}

export const VAIDYA_MODELS: ModelMeta[] = [
  {
    id: 'deepseek-v4-flash-free',
    label: 'DeepSeek v4 Flash',
    house: 'deepseek',
    note: 'full chain-of-thought, swift',
    reasoning: 'full',
    defaultEffort: 'max',
    swift: true,
  },
  {
    id: 'big-pickle',
    label: 'Big Pickle',
    house: 'opencode',
    note: 'patient reasoner, house favorite',
    reasoning: 'full',
    defaultEffort: 'high',
  },
  {
    id: 'nemotron-3.5-lightning-free',
    label: 'Nemotron 3.5 Lightning',
    house: 'nvidia',
    note: 'quick answers, no chain',
    reasoning: 'ignored',
    swift: true,
  },
  {
    id: 'nemotron-3-ultra-free',
    label: 'Nemotron 3 Ultra',
    house: 'nvidia',
    note: 'largest reasoning-free mind',
    reasoning: 'ignored',
  },
  {
    id: 'laguna-s-2.1-free',
    label: 'Laguna S 2.1',
    house: 'laguna',
    note: 'calm generalist',
    reasoning: 'ignored',
  },
  {
    id: 'mimo-v2.5-free',
    label: 'MiMo v2.5',
    house: 'xiaomi',
    note: 'light and playful',
    reasoning: 'ignored',
    swift: true,
  },
  {
    id: 'hy3-free',
    label: 'HY3',
    house: 'hy',
    note: 'strictest palate (no effort param)',
    reasoning: 'omit',
    swift: true,
  },
];

export const EFFORTS = [
  { id: null, label: 'Intuition' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'max', label: 'Deep' },
] as const;

export type EffortId = (typeof EFFORTS)[number]['id'];

export function modelById(id: string): ModelMeta {
  return VAIDYA_MODELS.find((m) => m.id === id) || VAIDYA_MODELS[0];
}
