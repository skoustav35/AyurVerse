/**
 * Default fallback seeds for AyurVerse data collections.
 * Ensures the application is immediately usable, rich, and responsive
 * even when offline or when external cloud database quotas are limited.
 */

const T0 = Date.now();
const iso = (minsAgo) => new Date(T0 - minsAgo * 60000).toISOString();

export const DEFAULT_PROFILES = [
  { id: 1, user_id: 'demo-vaidya-1', username: 'vaidya.meera', full_name: 'Vaidya Meera Nair', bio: 'Kerala panchakarma physician · 15 yrs clinical practice', avatar_url: null, created_at: iso(5000) },
  { id: 2, user_id: 'demo-vaidya-2', username: 'arjun.rasa', full_name: 'Arjun Rasa', bio: 'Rasashastra student & herbal grower · medicinal chemistry', avatar_url: null, created_at: iso(4800) },
  { id: 3, user_id: 'demo-vaidya-3', username: 'tulsi.threads', full_name: 'Tulsi Threads', bio: 'Ayurvedic kitchen · recipes & living rituals', avatar_url: null, created_at: iso(4600) },
  { id: 4, user_id: 'vaidya-lakshmi', username: 'vaidya.lakshmi', full_name: 'Vaidya Lakshmi Menon', bio: 'Kerala panchakarma consultant · Karkidaka chikitsa', avatar_url: null, created_at: iso(4500) },
  { id: 5, user_id: 'raghavan-siddha', username: 'raghavan.siddha', full_name: 'Dr. S. Raghavan', bio: 'Tamil Nadu vaidya & palm-leaf manuscript researcher', avatar_url: null, created_at: iso(4400) },
  { id: 6, user_id: 'prakash-bhat', username: 'prakash.bhat', full_name: 'Vaidya Prakash Bhat', bio: 'Mysuru ashtanga-vaidya & herb curator', avatar_url: null, created_at: iso(4300) },
  { id: 7, user_id: 'anjali-d', username: 'anjali.d', full_name: 'Dr. Anjali Deshmukh', bio: 'Pune stri-roga specialist · maternal wellness', avatar_url: null, created_at: iso(4200) },
  { id: 8, user_id: 'k-patel', username: 'k.patel', full_name: 'Vaidya Kanaiyalal Patel', bio: 'Ahmedabad rasashastra pharmacist & bhavana master', avatar_url: null, created_at: iso(4100) },
  { id: 9, user_id: 'ritu-rathore', username: 'ritu.rathore', full_name: 'Dr. Ritu Rathore', bio: 'Jaipur desert-climate consultant & ritucharya guide', avatar_url: null, created_at: iso(4000) },
  { id: 10, user_id: 'harpreet-s', username: 'harpreet.s', full_name: 'Vaidya Harpreet Singh', bio: 'Amritsar vata-vyadhi physician & joint specialist', avatar_url: null, created_at: iso(3900) },
  { id: 11, user_id: 'chandrima-b', username: 'chandrima.b', full_name: 'Dr. Chandrima Bose', bio: 'Kolkata kaviraj lineage holder · classical botany', avatar_url: null, created_at: iso(3800) },
  { id: 12, user_id: 'dibakar-das', username: 'dibakar.das', full_name: 'Vaidya Dibakar Das', bio: 'Guwahati folk-formula documentarian & ethno-botanist', avatar_url: null, created_at: iso(3700) },
  { id: 13, user_id: 'rinchen-d', username: 'rinchen.d', full_name: 'Dr. Rinchen Dolma', bio: 'Leh Sowa Rigpa amchi & Himalayan alpine herbalist', avatar_url: null, created_at: iso(3600) },
  { id: 14, user_id: 'vikram-aditya', username: 'vikram.aditya', full_name: 'Vaidya Vikram Aditya', bio: 'Varanasi BHU faculty · Charaka Samhita lecturer', avatar_url: null, created_at: iso(3500) },
  { id: 15, user_id: 'meera-k', username: 'meera.k', full_name: 'Dr. Meera Krishnan', bio: 'Coimbatore yoga-ayurveda integrator & pranayama mentor', avatar_url: null, created_at: iso(3400) },
  { id: 16, user_id: 'farooq-a', username: 'farooq.a', full_name: 'Vaidya Farooq Ahmed', bio: 'Srinagar unani-ayurveda bridge physician · temperament studies', avatar_url: null, created_at: iso(3300) },
  { id: 17, user_id: 'sunita-p', username: 'sunita.p', full_name: 'Dr. Sunita Patnaik', bio: 'Bhubaneswar dietetics researcher & pathya kitchen architect', avatar_url: null, created_at: iso(3200) },
  { id: 18, user_id: 'tashi-w', username: 'tashi.w', full_name: 'Vaidya Tashi Wangmu', bio: 'Gangtok high-altitude medicine & cordyceps researcher', avatar_url: null, created_at: iso(3100) },
  { id: 19, user_id: 'arvind-nair', username: 'arvind.nair', full_name: 'Dr. Arvind Nair', bio: 'Delhi respiratory specialist & pippali rasayana researcher', avatar_url: null, created_at: iso(3000) },
  { id: 20, user_id: 'LCCzp5cvMQUChN7PDce1ikSBwri2', username: 'skoustav35', full_name: 'Koustav Sarkar', bio: 'New weaver in the atelier.', avatar_url: null, created_at: iso(60) },
  { id: 21, user_id: 'aaradhya-sharma', username: 'aaradhya.sharma', full_name: 'Aaradhya Sharma', bio: 'Herbal traditions & classical ayurvedic studies.', avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', created_at: iso(120) },
];

export const DEFAULT_GROUPS = [
  { id: 1, name: 'Dinacharya Club', slug: 'dinacharya-club', description: 'Daily routine check-ins, sunrise oiling, and seasonal tweaks.', kind: 'circle', owner_id: 'demo-vaidya-1', tags: ['dinacharya', 'routine', 'ayurveda'], member_count: 148, conversation_id: 1, created_at: iso(3000) },
  { id: 2, name: 'Rasa Lab', slug: 'rasa-lab', description: 'Classical pharmacy study circle & mineral purification assays.', kind: 'study', owner_id: 'demo-vaidya-2', tags: ['rasashastra', 'shodhana', 'chemistry'], member_count: 94, conversation_id: 2, created_at: iso(2500) },
  { id: 3, name: 'Atelier Scribes', slug: 'atelier-scribes', description: 'Bengali verse, poetic meter, prose translations and Sanskrit rhythms.', kind: 'circle', owner_id: 'demo-vaidya-3', tags: ['poetry', 'tagore', 'manuscripts'], member_count: 220, conversation_id: 3, created_at: iso(2000) },
  { id: 4, name: 'AyurML Collective', slug: 'ayurml-collective', description: 'Ancient diagnostic taxonomy meets modern neural embeddings.', kind: 'study', owner_id: 'demo-vaidya-1', tags: ['transformers', 'machine-learning', 'taxonomy'], member_count: 76, conversation_id: 4, created_at: iso(1800) },
];

export const DEFAULT_POSTS = [
  {
    id: 1,
    kind: 'visual',
    author_id: 'demo-vaidya-1',
    author_name: 'Vaidya Meera Nair',
    author_username: 'vaidya.meera',
    author_avatar: null,
    caption: 'Morning abhyanga — warm sesame oil, slow strokes, before sunrise. The nervous system drinks it first. Never heat oil twice.',
    title: 'The Ritual of Dawn Abhyanga',
    summary: 'A mindful guide to traditional sesame oil massage before the first rays of sun.',
    content_md: null,
    media_url: null,
    media_type: 'image',
    tags: ['abhyanga', 'dinacharya', 'vata', 'ayurveda'],
    likes_count: 142,
    saves_count: 67,
    comments_count: 12,
    views_count: 1240,
    created_at: iso(180)
  },
  {
    id: 2,
    kind: 'forge',
    author_id: 'demo-vaidya-2',
    author_name: 'Arjun Rasa',
    author_username: 'arjun.rasa',
    author_avatar: null,
    caption: null,
    title: 'Rasashastra notes: what shodhana actually removes',
    summary: 'Purification is not symbolism — a practical look at herbal decoction cycles, quenching temperatures, and mineral assay results.',
    content_md: '# Shodhana, practically\n\nShodhana (purification) of metals and minerals uses repeated quenching in herbal decoctions. Each cycle transforms brittle crystalline structures into biologically absorbable nano-aggregates.\n\n## The Three Triphala Quenches\nWhen gold and copper sheets are heated to cherry-red and immersed in fresh Triphala kwatha, tannin-metal chelates form immediately at the surface.\n\n$$\\text{Surface Reduction Rate} = k \\cdot [\\text{Tannins}] \\cdot \\Delta T$$\n\nObserve the colour transition from brassy brilliance to deep ochre.',
    media_url: null,
    media_type: null,
    tags: ['rasashastra', 'shodhana', 'chemistry', 'ayurveda'],
    read_minutes: 5,
    likes_count: 218,
    saves_count: 95,
    comments_count: 18,
    views_count: 2480,
    created_at: iso(360)
  },
  {
    id: 3,
    kind: 'visual',
    author_id: 'demo-vaidya-3',
    author_name: 'Tulsi Threads',
    author_username: 'tulsi.threads',
    author_avatar: null,
    caption: 'Golden milk, done right: cracked black pepper + grass-fed ghee + low simmer for 7 minutes. Piperine unlocks curcumin assimilation by 2000%.',
    title: 'Golden Milk & Turmeric Alchemy',
    summary: 'How ordinary kitchen spices transform into liquid gold through fat-soluble extraction.',
    content_md: null,
    media_url: null,
    media_type: 'image',
    tags: ['turmeric', 'recipes', 'haldi', 'kapha', 'chai'],
    likes_count: 310,
    saves_count: 140,
    comments_count: 24,
    views_count: 3600,
    created_at: iso(90)
  },
  {
    id: 4,
    kind: 'forge',
    author_id: 'demo-vaidya-1',
    author_name: 'Vaidya Meera Nair',
    author_username: 'vaidya.meera',
    author_avatar: null,
    caption: null,
    title: 'Reading your prakriti without a 20-question quiz',
    summary: 'Forget the superficial online quizzes. Here is how a traditional vaidya reads constitution in the first five minutes using pulse, tongue, and gait.',
    content_md: '# Prakriti, clinically\n\n*Nadi, jihva, sparsha* — pulse, tongue, touch. Before any questionnaire is opened, the body reveals its elemental dominance in the speed of the breath and the warmth of the hands.\n\n### 1. The Vata Pulse (Sarpa Gati)\nFelt on the radial edge — fast, thin, winding like a serpent.\n\n### 2. The Pitta Pulse (Manduka Gati)\nStrong, rhythmic, leaping like a frog.\n\n### 3. The Kapha Pulse (Hamsa Gati)\nSlow, steady, undulating like a gliding swan.',
    media_url: null,
    media_type: null,
    tags: ['prakriti', 'diagnosis', 'dosha', 'ayurveda'],
    read_minutes: 6,
    likes_count: 480,
    saves_count: 230,
    comments_count: 36,
    views_count: 5100,
    created_at: iso(720)
  },
  {
    id: 5,
    kind: 'forge',
    author_id: 'vaidya-lakshmi',
    author_name: 'Vaidya Lakshmi Menon',
    author_username: 'vaidya.lakshmi',
    author_avatar: null,
    caption: null,
    title: 'Karkidaka Chikitsa: when the monsoon resets agni',
    summary: 'Why July in Kerala is the sacred window for marma rejuvenation and medicinal kanji porridges.',
    content_md: '# The Monsoon Window\n\nDuring the peak rains of Karkidakam, the body’s srotas (channels) naturally soften and dilate under high atmospheric humidity. It is the only season where deep tissue purification occurs with minimal metabolic friction.',
    media_url: null,
    media_type: null,
    tags: ['kerala', 'monsoon', 'panchakarma', 'ritucharya'],
    read_minutes: 4,
    likes_count: 175,
    saves_count: 82,
    comments_count: 14,
    views_count: 1980,
    created_at: iso(950)
  },
  {
    id: 6,
    kind: 'visual',
    author_id: 'demo-vaidya-3',
    author_name: 'Tulsi Threads',
    author_username: 'tulsi.threads',
    author_avatar: null,
    caption: 'Bengali monsoon poetry recitation with cardamom tea on the verandah. Rain on the river ghats.',
    title: 'Bengali Poetry & Monsoon Chai',
    summary: 'A quiet afternoon of verse recitation and freshly crushed green cardamom tea.',
    content_md: null,
    media_url: null,
    media_type: 'video',
    media_duration: 142,
    tags: ['poetry', 'recitation', 'bengali', 'chai', 'tea'],
    likes_count: 260,
    saves_count: 110,
    comments_count: 29,
    views_count: 3200,
    created_at: iso(120)
  }
];

export const DEFAULT_CONVERSATIONS = [
  { id: 1, name: 'Dinacharya Club', is_group: true, created_by: 'demo-vaidya-1', last_message_at: iso(30), created_at: iso(3000) },
  { id: 2, name: null, is_group: false, created_by: 'demo-vaidya-2', last_message_at: iso(180), created_at: iso(2800) },
  { id: 3, name: null, is_group: false, created_by: 'vaidya-lakshmi', last_message_at: iso(420), created_at: iso(2700) },
];

export const DEFAULT_CONVERSATION_MEMBERS = [
  { id: 1, conversation_id: 1, user_id: 'demo-vaidya-1', last_read_at: iso(35), created_at: iso(3000) },
  { id: 2, conversation_id: 1, user_id: 'demo-vaidya-3', last_read_at: iso(40), created_at: iso(2900) },
  { id: 3, conversation_id: 2, user_id: 'demo-vaidya-1', last_read_at: iso(190), created_at: iso(2800) },
  { id: 4, conversation_id: 2, user_id: 'demo-vaidya-2', last_read_at: iso(180), created_at: iso(2800) },
  { id: 5, conversation_id: 3, user_id: 'demo-vaidya-1', last_read_at: iso(430), created_at: iso(2700) },
  { id: 6, conversation_id: 3, user_id: 'vaidya-lakshmi', last_read_at: iso(420), created_at: iso(2700) },
];

export const DEFAULT_MESSAGES = [
  { id: 1, conversation_id: 1, sender_id: 'demo-vaidya-3', type: 'text', body: 'Did my abhyanga before 6 today — reporting for duty 🌿', media_url: null, post_id: null, sender_name: 'Tulsi Threads', sender_avatar: null, created_at: iso(45) },
  { id: 2, conversation_id: 1, sender_id: 'demo-vaidya-1', type: 'text', body: 'Beautiful. Keep the oil warm, not hot — sukha, not sweat.', media_url: null, post_id: null, sender_name: 'Vaidya Meera Nair', sender_avatar: null, created_at: iso(30) },
  { id: 3, conversation_id: 2, sender_id: 'demo-vaidya-2', type: 'text', body: 'The assay showed zero free sulphur after 7 cycles.', media_url: null, post_id: null, sender_name: 'Arjun Rasa', sender_avatar: null, created_at: iso(180) },
  { id: 4, conversation_id: 3, sender_id: 'vaidya-lakshmi', type: 'text', body: 'Sending the Karkidaka kanji recipe scroll across.', media_url: null, post_id: null, sender_name: 'Vaidya Lakshmi Menon', sender_avatar: null, created_at: iso(420) },
];

export const DEFAULT_PLAYLISTS = [
  {
    id: 1,
    user_id: 'demo-vaidya-1',
    author_name: 'Vaidya Meera Nair',
    author_username: 'vaidya.meera',
    title: '7-Day Agni & Ojas Masterclass',
    description: 'A structured video course on rekindling digestive fire, clearing metabolic toxins, and awakening vitality.',
    category: 'Agni & Digestion',
    post_ids: [1, 2, 3],
    thumbnail_url: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=600',
    created_at: iso(1000)
  },
  {
    id: 2,
    user_id: 'demo-vaidya-2',
    author_name: 'Arjun Rasa',
    author_username: 'arjun.rasa',
    title: 'Classical Herbology & Alchemy Lab',
    description: 'Learn ancient harvesting cycles, seasonal potencies, and decoction dynamics for maximum bio-availability.',
    category: 'Herbal Alchemy',
    post_ids: [2, 1],
    thumbnail_url: 'https://images.unsplash.com/photo-1512290900672-1f02f7481878?w=600',
    created_at: iso(800)
  }
];

