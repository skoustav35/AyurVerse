/**
 * AyurVerse · forge expansion seed (project: ananta-ayurverse).
 *
 * Generates ~2000 unique long-form "forge" articles spanning every part of
 * India × dozens of Ayurvedic topics × multiple editorial angles, plus 16
 * regional vaidya personas. Deterministic (seeded PRNG) and batched
 * (400 writes/commit) for speed.
 *
 * Run ONLY while the temporary open rules are deployed:
 *   node scripts/seed-forges.mjs [count]
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, writeBatch } from 'firebase/firestore';

const TARGET = Number(process.argv[2]) || 2000;

const app = initializeApp({
  apiKey: 'AIzaSyDRbknm1v80CQ9YNH6jgVMs2OAYyXLK35I',
  authDomain: 'ananta-ayurverse.firebaseapp.com',
  projectId: 'ananta-ayurverse',
});
const db = getFirestore(app);

// ---------- deterministic PRNG ----------
let _s = 42;
const rnd = () => {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// ---------- regions: every part of India ----------
const REGIONS = [
  ['Kerala', 'kerala', 'where monsoon karkidaka chikitsa turns the rains into a month-long rejuvenation retreat'],
  ['Tamil Nadu', 'tamil-nadu', 'home of Siddha neighbours, temple-town vaidyas and palm-leaf manuscript libraries'],
  ['Karnataka', 'karnataka', 'from Mysuru’s ashtanga shalas to Coorg’s monsoon herb gardens'],
  ['Andhra Pradesh', 'andhra-pradesh', 'where naturopathy hospitals line the Krishna river belt'],
  ['Telangana', 'telangana', 'where Deccan herbal mandis trade guduchi by the sackful'],
  ['Maharashtra', 'maharashtra', 'from Pune’s classical colleges to Konkan kokum country'],
  ['Gujarat', 'gujarat', 'where sattvic kitchens and Bhavnagar’s pharma cluster meet'],
  ['Rajasthan', 'rajasthan', 'desert medicine — ghee, bajra and cooling summer regimens'],
  ['Madhya Pradesh', 'madhya-pradesh', 'the herbal heartland, source of a third of India’s wildcrafted amla'],
  ['Chhattisgarh', 'chhattisgarh', 'tribal bone-setters and mahua-country folk formulas'],
  ['Goa', 'goa', 'where coastal pitta-pacifying diets lean on coconut and kokum'],
  ['Punjab', 'punjab', 'wheat-belt strength traditions and sarson-oil winter abhyanga'],
  ['Haryana', 'haryana', 'pehlwani akharas meet classical vajikarana texts'],
  ['Uttar Pradesh', 'uttar-pradesh', 'Varanasi’s BHU faculty and the Ganga-side rasashastra lineage'],
  ['Bihar', 'bihar', 'Nalanda’s old medical manuscripts and sattu-summer regimens'],
  ['Jharkhand', 'jharkhand', 'forest vaidyas and sal-leaf dispensaries'],
  ['West Bengal', 'west-bengal', 'where kaviraji shops still hand-roll their own bhasmas'],
  ['Odisha', 'odisha', 'temple-kitchen mahaprasad dietetics and Chilika-side yoga camps'],
  ['Assam', 'assam', 'Brahmaputra-valley herb lore and bamboo-steam swedana'],
  ['Arunachal Pradesh', 'arunachal-pradesh', 'high-altitude Sowa Rigpa amchis and Himalayan rhododendron teas'],
  ['Nagaland', 'nagaland', ' Naga chilli, smoked-meat moderation and hill-tuber diets'],
  ['Manipur', 'manipur', 'maibi healing chants, black-rice antioxidants and polo-ground fitness'],
  ['Mizoram', 'mizoram', 'bamboo-shoot ferments and jhum-valley ginger country'],
  ['Tripura', 'tripura', 'agarwood forests and queen-pineapple enzyme tonics'],
  ['Meghalaya', 'meghalaya', 'living-root trails, turmeric of Lakadong fame and rain rituals'],
  ['Sikkim', 'sikkim', 'fully organic state — cardamom estates and monastery medicine'],
  ['Uttarakhand', 'uttarakhand', 'Haridwar’s Patanjali gurukul belt and alpine kutki country'],
  ['Himachal Pradesh', 'himachal-pradesh', 'apple-valley diets and Dhauladhar herb-collection trails'],
  ['Jammu & Kashmir', 'jammu-kashmir', 'kesar saffron fields and walnut-oil winter care'],
  ['Ladakh', 'ladakh', 'Sowa Rigpa heartland — seabuckthorn, apricots and thin-air breathing'],
  ['Delhi NCR', 'delhi', 'capital-clinic ayurveda tuned for smog-season lungs'],
  ['Puducherry', 'puducherry', 'Aurobindo-ashram gardens and French-Tamil fusion wellness'],
  ['Andaman & Nicobar', 'andaman-nicobar', 'island botanicals — noni, sea coconut and tidal rhythms'],
  ['Lakshadweep', 'lakshadweep', 'coral-atoll diets of tuna, coconut and lagoon calm'],
  ['Dadra & Nagar Haveli and Daman & Diu', 'dnh-dd', 'tribal warli brews and coastal-gujarati foodways'],
  ['Chandigarh', 'chandigarh', 'grid-city runners discovering nasya for traffic lungs'],
];

// ---------- topics ----------
const HERBS = [
  ['Ashwagandha', 'ashwagandha', 'the adaptogenic root for strength, sleep and steady nerves'],
  ['Turmeric (Haridra)', 'turmeric', 'the golden rhizome for joints, skin and metabolic fire'],
  ['Triphala', 'triphala', 'the three-fruit cornerstone of daily gut reset'],
  ['Brahmi', 'brahmi', 'the medhya herb for memory, focus and calm'],
  ['Amla', 'amla', 'the vitamin-C-rich rasayana fruit of immunity and hair'],
  ['Neem', 'neem', 'the bitter blood-purifier for skin and microbial balance'],
  ['Tulsi', 'tulsi', 'the household adaptogen for breath, immunity and ritual'],
  ['Shatavari', 'shatavari', 'the cooling reproductive tonic of Ayurvedic gynaecology'],
  ['Guduchi', 'guduchi', 'the climbing immunomodulator for fevers and metabolism'],
  ['Yashtimadhu (Liquorice)', 'liquorice', 'the sweet demulcent for throat, gut and adrenals'],
  ['Shunti (Dry Ginger)', 'ginger', 'the universal deepana-pachana spice for agni'],
  ['Maricha (Black Pepper)', 'black-pepper', 'the bioavailability spark of trikatu'],
  ['Pippali (Long Pepper)', 'pippali', 'the rejuvenative spice of respiratory rasayana'],
  ['Cardamom (Ela)', 'cardamom', 'the fragrant tridoshic digestive'],
  ['Cinnamon (Twak)', 'cinnamon', 'the warming bark for blood sugar and circulation'],
  ['Cumin (Jeeraka)', 'cumin', 'the everyday carminative of tadka medicine'],
  ['Coriander (Dhanyaka)', 'coriander', 'the cooling pitta-pacifying seed and leaf'],
  ['Fennel (Mishreya)', 'fennel', 'the sweet after-meal digestive of the Indian table'],
  ['Fenugreek (Methi)', 'fenugreek', 'the bitter-sweet seed for sugar and joints'],
  ['Moringa (Shigru)', 'moringa', 'the drumstick tree — multivitamin greens'],
  ['Mandukaparni (Gotu Kola)', 'gotu-kola', 'the creeping medhya herb of focus and veins'],
  ['Bhringraj', 'bhringraj', 'the king of hair — liver-loving bitter green'],
  ['Jatamansi', 'jatamansi', 'the Himalayan root of deep sleep'],
  ['Punarnava', 'punarnava', 'the renewer — diuretic support for kidneys and swelling'],
  ['Guggulu', 'guggulu', 'the resin scraped for joints, lipids and thyroid'],
  ['Kutki', 'kutki', 'the alpine bitter for liver and pitta fevers'],
];
const THERAPIES = [
  ['Abhyanga', 'abhyanga', 'warm-oil self-massage that feeds the nervous system first'],
  ['Shirodhara', 'shirodhara', 'the steady oil stream that quiets a buzzing mind'],
  ['Nasya', 'nasya', 'nasal therapy — the doorway to the head and sinuses'],
  ['Basti', 'basti', 'medicated enemas, the half of all treatment in classical texts'],
  ['Virechana', 'virechana', 'therapeutic purgation for pitta overload'],
  ['Vamana', 'vamana', 'therapeutic emesis for kapha-spring cleansing'],
  ['Swedana', 'swedana', 'sudation — opening the channels with steam and heat'],
  ['Pizhichil', 'pizhichil', 'the royal oil bath of Kerala’s kalari tradition'],
  ['Navarakizhi', 'navarakizhi', 'warm herbal-rice poultices for muscle and nerve'],
  ['Udvartana', 'udvartana', 'herbal-powder massage for kapha, weight and glow'],
  ['Karnapurana', 'karnapurana', 'warm ear oiling for jaw, sleep and vata ears'],
  ['Netra Tarpana', 'netra-tarpana', 'ghee pools for tired, screen-strained eyes'],
];
const CONCEPTS = [
  ['Vata Dosha', 'vata', 'air-ether principle behind movement, nerves and creativity'],
  ['Pitta Dosha', 'pitta', 'fire-water principle of digestion, ambition and temper'],
  ['Kapha Dosha', 'kapha', 'earth-water principle of structure, calm and stamina'],
  ['Prakriti', 'prakriti', 'your inborn constitution — read before any prescription'],
  ['Agni', 'agni', 'digestive fire — the hinge of all health'],
  ['Ama', 'ama', 'undigested residue — the root of most chronic fog'],
  ['Ojas', 'ojas', 'the sap of immunity, glow and resilience'],
  ['Dinacharya', 'dinacharya', 'the daily routine that prevents most disease'],
  ['Ritucharya', 'ritucharya', 'seasonal regimen — living with the year, not against it'],
  ['Rasayana', 'rasayana', 'rejuvenation therapy for a longer healthspan'],
  ['Srotas', 'srotas', 'the body’s channels — keep them clear, keep flowing'],
  ['Panchamahabhuta', 'panchamahabhuta', 'five elements as a diagnostic language'],
  ['Triguna', 'triguna', 'sattva, rajas, tamas — the mind’s three weather systems'],
  ['Dhatus', 'dhatus', 'the seven tissues, from plasma to reproductive essence'],
];
const CONDITIONS = [
  ['Madhumeha (blood sugar)', 'diabetes', 'sweet-urine disease and its diet-first management'],
  ['Sandhivata (joints)', 'arthritis', 'creaking knees, basti schedules and guggulu allies'],
  ['Nidranasha (insomnia)', 'insomnia', 'why the 10pm rule beats most sleeping pills'],
  ['Anxiety & restlessness', 'anxiety', 'vata in the mind — oil, rhythm and breath'],
  ['PCOS & cycles', 'pcos', 'artava dhatu, weight and the unhurried cycle'],
  ['Hypertension', 'hypertension', 'cooling pitta before the cuff climbs'],
  ['Grahani (gut disorders)', 'gut-health', 'when the gut forgets its manners'],
  ['Kushta (skin)', 'skin', 'reading the skin as a liver-and-blood bulletin'],
  ['Hair fall (Khalitya)', 'hair-fall', 'bhringraj oiling schedules that actually hold'],
  ['Sthaulya (weight)', 'weight', 'kapha arithmetic — light food, heavy routine'],
  ['Amlapitta (acidity)', 'acidity', 'sour stomachs and the cooling counter-offensive'],
  ['Tamaka Shwasa (asthma)', 'asthma', 'breathlessness, smoke season and pippali rasayana'],
  ['Migraine (Ardhavabhedaka)', 'migraine', 'half-head pain and the nasya calendar'],
  ['Thyroid (Galaganda)', 'thyroid', 'neck swelling, iodine wisdom and kanchanara'],
  ['Vyadhikshamatva (immunity)', 'immunity', 'resistance as a daily practice, not a pill'],
  ['Monsoon fevers', 'monsoon-health', 'rainy-season agni protection and yusha soups'],
];
const TEXTS = [
  ['Charaka Samhita', 'charaka-samhita', 'the physician’s bible — 120 chapters of clinical reasoning'],
  ['Ashtanga Hridayam', 'ashtanga-hridayam', 'Vagbhata’s poetic handbook, memorised by toppers'],
  ['Sushruta Samhita', 'sushruta-samhita', 'surgery, marma points and the world’s first rhinoplasty'],
  ['Yoga Asana', 'yoga', 'posture as medicine — joint by joint'],
  ['Pranayama', 'pranayama', 'breath ratios that rewire the nervous system'],
  ['Dhyana (meditation)', 'meditation', 'sitting practice for rajas minds'],
  ['Marma Therapy', 'marma', '107 vital points — acupressure’s Indian cousin'],
  ['Upavasa (fasting)', 'fasting', 'strategic lightness for ama clearance'],
  ['Nidra (sleep science)', 'sleep', 'the forgotten pillar beside food and routine'],
  ['Kalari & Ayurveda', 'kalaripayattu', 'martial bodies maintained by marmachikitsa'],
];

const TOPICS = [
  ...HERBS.map(([n, t, d]) => ({ name: n, tag: t, essence: d, kind: 'herb' })),
  ...THERAPIES.map(([n, t, d]) => ({ name: n, tag: t, essence: d, kind: 'therapy' })),
  ...CONCEPTS.map(([n, t, d]) => ({ name: n, tag: t, essence: d, kind: 'concept' })),
  ...CONDITIONS.map(([n, t, d]) => ({ name: n, tag: t, essence: d, kind: 'condition' })),
  ...TEXTS.map(([n, t, d]) => ({ name: n, tag: t, essence: d, kind: 'text' })),
];

const PERSONAS = [
  ['Vaidya Lakshmi Menon', 'vaidya.lakshmi', 'Kerala panchakarma consultant'],
  ['Dr. S. Raghavan', 'raghavan.siddha', 'Tamil Nadu vaidya & manuscript reader'],
  ['Vaidya Prakash Bhat', 'prakash.bhat', 'Mysuru ashtanga-vaidya'],
  ['Dr. Anjali Deshmukh', 'anjali.d', 'Pune stri-roga specialist'],
  ['Vaidya Kanaiyalal Patel', 'k.patel', 'Ahmedabad rasashastra pharmacist'],
  ['Dr. Ritu Rathore', 'ritu.rathore', 'Jaipur desert-climate consultant'],
  ['Vaidya Harpreet Singh', 'harpreet.s', 'Amritsar vata-vyadhi physician'],
  ['Dr. Chandrima Bose', 'chandrima.b', 'Kolkata kaviraj lineage holder'],
  ['Vaidya Dibakar Das', 'dibakar.das', 'Guwahati folk-formula documentarian'],
  ['Dr. Rinchen Dolma', 'rinchen.d', 'Leh Sowa Rigpa amchi'],
  ['Vaidya Vikram Aditya', 'vikram.aditya', 'Varanasi BHU faculty'],
  ['Dr. Meera Krishnan', 'meera.k', 'Coimbatore yoga-ayurveda integrator'],
  ['Vaidya Farooq Ahmed', 'farooq.a', 'Srinagar unani-ayurveda bridge physician'],
  ['Dr. Sunita Patnaik', 'sunita.p', 'Bhubaneswar dietetics researcher'],
  ['Vaidya Tashi Wangmu', 'tashi.w', 'Gangtok high-altitude medicine practitioner'],
  ['Dr. Arvind Nair', 'arvind.nair', 'Delhi smog-season respiratory specialist'],
];

// ---------- editorial angles ----------
const ANGLES = [
  {
    id: 'guide',
    title: (tp, rg) => `${tp.name} in ${rg}: a practical field guide`,
    sum: (tp, rg) => `Everything a beginner needs — what it is, how ${rg} uses it, and where to start safely.`,
  },
  {
    id: 'kitchen',
    title: (tp, rg) => `The ${rg} kitchen pharmacy: everyday ${tp.name.toLowerCase()}`,
    sum: (tp, rg) => `No dispensary needed — how ordinary ${rg} households already practise this wisdom.`,
  },
  {
    id: 'seasonal',
    title: (tp, rg) => `${tp.name} through the ${rg} year: a ritucharya calendar`,
    sum: (tp, rg) => `Season by season — when to lean in, when to rest, and what ${rg}’s climate demands.`,
  },
  {
    id: 'science',
    title: (tp, rg) => `What research says about ${tp.name.toLowerCase()} — notes from ${rg}`,
    sum: (tp, rg) => `Classical claims meet modern trials: an honest, hype-free evidence tour.`,
  },
  {
    id: 'myths',
    title: (tp, rg) => `Six myths about ${tp.name.toLowerCase()} that ${rg} vaidyas keep hearing`,
    sum: (tp, rg) => `Well-meaning WhatsApp forwards, gently corrected by people who treat patients.`,
  },
  {
    id: 'clinic',
    title: (tp, rg) => `From the clinic notebook: ${tp.name.toLowerCase()} cases in ${rg}`,
    sum: (tp, rg) => `Anonymised case notes — what worked, what didn’t, and what the textbook missed.`,
  },
];

const INTROS = [
  (tp, rg, rdet) => `Ask any practitioner in ${rg} — ${rdet} — about ${tp.name.toLowerCase()}, and you will get an answer with soil on it. Not a definition, but a practice: ${tp.essence}. This is that answer, written down.`,
  (tp, rg, rdet) => `There is textbook ${tp.name.toLowerCase()}, and then there is how ${rg} actually does it. ${rdet.charAt(0).toUpperCase() + rdet.slice(1)}. Between the two lies everything worth knowing — ${tp.essence}.`,
  (tp, rg) => `${tp.name} is one of those subjects everyone nods at and few understand. In ${rg}, where ${tp.essence}, practitioners have strong opinions. I collected the useful ones.`,
  (tp, rg) => `Spend a week in the clinics of ${rg} and ${tp.name.toLowerCase()} comes up daily — ${tp.essence}. Here is the distilled version: what it is, why it matters, and how to begin.`,
];

const CLASSICAL = [
  (tp) => `## The classical view\n\nThe samhitas treat ${tp.name.toLowerCase()} as foundational rather than fashionable. Charaka places it inside a larger logic of cause and effect — increase the similar, decrease with the opposite. Vagbhata compresses the same idea into verses students still chant before exams. The through-line across commentaries: ${tp.essence}. This is not trivia; it is the operating manual the rest of this article runs on.`,
  (tp) => `## What the texts actually say\n\nStrip away modern marketing and the classical position on ${tp.name.toLowerCase()} is precise and modest: ${tp.essence}. Sushruta adds the surgeon’s footnote — structure first, symptoms second. Later compendia (Bhavaprakasha, Sharangdhara) supply the working details: proportions, timing, vehicles (anupana). Read them and the Instagram version starts to look thin.`,
];

const REGIONAL = [
  (tp, rg, rdet) => `## How ${rg} does it differently\n\n${rdet.charAt(0).toUpperCase() + rdet.slice(1)}. That landscape shapes the practice: morning schedules shift with the local sunrise tables, staple grains change the dietary advice, and the herbs that grow within walking distance become the first-line pharmacy. Visiting vaidyas often remark that ${tp.name.toLowerCase()} here tastes of the place — same principles, local accent. Patients travelling for treatment should budget a fortnight, not a weekend.`,
  (tp, rg) => `## The ${rg} accent\n\nPrinciples travel; details stay local. In ${rg}, ${tp.name.toLowerCase()} is timed around regional festivals and harvests, paired with foods the local gut already trusts, and taught in the idiom of the neighbourhood. The result is higher adherence than any imported protocol — people follow what feels like theirs. If you are adapting this elsewhere, keep the logic and swap the ingredients.`,
];

const PRACTICAL = [
  (tp) => `## A safe way to begin\n\nStart smaller than your enthusiasm. For ${tp.name.toLowerCase()}, the classical onboarding is: one change, observed for a week, in a food vehicle you already digest well (warm water, ghee, honey where allowed). Keep a two-line diary — sleep quality, morning energy. If both drift up, continue; if digestion complains, halve the dose or pause. Children, pregnancy, and anyone on prescription medication should run this past their physician first. Ayurveda is gentle, not casual.`,
  (tp) => `## The home protocol\n\nMorning is the laboratory. Take ${tp.name.toLowerCase()} at the same hour daily — routine (dinacharya) is half the medicine. Pair it with tongue-scraping and a glass of warm water so you can actually observe effects. Evenings are for review: appetite at dinner tells you what the morning did. Skip the practice during acute fever or indigestion; the texts are explicit that a weak agni first needs rest, not remedies.`,
];

const CAUTION = [
  (tp) => `## Who should pause\n\n${tp.name} is broadly safe in food-scale use, but three groups need supervision: pregnant and lactating mothers, people on blood thinners or immunosuppressants, and anyone mid-way through panchakarma. More is not better — classical dosing is deliberately modest because the medicine works with the body’s rhythm, not against it. Buy from GMP-certified pharmacies; heavy-metal scares trace to unregulated powders, not the tradition.`,
];

const CLOSINGS = [
  (tp, rg) => `Begin this week: pick one idea above and practise it for seven days. ${tp.name} rewards the consistent, not the intense — and ${rg}’s vaidyas will tell you the follow-up visit matters more than the first. Save this for your seasonal reset.`,
  (tp) => `The deepest line in the classics on this subject is also the shortest: act according to place, time and self. Everything above is commentary. Your body is the text — read it daily.`,
  (tp, rg) => `If this helped, share it with one person in ${rg} who keeps asking you about ${tp.name.toLowerCase()}. Good medicine travels by word of mouth, as it always has.`,
];

const SEASONS = ['vasanta (spring)', 'grishma (summer)', 'varsha (monsoon)', 'sharad (autumn)', 'hemanta (early winter)', 'shishira (late winter)'];

// ---------- build ----------
const T0 = Date.now();
const MIN = 60000;

function buildArticle(n, region, topic, angle, author) {
  const [rg, rtag, rdet] = region;
  const season = pick(SEASONS);
  const title = angle.title(topic, rg);
  const summary = angle.id === 'seasonal'
    ? `Season by season through ${season} and beyond — when to lean in, when to rest, and what ${rg}’s climate demands.`
    : angle.sum(topic, rg);
  const body = [
    pick(INTROS)(topic, rg, rdet),
    '',
    pick(CLASSICAL)(topic),
    '',
    pick(REGIONAL)(topic, rg, rdet),
    '',
    pick(PRACTICAL)(topic),
    '',
    pick(CAUTION)(topic),
    '',
    pick(CLOSINGS)(topic, rg),
  ].join('\n');
  const read = Math.max(2, Math.round(body.split(/\s+/).length / 190));
  const likes = ri(3, 140);
  return {
    id: n,
    kind: 'forge',
    author_id: author.uid,
    author_name: author.name,
    author_username: author.username,
    author_avatar: null,
    caption: null,
    title,
    summary,
    content_md: body,
    media_url: null,
    media_type: null,
    media_duration: null,
    location: rg + ', India',
    tags: [...new Set([topic.tag, rtag, angle.id, topic.kind, 'ayurveda'])],
    read_minutes: read,
    likes_count: likes,
    saves_count: Math.round(likes * (0.2 + rnd() * 0.35)),
    comments_count: ri(0, 7),
    views_count: likes * ri(6, 22),
    created_at: new Date(T0 - ri(0, 525600) * MIN).toISOString(),
  };
}

function mulberry(seed) { _s = seed; }

async function commitInBatches(writes) {
  const SIZE = 400;
  for (let i = 0; i < writes.length; i += SIZE) {
    const batch = writeBatch(db);
    for (const [coll, id, data] of writes.slice(i, i + SIZE)) batch.set(doc(db, coll, String(id)), data);
    await batch.commit();
    console.log(`committed ${Math.min(i + SIZE, writes.length)}/${writes.length}`);
  }
}

mulberry(20260918);

// personas → profiles
const personaDocs = PERSONAS.map(([name, username, bio], i) => {
  const uid = `persona-${username}`;
  return ['profiles', String(100 + i), { id: 100 + i, user_id: uid, username, full_name: name, bio, avatar_url: null, created_at: new Date(T0 - ri(10000, 300000) * MIN).toISOString() }];
});

// unique (region, topic, angle) combos
const combos = [];
for (let r = 0; r < REGIONS.length; r++)
  for (let t = 0; t < TOPICS.length; t++)
    for (let a = 0; a < ANGLES.length; a++) combos.push([r, t, a]);
// shuffle
for (let i = combos.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [combos[i], combos[j]] = [combos[j], combos[i]];
}
const chosen = combos.slice(0, TARGET);

const authors = [
  { uid: 'demo-vaidya-1', name: 'Vaidya Meera Nair', username: 'vaidya.meera' },
  { uid: 'demo-vaidya-2', name: 'Arjun Rasa', username: 'arjun.rasa' },
  { uid: 'demo-vaidya-3', name: 'Tulsi Threads', username: 'tulsi.threads' },
  ...PERSONAS.map(([name, username]) => ({ uid: `persona-${username}`, name, username })),
];

const forgeWrites = chosen.map(([r, t, a], i) =>
  ['posts', String(5 + i), buildArticle(5 + i, REGIONS[r], TOPICS[t], ANGLES[a], authors[(r + t + a) % authors.length])]
);

console.log(`personas: ${personaDocs.length}, forges: ${forgeWrites.length}`);
await commitInBatches([...personaDocs, ...forgeWrites, ['counters', 'posts', { next: 5 + forgeWrites.length }]]);
console.log('DONE');
process.exit(0);
