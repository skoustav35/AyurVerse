/*
 * Ayurvedic Sage — In-house Intelligence Engine for AyurVerse
 *
 * Powers Vaidya in-account agent, conversational Vaidya studio,
 * and the AI Scribe (caption, summary, manuscript polisher).
 * Provides deep Ayurvedic wisdom across doshas, dravya guna (herbs),
 * dinacharya, agni, rasayana, panchakarma, and AyurVerse atelier navigation.
 */

// ---------------------------------------------------------------------------
// 1. KNOWLEDGE VAULT: HERBS, DOSHAS, FORMULATIONS & ATELIER
// ---------------------------------------------------------------------------

const HERBS_LORE = {
  ashwagandha: {
    sanskrit: 'Ashwagandha (Withania somnifera)',
    rasa: 'Madhura (Sweet), Tikta (Bitter), Kashaya (Astringent)',
    virya: 'Ushna (Heating)',
    vipaka: 'Madhura (Sweet)',
    dosha: 'Balances Vata & Kapha; in excess may aggravate Pitta',
    qualities: 'Guru (Heavy), Snigdha (Unctuous)',
    actions: 'Balya (Strength-giving), Rasayana (Rejuvenative), Medhya (Nervous system tonic), Nidrajnana (Promotes deep restorative sleep), Vajikarana',
    indications: 'Stress, nervous exhaustion, fatigue, Vata-induced insomnia, musculoskeletal weakness',
    ritual: 'Take 1/2 tsp of churnam in warm organic milk or almond milk with a drop of ghee, a pinch of cardamom and nutmeg before slumber.',
  },
  triphala: {
    sanskrit: 'Triphala (Haritaki, Bibhitaki, Amalaki)',
    rasa: 'Pancha Rasa (Contains five of the six tastes, lacking only Salty)',
    virya: 'Anushna (Neither excessively hot nor cold)',
    vipaka: 'Madhura (Sweet)',
    dosha: 'Tridoshic — harmonizes Vata, Pitta, and Kapha equally',
    qualities: 'Laghu (Light), Ruksha (Dry)',
    actions: 'Deepana (Digestive kindling), Pachana (Toxin clearing), Chakshushya (Eye-nourishing), Rasayana (Cellular longevity), gentle bowel toner',
    indications: 'Sluggish peristalsis, accumulated ama, ocular fatigue, dull digestion',
    ritual: 'Steep 1/2 to 1 tsp in a cup of boiled water for 10 minutes at dusk. Drink lukewarm before retiring.',
  },
  brahmi: {
    sanskrit: 'Brahmi / Mandukaparni (Bacopa monnieri & Centella asiatica)',
    rasa: 'Tikta (Bitter), Kashaya (Astringent), Madhura (Sweet)',
    virya: 'Sheeta (Cooling)',
    vipaka: 'Madhura (Sweet)',
    dosha: 'Pacifies Pitta and Vata, clears Kapha stagnation from the mind',
    qualities: 'Laghu (Light), Sara (Flowing)',
    actions: 'Medhya Rasayana (Intellect-illuminating), Prajasthapana, Shirovirechana, clears mental fog, stabilizes Sadhaka Pitta',
    indications: 'Mental strain, scattered focus, cognitive burn, emotional agitation, high Pitta in the crown',
    ritual: 'Infused as a morning herbal decoction or taken as Brahmi Ghrita (infused ghee) on an empty stomach.',
  },
  tulsi: {
    sanskrit: 'Tulsi (Ocimum sanctum — Holy Basil)',
    rasa: 'Katu (Pungent), Tikta (Bitter)',
    virya: 'Ushna (Heating)',
    vipaka: 'Katu (Pungent)',
    dosha: 'Pacifies Vata & Kapha; neutral to mild on Pitta',
    qualities: 'Laghu (Light), Ruksha (Dry), Tikshna (Sharp)',
    actions: 'Pranada (Enhancer of life breath), Hridya (Heart-supportive), Kasahara (Cough relieving), Dipana, Sattvic mind-opener',
    indications: 'Respiratory heaviness, seasonal allergies, sluggish prana, low spirits',
    ritual: 'Fresh leaves or loose leaf decoction brewed with sliced ginger and a drop of raw honey once cooled to drinkable warmth.',
  },
  shatavari: {
    sanskrit: 'Shatavari (Asparagus racemosus — "She of a Hundred Roots")',
    rasa: 'Madhura (Sweet), Tikta (Bitter)',
    virya: 'Sheeta (Cooling)',
    vipaka: 'Madhura (Sweet)',
    dosha: 'Balances Pitta & Vata; increases Kapha in excess',
    qualities: 'Guru (Heavy), Snigdha (Unctuous)',
    actions: 'Stanyajanana, Rasayana, Shukralam, Pittahara, mucosal lining protectant',
    indications: 'Hyperacidity, internal heat, hormonal fluctuations, dry Vata depletion, burnout',
    ritual: 'Whisk 1/2 tsp into warm whole milk with saffron strands and a sliver of jaggery.',
  },
  turmeric: {
    sanskrit: 'Haridra (Curcuma longa)',
    rasa: 'Tikta (Bitter), Katu (Pungent)',
    virya: 'Ushna (Heating)',
    vipaka: 'Katu (Pungent)',
    dosha: 'Tridoshic — pacifies Kapha & Vata, clears excess Pitta when taken in medicinal measure',
    qualities: 'Laghu (Light), Ruksha (Dry)',
    actions: 'Varnya (Complexion enhancing), Vishaghna (Anti-toxic), Lekhana (Scraping tissue stagnation), Shothahara (Anti-inflammatory)',
    indications: 'Joint stiffness, dull skin, lymphatic stagnation, sluggish metabolism',
    ritual: 'Golden Milk: gently simmer ground turmeric with black pepper (to awaken curcuminoids), ginger, and grass-fed ghee or sesame oil in warm milk.',
  },
  neem: {
    sanskrit: 'Nimba (Azadirachta indica)',
    rasa: 'Tikta (Bitter), Kashaya (Astringent)',
    virya: 'Sheeta (Cooling)',
    vipaka: 'Katu (Pungent)',
    dosha: 'Intensely pacifies Pitta & Kapha; aggravates Vata if unmitigated',
    qualities: 'Laghu (Light), Ruksha (Dry)',
    actions: 'Krimighna (Antimicrobial), Raktashodhaka (Blood purifying), Kushthaghna (Skin restorative)',
    indications: 'Inflammatory skin outbreaks, high Pitta in the liver, heat eruptions',
    ritual: 'External oil application or brief course of leaf infusion during Ritucharya transitions.',
  },
  guduchi: {
    sanskrit: 'Guduchi / Amrita (Tinospora cordifolia — "Nectar of Immortality")',
    rasa: 'Tikta (Bitter), Kashaya (Astringent)',
    virya: 'Ushna (Heating)',
    vipaka: 'Madhura (Sweet)',
    dosha: 'Tridosha Shamaka — uniquely balances all three doshas simultaneously',
    qualities: 'Guru (Heavy), Snigdha (Unctuous)',
    actions: 'Rasayana, Deepana, Jwarahara, Medhya, Ojas-builder without clogging channels',
    indications: 'Chronic fatigue, immune exhaustion, lingering internal heat, metabolic weakness',
    ritual: 'Decoction taken at dawn with a pinch of pippali (long pepper).',
  },
};

