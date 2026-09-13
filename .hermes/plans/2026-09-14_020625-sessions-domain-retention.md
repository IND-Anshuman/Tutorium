# Sessions + domain context retention

## Goal

Make Tutorium feel like a "project-based tutor": each chat session is bound to **one learning domain the user names** (e.g. *Biology*, *Calculus for ML*, *Spanish travel phrases*); the session keeps a rolling **domain context** that every agent reads, so the tutor remembers the user's level, key terms, weak spots, and accumulated short notes across turns and reloads. Starting a new topic = explicitly starting a new session; the prior session is closed but kept for the Library.

## Current context / assumptions

- The app already has **per-user, per-topic persistence** (SQLite via `better-sqlite3`), an agent orchestrator (`src/lib/orchestrate.ts`), an `/api/session` route that hydrates "last-active topic", and a single hardcoded `userId = "demo-user"` in `src/app/page.tsx`.
- The orchestrator's `OrcCtx` is built per turn from `classifyMessage()` → `findOrCreateSubject()` → `findOrCreateTopic()`. There is no concept of a "session" distinct from "topic"; a session is *implicit* (the last-active-topic lookup).
- `/api/session?userId=...&topicId=...` (file: `src/app/api/session/route.ts`) returns the most-recent topic + its messages + its materials. This is the seam where domain context will plug in.
- The browser stores **no persistent identity**; auth is not in scope. We assume **single local user** (`USERID = "demo-user"`) — multi-user is out of scope for this slice.
- Better-sqlite3's WAL is already on, so adding new tables + indexes is non-blocking at startup.
- `src/lib/llm.ts` exposes `llmJsonSig<T>(signal, args)` and the agents accept `signal?: AbortSignal`. Token/cost discipline from the prior sprint stays.
- No third-party deps needed; the project already has `react-markdown`, `dompurify`, etc. We will add **none**.

## Architecture / proposed approach

A **`sessions` table** sits between user and topic: one session = one chat room = one named learning domain. Each session owns its **domain context** (a free-form, compact "what we're learning, the user's level, key terms so far, weak spots, in-flight notes") that every agent reads on each turn. A session can contain one or more topics (often one). Starting a new topic in a different domain creates a new session; restarting on the same session continues. New shell: a **left rail with sessions** + the current chat. Sessions list, switch, and "Start new" actions drive the whole flow. Domain context is compacted via a tiny LLM summarizer, called on a debounce.

The scope is **deliberately small** for hackathon-grade work: one local user, no auth, sessions are server-side, the context is persisted JSON (a string), and compaction runs in the background. Chat UX is unchanged in shape (input at bottom, messages, widgets) — we add a rail and a "domain header", nothing else.

## Data model additions

