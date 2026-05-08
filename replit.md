# Apex — TUS Zirvesi

AI destekli Türk tıp uzmanlık sınavı (TUS) hazırlık platformu — Mistral AI sorular, Pollinations.ai görseller, Firebase backend.

## Run & Operate

- `pnpm --filter @workspace/apextus run dev` — run the Apex TUS web app (port 23480)
- `pnpm --filter @workspace/apextus run typecheck` — typecheck the web app
- Artifact: `artifacts/apextus/` — React + Vite + Firebase + Mistral AI

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 18 + Vite 7 + Tailwind CSS v4
- AI: Mistral API (mistral-large-latest) — replaces Gemini
- Image AI: Pollinations.ai (FLUX model, free, no key needed)
- Backend: Firebase v10 (Auth + Firestore + Storage)
- Charts: Recharts
- Fonts: Playfair Display + Syne + JetBrains Mono

## Where things live

- `artifacts/apextus/src/` — all source files
- `artifacts/apextus/src/lib/firebase.ts` — Firebase init (config hardcoded)
- `artifacts/apextus/src/lib/mistral.ts` — Mistral API client
- `artifacts/apextus/src/lib/imageGen.ts` — Pollinations.ai + Firebase Storage upload
- `artifacts/apextus/src/lib/data.ts` — TREE (11 cats, 109 topics), LINK_MAP, constants
- `artifacts/apextus/src/lib/firestore.ts` — all Firestore operations
- `artifacts/apextus/src/contexts/AppContext.tsx` — global state + Firebase auth
- `artifacts/apextus/src/index.css` — dark medical theme CSS variables + component styles
- `artifacts/apextus/.env` — VITE_MISTRAL_API_KEY

## Architecture decisions

- Mistral API is called client-side (same pattern as original Gemini integration)
- Images generated via Pollinations.ai then uploaded to Firebase Storage for persistence
- Spaced repetition (SM-2): intervals [1,3,7,14,30,60] days, tracked in Firestore
- Free plan limits: 5 quiz questions, 1 note, 1 AI explanation
- Firebase Firestore collections: notes/{topicKey}, questions/{topicKey__diff}/pool, analyses/{fp}, users/{uid}, profiles/{uid}

## Product

- AI Quiz: Mistral generates TUS-style clinical case questions with 5 options; AI explanation per question
- Konu Notları: Full TUS study notes (13 sections) + clinical connection map + AI-generated educational images
- Tekrar Planı: SM-2 spaced repetition + AI weekly/monthly study plan generator
- İstatistikler: Category performance charts (Recharts), session trends, topic coverage
- Pricing: Free / Weekly (₺249) / Monthly (₺699) — Shopier payment, WhatsApp activation

## User preferences

- Use Mistral API (not Gemini) for all AI calls
- Images generated via Pollinations.ai FLUX model, stored in Firebase Storage
- All existing features from original HTML app must be preserved
- Turkish language throughout

## Gotchas

- CSS: Google Fonts @import must come FIRST in index.css before tailwind imports
- Mistral JSON mode: uses `response_format: { type: "json_object" }` (not gemini's responseMimeType)
- Firebase Storage: image upload can fail silently — app falls back to Pollinations.ai URL
- VITE_MISTRAL_API_KEY in .env file (client-exposed at build time, same pattern as original)