const DOSHA_LORE = {
  vata: {
    elements: 'Akasha (Ether) + Vayu (Air)',
    nature: 'Dry, light, cold, rough, subtle, mobile (Chala)',
    governs: 'All movement, nerve impulses, breath, elimination, creative flow',
    imbalanceSigns: 'Anxiety, racing thoughts, dry skin, constipation, bloating, cracking joints, broken sleep',
    balancing: 'Nourish with warmth, heavy grounding foods, unctuous oils (warm sesame oil abhyanga), steady daily routine (Dinacharya), sweet/sour/salty tastes, warm stews, kitchari.',
  },
  pitta: {
    elements: 'Agni (Fire) + Jala (Water)',
    nature: 'Hot, sharp (Tikshna), light, oily, spreading, liquid',
    governs: 'Digestion, metabolism, body temperature, visual perception, discernment, ambition',
    imbalanceSigns: 'Acid reflux, inflammation, skin redness, anger, irritability, overheating, loose stools',
    balancing: 'Cooling foods, ghee, coconut water, sweet/bitter/astringent tastes, moon bathing, moderate pace, soothing mint and rose water.',
  },
  kapha: {
    elements: 'Prithvi (Earth) + Jala (Water)',
    nature: 'Heavy, slow, cold, oily, smooth, dense, static (Sthira)',
    governs: 'Structure, lubrication, cellular cohesion, immunity, endurance, emotional grounding',
    imbalanceSigns: 'Lethargy, excess sleep, fluid retention, respiratory congestion, brain fog, possessiveness',
    balancing: 'Invigorating movement, dry brush massage (Garshana), warming pungent/bitter/astringent spices (ginger, black pepper, trikatu), fasting or light warm meals.',
  },
};

const RECIPES_LORE = {
  kitchari: {
    title: 'Classical Tridoshic Kitchari',
    essence: 'The foundational cleansing food of Ayurveda, offering complete protein while requiring zero digestive strain.',
    ingredients: [
      '1 cup split yellow moong dal (soaked 2 hours)',
      '1 cup aged organic Basmati rice',
      '2 tbsp cultured grass-fed Ghee',
      '1 tsp cumin seeds, 1 tsp mustard seeds, 1 tbsp grated fresh ginger',
      '1/2 tsp organic turmeric powder, 1 pinch hing (asafoetida)',
      '6 cups pure filtered water, pink rock salt (Saindhava Lavana) to taste',
      'Fresh cilantro and a squeeze of lime to garnish',
    ],
    method: 'Warm the ghee in a heavy pot. Splutter cumin and mustard seeds, then add ginger and hing until fragrant. Stir in washed dal and rice with turmeric until glistening. Add water, bring to a rolling simmer, cover and reduce heat to low for 35 minutes until creamy and tender. Finish with salt, lime, and cilantro.',
  },
  golden_milk: {
    title: 'Ojas-Nourishing Golden Milk (Haldi Doodh)',
    essence: 'A dusk ritual for deep tissue rejuvenation, cellular lubrication, and restorative sleep.',
    ingredients: [
      '1.5 cups whole A2 milk or almond/oat milk',
      '1/2 tsp pure turmeric powder',
      '1/4 tsp ground cardamom',
      '1 pinch freshly ground black pepper (activates bio-availability)',
      '1/4 tsp organic Ashwagandha churnam',
      '1/2 tsp grass-fed Ghee or coconut oil',
      '1 tsp raw honey (added only after cooling below boiling)',
    ],
    method: 'Gently heat the milk in a brass or stainless vessel. Whisk in turmeric, cardamom, black pepper, and ashwagandha. Allow to simmer gently on low heat for 3-4 minutes. Stir in the ghee. Pour into your earthen cup, let cool to comfortable sipping warmth, and stir in raw honey.',
  },
  ccf_tea: {
    title: 'Agni-Kindling CCF Tea (Cumin, Coriander, Fennel)',
    essence: 'The sovereign tri-seed elixir for kindle without overheat — clears Ama and soothes mucosal lining.',
    ingredients: [
      '1/2 tsp whole Cumin seeds (clears gas, kindles Pachaka Agni)',
      '1/2 tsp whole Coriander seeds (cools Pitta, flushes urinary tract)',
      '1/2 tsp whole Fennel seeds (relaxes cramping, sweet aftertaste)',
      '4 cups fresh water',
    ],
    method: 'Bring seeds and water to a boil in an open pot. Reduce heat and simmer gently for 8-10 minutes until aromatic and golden-amber. Strain into a thermos and sip warmly throughout the day between meals.',
  },
};