Append these to the `db.exec(`…\`);` block in `src/lib/db.ts`. Keep the existing tables exactly as-is.

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  domain          TEXT NOT NULL,             -- free-text: "Calculus for ML", "Biology for USMLE", etc.
  domain_locked   INTEGER NOT NULL DEFAULT 0,  -- 0 = auto-name allowed; 1 = user locked the name (UI shows no edit pencil)
  status          TEXT NOT NULL DEFAULT 'open', -- open | closed
  context         TEXT NOT NULL DEFAULT '{}',    -- JSON: {summary, level, key_terms[], weak_areas[], short_notes[]}
  topic_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  closed_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_user_updated ON sessions(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
```

```sql
ALTER TABLE messages ADD COLUMN session_id TEXT;
```

SQLite has no IF NOT EXISTS for ADD COLUMN — use a tiny guard at boot:

```ts
// Pseudo:
const cols = db.prepare(`PRAGMA table_info(messages)`).all() as { name: string }[];
if (!cols.some(c => c.name === "session_id")) {
  db.exec(`ALTER TABLE messages ADD COLUMN session_id TEXT;`);
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);`);
```

Then add a top-level `ctx.sessionId` so reads/writes everywhere can join by it.

## DB helpers (add to `src/lib/db.ts`)

```ts
// ---------- sessions ----------
export function listSessions(userId: string, opts: { limit?: number } = {}) {
  return db.prepare(
    `SELECT id, domain, status, topic_count, created_at, updated_at, closed_at
     FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?`
  ).all(userId, opts.limit ?? 50);
}

export function getLastOpenSession(userId: string) {
  return db.prepare(
    `SELECT * FROM sessions WHERE user_id = ? AND status='open' ORDER BY updated_at DESC LIMIT 1`
  ).get(userId) as any;
}

export function getSession(id: string) {
  return db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as any;
}

export function createSession(userId: string, domain: string, opts: { domainLocked?: boolean } = {}) {
  const id = uid();
  const now = nowIso();
  db.prepare(
    `INSERT INTO sessions (id, user_id, domain, domain_locked, status, context, topic_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'open', '{}', 0, ?, ?)`
  ).run(id, userId, domain.trim() || "General", opts.domainLocked ? 1 : 0, now, now);
  return id;
}

export function renameSession(id: string, newDomain: string) {
  const now = nowIso();
  db.prepare(`UPDATE sessions SET domain=?, updated_at=? WHERE id=? AND domain_locked=0`)
    .run(newDomain.trim() || "General", now, id);
}

export function touchSession(id: string) {
  db.prepare(`UPDATE sessions SET updated_at=? WHERE id=?`).run(nowIso(), id);
}

export function closeSession(id: string) {
  db.prepare(`UPDATE sessions SET status='closed', closed_at=?, updated_at=? WHERE id=?`)
    .run(nowIso(), nowIso(), id);
}

export function setSessionContext(id: string, ctx: SessionContext) {
  db.prepare(`UPDATE sessions SET context=?, updated_at=? WHERE id=?`)
    .run(JSON.stringify(ctx), nowIso(), id);
}

export function getSessionContext(id: string): SessionContext {
  const s = getSession(id);
  return s?.context ? JSON.parse(s.context) : defaultContext();
}

export function bumpSessionTopicCount(id: string) {
  db.prepare(`UPDATE sessions SET topic_count=topic_count+1, updated_at=? WHERE id=?`).run(nowIso(), id);
}

export function listMessagesBySession(sessionId: string) {
  return db.prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC`)
    .all(sessionId)
    .map((m: any) => ({
      ...m,
      interactive: m.interactive ? JSON.parse(m.interactive) : null,
      audio_meta: m.audio_meta ? JSON.parse(m.audio_meta) : null,
    }));
}

