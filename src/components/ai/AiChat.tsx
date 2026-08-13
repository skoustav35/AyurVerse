import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Sparkles,
  Send,
  Plus,
  History,
  Trash2,
  CheckCircle2,
  Feather,
  UserPlus,
  MessageSquare,
  PencilLine,
  Search as SearchIcon,
  Loader2,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { useUI } from '../../store/ui';
import Mandala from '../common/Mandala';

const Markdown = lazy(() => import('../reader/Markdown'));

interface ActionReceipt {
  tool: string;
  summary: string;
}
interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  actions?: ActionReceipt[];
  ts: number;
  error?: boolean;
}
interface Session {
  id: string;
  title: string;
  messages: ChatMsg[];
  updatedAt: number;
}

const QUICK_PROMPTS = [
  { icon: Feather, label: 'Write & publish a lore post', text: 'Write and publish a Deep Lore post about the three doshas of Ayurveda — give it a distinct title, a one-line summary, tags, and a rich manuscript.' },
  { icon: SearchIcon, label: 'Find weavers to follow', text: 'Find some interesting weavers I could follow and tell me about them.' },
  { icon: UserPlus, label: 'Follow a channel', text: 'Follow @anaya.veda for me.' },
  { icon: MessageSquare, label: 'Message someone', text: 'Send @anaya.veda a warm hello from me in a thread.' },
  { icon: PencilLine, label: 'Refresh my bio', text: 'Rewrite my profile bio to sound warm, ayurvedic and inviting, then save it.' },
];

const toolIcon = (tool: string) => {
  if (tool.includes('lore') || tool === 'edit_post') return Feather;
  if (tool.includes('follow')) return UserPlus;
  if (tool.includes('thread') || tool.includes('message')) return MessageSquare;
  if (tool.includes('profile')) return PencilLine;
  if (tool.includes('find') || tool.includes('list')) return SearchIcon;
  return CheckCircle2;
};

