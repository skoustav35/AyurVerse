import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Images, Feather, MessagesSquare, Hash, Camera, Users } from 'lucide-react';
import { uploadMedia } from '../../lib/upload';
import { useCreateGroup } from '../../hooks/queries';
import { useUI } from '../../store/ui';

const KINDS = [
  { id: 'feed', label: 'Feed circle', hint: 'share photos & videos together', icon: Images },
  { id: 'forge', label: 'Forge circle', hint: 'long-form lore & scrolls', icon: Feather },
  { id: 'thread', label: 'Thread circle', hint: 'a group chat room', icon: MessagesSquare },
] as const;

export default function CreateGroupModal() {
  const open = useUI((s) => s.createGroupOpen);
  const close = useUI((s) => s.closeCreateGroup);
  const initialKind = useUI((s) => s.createGroupKind);
  const openGroup = useUI((s) => s.openGroup);
  const pushToast = useUI((s) => s.pushToast);
  const create = useCreateGroup();

  const [kind, setKind] = useState<'feed' | 'forge' | 'thread'>('feed');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagText, setTagText] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setKind(initialKind);
      setName('');
      setDescription('');
      setTagText('');
      setAvatarUrl('');
    }
  }, [open, initialKind]);

  const handleAvatar = async (file: File) => {
    if (file.size > 32 * 1024 * 1024) {
      pushToast('Image must be under 32MB', 'error');
      return;
    }
    try {
      setBusy(true);
      const url = await uploadMedia(file);
      setAvatarUrl(url);
    } catch (err) {
      pushToast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (!name.trim()) {
      pushToast('Give your circle a name', 'error');
      return;
    }
    const tags = tagText.split(/[,\s]+/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
    create.mutate(
      { name: name.trim(), kind, description: description.trim(), tags, avatar_url: avatarUrl || null },
      {
        onSuccess: (data) => {
          close();
          openGroup(data.group.id);
        },
      },
    );
  };

  const inputClass =
    'mt-1 w-full rounded-xl border border-sand-300 bg-parchment/85 px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400/60 focus:border-gold-400';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} className="fixed inset-0 z-[80] bg-neem-950/55 backdrop-blur-sm" />
          <div className="fixed inset-0 z-[85] grid place-items-end sm:place-items-center p-0 sm:p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="pointer-events-auto w-full sm:max-w-lg max-h-[92dvh] flex flex-col bg-parchment rounded-t-[26px] sm:rounded-[26px] overflow-hidden shadow-[0_-20px_60px_-20px_rgba(12,27,19,0.6)]"
            >
              <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-sand-300/70">
                <div className="flex items-center gap-2.5">
                  <span className="grid place-items-center w-9 h-9 rounded-full bg-gradient-to-br from-saffron-500/20 to-gold-400/15 ring-1 ring-gold-500/30">
                    <Users size={16} className="text-saffron-600" />
                  </span>
                  <p className="font-display font-semibold text-[16px] text-neem-950">Found a circle</p>
                </div>
                <button onClick={close} className="grid place-items-center w-8 h-8 rounded-full text-ink-500 hover:bg-sand-200/70" aria-label="Close">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-4">
                {/* kind */}
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Kind of circle</span>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {KINDS.map((k) => {
                      const active = kind === k.id;
                      return (
                        <button
                          key={k.id}
                          onClick={() => setKind(k.id)}
                          className={`relative rounded-2xl border p-3 text-center transition-colors ${
                            active ? 'border-saffron-500/70 bg-saffron-500/10' : 'border-sand-300 hover:border-gold-500/50 bg-parchment/60'
                          }`}
                        >
                          <k.icon size={18} className={`mx-auto ${active ? 'text-saffron-600' : 'text-ink-400'}`} />
                          <p className={`text-[12px] font-semibold mt-1.5 ${active ? 'text-neem-900' : 'text-ink-700'}`}>{k.label}</p>
                          <p className="text-[9.5px] text-ink-500 mt-0.5 leading-tight">{k.hint}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* avatar + name */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="relative shrink-0 grid place-items-center w-14 h-14 rounded-2xl border border-dashed border-sand-300 hover:border-gold-500/60 bg-parchment/60 overflow-hidden"
                  >
                    {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : <Camera size={18} className="text-sand-400" />}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAvatar(f);
                    }}
                  />
                  <label className="block flex-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Name</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Ayurvedic Kitchen" className={inputClass} />
                  </label>
                </div>

                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Description</span>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={600} placeholder="What is this circle for? Who should join?" className={`${inputClass} resize-none`} />
                </label>

                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500 inline-flex items-center gap-1">
                    <Hash size={11} /> Tags
                  </span>
                  <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="cooking, spice, recipes" className={inputClass} />
                </label>
              </div>

              <div className="shrink-0 border-t border-sand-300/70 px-5 pt-3.5 pb-[calc(0.9rem+env(safe-area-inset-bottom))] bg-parchment/80 backdrop-blur">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={submit}
                  disabled={create.isPending || !name.trim()}
                  className="w-full rounded-xl bg-gradient-to-r from-saffron-600 to-gold-500 text-parchment font-semibold text-sm py-3.5 disabled:opacity-40 hover:brightness-105"
                >
                  {create.isPending ? 'Founding…' : 'Found the circle'}
                </motion.button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