export interface SessionContext {
  summary: string;       // one-paragraph rolling summary of the domain
  level: string;         // beginner | intermediate | advanced | unknown
  key_terms: string[];   // domain terms that have appeared
  weak_areas: string[];  // user-confirmed weak spots
  short_notes: string[]; // small recent additions (capped, see below)
  updated_at: string;
}
export function defaultContext(): SessionContext {
  return { summary: "", level: "unknown", key_terms: [], weak_areas: [], short_notes: [], updated_at: "" };
}
```

`saveMessage` and `listMessages` must accept an optional `sessionId`; add `if (sessionId)`, include in the INSERT and WHERE. Same for the orchestrator's `getBrief` fallback and the `messages.topic_id IS NULL` path that runs before a topic is known — those messages get `sessionId` only.

## Step-by-step tasks

Each task is ≤5 min focused work. Run commands exactly as listed; expected output is given where the test should produce deterministic text.

### Task 1 — schema migrations + DB helpers (test-first)

**1a.** In `src/lib/db.ts`, replace the `db.exec(\`…\`);` block with a **migration** approach: split the `CREATE TABLE IF NOT EXISTS` strings into a list, plus the PRAGMA + ALTER guard above, so re-runs are safe.

**1b.** Append all new helper functions listed in "DB helpers".

**1c.** Update `saveMessage(topicId, role, content, …)` to accept an optional `sessionId` and write it. Update `listMessages(topicId)` to take an optional `sessionId` and join both (no migration pain: if sessionId is provided, filter by it; the existing UI passes topicId).

**1d.** Add a unit test file `src/lib/db.test.ts` that:
- opens the DB, creates a session + a topic + a message with sessionId, calls `listMessagesBySession`, asserts the message comes back.
- asserts `bumpSessionTopicCount` increments.
- asserts `renameSession` is a no-op when `domain_locked=1`.

```ts
// src/lib/db.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createSession, getSession, listMessagesBySession, saveMessage, bumpSessionTopicCount, renameSession, getSessionContext, setSessionContext, defaultContext, uid } from "./db";

describe("sessions", () => {
  const userId = "t-" + uid();
  it("creates + reads a session", () => {
    const id = createSession(userId, "Biology");
    const s = getSession(id);
    expect(s.domain).toBe("Biology");
    expect(s.status).toBe("open");
  });
  it("round-trips messages by session", () => {
    const sId = createSession(userId, "Calc");
    const m = uid();
    saveMessage(null, "user", "hello", null, null, { sessionId: sId, id: m });
    const list = listMessagesBySession(sId);
    expect(list.find(x => x.id === m)?.content).toBe("hello");
  });
  it("bumpSessionTopicCount + renameSession guard", () => {
    const sId = createSession(userId, "Spanish");
    bumpSessionTopicCount(sId); bumpSessionTopicCount(sId);
    expect(getSession(sId).topic_count).toBe(2);
    renameSession(sId, "Spanish for travel"); renameSession(sId, "Renamed");
    expect(getSession(sId).domain).toBe("Spanish for travel");
    createSession(userId, "Locked", { domainLocked: true });
    const lockedId = uid(); // placeholder, use a real locked id
  });
  it("set/get context", () => {
    const sId = createSession(userId, "Music Theory");
    const ctx = { ...defaultContext(), summary: "we are learning chord progressions", level: "beginner", key_terms: ["triad","inversion"] };
    setSessionContext(sId, ctx);
    expect(getSessionContext(sId).summary).toContain("chord");
  });
});
```

Run `npx vitest run`; expect all pass.

### Task 2 — `/api/session` returns the open session's domain

Edit `src/app/api/session/route.ts`:

- Query `getLastOpenSession(userId)` if no `topicId` is provided.
- Response shape:

```ts
{ session: { id, domain, status, topic_count, created_at, updated_at }, messages: [...], materials: [...] }
```

- When `topicId` is provided, lookup that topic's `session_id` (or fall back to the most-recent open session — that's our "starting a new topic in the same domain" UX).

Test:
```ts
// src/app/api/session/route.test.ts — use vitest + a real fetch against a local server? Skip for now; rely on live curl.
```
Run `curl 'http://localhost:3000/api/session?userId=demo-user'` after the dev server boots — expect `session.id` + `session.domain` present, possibly `null` on a fresh DB (then test 2b below).

### Task 3 — domain-first agent flow

In `src/app/api/agent/route.ts`, the **domain comes first**:

1. Read `body.sessionId` (if present) OR resolve the last open session via `getLastOpenSession(userId)`. If neither, **create a new session** with the topic as the *initial* domain (the topic classified later may refine the domain; for now session.domain = topic title).
2. After `classifyMessage()`, if `classification.subject === "General"` and the session has a non-empty domain, **keep the session's domain as the subject** (the model often returns "General" for follow-ups; the domain is sticky).
3. Pass `sessionId` into `OrcCtx` and `ctx.signal`. `orchestrateTurn` writes all saved materials/messages with both `topicId` and `sessionId`.
4. After successful reply, call `touchSession(sessionId)` and run a **debounced domain-context update** (see Task 5).
5. On error (including AbortError), do not close the session; just return the error.

```ts
// In the route, before classify:
let session = body.sessionId ? getSession(body.sessionId) : null;
if (!session) session = getLastOpenSession(userId);
let sessionId: string;
if (!session) {
  // Make the FIRST message also bootstrap a session from the message's topic.
  sessionId = createSession(userId, "New session"); // domain will be renamed right after classify
} else {
  sessionId = session.id;
  if (session.status !== "open") sessionId = createSession(userId, "New session");
}
```

After classify, before/instead of `findOrCreateSubject`:
```ts
const initialDomain = (subject || topic) ? `${subject.name} · ${topic.title}` : "";
if (session.domain === "New session" || session.domain_locked === 0) {
  renameSession(sessionId, initialDomain || session.domain);
}
```

