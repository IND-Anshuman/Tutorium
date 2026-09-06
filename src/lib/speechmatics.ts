// Speechmatics batch STT client — transport via curl subprocess.
//
// WHY CURL: this machine's DNS returns two A records for
// eu1.asr.api.speechmatics.com; one accepts TCP but hangs on TLS, which kills
// Node's undici fetch (it pins the first address). curl's happy-eyeballs
// falls over to the reachable IP (verified: 401 in 0.8s vs fetch ConnectTimeout).
// MetaForge's Python client works because requests retries differently —
// for the Next.js runtime, curl.exe (ships with Windows) is the reliable path.
//
// Auth: Bearer header, key never in URL. Jobs submitted with ?wait=N long-poll.
// Returns json-v2 transcript with word-level confidence + custom vocab support.

import { execFile } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const REGION = process.env.TUTORIUM_SPEECHMATICS_REGION || "eu1";
const API_KEY = process.env.SPEECHMATICS_API_KEY || "";

export class SpeechmaticsError extends Error {}

function baseUrl() {
  return `https://${REGION}.asr.api.speechmatics.com/v2`;
}

function authHeader(): string {
  if (!API_KEY || API_KEY === "placeholder") {
    throw new SpeechmaticsError("SPEECHMATICS_API_KEY not set — run `npm run env:sync`");
  }
  return `Authorization: Bearer ${API_KEY}`;
}

export function speechmaticsConfigured() {
  return Boolean(API_KEY && API_KEY !== "placeholder");
}

export interface AdditionalVocabItem {
  content: string;
  sounds_like?: string[];
}

export interface TranscriptWord {
  word: string;
  confidence: number;
  start: number;
  end: number;
}

export interface SttResult {
  text: string;
  words: TranscriptWord[];
  jobId?: string;
}

function curl(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("curl", args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const hint = (stderr || "").slice(0, 200);
        reject(new SpeechmaticsError(`curl failed: ${err.message}${hint ? ` — ${hint}` : ""}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function curlJson(url: string, timeoutMs: number): Promise<Record<string, any>> {
  const out = await curl(["-sS", "--max-time", String(Math.ceil(timeoutMs / 1000)), "-H", authHeader(), url], timeoutMs);
  try {
    return JSON.parse(out);
  } catch {
    throw new SpeechmaticsError(`Speechmatics returned non-JSON: ${out.slice(0, 200)}`);
  }
}

export async function transcribeBatch(args: {
  file: ArrayBuffer;
  filename?: string;
  language?: string;
  additionalVocab?: AdditionalVocabItem[];
  waitS?: number;
}): Promise<SttResult> {
  const waitS = Math.min(args.waitS ?? 120, 480);

  const config = {
    type: "transcription",
    transcription_config: {
      language: args.language || "en",
      model: "enhanced",
      ...(args.additionalVocab?.length
        ? {
            additional_vocab: args.additionalVocab.slice(0, 1000).map((v) =>
              v.sounds_like?.length
                ? { content: v.content, sounds_like: v.sounds_like }
                : { content: v.content }
            ),
          }
        : {}),
    },
  };

  // stage audio + config to temp files so curl streams them as multipart
  const stamp = randomUUID().slice(0, 8);
  const audioPath = join(tmpdir(), `tutorium-${stamp}.audio`);
  await writeFile(audioPath, Buffer.from(args.file));

  try {
    // -- build the multipart submit command --
    const submitUrl = `${baseUrl()}/jobs/?wait=${waitS}`;
    const submitArgs = [
      "-sS",
      "--max-time",
      String(waitS + 30),
      "-H",
      authHeader(),
      "-F",
      `data_file=@${audioPath}`,
      "-F",
      `config=${JSON.stringify(config)}`,
      submitUrl,
    ];

    const raw = await curl(submitArgs, (waitS + 40) * 1000);
    let data: Record<string, any>;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new SpeechmaticsError(`Speechmatics submit returned non-JSON: ${raw.slice(0, 200)}`);
    }

    if (data.error || data.status === "failed") {
      throw new SpeechmaticsError(`Speechmatics submit failed: ${JSON.stringify(data).slice(0, 250)}`);
    }

    const jobId = data.id as string | undefined;
    let transcript = data.json_v2 || data["json-v2"] || null;

    if (!transcript && jobId) {
      // poll the transcript endpoint until ready
      const deadline = Date.now() + waitS * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 8_000));
        let poll: Record<string, any> | null = null;
        try {
          poll = await curlJson(`${baseUrl()}/jobs/${jobId}/transcript?format=json-v2`, 30_000);
        } catch {
          poll = null; // 202/404 expected before the job is done
        }
        if (poll && poll.results) {
          transcript = poll;
          break;
        }
      }
    }

    if (!transcript) {
      throw new SpeechmaticsError(`Speechmatics job ${jobId || "?"} did not finish in time`);
    }

    return parseTranscript(transcript, jobId);
  } finally {
    unlink(audioPath).catch(() => {});
  }
}

function parseTranscript(transcript: Record<string, any>, jobId?: string): SttResult {
  const results = (transcript.results || []) as Array<Record<string, any>>;
  const words: TranscriptWord[] = [];
  const parts: string[] = [];
  for (const r of results) {
    const alt = (r.alternatives || [{}])[0] || {};
    const content = (alt.content || "").trim();
    if (r.type === "word" && content) {
      words.push({
        word: content,
        confidence: typeof alt.confidence === "number" ? alt.confidence : 1,
        start: r.start_time ?? 0,
        end: r.end_time ?? 0,
      });
      parts.push(content);
    } else if (r.type === "punctuation" && content) {
      const last = parts[parts.length - 1];
      if (last !== undefined) parts[parts.length - 1] = last + content;
    }
  }
  return { text: parts.join(" "), words, jobId };
}