function storeKey(uid: string) {
  return `av_vaidya_${uid}`;
}
function loadSessions(uid: string): { sessions: Session[]; activeId: string | null } {
  try {
    const raw = localStorage.getItem(storeKey(uid));
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { sessions: [], activeId: null };
}

const newSession = (): Session => ({ id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, title: 'New conversation', messages: [], updatedAt: Date.now() });

export default function AiChat({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  const uid = user?.id ?? 'anon';
  const queryClient = useQueryClient();
  const pushToast = useUI((s) => s.pushToast);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const loadedRef = useRef(false);

  // hydrate from storage on mount / user change
  useEffect(() => {
    const { sessions: s, activeId: a } = loadSessions(uid);
    if (s.length) {
      setSessions(s);
      setActiveId(a && s.some((x) => x.id === a) ? a : s[0].id);
    } else {
      const fresh = newSession();
      setSessions([fresh]);
      setActiveId(fresh.id);
    }
    loadedRef.current = true;
  }, [uid]);

  // persist
  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      localStorage.setItem(storeKey(uid), JSON.stringify({ sessions, activeId }));
    } catch {
      /* quota */
    }
  }, [sessions, activeId, uid]);

  const active = useMemo(() => sessions.find((s) => s.id === activeId) || null, [sessions, activeId]);
  const messages = active?.messages ?? [];

  // autoscroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages.length, pending]);

  const autoGrow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 132)}px`;
  };
  useEffect(autoGrow, [input]);

  const startNew = () => {
    const fresh = newSession();
    setSessions((prev) => [fresh, ...prev].slice(0, 20));
    setActiveId(fresh.id);
    setHistoryOpen(false);
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (!next.length) {
        const fresh = newSession();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  };

  const patchActive = (updater: (s: Session) => Session) =>
    setSessions((prev) => prev.map((s) => (s.id === activeId ? updater(s) : s)));

  const send = async (text: string) => {
    const body = text.trim();
    if (!body || pending || !activeId) return;
    setInput('');

    const userMsg: ChatMsg = { role: 'user', content: body, ts: Date.now() };
    patchActive((s) => ({
      ...s,
      title: s.messages.length === 0 ? body.slice(0, 42) : s.title,
      messages: [...s.messages, userMsg],
      updatedAt: Date.now(),
    }));

    // rolling memory: last 10 turns (including this one)
    const prior = (sessions.find((s) => s.id === activeId)?.messages ?? []).concat(userMsg);
    const memory = prior.slice(-10).map((m) => ({ role: m.role, content: m.content }));

    setPending(true);
    try {
      const res = await apiFetch<{ reply: string; actions?: ActionReceipt[]; disabled?: boolean }>('/api/agent', {
        method: 'POST',
        body: JSON.stringify({ messages: memory }),
      });
      const asst: ChatMsg = { role: 'assistant', content: res.reply || '…', actions: res.actions ?? [], ts: Date.now() };
      patchActive((s) => ({ ...s, messages: [...s.messages, asst], updatedAt: Date.now() }));

      // if the agent changed account state, refresh the relevant caches
      if (res.actions && res.actions.length) {
        for (const key of ['my-posts', 'feed', 'posts', 'follows', 'me-profile', 'threads', 'profiles', 'stories', 'studio']) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
        pushToast(`Vaidya completed ${res.actions.length} action${res.actions.length > 1 ? 's' : ''}`, 'neem');
      }
    } catch (err) {
      const asst: ChatMsg = { role: 'assistant', content: (err as Error).message || 'Something interrupted the thread. Try again in a moment.', ts: Date.now(), error: true };
      patchActive((s) => ({ ...s, messages: [...s.messages, asst], updatedAt: Date.now() }));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-parchment-deep/40">
      {/* Header */}
      <header className="shrink-0 px-4 py-3 border-b border-sand-300/70 bg-gradient-to-b from-parchment/80 to-transparent">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="grid place-items-center w-9 h-9 rounded-full bg-gradient-to-br from-neem-800 to-neem-700 ring-1 ring-gold-500/40 shrink-0">
              <Sparkles size={16} className="text-gold-300" />
            </span>
            <div className="min-w-0">
              <p className="font-display font-semibold text-[15.5px] text-neem-950 leading-tight">Vaidya</p>
              <p className="text-[10.5px] text-ink-500 leading-tight truncate">your in-account AI · powered by big-pickle</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={startNew} title="New chat" className="grid place-items-center w-8 h-8 rounded-full text-ink-500 hover:bg-sand-200/70 hover:text-neem-800 transition-colors">
              <Plus size={17} />
            </button>
            <button onClick={() => setHistoryOpen((o) => !o)} title="History" className={`grid place-items-center w-8 h-8 rounded-full transition-colors ${historyOpen ? 'bg-neem-800 text-parchment' : 'text-ink-500 hover:bg-sand-200/70 hover:text-neem-800'}`}>
              <History size={16} />
            </button>
            {onClose && (
              <button onClick={onClose} title="Close" className="grid place-items-center w-8 h-8 rounded-full text-ink-500 hover:bg-sand-200/70 lg:hidden">
                <X size={17} />
              </button>
            )}
          </div>
        </div>

        {/* History dropdown */}
        <AnimatePresence>
          {historyOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-1 max-h-52 overflow-y-auto">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`group flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer transition-colors ${s.id === activeId ? 'bg-neem-800 text-parchment' : 'hover:bg-sand-200/60 text-ink-700'}`}
                    onClick={() => {
                      setActiveId(s.id);
                      setHistoryOpen(false);
                    }}
                  >
                    <History size={13} className={s.id === activeId ? 'text-gold-300' : 'text-ink-400'} />
                    <span className="flex-1 min-w-0 truncate text-[12.5px] font-medium">{s.title || 'Untitled'}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSession(s.id);
                      }}
                      className={`opacity-0 group-hover:opacity-100 transition-opacity ${s.id === activeId ? 'text-parchment/70 hover:text-parchment' : 'text-ink-400 hover:text-terra-600'}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !pending && (
          <div className="relative h-full flex flex-col items-center justify-center text-center px-2">
            <Mandala className="absolute inset-0 m-auto w-56 h-56 text-gold-500/10 animate-spin-slower pointer-events-none" />
            <span className="relative grid place-items-center w-14 h-14 rounded-2xl bg-gradient-to-br from-neem-800 to-neem-700 ring-1 ring-gold-500/40">
              <Sparkles size={22} className="text-gold-300" />
            </span>
            <p className="relative font-display font-semibold text-[19px] text-neem-950 mt-4">Namaste, I am Vaidya</p>
            <p className="relative text-[12.5px] text-ink-600 leading-relaxed mt-1.5 max-w-[260px]">
              Ask me to write &amp; publish lore, edit a post, find and follow weavers, send a message, refresh your bio —
              I act right inside your account.
            </p>
            <div className="relative mt-5 w-full space-y-1.5">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q.label}
                  onClick={() => send(q.text)}
                  className="w-full flex items-center gap-2.5 rounded-xl border border-sand-300 bg-parchment/70 px-3 py-2.5 text-left hover:border-gold-500/60 hover:bg-parchment transition-colors"
                >
                  <span className="grid place-items-center w-7 h-7 rounded-full bg-saffron-500/15 text-saffron-600 shrink-0">
                    <q.icon size={14} />
                  </span>
                  <span className="text-[12.5px] font-medium text-ink-700">{q.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble key={i} msg={m} />
        ))}

        {pending && (
          <div className="flex items-center gap-2 pl-1">
            <span className="grid place-items-center w-8 h-8 rounded-full bg-gradient-to-br from-neem-800 to-neem-700 ring-1 ring-gold-500/40 shrink-0">
              <Sparkles size={14} className="text-gold-300" />
            </span>
            <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-md bg-parchment border border-sand-300 px-3.5 py-3">
              {[0, 1, 2].map((d) => (
                <motion.span
                  key={d}
                  className="w-1.5 h-1.5 rounded-full bg-saffron-500"
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                  transition={{ repeat: Infinity, duration: 0.9, delay: d * 0.15 }}
                />
              ))}
              <span className="text-[11px] text-ink-500 ml-1 font-display italic">Vaidya is working…</span>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-sand-300/70 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-parchment/80 backdrop-blur">
        <div className="flex items-end gap-2 rounded-2xl border border-sand-300 bg-parchment px-3 py-2 focus-within:ring-2 focus-within:ring-gold-400/60 focus-within:border-gold-400 transition-shadow">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask Vaidya to do anything in your account…"
            disabled={pending}
            className="flex-1 resize-none bg-transparent outline-none text-[14px] text-ink-900 placeholder:text-ink-400 leading-relaxed max-h-[132px] py-1"
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => send(input)}
            disabled={pending || !input.trim()}
            className="grid place-items-center w-9 h-9 rounded-full bg-gradient-to-br from-saffron-600 to-gold-500 text-parchment shrink-0 disabled:opacity-40 hover:brightness-105 transition-all"
            aria-label="Send"
          >
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} className="-translate-x-[1px]" />}
          </motion.button>
        </div>
        <p className="text-[9.5px] text-ink-400 text-center mt-1.5">Vaidya can publish, edit, follow &amp; message on your behalf · remembers your last 10 turns</p>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMsg }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-gradient-to-br from-neem-800 to-neem-700 text-parchment px-4 py-2.5 shadow-[0_6px_16px_-8px_rgba(18,41,28,0.6)]">
          <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <span className="grid place-items-center w-8 h-8 rounded-full bg-gradient-to-br from-neem-800 to-neem-700 ring-1 ring-gold-500/40 shrink-0 mt-0.5">
        <Sparkles size={14} className="text-gold-300" />
      </span>
      <div className="max-w-[85%] min-w-0">
        <div className={`rounded-2xl rounded-tl-md px-4 py-3 border ${msg.error ? 'bg-terra-500/10 border-terra-500/30' : 'bg-parchment border-sand-300'}`}>
          <div className="prose-vaidya text-[13.5px] text-ink-800 leading-relaxed break-words">
            <Suspense fallback={<p className="text-[13.5px] whitespace-pre-wrap">{msg.content}</p>}>
              <Markdown source={msg.content} />
            </Suspense>
          </div>
        </div>
        {msg.actions && msg.actions.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {msg.actions.map((a, i) => {
              const Ic = toolIcon(a.tool);
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="inline-flex items-center gap-2 rounded-full bg-neem-500/10 border border-neem-500/25 px-3 py-1.5 mr-1.5"
                >
                  <span className="grid place-items-center w-5 h-5 rounded-full bg-neem-600/20 text-neem-700 shrink-0">
                    <Ic size={11} />
                  </span>
                  <span className="text-[11.5px] font-medium text-neem-800">{a.summary}</span>
                  <CheckCircle2 size={12} className="text-neem-600" />
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