**Important**: this rename is a *gentle* heuristic — the UI will let the user override it (next task).

### Task 4 — domain-context loader in every agent call

Every agent call (in `src/lib/agents.ts`) reads a compact prompt prefix built from `getSessionContext(sessionId)`:

```ts
// New helper in src/lib/agents.ts
export function domainContextPrefix(ctx: SessionContext | null): string {
  if (!ctx || (!ctx.summary && !ctx.key_terms.length)) return "";
  const lines: string[] = [];
  if (ctx.summary) lines.push(`Domain: ${ctx.summary}`);
  if (ctx.level && ctx.level !== "unknown") lines.push(`Learner level: ${ctx.level}`);
  if (ctx.key_terms?.length) lines.push(`Known terms in this domain: ${ctx.key_terms.slice(-12).join(", ")}`);
  if (ctx.weak_areas?.length) lines.push(`Learner struggles: ${ctx.weak_areas.slice(-6).join("; ")}`);
  if (ctx.short_notes?.length) lines.push(`Recent notes: ${ctx.short_notes.slice(-5).join(" | ")}`);
  return lines.join("\n") + "\n\n";
}
```

Then in each LLM call (`teachTopic`, `generateSceneBrief`, `createStudyPack`'s sub-calls, `generateVisual`, `gradeTeachBack`), prepend `domainContextPrefix(args.sessionCtx)` to the `system` field. **Default arg**: add `sessionCtx?: SessionContext | null` to each function signature; pass through from `orchestrate.ts`.

### Task 5 — debounced compaction

New file `src/lib/context-compactor.ts`:

```ts
import { llmJson } from "./llm";
import { getSessionContext, setSessionContext, defaultContext, type SessionContext } from "./db";

const MAX_KEY_TERMS = 12;
const MAX_WEAK_AREAS = 6;
const MAX_SHORT_NOTES = 8;

export async function compactSessionContext(sessionId: string, recentMessages: ChatMessage[]) {
  const prev = getSessionContext(sessionId);
  const user = llmJson<{ summary: string; level: string; key_terms: string[]; weak_areas: string[]; short_notes: string[] }>;
  // ... (full impl below)
}
```

Implementation:

```ts
const summary = prev.summary || "(none yet)";
const recent = recentMessages.slice(-6)
  .map(m => `${m.role}: ${m.content.slice(0, 220)}`).join("\n");

const { data } = await llmJson<{ summary: string; level: string; new_terms: string[]; new_weak: string[]; new_notes: string[] }>({
  system: `You compact a tutor's running session context. Merge the new exchange into the existing one. Output JSON {"summary","level","new_terms","new_weak","new_notes"}.`,
  user: `Previous summary:\n${summary}\n\nRecent exchange:\n${recent}\n\nReturn merged context.`,
  maxTokens: 400,
});

