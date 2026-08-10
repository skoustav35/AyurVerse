# AyurVerse vs Competitors (Instagram/Facebook) Analysis

## 1. Core Features
*   **Visual Feed (Instagram-like):** Has double-tap to like, golden bursts, story rings.
    *   *Difference:* Theme is highly customized ("Ayurvedic-majestic").
*   **Deep Reading / Forge (Replit-like):** Markdown, KaTeX, code blocks.
    *   *Difference:* Instagram/FB lack long-form, rich-text reading environments. This caters to a creator/intellectual niche.
*   **Library Search (YouTube-like):** Multi-field boosted, BM25-style.
    *   *Difference:* FB/Insta search is notoriously basic (mostly accounts/hashtags). A powerful content search is a strong differentiator.
*   **DMs/Messaging:** 1:1, group, voice notes, stickers.
    *   *Difference:* Standard expectation, but built natively on Supabase Realtime.
*   **Studio / Payouts:** Razorpay integrated for $1/1k likes.
    *   *Difference:* Direct monetization for micro-creators is a massive pull compared to FB/Insta where only massive influencers make ad money.

## 2. Design System
*   "Ayurvedic-majestic": Uses Neem, Saffron, Gold, Parchment colors. Incorporates Mandalas and organic shapes.
*   *Competitor Comparison:* Instagram and Facebook are entirely sterile, white/black minimalist. AyurVerse has a strong cultural soul that instantly screams "India" but in a premium, non-cliché way.

## 3. Tech Stack & Performance
*   Vite, React 19, Tailwind v4.
*   Supabase (Postgres, Auth, Storage).
*   Needs to be highly optimized for mobile web if it's not a native app yet.

## 4. Localization & Indian Market Fit
*   **Pan-India Appeal:** The aesthetic (Ayurvedic/Majestic) is culturally resonant across most of India without tying to one specific language.
*   **The Promotional Hook:** $1 for 1,000 likes via Razorpay is an incredible growth hack for the Indian market. It taps directly into the desire for creator monetization, which platforms like ShareChat and Moj have used, but pairs it with a premium UI (unlike the often cluttered UIs of local competitors).
*   **Challenge:** Mobile data is cheap, but device capabilities vary wildly. The heavy use of Framer Motion, GSAP, and complex SVGs (Mandalas) needs careful performance profiling to ensure it doesn't drain battery or lag on mid-tier Android devices (which dominate the market).


## 5. What's Next to be Implemented (Prioritized)

### Phase 1: Growth & Retention (Immediate)
1.  **PWA (Progressive Web App) Setup / Native Wrapping:**
    *   *Why:* Indian users prefer installed apps. If not going React Native yet, a robust PWA with a manifest, service worker for offline caching, and "Add to Home Screen" prompt is mandatory.
2.  **Fraud Prevention for the Payouts:**
    *   *Why:* The $1/1k likes promo *will* attract bots and click-farms instantly.
    *   *What:* Implement rate-limiting, CAPTCHAs on signup, device fingerprinting, and an algorithmic check (velocity of likes, account age) before approving Razorpay payouts.
3.  **Algorithmic Discovery (The "For You" Page):**
    *   *Why:* To compete with Insta Reels, the feed cannot rely solely on the chronological follow graph.
    *   *What:* Implement a recommendation engine leveraging the `taste` weights and `BM25-style` search you already have, feeding it into an infinite scroll "Discover" tab.

### Phase 2: Engagement & Content Creation
4.  **Multi-Language UI & Content Translation:**
    *   *Why:* A pan-India app needs Hindi, Tamil, Telugu, etc.
    *   *What:* Use the OpenCode AI not just for polishing English, but for offering one-tap translations of captions and Forge manuscripts.
5.  **Video Compression & CDN Optimization:**
    *   *Why:* High-res media will kill load times on 4G/3G networks outside major cities.
    *   *What:* Ensure Supabase Storage is sitting behind a strong CDN (like Cloudflare) and implement aggressive client-side image/video compression before upload (using libraries like `browser-image-compression` or FFmpeg WASM).

### Phase 3: Community & Safety
6.  **Moderation Tools & Reporting:**
    *   *Why:* Essential for any social network.
    *   *What:* User blocking, content reporting, and an admin dashboard to handle flagged posts.
