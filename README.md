# Tutorium — say less, learn more

A **voice-first AI tutor**. Speak your question, get an interactive lesson — not a wall of text. Built for the **Virgo Challenge** (educational AI tool).

Tutorium turns messy notes, voice, and questions into a real study workflow: curriculum-aligned study packs, flashcards, quizzes, summaries, and a **Say-It-Back** pronunciation/fluency practice that scores every word you say.

## Why it stands out

- **Voice-first by design** — hold the mic and speak; the whole pipeline (STT → reasoning → interactive lesson) is built around speech, not bolted on.
- **Speechmatics word-level confidence** powers **Say-It-Back**: you read a passage aloud, every word is colored by recognition confidence (green/amber/red), and topic terms that didn't come through clean become drill targets.
- **Vocab Hot-Swap** — before each recognition job, the topic's key terms are injected into Speechmatics' custom dictionary (`additional_vocab`), so curriculum jargon like *photosynthesis* or *quadratic* doesn't garble.
- **Interactive components** (not just text): flashcard decks, graded quizzes, study-pack action chips, and a Feynman-style **teach-back** grader.
- **Learner memory** — a per-student profile that updates strengths, weaknesses, and the next best action after every exchange.
- **Zero external DB** — SQLite local; clone, add two API keys, and demo.

## Features

| Feature | How it works |
|---------|--------------|
| 🎙 Hold-to-talk | Browser media recorder → `/api/stt` → Speechmatics batch → transcript into the chat |
| 📚 Study pack | Paste/speak messy notes → clean notes, reviewer, flashcards, quiz, summary, story |
| 🃏 Interactive widgets | Flashcards, scored quiz, study-pack actions, teach-back review — rendered inline |
| 🗣 Say-It-Back | Read a passage aloud → per-word confidence heatmap + score + missed-term drill |
| 🧠 Teach-back grader | Explain the topic in your own words → LLM grades against source notes (Feynman mode) |
| 🗄 Learner library | Subjects → topics → materials, persisted locally |
| 🎯 Vocab Hot-Swap | Topic key terms injected into Speechmatics `additional_vocab` each job |

## Stack

- **Next.js 14** (App Router) + React 18 + TypeScript + Tailwind
- **Featherless AI** — OpenAI-compatible LLM backend (swappable in one file, `src/lib/llm.ts`)
- **Speechmatics batch API v2** — STT with word-level confidence + custom vocabulary
- **SQLite** (better-sqlite3) — zero-credential local storage

## Quick start

```bash
npm install
npm run env:sync     # copies SPEECHMATICS_API_KEY + FEATHERLESS_API_KEY
                     # from C:\Users\HP\Desktop\MetaForge\.env (edit scripts/sync-env.mjs to point elsewhere)
npm run dev          # http://localhost:3000
```

Or set the env vars directly in `.env.local`:

```env
SPEECHMATICS_API_KEY=...
FEATHERLESS_API_KEY=...
TUTORIUM_LLM_MODEL=Qwen/Qwen3-32B
```

(No Supabase/Mongo/AWS needed.)

### Demo flow (2 minutes)

1. Open the app, hold the mic: *"make a study pack about photosynthesis"* → speak some messy notes.
2. The **study pack actions** render: quiz, flashcards, say-it-back.
3. Tap **"say it back"** and read the passage aloud → get your **Say-It-Back score** + word heatmap.
4. Ask a follow-up: *"explain it like I'm 12"* → voice reply, kid-friendly.
5. Open **Library** to see all subjects/topics/materials persisted.

## Testing

```bash
npm test       # vitest — vocab hot-swap + say-it-back scoring
npm run build  # production build
```

## Project structure

```
src/
  app/
    page.tsx              # voice-first chat
    library/page.tsx      # subject → topic → materials
    api/agent/            # orchestrator (classify → agents → memory)
    api/stt/              # Speechmatics transcription + say-it-back scoring
    api/teachback/        # Feynman teach-back grader
    api/library, api/topic/[id], api/health
  components/chat/        # interactive widgets + message renderer
  lib/
    llm.ts                # Featherless client (provider swap point)
    speechmatics.ts       # batch STT via curl (word-confidence + custom vocab)
    agents.ts             # classifier / study-pack / teach / memory agents
    vocab.ts              # Vocab Hot-Swap term extraction
    sayitback.ts          # word-confidence → heatmap + score
    types.ts, db.ts, replies.ts
scripts/sync-env.mjs      # copy API keys from MetaForge .env (no printing)
```

## Notes

- **Featherless model** is slow on long JSON (study-pack generation ~70s); a faster model or the teach/quiz-only flow feels near-instant. Tune `TUTORIUM_LLM_MODEL`.
- **English-first.** Speechmatics language is configurable per STT call (`language`).
- Speechmatics call goes through `curl` on Windows because the machine's DNS returns a dead A-record that kills Node's undici fetch; MetaForge's Python path was unaffected. See comment in `src/lib/speechmatics.ts`.

Hackathon prototype — add a license before broader reuse.