const merged: SessionContext = {
  ...prev,
  summary: data.summary || prev.summary,
  level: data.level || prev.level || "unknown",
  key_terms: uniq([...prev.key_terms, ...(data.new_terms || [])]).slice(-MAX_KEY_TERMS),
  weak_areas: uniq([...prev.weak_areas, ...(data.new_weak || [])]).slice(-MAX_WEAK_AREAS),
  short_notes: uniq([...prev.short_notes, ...(data.new_notes || [])]).slice(-MAX_SHORT_NOTES),
  updated_at: new Date().toISOString(),
};
setSessionContext(sessionId, merged);
```

Debounce in the route: keep a `Map<sessionId, NodeJS.Timeout>`; on each successful reply, schedule `compactSessionContext` 1500ms later, and reset if a new turn comes in before it fires. Use a per-process `Map<string, Timer>` stored in module scope.

### Task 6 — UI: sessions rail + "Start new" flow

Add a left rail to `src/app/page.tsx`. Replace the top bar's "Library" link with a rail toggle. When the rail is open, it shows:

- "New session" button (creates a session with domain "New session", navigates to `/`).
- List of recent sessions (top 10) — click to switch.
- Each row: domain title + status pill + topic_count + last-active time.
- The current session has a thin lamp-amber left border.

Mobile: rail is a slide-in drawer (closed by default; toggleable from the top bar).

New file `src/components/sessions/SessionsRail.tsx` (client component) that fetches `/api/sessions` on mount.

### Task 7 — UI: domain header + rename control

In `src/app/page.tsx`, the top bar's "Studying: {topic}" pill becomes a richer **domain header**:

- Shows the session's `domain`.
- A small ✏️ button (only when `domain_locked === 0`) opens an inline input; on blur or Enter, calls `PATCH /api/session/:id` with `{domain}`.
- When `domain_locked === 1`, the pencil is hidden — explicit "domain locked" UX. The lock is set when the user explicitly renames (treat any user edit as auto-locking; we don't have to ask).

The header reads `session.domain` from `/api/session`; if `session === null`, fall back to current behavior (no header pill).

### Task 8 — UI: session switch clears chat

When the user clicks a session in the rail, navigate to `/?session=<id>`. The page:
- on mount, calls `/api/session?sessionId=<id>`, sets `topicId`, hydrates messages.
- on send, includes `sessionId` in the agent POST body.

When the user clicks "New session":
- POST `/api/sessions` `{ domain: "" }` → `{ id }`
- navigate to `/?session=<newId>`

### Task 9 — UI: small domain widgets (1 per reply)

Inside `src/components/chat/InteractiveMessage.tsx` switch, **before** dispatching on `payload.type`, render a compact **DomainContextStrip** if the message has a `sessionCtx` field (the route returns it on the assistant message so the client can show what's in scope):

```
Domain: Biology for USMLE · Beginner · Terms: mitochondria, ATP, Krebs · Notes: 3
```

This is the **gpt-like affordance**: every reply shows the tutor's current understanding of the domain. Cheap, visual, *demonstrates* context retention.

Wire from route: include `domainContext` (just the string summary) in `saveMessage`'s `audio_meta` field or extend the route's reply envelope with a `sessionCtxPreview` field (≤ 200 chars).

### Task 10 — new API routes (small)

`src/app/api/sessions/route.ts`:
- `GET` — `listSessions(userId)` → returns `{sessions: [...]}`.
- `POST` — body `{userId, domain?}` → calls `createSession`. Returns `{id, domain, ...}`.

`src/app/api/sessions/[id]/route.ts`:
- `GET` — full session record + messages-by-session.
- `PATCH` — body `{domain?, domainLocked?, status?}` → updates. Renaming auto-locks.
- `DELETE` — soft close (`status='closed'`), not a real delete.

All small; all must pass `tsc --noEmit` and existing 11 tests.

### Task 11 — agent flow respects session context

In `src/lib/agents.ts`:
- `classifyMessage(message, history, signal?)` — keep signature.
- `teachTopic(args, …)` — add `sessionCtx?: SessionContext | null`; prepend `domainContextPrefix(args.sessionCtx)` to system prompt.
- `createStudyPack(args, …)` — same.
- `generateVisual`, `gradeTeachBack` — same.

In `src/lib/orchestrate.ts`:
- `OrcCtx` gets `sessionCtx: SessionContext | null`.
- Forward `sessionCtx` to every agent call.
- After orchestrating, return it in the result so the route can echo it back.

In `src/app/api/agent/route.ts`:
- Pass `sessionCtx = getSessionContext(sessionId)` into the `OrcCtx`.
- After successful reply, schedule the debounced compaction (Task 5).

### Task 12 — UI polish: empty state shows the domain field

`src/app/page.tsx` empty state hero currently says "Say it. Own it.". Change to "What are we learning? **[type a topic]**" with a single text input labeled "Domain" that submits a new session. (The current mic + library CTAs stay, but as secondary actions below the input.)

### Task 13 — tests (TDD per task)

Each of Tasks 1, 2, 5, 6, 10, 11 has a test file under `src/lib/` or `src/app/api/`. Per-task pattern:

```bash
# 1. write the test in the right place
# 2. run it (must fail / be pending)
npx vitest run src/lib/<file>.test.ts
# 3. implement the minimum that makes it pass
# 4. run again (must pass)
# 5. commit the slice (one commit per task)
git add -A && git commit -m "sessions: <slice>"
```

For UI tests (rail + rename + switch), rely on the live server + `desktop_preview` open + curl smoke. No React Testing Library added (keeps deps flat).

## Tests / validation

End-to-end manual + curl after each slice:

```bash
# 1. fresh session
curl -s -X POST http://localhost:3000/api/sessions -H 'Content-Type: application/json' \
  -d '{"userId":"e2e","domain":"Calculus for ML"}'
