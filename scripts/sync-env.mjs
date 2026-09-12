#!/usr/bin/env node
/**
 * sync-env.mjs — seed tutorium's `.env.local` from a source `.env`.
 * Default source: MetaForge's .env (copies Speechmatics + Featherless creds).
 *
 * This seeds the DEFAULT provider. To switch to another OpenAI-compatible
 * provider (Token Factory, OpenRouter, Groq, ...), copy these vars from
 * `.env.example` into `.env.local` and override TUTORIUM_LLM_BASE_URL /
 * TUTORIUM_LLM_API_KEY / TUTORIUM_LLM_MODEL — no code changes needed.
 * Never prints secret values.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const metaforgeEnv = process.env.TUTORIUM_SYNC_SOURCE || "C:\\Users\\HP\\Desktop\\MetaForge\\.env";
const target = join(root, ".env.local");

// creds we copy from the source, plus the model to mirror under TUTORIUM_LLM_MODEL
const wanted = ["SPEECHMATICS_API_KEY", "FEATHERLESS_API_KEY"];
const wantedModel = "METAFORGE_FEATHERLESS_MODEL";

const src = readFileSync(metaforgeEnv, "utf8");
const found = {};
for (const line of src.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m && m[1] === wantedModel && m[2].trim()) {
    found["TUTORIUM_LLM_MODEL"] = m[2].trim();
  } else if (m && wanted.includes(m[1]) && m[2].trim()) {
    found[m[1]] = m[2].trim();
  }
}

const missing = wanted.filter((k) => !found[k]);
if (missing.length) {
  console.error(`Missing in ${metaforgeEnv}: ${missing.join(", ")}`);
  // model is optional — only hard-fail on the two credentials
  if (missing.some((k) => ["SPEECHMATICS_API_KEY", "FEATHERLESS_API_KEY"].includes(k))) process.exit(1);
}

let existing = "";
if (existsSync(target)) existing = readFileSync(target, "utf8");
const lines = existing.split(/\r?\n/).filter(Boolean);
const keyRe = /^([A-Z_0-9]+)=/;
const present = new Set(lines.map((l) => l.match(keyRe)?.[1]).filter(Boolean));

for (const k of [...wanted, "TUTORIUM_LLM_MODEL"]) {
  if (!(k in found)) continue;
  if (present.has(k)) {
    const idx = lines.findIndex((l) => l.match(keyRe)?.[1] === k);
    lines[idx] = `${k}=${found[k]}`;
  } else {
    lines.push(`${k}=${found[k]}`);
  }
}

writeFileSync(target, lines.join("\n") + "\n");
console.log(
  `OK: synced ${wanted.join(", ")} -> ${target} (values redacted: ${wanted.map((k) => k.slice(0, 4) + "***").join(", ")})\n` +
    `LLM provider defaults to https://api.featherless.ai/v1 — override TUTORIUM_LLM_BASE_URL in .env.local for another OpenAI-compatible provider.`
);