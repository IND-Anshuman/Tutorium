// Rate limiting + daily spend guard.
// Correct for --max-instances=1 (single process, in-memory buckets + SQLite counter).
// If you ever go multi-instance: move buckets to Memorystore and counters to the DB
// with an atomic UPDATE ... RETURNING.
import db from "./db";

// ---- per-identity token buckets (in-memory) ----
interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export interface LimitRule {
  name: string;
  max: number;
  windowMs: number;
  friendly: string;
}

export const LIMITS: Record<"agent" | "stt" | "ingest", LimitRule> = {
  agent: {
    name: "agent",
    max: 20,
    windowMs: 10 * 60 * 1000,
    friendly: "You've sent a lot of messages in the last 10 minutes — take a short break and come back.",
  },
  stt: {
    name: "stt",
    max: 6,
    windowMs: 10 * 60 * 1000,
    friendly: "Voice transcription limit reached for now (6 per 10 minutes) — it keeps transcription costs sane. Try again in a bit.",
  },
  ingest: {
    name: "ingest",
    max: 3,
    windowMs: 60 * 60 * 1000,
    friendly: "You've attached 3 documents this hour — that's the cap for now.",
  },
};

// Returns null when allowed, or the rule that blocked.
export function checkRateLimit(identity: string, kind: "agent" | "stt" | "ingest"): LimitRule | null {
  const rule = LIMITS[kind];
  const key = `${rule.name}:${identity}`;
  const now = Date.now();
  const bucket = buckets.get(key) || { tokens: rule.max, updatedAt: now };
  // refill continuously
  const refill = ((now - bucket.updatedAt) / rule.windowMs) * rule.max;
  bucket.tokens = Math.min(rule.max, bucket.tokens + refill);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return rule;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return null;
}

// occasionally drop stale buckets so the map can't grow unbounded
const MAX_BUCKETS = 5000;
export function pruneBuckets(): void {
  if (buckets.size < MAX_BUCKETS) return;
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, b] of buckets) {
    if (b.updatedAt < cutoff) buckets.delete(key);
  }
}

// ---- daily spend guard (persisted in SQLite) ----
// Counts PAID LLM calls per user per day. The jobrunner counts too (it fires
// study packs without an HTTP request).

// lazily create the table (idempotent)
let tableReady = false;
// Fail-open: a broken spend counter must never take the tutor down — the
// in-memory rate limits still apply. Log once per process.
let tableErrorLogged = false;
function ensureTable() {
  if (tableReady) return;
  try {
    db.prepare(
      `CREATE TABLE IF NOT EXISTS spend_guard (
         day TEXT NOT NULL,
         identity TEXT NOT NULL,
         calls INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (day, identity)
       )`
    ).run();
    tableReady = true;
  } catch (e) {
    if (!tableErrorLogged) {
      console.warn("[limits] spend_guard unavailable:", (e as Error).message);
      tableErrorLogged = true;
    }
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const DAILY_LLM_BUDGET = Number(process.env.TUTORIUM_DAILY_LLM_BUDGET || 300);

// Returns true when the user still has budget.
export function checkDailyBudget(identity: string): boolean {
  ensureTable();
  if (!tableReady) return true;
  const row = db
    .prepare(`SELECT calls FROM spend_guard WHERE day = ? AND identity = ?`)
    .get(today(), identity) as { calls: number } | undefined;
  return (row?.calls ?? 0) < DAILY_LLM_BUDGET;
}

export function recordLlmCall(identity: string, n = 1): void {
  ensureTable();
  if (!tableReady) return;
  db.prepare(
    `INSERT INTO spend_guard (day, identity, calls) VALUES (?, ?, ?)
     ON CONFLICT(day, identity) DO UPDATE SET calls = calls + ?`
  ).run(today(), identity, n, n);
}

export function callsToday(identity: string): number {
  ensureTable();
  if (!tableReady) return 0;
  const row = db
    .prepare(`SELECT calls FROM spend_guard WHERE day = ? AND identity = ?`)
    .get(today(), identity) as { calls: number } | undefined;
  return row?.calls ?? 0;
}