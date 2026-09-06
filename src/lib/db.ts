// SQLite data layer — zero-credential, demo-safe. Thin enough to swap for Supabase later.
import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync } from "fs";
import path from "path";
import crypto from "crypto";

const dataDir = process.env.TUTORIUM_DATA_DIR || join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, "tutorium.db");

declare global {
  // eslint-disable-next-line no-var
  var __tutoriumDb: Database.Database | undefined;
}

const db: Database.Database =
  globalThis.__tutoriumDb ?? new Database(dbPath);
globalThis.__tutoriumDb = db;

db.pragma("journal_mode = WAL");

// ---------- schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  learning_style TEXT DEFAULT 'unknown',
  strengths TEXT DEFAULT '[]',
  weaknesses TEXT DEFAULT '[]',
  next_recommended_action TEXT DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subcategory TEXT,
  curriculum_match TEXT DEFAULT '{}',
  progress TEXT DEFAULT '{}',
  last_studied_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  topic_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  interactive TEXT,
  audio_meta TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics(subject_id);
CREATE INDEX IF NOT EXISTS idx_materials_topic ON materials(topic_id);
CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(topic_id);
`);

export const uid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

// ---------- profiles ----------
export function getOrCreateProfile(userId: string, name?: string) {
  let row = db.prepare(`SELECT * FROM profiles WHERE user_id = ?`).get(userId) as any;
  if (!row) {
    const id = uid();
    db.prepare(
      `INSERT INTO profiles (id, user_id, name, updated_at) VALUES (?, ?, ?, ?)`
    ).run(id, userId, name || "Student", nowIso());
    row = db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(id) as any;
  }
  return {
    ...row,
    strengths: JSON.parse(row.strengths || "[]"),
    weaknesses: JSON.parse(row.weaknesses || "[]"),
  };
}

export function updateProfile(
  userId: string,
  patch: {
    learning_style?: string;
    strengths?: string[];
    weaknesses?: string[];
    next_recommended_action?: string;
  }
) {
  const p = getOrCreateProfile(userId);
  db.prepare(
    `UPDATE profiles SET learning_style=?, strengths=?, weaknesses=?, next_recommended_action=?, updated_at=? WHERE user_id=?`
  ).run(
    patch.learning_style ?? p.learning_style,
    JSON.stringify(patch.strengths ?? p.strengths),
    JSON.stringify(patch.weaknesses ?? p.weaknesses),
    patch.next_recommended_action ?? p.next_recommended_action,
    nowIso(),
    userId
  );
  return getOrCreateProfile(userId);
}

// ---------- subjects / topics ----------
export function findOrCreateSubject(userId: string, name: string) {
  const clean = (name || "General").trim() || "General";
  let row = db
    .prepare(`SELECT * FROM subjects WHERE user_id = ? AND lower(name) = lower(?)`)
    .get(userId, clean) as any;
  if (!row) {
    const id = uid();
    db.prepare(`INSERT INTO subjects (id, user_id, name, created_at) VALUES (?, ?, ?, ?)`).run(
      id,
      userId,
      clean,
      nowIso()
    );
    row = db.prepare(`SELECT * FROM subjects WHERE id = ?`).get(id) as any;
  }
  return row;
}

export function findOrCreateTopic(
  subjectId: string,
  title: string,
  subcategory: string | null
) {
  const clean = (title || "General").trim() || "General";
  let row = db
    .prepare(`SELECT * FROM topics WHERE subject_id = ? AND lower(title) = lower(?)`)
    .get(subjectId, clean) as any;
  if (!row) {
    const id = uid();
    db.prepare(
      `INSERT INTO topics (id, subject_id, title, subcategory, created_at, last_studied_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, subjectId, clean, subcategory || "General", nowIso(), nowIso());
    row = db.prepare(`SELECT * FROM topics WHERE id = ?`).get(id) as any;
  } else {
    db.prepare(`UPDATE topics SET last_studied_at = ? WHERE id = ?`).run(nowIso(), row.id);
  }
  return row;
}

export function getTopic(topicId: string) {
  return db.prepare(`SELECT * FROM topics WHERE id = ?`).get(topicId) as any;
}

export function getSubject(subjectId: string) {
  return db.prepare(`SELECT * FROM subjects WHERE id = ?`).get(subjectId) as any;
}

export function listLibrary(userId: string) {
  const subjects = db
    .prepare(`SELECT * FROM subjects WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as any[];
  return subjects.map((s) => ({
    ...s,
    topics: db
      .prepare(`SELECT * FROM topics WHERE subject_id = ? ORDER BY last_studied_at DESC`)
      .all(s.id)
      .map((t: any) => ({
        ...t,
        curriculum_match: JSON.parse(t.curriculum_match || "{}"),
        progress: JSON.parse(t.progress || "{}"),
        materials: db
          .prepare(`SELECT id, type, title, created_at FROM materials WHERE topic_id = ?`)
          .all(t.id),
      })),
  }));
}

export function updateTopicProgress(topicId: string, progress: Record<string, unknown>) {
  db.prepare(`UPDATE topics SET progress = ? WHERE id = ?`).run(
    JSON.stringify(progress),
    topicId
  );
}

export function getTopicProgress(topicId: string): Record<string, unknown> {
  const t = getTopic(topicId);
  return JSON.parse(t?.progress || "{}");
}

// ---------- materials ----------
export function saveMaterial(
  topicId: string,
  type: string,
  title: string,
  content: Record<string, unknown>
) {
  const id = uid();
  db.prepare(`INSERT INTO materials (id, topic_id, type, title, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id,
    topicId,
    type,
    title,
    JSON.stringify(content),
    nowIso()
  );
  return id;
}

export function getMaterial(topicId: string, type: string) {
  return db
    .prepare(`SELECT * FROM materials WHERE topic_id = ? AND type = ? ORDER BY created_at DESC`)
    .get(topicId, type) as any;
}

export function getLatestMaterialByType(topicId: string, type: string) {
  return getMaterial(topicId, type);
}

export function listMaterials(topicId: string) {
  return db
    .prepare(`SELECT * FROM materials WHERE topic_id = ? ORDER BY created_at ASC`)
    .all(topicId)
    .map((m: any) => ({ ...m, content: JSON.parse(m.content || "{}") }));
}

// ---------- messages ----------
export function saveMessage(
  topicId: string | null,
  role: "user" | "assistant",
  content: string,
  interactive?: InteractiveLike | null,
  audioMeta?: Record<string, unknown> | null
) {
  const id = uid();
  db.prepare(
    `INSERT INTO messages (id, topic_id, role, content, interactive, audio_meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, topicId, role, content, interactive ? JSON.stringify(interactive) : null, audioMeta ? JSON.stringify(audioMeta) : null, nowIso());
  return id;
}

export function listMessages(topicId: string) {
  return db
    .prepare(`SELECT * FROM messages WHERE topic_id = ? ORDER BY created_at ASC`)
    .all(topicId)
    .map((m: any) => ({
      ...m,
      interactive: m.interactive ? JSON.parse(m.interactive) : null,
      audio_meta: m.audio_meta ? JSON.parse(m.audio_meta) : null,
    }));
}

export interface InteractiveLike {
  type: string;
  [k: string]: unknown;
}

// Cast helper: InteractivePayload union members lack index signatures, so a
// structural cast is needed at the db boundary.
export function asInteractive(p: unknown): InteractiveLike | null {
  return (p as InteractiveLike) ?? null;
}

export default db;