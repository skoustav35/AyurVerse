"""Deterministic persona generator — 500 believable weavers.

Each persona is a stable product of its index (seeded RNG): name, handle, bio,
interest affinities keyed to AyurVerse's corpus, writing voice, activity tier
and circadian windows. The director passes `system_prompt()` verbatim to the
local LLM so every action is taken *in character*.
"""
from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass, field

FIRST = [
    "Aarav", "Anaya", "Arjun", "Bhavna", "Chandan", "Charu", "Devika", "Dhruv", "Esha", "Farid",
    "Gauri", "Harsha", "Ila", "Irfan", "Jagan", "Jyoti", "Kabir", "Kalindi", "Keshav", "Lata",
    "Madhav", "Malini", "Mihir", "Nadia", "Nakul", "Ojas", "Padma", "Parth", "Qamar", "Radhika",
    "Raghav", "Sahej", "Samar", "Tara", "Tej", "Uma", "Veda", "Vidya", "Waseem", "Yamini",
    "Zara", "Aditi", "Biren", "Chitra", "Damodar", "Ekta", "Feroz", "Gitanjali", "Hriday", "Indu",
    "Jairam", "Kalyani", "Lokesh", "Meera", "Nandini", "Om", "Piya", "Rukmini", "Soham", "Trisha",
    "Uday", "Vani", "Yash", "Zubin", "Amrita", "Bodhi", "Chethan", "Dipali", "Eknath", "Fulati",
]
LAST = [
    "Acharya", "Bandopadhyay", "Chakrabarti", "Desai", "Ettiyadi", "Fernandes", "Ghosh", "Hegde",
    "Iyer", "Joshi", "Kamat", "Lahiri", "Mukherjee", "Naidu", "Oommen", "Pandit", "Qureshi",
    "Raghunathan", "Sengupta", "Trivedi", "Upadhyay", "Venkataraman", "Wankhede", "Xavier",
    "Yagnik", "Zacharia", "Anand", "Biswas", "Chawla", "Dhar", "Easwaran", "Fatima", "Guha",
    "Handa", "Inamdar", "Jayaram", "Kidwai", "Luthra", "Menon", "Nagarkar", "Oberoi", "Pradhan",
]

VOICES = [
    "spare and precise, one telling detail per sentence",
    "warm and conversational, generous with praise, allergic to hype",
    "lyrical, prone to one quiet metaphor per paragraph",
    "analytical; states assumptions before conclusions",
    "dry wit, short sentences, never a wasted word",
    "teacherly — builds from first principles to the payoff",
    "field-note style: place, time, texture, then thought",
    "devotional cadence; reads like it was written by lamplight",
]

# archetype -> (tag affinities, forge topic seeds, typical craft)
ARCHETYPES = {
    "ml_monk": {
        "tags": ["transformers", "attention", "deep-learning", "pytorch", "embeddings", "vectors", "search"],
        "topics": [
            "a gentle derivation of scaled dot-product attention",
            "why cosine similarity is a temple-bell curve of meaning",
            "hand-rolling a tiny embedding index over poetry titles",
            "kv-cache arithmetic for small laptops",
            "reading layernorm as pranayama for activations",
        ],
        "craft": "machine learning, slowly and by hand",
    },
    "versekeeper": {
        "tags": ["bengali", "poetry", "recitation", "tagore", "prosody", "monsoon", "reading"],
        "topics": [
            "counting matras in a rainstorm: payar chhanda for beginners",
            "why Tagore reads better at 0.8x speed",
            "the caesura as a doorway: 8 matras, then 6",
            "annotating one Gitanjali line for reciters",
            "a field note on vowel length in Bengali and Sanskrit",
        ],
        "craft": "prosody and the spoken line",
    },
    "loomkeeper": {
        "tags": ["weaving", "handloom", "kanchipuram", "textile", "craft", "generative", "cellular-automata"],
        "topics": [
            "reading a weaving draft like sheet music",
            "rule 90 pallus: temple triangles from three bits",
            "why every warp thread deserves a name",
            "zari math: counting gold per inch of silk",
            "a summer notebook from the pit looms",
        ],
        "craft": "handloom drafts and pattern grammar",
    },
    "rasa_cook": {
        "tags": ["chai", "recipe", "streetfood", "dosa", "spices", "monsoon", "davanagere"],
        "topics": [
            "the three risings of monsoon chai",
            "seasoning a griddle for a decade: marginal notes",
            "ginger first — a small manifesto on sequence",
            "davanagere benne dosa as an ideology",
            "weighing cardamom like a pharmacist",
        ],
        "craft": "kitchen craft and spice logic",
    },
    "raag_ear": {
        "tags": ["tabla", "sitar", "surbahar", "music", "riyaz", "rhythm", "dance", "bharatanatyam"],
        "topics": [
            "teentaal for programmers: sixteen beats, no frameworks",
            "the bayan is weather: notes from an 11pm riyaz",
            "korvai arithmetic — landing on sam every time",
            "surbahar vs sitar: an argument in timbre",
            "counting jati in 7 while the heart keeps 8",
        ],
        "craft": "rhythm, riyaz and instruments",
    },
    "nyaya_logician": {
        "tags": ["logic", "nyaya", "philosophy", "reasoning", "kalman-filter", "estimation", "control-theory"],
        "topics": [
            "the hetu must be visible: notes on udaharana",
            "five limbs and one ladder: persuasion as process",
            "hetvabhasa — the original red-team taxonomy",
            "kalman gain as trust, chai as evidence",
            "a tiny proof checker and what it taught my readings",
        ],
        "craft": "old logic for new arguments",
    },
    "ui_gardener": {
        "tags": ["design", "css", "ayurveda", "ui", "motion", "photography"],
        "topics": [
            "parchment, not paper-white: a color token rant",
            "golden-ratio gutters in practice",
            "springs, not tweens: motion with a pulse",
            "why my skeletons shimmer warm",
            "restraint is the ninth color",
        ],
        "craft": "warm interfaces and disciplined motion",
    },
    "ghat_walker": {
        "tags": ["varanasi", "dawn", "ganga", "travel", "photography", "holi", "festival"],
        "topics": [
            "fog over kedar ghat: water practicing to be sky",
            "portra diplomacy — getting close without taking",
            "shooting holi at f/1.8 and living",
            "a boat index of dawn light",
            "the etiquette of the burning ghat",
        ],
        "craft": "travel notes and light discipline",
    },
    "retrieval_sufi": {
        "tags": ["search", "information-retrieval", "vectors", "bm25", "embeddings", "library"],
        "topics": [
            "bm25 as ritual counting: saturation and brevity",
            "reciprocal rank fusion in one honest stanza",
            "hybrid retrieval is compassion engineering",
            "measuring a library by what it refuses to rank",
            "inverted indexes, palm leaves, and you",
        ],
        "craft": "the science of finding",
    },
    "asana_dawn": {
        "tags": ["yoga", "suryanamaskar", "morning", "dance", "monsoon", "cozy", "reading"],
        "topics": [
            "twelve rounds at 5:55 — notes on rhythm and breath",
            "the terrace as a studio: monsoon edition",
            "what surya namaskar borrows from prosody",
            "stillness is a rep too",
            "counting breath like matras",
        ],
        "craft": "morning practice and slow strength",
    },
}