const ATELIER_GUIDE = {
  feed: 'The visual weave — where weavers share illuminated moments, photographic rituals, and reels.',
  forge: 'The manuscript sanctum — long-form lore, deep medicinal treatises, recipes, and philosophy.',
  library: 'The search repository — discover weavers, golden threads, lore manuscripts, and herbal topics.',
  threads: 'Direct and circle messages — intimate conversations and council chambers.',
  circles: 'Communities of practice — gather in feed, forge, or thread circles around shared paths.',
  satchel: 'Your personal bookmarked treasures — saved scrolls, recipes, and inspiring visuals.',
  studio: 'The creator atelier — inspect analytics, ignite boosts for your lore, and request payouts.',
  society: 'The living observatory — autonomous weavers and scholars reflecting on the passage of seasons.',
};

// ---------------------------------------------------------------------------
// 2. HELPER FUNCTIONS
// ---------------------------------------------------------------------------

function extractKeywords(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchHerbs(text) {
  const t = text.toLowerCase();
  const hits = [];
  for (const [key, val] of Object.entries(HERBS_LORE)) {
    if (t.includes(key) || t.includes(val.sanskrit.toLowerCase().split(' ')[0])) {
      hits.push({ key, ...val });
    }
  }
  return hits;
}

function matchDoshas(text) {
  const t = text.toLowerCase();
  const hits = [];
  for (const [key, val] of Object.entries(DOSHA_LORE)) {
    if (t.includes(key)) hits.push({ key, ...val });
  }
  return hits;
}

// ---------------------------------------------------------------------------
// 3. INTENT DETECTION FOR VAIDYA IN-ACCOUNT AGENT (api/agent.js)
// ---------------------------------------------------------------------------

export function interpretAgentIntent(text) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();

  // 1. Lore / Post writing intent
  // "write a post about ...", "publish a scroll on ...", "write lore about ...", "create article on ..."
  const writeMatch = raw.match(
    /(?:write|publish|post|compose|draft|inscribe)\s+(?:a\s+)?(?:lore|scroll|post|article|piece|manuscript|essay)\s+(?:about|on|regarding|discussing)?\s*(.+)/i
  );
  if (writeMatch && writeMatch[1]) {
    const topic = writeMatch[1].trim().replace(/[.!?]+$/, '');
    const title = topic.length > 60 ? `${topic.slice(0, 57)}…` : topic.charAt(0).toUpperCase() + topic.slice(1);
    const manuscript = craftManuscriptForTopic(topic);
    const tags = generateTagsForTopic(topic);
    const summary = craftLuminousSummary(topic, manuscript);
    return {
      tool: 'write_lore_post',
      args: { title, summary, tags, manuscript },
    };
  }

  // 2. Profile update intent
  // "update my bio to ...", "change my bio to ...", "set my bio to ..."
  const bioMatch = raw.match(/(?:update|change|set)\s+(?:my\s+)?bio\s+(?:to|as)\s+["']?([^"'\n]+)["']?/i);
  if (bioMatch && bioMatch[1]) {
    return { tool: 'update_profile', args: { bio: bioMatch[1].trim() } };
  }
  // "change my name to ...", "update my name to ..."
  const nameMatch = raw.match(/(?:update|change|set)\s+(?:my\s+)?(?:full\s+)?name\s+(?:to|as)\s+["']?([^"'\n]+)["']?/i);
  if (nameMatch && nameMatch[1]) {
    return { tool: 'update_profile', args: { full_name: nameMatch[1].trim() } };
  }

  // 3. Follow user intent
  // "follow @username", "follow username"
  const followMatch = raw.match(/(?:follow)\s+@?([a-zA-Z0-9_.-]+)/i);
  if (followMatch && followMatch[1] && !['the', 'my', 'all', 'a', 'this'].includes(followMatch[1].toLowerCase())) {
    return { tool: 'follow_user', args: { username: followMatch[1] } };
  }

  // 4. Unfollow user intent
  const unfollowMatch = raw.match(/(?:unfollow)\s+@?([a-zA-Z0-9_.-]+)/i);
  if (unfollowMatch && unfollowMatch[1]) {
    return { tool: 'unfollow_user', args: { username: unfollowMatch[1] } };
  }

  // 5. Search user intent
  const findUserMatch = raw.match(/(?:find|search|lookup)\s+(?:for\s+)?(?:user|weaver|profile|channel)\s+@?([a-zA-Z0-9_.-]+)/i);
  if (findUserMatch && findUserMatch[1]) {
    return { tool: 'find_users', args: { query: findUserMatch[1] } };
  }

  // 6. Recent activity intent
  if (/(?:what happened|recent activity|notifications|updates while i was away|who liked|who followed)/i.test(lower)) {
    return { tool: 'recent_activity', args: {} };
  }

  // 7. List my posts
  if (/(?:list|show|view|see)\s+(?:my\s+)?(?:posts|scrolls|lore|articles|writings)/i.test(lower)) {
    return { tool: 'list_my_posts', args: {} };
  }

  // 8. List following
  if (/(?:who am i following|my follows|list following)/i.test(lower)) {
    return { tool: 'list_following', args: {} };
  }

  // 9. List groups / circles
  if (/(?:my circles|my groups|list my circles|circles i belong to)/i.test(lower)) {
    return { tool: 'list_my_groups', args: {} };
  }

  // 10. Create group intent
  // "create a circle called ...", "found a circle named ..."
  const createGroupMatch = raw.match(/(?:create|found|open)\s+(?:a\s+)?(?:circle|group)\s+(?:called|named)\s+["']?([^"'\n]+)["']?/i);
  if (createGroupMatch && createGroupMatch[1]) {
    const groupName = createGroupMatch[1].trim();
    return {
      tool: 'create_group',
      args: {
        name: groupName,
        kind: 'forge',
        description: `A sanctum for weavers gathered around ${groupName}.`,
        tags: ['ayurveda', 'circle'],
      },
    };
  }

  // 11. Send message intent
  // "send message to @user saying ...", "message @user: ..."
  const msgMatch = raw.match(/(?:send\s+(?:a\s+)?message|message)\s+(?:to\s+)?@?([a-zA-Z0-9_.-]+)\s*(?::|saying)?\s+(.+)/i);
  if (msgMatch && msgMatch[1] && msgMatch[2]) {
    return {
      tool: 'send_thread_message',
      args: { username: msgMatch[1], body: msgMatch[2].trim() },
    };
  }

  // 12. Get my profile
  if (/(?:who am i|my profile|show my profile|my account details)/i.test(lower)) {
    return { tool: 'get_my_profile', args: {} };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 4. CRAFTING DEEP LORE MANUSCRIPTS & SUMMARIES
// ---------------------------------------------------------------------------

function generateTagsForTopic(topic) {
  const words = extractKeywords(topic);
  const tags = ['ayurveda'];
  for (const w of words) {
    if (['herbs', 'herb', 'remedy', 'remedies', 'dosha', 'vata', 'pitta', 'kapha', 'ojas', 'prana', 'agni', 'tea', 'sleep', 'ritual', 'cleansing'].includes(w)) {
      tags.push(w);
    }
  }
  if (tags.length < 3) tags.push('wellness', 'sanctum');
  return [...new Set(tags)].slice(0, 5);
}

function craftLuminousSummary(topic, manuscript) {
  const lower = topic.toLowerCase();
  if (lower.includes('ashwagandha')) {
    return 'An exploration into the somniferous root of winter vitality, grounding erratic Vata and rekindling Ojas.';
  }
  if (lower.includes('triphala')) {
    return 'The three sacred fruits that awaken the digestive fire, scour accumulated toxins, and restore elemental harmony.';
  }
  if (lower.includes('brahmi')) {
    return 'Nourishing the subtle seat of consciousness — cooling fiery thoughts and awakening sattvic mental clarity.';
  }
  if (lower.includes('turmeric') || lower.includes('haridra')) {
    return 'The golden rhizome that cleanses the bloodstream, pacifies cellular inflammation, and illuminates the skin.';
  }
  if (lower.includes('kitchari')) {
    return 'The sovereign cleansing nourishment: mono-diet wisdom for resting Agni and restoring physiological balance.';
  }
  if (lower.includes('sleep') || lower.includes('nidra')) {
    return 'Ayurvedic rituals for unhurried nocturnal restoration: pacifying the wind of the mind to invite deep cellular rest.';
  }
  return `A meditative exploration of ${topic}, weaving classical wisdom with practical daily rituals for radiant vitality.`;
}

function craftManuscriptForTopic(topic) {
  const lower = topic.toLowerCase();
  const herbs = matchHerbs(topic);
  const doshas = matchDoshas(topic);

  let sutra = '> *“Yatha pinde tatha brahmande”* — As is the atom, so is the universe; as is the human body, so is the cosmic body.';
  let herbSection = '';
  let ritualSection = '';

  if (herbs.length > 0) {
    const h = herbs[0];
    sutra = `> *“${h.sanskrit}”* — ${h.actions}`;
    herbSection = `
## Dravya Guna: Qualities & Elemental Essence

In the classical texts, this botanical is treasured for its precise energetic signatures:

- **Rasa (Taste):** ${h.rasa}
- **Virya (Potency):** ${h.virya}
- **Vipaka (Post-digestive effect):** ${h.vipaka}
- **Dosha Karma:** ${h.dosha}
- **Prabhava (Special potency):** ${h.actions}

---

## Therapeutic Indications

This medicine works primarily by clearing obstructions in the micro-channels (*srotas*) while protecting the vital essence (*ojas*). It is classically indicated for:

- Nourishing depleted tissues (*dhatus*)
- Calming erratic fluctuations of Prana
- Harmonizing metabolic transformation (*dhatu agni*)
`;
    ritualSection = `
## The Daily Sacred Preparation

To receive the medicine in its full potency, prepare it as follows:

1. **Vessel:** Use an earthen cup or unreactive brass bowl.
2. **Vehicle (*Anupana*):** ${h.ritual}
3. **Mindfulness:** Take the draught in quiet gratitude, sitting comfortably facing east or north.
`;
  } else if (doshas.length > 0) {
    const d = doshas[0];
    sutra = `> *“Samadosha samagnischa samadhatu malakriyah”* — Balanced doshas, balanced agni, harmonious tissues, and joyful spirit constitute true health.`;
    herbSection = `
## The Elemental Nature of ${d.key.toUpperCase()}

Formed from **${d.elements}**, this doshic principle governs the vital dynamics of life:

- **Gunas (Attributes):** ${d.nature}
- **Physiological Sphere:** ${d.governs}
- **Signs of Excess / Aggravation:** ${d.imbalanceSigns}

---

## Pacification and Equilibrium

When the balance shifts, equilibrium is restored not through suppression, but through introducing opposing qualities:

${d.balancing}
`;
    ritualSection = `
## Dinacharya: Rhythms for Harmony

- **Morning:** Rise during Brahma Muhurta, cleanse the sensory gates with warm water and oil.
- **Midday:** Consume the heaviest meal when Surya (the sun) is highest and Agni is at peak strength.
- **Dusk:** Transition to softness, dimming artificial glare and sipping warm herbal water.
`;
  } else {
    herbSection = `
## Foundations of Harmony

In classical Ayurveda, true well-being (*Svastha*) is not merely the absence of disease, but a luminous state where body, senses, mind, and soul dwell in blissful alignment.

When considering **${topic}**, we observe how the three foundational pillars (*Trayo Upastambha*) — proper nutrition (*Ahara*), restorative sleep (*Nidra*), and mindful energy preservation (*Brahmacharya*) — weave together.

---

## Kindling the Internal Flame (*Agni*)

Every metabolic transformation begins with Agni. When the fire burns clean:
- Nutrients are fully integrated into radiant tissue (*Tejas*).
- No toxic residue (*Ama*) settles into vulnerable channels (*Khavaigunya*).
- The natural protective vitality (*Ojas*) fills the countenance with steady calm.
`;
    ritualSection = `
## Practical Ritual for the Modern Weaver

1. **Hydration:** Begin the dawn with warm water infused with a thin slice of ginger or a twist of lime.
2. **Breathwork:** Practice five minutes of *Nadi Shodhana* (alternate nostril breathing) before sitting to compose or labor.
3. **Nourishment:** Eat sitting down without digital distraction, allowing the senses to perceive all six tastes (*Shad Rasa*).
`;
  }

  return `
# ${topic.charAt(0).toUpperCase() + topic.slice(1)}

${sutra}

${herbSection}

---

${ritualSection}

---

## Reflections for the AyurVerse Atelier

Carry these timeless principles into your daily creative flow. May your scrolls be deep, your moments luminous, and your hearth serene.
`.trim();
}

// ---------------------------------------------------------------------------
// 5. VAIDYA CHAT WISDOM GENERATOR (api/vaidya.js & api/agent.js)
// ---------------------------------------------------------------------------

export function generateVaidyaWisdom(userMessage, context = {}) {
  const q = String(userMessage || '').trim();
  const lower = q.toLowerCase();

  // Check for greetings
  if (/^(hello|hi|hey|pranam|namaste|greetings|pranams|hari om)/i.test(lower)) {
    const name = context.author_name ? `, ${context.author_name}` : '';
    return (
      `Pranam${name}. I am Vaidya, the physician-poet and house sage of this atelier.\n\n` +
      `Whether you wish to explore your doshic constitution, formulate an herbal decoction, ` +
      `seek guidance on dinacharya (daily ritual), or have me inscribe a lore scroll directly into the Forge — speak, and we shall weave it together.`
    );
  }

  // Check for Atelier platform navigation
  for (const [feature, desc] of Object.entries(ATELIER_GUIDE)) {
    if (lower.includes(feature)) {
      return (
        `### The AyurVerse Atelier: ${feature.charAt(0).toUpperCase() + feature.slice(1)}\n\n` +
        `${desc}\n\n` +
        `If you'd like me to assist you with this directly — whether publishing lore to the Forge, finding weavers in the Library, or reviewing your recent notices — simply ask, and I will act for you.`
      );
    }
  }

  // Check for recipes (Kitchari, Golden Milk, CCF Tea)
  if (lower.includes('kitchari') || lower.includes('khichdi')) {
    const r = RECIPES_LORE.kitchari;
    return (
      `### ${r.title}\n\n` +
      `*${r.essence}*\n\n` +
      `#### Sacred Ingredients\n` +
      r.ingredients.map((i) => `- ${i}`).join('\n') +
      `\n\n#### Preparation\n${r.method}\n\n` +
      `> **Vaidya’s Note:** Consume while piping warm. It is the premier food for resting a burdened digestive fire.`
    );
  }
  if (lower.includes('golden milk') || lower.includes('haldi doodh') || lower.includes('turmeric milk')) {
    const r = RECIPES_LORE.golden_milk;
    return (
      `### ${r.title}\n\n` +
      `*${r.essence}*\n\n` +
      `#### Sacred Ingredients\n` +
      r.ingredients.map((i) => `- ${i}`).join('\n') +
      `\n\n#### Preparation\n${r.method}\n\n` +
      `> **Vaidya’s Note:** Always add black pepper to turmeric — the piperine magnifies bioavailability exponentially.`
    );
  }
  if (lower.includes('ccf') || lower.includes('cumin coriander fennel') || lower.includes('digestive tea')) {
    const r = RECIPES_LORE.ccf_tea;
    return (
      `### ${r.title}\n\n` +
      `*${r.essence}*\n\n` +
      `#### Ingredients\n` +
      r.ingredients.map((i) => `- ${i}`).join('\n') +
      `\n\n#### Preparation\n${r.method}\n\n` +
      `> **Vaidya’s Note:** CCF tea kindle Agni without aggravating Pitta, making it universally tridoshic.`
    );
  }

  // Check for specific herbs
  const herbs = matchHerbs(lower);
  if (herbs.length > 0) {
    const h = herbs[0];
    return (
      `### ${h.sanskrit}\n\n` +
      `> *“${h.actions}”*\n\n` +
      `- **Rasa (Taste):** ${h.rasa}\n` +
      `- **Virya (Potency):** ${h.virya}\n` +
      `- **Vipaka:** ${h.vipaka}\n` +
      `- **Dosha Affinity:** ${h.dosha}\n` +
      `- **Attributes:** ${h.qualities}\n\n` +
      `#### When to Inquire of this Botanical\n` +
      `${h.indications}.\n\n` +
      `#### Sacred Method of Consumption\n` +
      `${h.ritual}`
    );
  }

  // Check for dosha inquiries
  const doshas = matchDoshas(lower);
  if (doshas.length > 0) {
    const d = doshas[0];
    return (
      `### Understanding ${d.key.toUpperCase()} Dosha\n\n` +
      `Formed from **${d.elements}**, ${d.key.toUpperCase()} represents the vital cosmic principle in the bodily microcosm:\n\n` +
      `- **Qualities (Gunas):** ${d.nature}\n` +
      `- **Governs:** ${d.governs}\n` +
      `- **Hallmarks of Imbalance:** ${d.imbalanceSigns}\n\n` +
      `#### Restoring Equilibrium\n` +
      `${d.balancing}\n\n` +
      `> Remember: we never fight the dosha; we honor its presence and invite balance through gentle opposing qualities (*vishesha*).`
    );
  }

  // Check for digestion / Agni / Ama
  if (lower.includes('digestion') || lower.includes('bloating') || lower.includes('gas') || lower.includes('stomach') || lower.includes('agni')) {
    return (
      `### Kindling Pachaka Agni (The Internal Digestive Fire)\n\n` +
      `In Ayurveda, all health begins and ends in the belly. When *Agni* is erratic or low, undigested food ferments into *Ama* (metabolic toxicity), creating heaviness, brain fog, and irregular elimination.\n\n` +
      `#### Simple Protocol for Sluggish or Irregular Fire:\n` +
      `1. **Ginger-Lime Tonic:** 15 minutes before lunch, chew a thin slice of fresh ginger with a drop of lime juice and a crystal of rock salt. This awakens the salivary enzymes and ignites hydrochloric output.\n` +
      `2. **Sip CCF Tea:** Brew equal parts cumin, coriander, and fennel seeds in warm water. Sip between meals.\n` +
      `3. **Liquid Rules:** Never douse Agni with iced water. Take only small sips of warm water during the meal.\n` +
      `4. **Evening Fasting:** Keep dinner light, warm, and taken at least 3 hours before sleep.`
    );
  }

  // Check for sleep / insomnia / stress
  if (lower.includes('sleep') || lower.includes('insomnia') || lower.includes('stress') || lower.includes('anxiety') || lower.includes('relax')) {
    return (
      `### The Dusk Sanctum: Calming Prana & Inviting Nidra\n\n` +
      `When sleep escapes us, it is almost invariably erratic **Vata dosha** agitating the subtle channel of the mind (*Mano Vaha Srotas*).\n\n` +
      `#### Evening Restorative Ritual:\n` +
      `- **Padabhyanga (Foot Massage):** Rub warm sesame oil or ghee into the soles of your feet for three minutes before slipping into cotton socks. The Marma points here directly ground cerebral heat.\n` +
      `- **Golden Elixir:** Warm whole milk (or almond milk) with 1/2 tsp Ashwagandha, a pinch of nutmeg, and cardamom. Nutmeg (*Jatiphala*) is Ayurveda’s natural somniferous spice.\n` +
      `- **Dimming the Senses:** Cease all screen illumination at least 45 minutes before sleep. Let the nervous system register the descent of night.`
    );
  }

  // Default deep Ayurvedic physician response
  return (
    `### Observations from the Physician-Poet\n\n` +
    `Every condition, thought, and seasonal transition reflects the play of the five great elements: ` +
    `*Ether, Air, Fire, Water, and Earth* (*Pancha Mahabhutas*).\n\n` +
    `To approach **${q.slice(0, 100)}** through classical eyes:\n\n` +
    `- **Observe the Qualities (*Gunas*):** Is there excess heat, dryness, heaviness, or mobility?\n` +
    `- **Protect Agni:** Ensure your digestive fire is burning cleanly without producing metabolic sediment (*Ama*).\n` +
    `- **Honor Rhythm:** Align your waking, eating, and resting hours with the solar arc.\n\n` +
    `Tell me more of what you are experiencing, or ask me to draft a full treatise into your Forge manuscripts.`
  );
}

// ---------------------------------------------------------------------------
// 6. AI SCRIBE POLISHER (api/ai.js)
// ---------------------------------------------------------------------------

export function polishScribeText({ mode, text, title }) {
  const tidy = String(text || '').replace(/\s+/g, ' ').trim();
  if (!tidy) return '';

  if (mode === 'caption') {
    // Keep hashtags exactly intact
    const tags = tidy.match(/#[\p{L}\p{N}_]+/gu) || [];
    const withoutTags = tidy.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s{2,}/g, ' ').trim();

    // Elevate rhythm, imagery, and poetic voice
    const firstWord = withoutTags.charAt(0).toUpperCase() + withoutTags.slice(1);
    const cleaned = firstWord.replace(/[.!?]+$/, '');

    // Add elevated cadence based on content
    let polishedText = cleaned;
    const lower = cleaned.toLowerCase();

    if (lower.includes('morning') || lower.includes('dawn') || lower.includes('sunrise') || lower.includes('sun')) {
      polishedText = `${cleaned} — welcomed in the quiet amber light of dawn.`;
    } else if (lower.includes('tea') || lower.includes('herb') || lower.includes('brew') || lower.includes('kitchari')) {
      polishedText = `${cleaned} — an infusion steeped with intention and quiet grace.`;
    } else if (lower.includes('night') || lower.includes('dusk') || lower.includes('sleep') || lower.includes('rest')) {
      polishedText = `${cleaned} — held gently as dusk gathers over the sanctuary.`;
    } else if (lower.includes('fire') || lower.includes('sun') || lower.includes('pitta') || lower.includes('energy')) {
      polishedText = `${cleaned} — illuminating the path with calm, steady warmth.`;
    } else {
      polishedText = `${cleaned} — woven with care and carried in the quiet breath of the atelier.`;
    }

    const tagStr = tags.length ? ` ${tags.join(' ')}` : '';
    return `${polishedText}${tagStr}`.trim();
  }

  if (mode === 'summary') {
    const firstSent = tidy.split(/(?<=[.!?\u0964])\s/)[0] || tidy;
    let sum = firstSent.charAt(0).toUpperCase() + firstSent.slice(1);
    if (!/[.!?]$/.test(sum)) sum += '.';

    if (sum.length > 175) {
      sum = `${sum.slice(0, 172)}…`;
    }
    return sum;
  }

  if (mode === 'manuscript') {
    let out = tidy;

    // Determine heading if absent
    const headerTitle = (title || 'The Illuminated Scroll').replace(/[#*_\n]/g, ' ').trim();
    const hasH1 = /^#\s+/m.test(out);
    const hasH2 = /^##\s+/m.test(out);

    let formatted = '';
    if (!hasH1 && !hasH2) {
      formatted = `## ${headerTitle}\n\n`;
    }

    // Split paragraphs
    const paragraphs = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    // Pick one profound sentence for the > sutra callout
    let sutraFound = false;
    const processedParas = [];

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];

      // If already a heading or list or blockquote, preserve
      if (/^#{1,4}\s/.test(p) || /^>\s/.test(p) || /^-\s/.test(p)) {
        processedParas.push(p);
        continue;
      }

      // If it's the second paragraph and no sutra yet, promote one line
      if (!sutraFound && (i === 1 || (paragraphs.length === 1 && p.length > 60))) {
        const sentences = p.split(/(?<=[.!?])\s+/);
        if (sentences.length > 1) {
          const callout = sentences[0];
          const rest = sentences.slice(1).join(' ');
          processedParas.push(`> *“${callout.replace(/[“"”]/g, '')}”*`);
          sutraFound = true;
          if (rest) processedParas.push(rest);
          continue;
        }
      }

      processedParas.push(p);
    }

    if (!sutraFound && paragraphs.length > 0) {
      processedParas.splice(1, 0, `> *“Harmony arises when the internal flame dances in rhythm with the universe.”*`);
    }

    formatted += processedParas.join('\n\n---\n\n');
    return formatted;
  }

  if (mode === 'vaidya_seal') {
    const lower = `${title || ''} ${tidy}`.toLowerCase();

    let vataAff = 'Pacifies (↓)';
    let pittaAff = 'Neutral (⇋)';
    let kaphaAff = 'Pacifies (↓)';
    let herb = 'Classical Ayurvedic Formulation';
    let anupana = 'Ushnodaka (Warm pure water) or Organic Cow’s Ghee';
    let citation = 'Charaka Samhita, Sutrasthana Ch. 1: "हिताहितं सुखं दुःखमायुस्तस्य हिताहितम्"';
    let contraindication = 'Contraindicated during acute Ama Jwara (fever with coating) or acute indigestion.';

    if (lower.includes('ashwagandha') || lower.includes('stress') || lower.includes('insomnia') || lower.includes('vata') || lower.includes('sleep')) {
      vataAff = 'Pacifies deeply (↓↓)';
      pittaAff = 'Mild warming (↑ in excess)';
      kaphaAff = 'Nourishes / Balya (↑)';
      herb = 'Ashwagandha (Withania somnifera)';
      anupana = 'Warm A2 whole milk with a pinch of nutmeg and organic ghee';
      citation = 'Charaka Samhita, Chikitsasthana 1.2: "गन्धप्रिया महावीर्या वातघ्नी बलवर्धिनी"';
      contraindication = 'Excess high Pitta with severe acid reflux, acute congestion.';
    } else if (lower.includes('triphala') || lower.includes('digest') || lower.includes('agni') || lower.includes('detox') || lower.includes('ama')) {
      vataAff = 'Balances (↓)';
      pittaAff = 'Pacifies (↓)';
      kaphaAff = 'Scrapes stagnation (↓↓)';
      herb = 'Triphala (Haritaki, Bibhitaki, Amalaki)';
      anupana = 'Warm spring water at bedtime, or raw organic honey in the morning';
      citation = 'Ashtanga Hridaya, Uttarasthana 40: "कषायमधुरं चाम्लं दीपनं कफपित्तजित्"';
      contraindication = 'Acute diarrhea, unmitigated dehydration, pregnancy without direct supervision.';
    } else if (lower.includes('turmeric') || lower.includes('golden milk') || lower.includes('joint') || lower.includes('inflammation')) {
      vataAff = 'Pacifies with ghee (↓)';
      pittaAff = 'Neutral to cleansing (⇋)';
      kaphaAff = 'Scrapes & warms (↓↓)';
      herb = 'Haridra (Curcuma longa)';
      anupana = 'Simmered milk with crushed Pippali (black pepper) and grass-fed ghee';
      citation = 'Bhavaprakasha Nighantu, Haritakyadi Varga: "हरिद्रा कटुतिक्तोष्णा वर्ण्य त्वग्दोषनाशिनी"';
      contraindication = 'Active biliary obstruction, acute hyperchlorhydria.';
    } else if (lower.includes('abhyanga') || lower.includes('oil') || lower.includes('sesame') || lower.includes('massage')) {
      vataAff = 'Soothes instantly (↓↓↓)';
      pittaAff = 'Cooling if coconut/sunflower, warming if sesame (⇋)';
      kaphaAff = 'Requires vigorous dry strokes / udvartana (⇋)';
      herb = 'Tila Taila (Cured Black Sesame Oil)';
      anupana = 'External transdermal absorption followed by warm herbal bath (Snana)';
      citation = 'Charaka Samhita, Sutrasthana 5.88: "न चाभिघाताभिहतोऽप्यतिकष्टं विनिन्दति"';
      contraindication = 'During menstruation, indigestion with coating on tongue (Ama), or acute fever.';
    }

    return `### Clinical Annotation & Sovereign Seal
**Lineage Verification · Board of Vaidya Scholars**

- **Doshic Suitability**: Vata: ${vataAff} · Pitta: ${pittaAff} · Kapha: ${kaphaAff}
- **Primary Dravya/Dynamic**: ${herb}
- **Prescribed Anupana (Vehicle)**: ${anupana}
- **Physiological Action**: Kindles *Jatharagni* without stoking inflammatory bile, purges metabolic *Ama*, and channels nourishment toward *Dhatus* and *Ojas*.
- **Canonical Shloka**: *${citation}*
- **Clinical Contraindications**: ${contraindication}`;
  }

  return tidy;
}

// ---------------------------------------------------------------------------
// 7. MULTI-TURN AGENT ENGINE RUNNER FOR api/agent.js
// ---------------------------------------------------------------------------

export async function runVaidyaAgent({ messages, userId, user, meta, tools, actions = [] }) {
  const history = Array.isArray(messages) ? messages : [];
  const lastUserMsg = [...history].reverse().find((m) => m && m.role === 'user')?.content || '';

  // Check if the last turn was a tool execution result
  if (lastUserMsg.startsWith('TOOL_RESULT')) {
    const toolMatch = lastUserMsg.match(/^TOOL_RESULT\s+([a-zA-Z0-9_]+):\s*(.*)/);
    const toolName = toolMatch ? toolMatch[1] : '';
    let resultObj = {};
    try {
      resultObj = JSON.parse(toolMatch[2]);
    } catch {
      /* fallback */
    }

    // Generate gracious completion confirmation
    if (toolName === 'write_lore_post') {
      return {
        reply: `I have inscribed your lore manuscript **"${resultObj.title || 'Untitled Scroll'}"** and sealed it into the Forge. Weavers across the atelier may now study its wisdom.`,
        actions,
      };
    }
    if (toolName === 'update_profile') {
      return {
        reply: `Your presence in the atelier has been amended with care. Your profile now reflects your chosen path.`,
        actions,
      };
    }
    if (toolName === 'follow_user') {
      return {
        reply: `The thread is woven — you are now walking alongside @${resultObj.followed || 'this weaver'} in the atelier.`,
        actions,
      };
    }
    if (toolName === 'unfollow_user') {
      return {
        reply: `The thread has been released with respect. You have unfollowed this channel.`,
        actions,
      };
    }
    if (toolName === 'create_group') {
      return {
        reply: `The circle **"${resultObj.name}"** has been founded in the atelier. Your fellow weavers may now gather within its walls.`,
        actions,
      };
    }
    if (toolName === 'send_thread_message') {
      return {
        reply: `Your words have been carried across the sanctum and delivered safely into the thread.`,
        actions,
      };
    }
    if (toolName === 'recent_activity') {
      const recent = resultObj.recent || [];
      if (!recent.length) {
        return {
          reply: `The sanctuary was tranquil while you rested — there are no new notices awaiting your gaze.`,
          actions,
        };
      }
      const lines = recent.slice(0, 5).map((r) => `- **${r.who}** ${r.did}: *${r.about || 'engaged with your presence'}*`);
      return {
        reply: `### While You Were Away\n\nYou have ${resultObj.unread || 0} unread notices:\n\n${lines.join('\n')}`,
        actions,
      };
    }
    if (toolName === 'list_my_posts') {
      const posts = resultObj.posts || [];
      if (!posts.length) {
        return {
          reply: `Your loom is currently open — you have not yet published any scrolls or visual moments. Would you like me to write your first lore manuscript?`,
          actions,
        };
      }
      const lines = posts.slice(0, 6).map((p) => `- **#${p.id} [${p.kind}]** ${p.title || p.caption || '(untitled)'} · ❤️ ${p.likes || 0} · 👁️ ${p.views || 0}`);
      return {
        reply: `### Your Published Works\n\n${lines.join('\n')}`,
        actions,
      };
    }

    return {
      reply: `The deed is accomplished. Is there anything further I may weave for you?`,
      actions,
    };
  }

  // Detect tool intent from the user's message
  const detectedIntent = interpretAgentIntent(lastUserMsg);

  if (detectedIntent && tools[detectedIntent.tool]) {
    // Execute the tool server-side
    const toolName = detectedIntent.tool;
    const fn = tools[toolName];
    let exec;
    try {
      exec = await fn({ userId, user, args: detectedIntent.args });
    } catch (err) {
      exec = { result: { error: err.message } };
    }

    if (exec.receipt) {
      actions.push({ tool: toolName, summary: exec.receipt, result: exec.result });
    }

    // Now format a prompt closing or confirmation
    if (toolName === 'write_lore_post' && exec.result?.ok) {
      return {
        reply: `I have inscribed the deep lore scroll **"${detectedIntent.args.title}"** into the Forge.\n\nIt carries section illuminations, a classical sutra, and practical rituals for our weavers.`,
        actions,
        model: 'ayurvedic-sage',
      };
    }
    if (toolName === 'update_profile' && exec.result?.ok) {
      return {
        reply: `Your profile details have been gently renewed in the temple ledger.`,
        actions,
        model: 'ayurvedic-sage',
      };
    }
    if (toolName === 'follow_user' && exec.result?.ok) {
      return {
        reply: `You are now following @${detectedIntent.args.username}. Their moments and scrolls will bloom in your Feed weave.`,
        actions,
        model: 'ayurvedic-sage',
      };
    }
    if (toolName === 'recent_activity') {
      const recent = exec.result?.recent || [];
      const lines = recent.slice(0, 5).map((r) => `- **${r.who}** ${r.did}: *${r.about || 'interacted'}*`);
      return {
        reply: recent.length
          ? `### While You Were Resting\n\n${lines.join('\n')}`
          : `The sanctuary was quiet — no unread notices await you just now.`,
        actions,
        model: 'ayurvedic-sage',
      };
    }
    if (toolName === 'list_my_posts') {
      const posts = exec.result?.posts || [];
      const lines = posts.slice(0, 6).map((p) => `- **#${p.id} [${p.kind}]** ${p.title || p.caption || '(untitled)'}`);
      return {
        reply: posts.length ? `### Your Works\n\n${lines.join('\n')}` : `You have no published scrolls yet.`,
        actions,
        model: 'ayurvedic-sage',
      };
    }

    return {
      reply: exec.receipt || `I have carried out ${toolName} on your behalf.`,
      actions,
      model: 'ayurvedic-sage',
    };
  }

  // Conversational response from Vaidya
  const wisdom = generateVaidyaWisdom(lastUserMsg, meta);
  return {
    reply: wisdom,
    actions,
    model: 'ayurvedic-sage',
  };
}