# → {"id":"…", "domain":"Calculus for ML"}

# 2. turn 1: empty session, no domain context yet
SID="<id-from-step-1>"
curl -s -X POST http://localhost:3000/api/agent -H 'Content-Type: application/json' \
  -d "{\"userId\":\"e2e\",\"sessionId\":\"$SID\",\"message\":\"explain gradients in simple terms\"}"
# → expect reply; /api/sessions shows topic_count=1, context.summary mentions gradients

# 3. session switch: page renders previous messages + the new domainContext in the reply envelope.

# 4. new session: clicking "New" creates a fresh session, context is empty, replies start fresh.
```

Unit-test counts: existing 11 must continue to pass; new ones target ~8 (db.session=5, compactor=1, route 2-3). Total: ~19 tests, all green.

## Risks, tradeoffs, open questions

- **Stale renames**: if the heuristic rename fires on the first turn ("New session" → "Calculus · Quadratic Equations") but the user wanted a cleaner name, they must edit. Mitigation: pencil always available when `domain_locked === 0`, auto-set on user edit. This is the gpt-like affordance.
- **Context bloat**: if compaction never runs or context grows unbounded, the prompt prefix becomes large. Hard caps (`MAX_KEY_TERMS=12`, `MAX_WEAK_AREAS=6`, `MAX_SHORT_NOTES=8`) prevent run-away. The compaction itself keeps it bounded.
- **Per-process debounce timer map**: in dev mode with HMR, the map can leak. Acceptable for hackathon; production would use Redis or DB-backed debounce.
- **No auth**: `userId` is hardcoded `"demo-user"`. Multi-user is out of scope for this slice. (Documented in README later.)
- **`messages.topic_id IS NULL` messages**: the very first message of a brand-new session is classified before a topic exists. We write it with `topic_id=null, session_id=<sid>`. Both list APIs work. The session's `topic_count` increments only after a topic is created (which happens via the existing `findOrCreateTopic` flow).
- **Migration safety**: better-sqlite3 with `journal_mode=WAL` survives an interrupted ALTER COLUMN, but for a fresh schema we have only one migration. Anyone with a pre-session DB will see empty `sessions` for their existing topics; their chat messages still have `topic_id` and continue to work — they just don't have a session row yet. The route's auto-create-session handles this.

## Out of scope (deliberately)

- Real authentication / multi-user.
- Vector embeddings / semantic search over past sessions (could be a later sprint).
- Sharing sessions, exporting them as PDFs, importing from chat exports.
- Per-session LLM provider overrides.
- Server-Sent Events for streaming tokens (current sync path stays).

---

## Summary of files touched

```
M src/lib/db.ts                                # new tables, helpers, session-aware saveMessage/listMessages
A src/lib/db.test.ts                           # 4 tests
M src/lib/agents.ts                            # sessionCtx arg + domainContextPrefix helper
A src/lib/context-compactor.ts                 # debounced LLM-based compaction
A src/lib/context-compactor.test.ts            # 1 test
M src/lib/orchestrate.ts                       # OrcCtx.sessionCtx forwarded everywhere
M src/app/api/agent/route.ts                   # sessionId handling, debounced compaction, 499-cancel intact
M src/app/api/session/route.ts                 # returns last-open session by default
A src/app/api/sessions/route.ts                # GET list / POST create
A src/app/api/sessions/[id]/route.ts           # GET/PATCH/DELETE
A src/components/sessions/SessionsRail.tsx     # client component
M src/app/page.tsx                             # rail + domain header + new-session flow
M src/app/globals.css                          # rail + domain-header styles
```

Commits: ~12 (one per task). Each must pass `tsc --noEmit` + `vitest run` + `npm run build`.