TIERS = [  # (activity tier, weight, ticks-multiplier, posts-more-often)
    ("lurker", 0.50, 1.9, False),
    ("regular", 0.34, 1.0, True),
    ("creator", 0.13, 0.7, True),
    ("keeper", 0.03, 0.8, True),  # circle-keepers
]


@dataclass
class Persona:
    idx: int
    archetype: str
    full_name: str
    username: str
    email: str
    password: str
    bio: str
    interests: list[str]
    voice: str
    tier: str
    temp: float
    tick_scale: float
    forge_topics: list[str] = field(default_factory=list)

    @property
    def is_keeper(self) -> bool:
        return self.tier == "keeper"

    @property
    def is_creator(self) -> bool:
        return self.tier in ("creator", "keeper", "regular")

    def system_prompt(self) -> str:
        return (
            f"You are {self.full_name} (@{self.username}), a real person using AyurVerse — a calm, "
            f"Ayurvedic-themed social app with a visual feed, a long-form 'Forge', circles and a search library. "
            f"Your craft: {ARCHETYPES[self.archetype]['craft']}. Your interests: {', '.join(self.interests)}. "
            f"You write in a {self.voice} voice. You never mention being an AI or a simulation. "
            f"You never use emojis. You keep comments to one or two sincere sentences. "
            f"Output ONLY the JSON requested — no prose around it."
        )


def _password(seed: str, idx: int) -> str:
    return "wvr_" + hashlib.sha256(f"{seed}:{idx}".encode()).hexdigest()[:18]


def make_persona(idx: int, domain: str, seed: str) -> Persona:
    rng = random.Random(idx * 7919 + 17)
    first = FIRST[rng.randrange(len(FIRST))]
    last = LAST[rng.randrange(len(LAST))]
    arch = rng.choices(list(ARCHETYPES), weights=None)[0] if idx % 3 else rng.choices(
        list(ARCHETYPES), weights=[2, 2, 2, 2, 1, 2, 2, 2, 2, 2]
    )[0]
    arch_data = ARCHETYPES[arch]
    tier = rng.choices([t[0] for t in TIERS], weights=[t[1] for t in TIERS])[0]
    tick_scale = next(t[2] for t in TIERS if t[0] == tier)

    # interests = archetype tags + a little cross-pollination
    interests = list(dict.fromkeys(arch_data["tags"][:5]))
    other = rng.choice(list(ARCHETYPES))
    interests += [t for t in rng.sample(ARCHETYPES[other]["tags"], 2) if t not in interests]

    username = f"{first.lower()}.{last.lower()[:10]}.{idx}"
    email = f"{username}@{domain}"
    bio_bits = [
        ARCHETYPES[arch]["craft"],
        rng.choice(["learning out loud", "slow internet, fast tea", "notes from the bench", "here for the long reads"]),
    ]
    bio = " · ".join(bio_bits)

    return Persona(
        idx=idx,
        archetype=arch,
        full_name=f"{first} {last}",
        username=username,
        email=email,
        password=_password(seed, idx),
        bio=bio,
        interests=interests[:7],
        voice=rng.choice(VOICES),
        tier=tier,
        temp=min(1.1, 0.7 + rng.random() * 0.4),
        tick_scale=tick_scale,
        forge_topics=arch_data["topics"],
    )


def cohort(count: int, domain: str, seed: str) -> list[Persona]:
    return [make_persona(i, domain, seed) for i in range(count)]
