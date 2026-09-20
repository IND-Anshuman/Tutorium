// Live deep-pack probe: drives the REAL orchestrateTurn with the REAL llm.ts
// (network call to Featherless) and an in-memory db ctx. Proves end-to-end:
// excerpt threading, detail parsing, pack generation with source, enrich pass.
// NOTE: env must be loaded BEFORE llm.ts is imported (it snapshots API_KEY at
// module-eval), so dotenv runs in a preload via --env-file instead of here.
import { orchestrateTurn, type OrcCtx } from "../src/lib/orchestrate";
import type { Classification, ChatMessage } from "../src/lib/types";

const SOURCE = `The Krebs cycle (citric acid cycle) is the central metabolic hub of the cell, occurring in the mitochondrial matrix.
Step 1: Acetyl-CoA (2C) combines with oxaloacetate (4C) to form citrate (6C), catalyzed by citrate synthase. This is the committed step.
Step 2: Citrate is isomerized to isocitrate by aconitase (via cis-aconitate intermediate).
Step 3: Isocitrate dehydrogenase oxidizes isocitrate to alpha-ketoglutarate (5C), producing the FIRST NADH and releasing the FIRST CO2. This is the rate-limiting step, inhibited by high ATP/NADH.
Step 4: Alpha-ketoglutarate dehydrogenase complex converts alpha-ketoglutarate to succinyl-CoA (4C), producing the SECOND NADH and SECOND CO2. Requires thiamine (B1) as cofactor — arsenic poisons this step.
Step 5: Succinyl-CoA synthetase converts succinyl-CoA to succinate, producing the cycle's ONLY GTP (substrate-level phosphorylation).
Step 6: Succinate dehydrogenase (the only membrane-bound step, part of Complex II) oxidizes succinate to fumarate, producing FADH2.
Step 7: Fumarase hydrates fumarate to malate.
Step 8: Malate dehydrogenase oxidizes malate back to oxaloacetate, producing the THIRD NADH, completing the cycle.
Net yield per acetyl-CoA: 3 NADH, 1 FADH2, 1 GTP, 2 CO2. The NADH/FADH2 feed the electron transport chain — the cycle itself makes NO ATP directly.
Total per glucose (2 turns): 6 NADH, 2 FADH2, 2 GTP. Regulation: citrate synthase inhibited by citrate/ATP; isocitrate dehydrogenase inhibited by ATP/NADH, activated by ADP; the whole cycle slows when the ETC backs up.`;

const classification: Classification = {
  subject: "Biochemistry",
  subcategory: "Metabolism",
  topic: "Krebs cycle",
  intent: "create_study_pack",
  confidence: 0.9,
};

const saved: Record<string, Record<string, unknown>> = {};
const ctx: OrcCtx = {
  userId: "probe-user",
  topicId: "probe-topic",
  topicTitle: "Krebs cycle",
  subjectName: "Biochemistry",
  classification,
  history: [] as ChatMessage[],
  profile: null,
  getMaterial: () => null,
  saveMaterial: (_t: string, type: string, _title: string, content: Record<string, unknown>) => {
    saved[type] = content;
    return "id";
  },
  message: "make me a study pack on the Krebs cycle, in depth\n" + SOURCE,
  signal: undefined,
  sessionCtx: null,
};

const t0 = Date.now();
async function main() {
const result = await orchestrateTurn(ctx);
const dt = ((Date.now() - t0) / 1000).toFixed(1);

console.log("=== RESULT ===");
console.log("intent:", result.intent);
console.log("time:", dt + "s");
console.log("reply (first 200):", result.reply.slice(0, 200).replace(/\n/g, " | "));

// Pull the pack quality bars from the captured saves.
const cards = saved["flashcards"]?.cards as Array<{ front: string; back: string; detail?: string }> | undefined;
const quiz = saved["quiz"]?.questions as Array<{ question: string; explanation: string }> | undefined;
const notes = saved["clean_notes"]?.text as string | undefined;
const summary = saved["summary"]?.text as string | undefined;
const briefMeta = saved["brief"] as { detail?: string } | undefined;

console.log("\n=== QUALITY BARS ===");
console.log("brief.detail recorded:", briefMeta?.detail);
console.log("notes length:", notes?.length ?? 0, "chars; has step detail:", /rate-limiting|arsenic|Complex II/i.test(notes || ""));
console.log("summary length:", summary?.length ?? 0, "chars");
console.log("cards:", cards?.length, "| avg back len:", cards ? Math.round(cards.reduce((a, c) => a + c.back.length, 0) / cards.length) : 0, "chars | with detail:", cards?.filter((c) => c.detail).length ?? 0);
console.log("quiz:", quiz?.length, "| avg explanation len:", quiz ? Math.round(quiz.reduce((a, q) => a + q.explanation.length, 0) / quiz.length) : 0, "chars");
}
main().catch((e) => { console.error("PROBE FAILED:", e.message); process.exit(1); });