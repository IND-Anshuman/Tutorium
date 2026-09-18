// Core orchestration: run one turn against a resolved topic.
// Shared by the sync /api/agent route and the background study-pack job so both
// behave identically. Pure-ish: takes db-bound helpers as args for testability.
//
// Token-efficiency: a persisted "brief" (compact scene summary) is the single
// source of grounding for teach/visual/quiz/teachback once a study pack exists,
// instead of each call re-sending raw notes.

import {
  createStudyPack,
  createFlashcardsOnly,
  createQuizOnly,
  teachTopic,
  generateVisual,
  gradeTeachBack,
  generateSceneBrief,
} from "./agents";
import { pickVocabTerms } from "./vocab";
import { parseQuizCount } from "./quizgen";
import { summarizeText, parseSummaryLength, messageCarriesText, extractBody } from "./summarizer";
import { analyzeDocument, buildStudyPlan, parseDocIntent, type DocAnalysis } from "./docthink";
import { designTricksterTheme, DEFAULT_THEME } from "./trickster";
import type { TricksterTheme } from "./types";
import { buildStudyPackActions, buildStudyPackConfirmation } from "./replies";
import type { Classification, ChatMessage, InteractivePayload, Intent } from "./types";
import type { SessionContext } from "./db";

export interface OrchestrateResult {
  reply: string;
  interactive: InteractivePayload | null;
  intent: Intent;
}

export interface OrcCtx {
  userId: string;
  topicId: string;
  topicTitle: string;
  subjectName: string;
  classification: Classification;
  history: ChatMessage[];
  profile?: { learning_style: string; strengths: string[]; weaknesses: string[] } | null;
  getMaterial: (topicId: string, type: string) => { content: Record<string, any> } | null;
  saveMaterial: (topicId: string, type: string, title: string, content: Record<string, unknown>) => string;
  message: string;
  signal?: AbortSignal;
  sessionCtx?: SessionContext | null;
  document?: { text: string; filename: string; pageCount?: number } | null;
}


// After a fresh summary exists, auto-wire the pronounce-to-remember drill: the
// summary becomes the Say-It-Back passage with vocabulary hot-swap terms, and
// the reply offers the drill. Garnish, never a blocker.
function summarizeReplyWithDrill(summary: string, keyTerms: string[]): string {
  return `${summary}\n\nWant it to stick? Say **"say it back"** and read it aloud — I'll score every key term.`;
}

function saveSummaryMaterials(
  ctx: OrcCtx, topicId: string, topicTitle: string, summary: string, keyTerms: string[]
) {
  ctx.saveMaterial(topicId, "summary", `${topicTitle} — Summary`, { text: summary });
  ctx.saveMaterial(topicId, "sayitback", `${topicTitle} — Say-It-Back passage`, {
    passage: summary,
    keyTerms,
  });
}


// Trickster theme with per-topic material cache. "surprise me" bypasses the cache.
async function getTricksterTheme(
  ctx: OrcCtx, kind: "quiz" | "flashcards", difficulty?: string, count?: number
): Promise<TricksterTheme | null> {
  const surprise = /\b(surprise me|spice it up|make it (harder|tricky|fun))\b/i.test(ctx.message);
  if (!surprise) {
    const cached = ctx.getMaterial(ctx.topicId, "theme")?.content as TricksterTheme | undefined;
    if (cached?.vibe) return cached;
  }
  const theme = await designTricksterTheme({
    topic: ctx.topicTitle,
    subject: ctx.subjectName,
    difficulty,
    quizCount: count,
    kind,
    sessionCtx: ctx.sessionCtx
      ? { level: ctx.sessionCtx.level, weak_areas: ctx.sessionCtx.weak_areas }
      : null,
    signal: ctx.signal,
  });
  if (theme !== DEFAULT_THEME && theme.vibe) {
    ctx.saveMaterial(ctx.topicId, "theme", `${ctx.topicTitle} — Trickster theme`, theme as unknown as Record<string, unknown>);
  }
  return surprise || theme !== DEFAULT_THEME ? theme : null;
}

// Getter for the scene brief (or fall back to stored notes / the raw message).
function getBrief(ctx: OrcCtx): string {
  const b = ctx.getMaterial(ctx.topicId, "brief")?.content?.text as string | undefined;
  if (b) return b;
  return (
    ctx.getMaterial(ctx.topicId, "clean_notes")?.content?.text ||
    ctx.getMaterial(ctx.topicId, "reviewer")?.content?.text ||
    ctx.message
  );
}

export async function orchestrateTurn(ctx: OrcCtx): Promise<OrchestrateResult> {
  const { classification, topicId, topicTitle, subjectName, message } = ctx;

// ---- document mode: attached/pasted document bypasses intent classification ----
if (ctx.document?.text) {
  try {
    const analysis: DocAnalysis = await analyzeDocument({
      text: ctx.document.text,
      filename: ctx.document.filename,
      pageCount: ctx.document.pageCount,
      signal: ctx.signal,
    });
    const sub = parseDocIntent(ctx.message);
    ctx.saveMaterial(topicId, "document", `${analysis.filename} — Analysis`, {
      ...analysis,
      text: ctx.document.text.slice(0, 100_000),
    });
    if (sub === "plan") {
      const plan = await buildStudyPlan({ analysis, days: 5, signal: ctx.signal });
      ctx.saveMaterial(topicId, "document", `${analysis.filename} — Study Plan`, { plan });
      return {
        reply: `Here's your ${plan.days.length}-day study plan for **${analysis.filename}**.`,
        interactive: {
          type: "document", topic: topicTitle, topicId,
          docTitle: analysis.filename, pageCount: analysis.pageCount,
          summary: analysis.summary, keyTerms: analysis.keyTerms,
          sections: analysis.sections, difficulty: analysis.difficulty,
          prerequisites: analysis.prerequisites, plan: plan.days,
        },
        intent: "teach_topic",
      };
    }
    if (sub === "quiz") {
      const questions = await createQuizOnly({
        topic: topicTitle, brief: analysis.summary, quiz: { count: 10, difficulty: "mixed" },
        sessionCtx: ctx.sessionCtx, signal: ctx.signal,
      });
      if (questions.length) {
        ctx.saveMaterial(topicId, "quiz", `${topicTitle} — Quiz`, { questions });
        return {
          reply: `Quiz on **${analysis.filename}** — ${questions.length} questions.`,
          interactive: { type: "quiz", topic: topicTitle, topicId, questions },
          intent: "make_quiz",
        };
      }
      return { reply: `I couldn't build a quiz from **${analysis.filename}** — try again.`, interactive: null, intent: "make_quiz" };
    }
    // summarize (default)
    const summary = analysis.summary;
    const keyTerms = analysis.keyTerms;
    saveSummaryMaterials(ctx, topicId, topicTitle, summary, keyTerms);
    return {
      reply: summarizeReplyWithDrill(summary, keyTerms),
      interactive: {
        type: "document", topic: topicTitle, topicId,
        docTitle: analysis.filename, pageCount: analysis.pageCount,
        summary, keyTerms, sections: analysis.sections,
        difficulty: analysis.difficulty, prerequisites: analysis.prerequisites,
        plan: [],
      },
      intent: "make_summary",
    };
  } catch (e) {
    return {
      reply: `I couldn't analyze **${ctx.document.filename}** (${(e as Error).message}). Try again in a moment.`,
      interactive: null,
      intent: "make_summary",
    };
  }
}

  switch (classification.intent) {
    case "create_study_pack": {
      // 1) build + persist one scene brief (compacted context reused by all later agents)
      let brief: Awaited<ReturnType<typeof generateSceneBrief>>;
      try {
        brief = await generateSceneBrief({
          topic: topicTitle,
          subject: subjectName,
          sourceText: message,
          sessionCtx: ctx.sessionCtx,
          signal: ctx.signal,
        });
      } catch {
        // Brief generation is the pack's foundation; without it every section
        // would fail too. Return an honest retry reply instead of throwing so
        // both the sync route and the background job persist a real message.
        return {
          reply: `I couldn't build a study pack for **${topicTitle}** this time — that's usually a temporary model hiccup. Ask me again in a moment and I'll rebuild it.`,
          interactive: null,
          intent: "create_study_pack",
        };
      }
      ctx.saveMaterial(topicId, "brief", `${topicTitle} — Brief`, {
        text: brief.brief,
        keyTerms: brief.keyTerms,
      });

      // 2) generate pack (split, isolated sub-calls), save each section independently
      const pack = await createStudyPack({
        topic: topicTitle,
        subject: subjectName,
        brief: brief.brief,
        sessionCtx: ctx.sessionCtx,
        signal: ctx.signal,
      });
      if (pack.clean_notes) ctx.saveMaterial(topicId, "clean_notes", `${topicTitle} — Clean Notes`, { text: pack.clean_notes });
      if (pack.reviewer) ctx.saveMaterial(topicId, "reviewer", `${topicTitle} — Reviewer`, { text: pack.reviewer });
      if (pack.flashcards?.length) ctx.saveMaterial(topicId, "flashcards", `${topicTitle} — Flashcards`, { cards: pack.flashcards });
      if (pack.quiz?.length) ctx.saveMaterial(topicId, "quiz", `${topicTitle} — Quiz`, { questions: pack.quiz });
      if (pack.summary) ctx.saveMaterial(topicId, "summary", `${topicTitle} — Summary`, { text: pack.summary });
      if (pack.story) ctx.saveMaterial(topicId, "story", `${topicTitle} — Story`, { text: pack.story });

      const vocab = pack.summary ? pickVocabTerms(pack.summary, 12) : brief.keyTerms.map((t: string) => ({ term: t, reason: "" }));
      ctx.saveMaterial(topicId, "sayitback", `${topicTitle} — Say-It-Back passage`, {
        passage: pack.summary || brief.brief,
        keyTerms: vocab.map((v) => v.term),
      });

      return {
        reply: buildStudyPackConfirmation(topicTitle, pack),
        interactive: buildStudyPackActions(topicTitle, topicId),
        intent: "create_study_pack",
      };
    }

    case "make_flashcards": {
      const m = ctx.getMaterial(topicId, "flashcards");
      if (m?.content?.cards?.length) {
        return {
          reply: `Here are your ${topicTitle} flashcards.`,
          interactive: { type: "flashcards", topic: topicTitle, topicId, cards: m.content.cards },
          intent: "make_flashcards",
        };
      }
      const brief = getBrief(ctx);
      const cardReq = parseQuizCount(ctx.message);
      const [cards, theme] = await Promise.all([
        createFlashcardsOnly({ topic: topicTitle, brief, cardCount: cardReq.count, sessionCtx: ctx.sessionCtx, signal: ctx.signal }),
        getTricksterTheme(ctx, "flashcards", cardReq.difficulty, cardReq.count),
      ]);
      if (!cards?.length) {
        return { reply: `I couldn't build flashcards for **${topicTitle}** yet — add more notes first.`, interactive: null, intent: "make_flashcards" };
      }
      ctx.saveMaterial(topicId, "flashcards", `${topicTitle} — Flashcards`, { cards });
      return {
        reply: theme ? `Fresh flashcards for **${topicTitle}**. ${theme.icon} ${theme.vibe}`.trim() : `Fresh flashcards for **${topicTitle}**.`,
        interactive: { type: "flashcards", topic: topicTitle, topicId, cards, theme },
        intent: "make_flashcards",
      };
    }

    case "make_quiz": {
      const req = parseQuizCount(ctx.message);
      const m = ctx.getMaterial(topicId, "quiz");
      const stored: any[] = m?.content?.questions || [];
      // Replay the stored quiz only when it satisfies the requested size.
      if (stored.length >= req.count && req.difficulty === "medium") {
        return {
          reply: `Quiz time — ${topicTitle}. ${stored.length} questions.`,
          interactive: { type: "quiz", topic: topicTitle, topicId, questions: stored.slice(0, req.count) },
          intent: "make_quiz",
        };
      }
      const brief = getBrief(ctx);
      const [questions, theme] = await Promise.all([
        createQuizOnly({ topic: topicTitle, brief, quiz: req, sessionCtx: ctx.sessionCtx, signal: ctx.signal }),
        getTricksterTheme(ctx, "quiz", req.difficulty, req.count),
      ]);
      if (!questions?.length) {
        return { reply: `I couldn't build a quiz for **${topicTitle}** yet — add more notes first.`, interactive: null, intent: "make_quiz" };
      }
      ctx.saveMaterial(topicId, "quiz", `${topicTitle} — Quiz`, { questions });
      return {
        reply: theme ? `Quiz time — ${topicTitle}. ${theme.vibe ? `${theme.icon} ${theme.vibe}.` : ""}`.trim() : `Quiz time — ${topicTitle}.`,
        interactive: { type: "quiz", topic: topicTitle, topicId, questions, theme },
        intent: "make_quiz",
      };
    }

    case "make_summary": {
      // Fresh text in this message -> summarize it now (quick|standard|deep).
      if (messageCarriesText(ctx.message)) {
        try {
          const length = parseSummaryLength(ctx.message);
          const { summary, keyTerms } = await summarizeText({
            text: extractBody(ctx.message),
            length,
            subject: subjectName,
            signal: ctx.signal,
          });
          if (summary) {
            saveSummaryMaterials(ctx, topicId, topicTitle, summary, keyTerms);
            return { reply: summarizeReplyWithDrill(summary, keyTerms), interactive: null, intent: "make_summary" };
          }
        } catch (e) {
          // Honest failure: coach instead of pretending.
          return {
            reply: `I couldn't summarize that just now (${(e as Error).message}). Paste the text again and I'll retry.`,
            interactive: null,
            intent: "make_summary",
          };
        }
      }
      const m = ctx.getMaterial(topicId, "summary");
      if (m?.content?.text) {
        return { reply: summarizeReplyWithDrill(String(m.content.text), []), interactive: null, intent: "make_summary" };
      }
      return {
        reply: `No summary yet — paste the text (or say "make a study pack") and I'll summarize **${topicTitle}**.`,
        interactive: null,
        intent: "make_summary",
      };
    }

    case "make_story": {
      const m = ctx.getMaterial(topicId, "story");
      return {
        reply: m?.content?.text || `No story yet — send notes and ask for a study pack.`,
        interactive: null,
        intent: "make_story",
      };
    }

    case "make_visual": {
      const m = ctx.getMaterial(topicId, "html_visual");
      if (m?.content?.html) {
        return {
          reply: `Here's the visual guide for **${topicTitle}**.`,
          interactive: { type: "html_visual", topic: topicTitle, topicId, title: m.content.title || `${topicTitle} visual`, html: m.content.html },
          intent: "make_visual",
        };
      }
      const brief = getBrief(ctx);
      if (brief && brief.length > 20) {
        const viz = await generateVisual({ topic: topicTitle, subject: subjectName, brief, sessionCtx: ctx.sessionCtx, signal: ctx.signal });
        ctx.saveMaterial(topicId, "html_visual", viz.title, { title: viz.title, html: viz.html });
        return {
          reply: `Here's the visual guide for **${topicTitle}**.`,
          interactive: { type: "html_visual", topic: topicTitle, topicId, title: viz.title, html: viz.html },
          intent: "make_visual",
        };
      }
      return {
        reply: `Visual generation needs your notes first — paste some notes (or say "make a study pack") and I'll draw it.`,
        interactive: null,
        intent: "make_visual",
      };
    }

    case "say_it_back": {
      const m = ctx.getMaterial(topicId, "sayitback");
      const passage =
        m?.content?.passage ||
        ctx.getMaterial(topicId, "summary")?.content?.text ||
        `Say back what you learned about ${topicTitle}.`;
      const keyTerms = m?.content?.keyTerms || pickVocabTerms(passage, 10).map((v) => v.term);
      return {
        reply: `Read this aloud in your own words — I'll score every word.`,
        interactive: { type: "say_it_back", topic: topicTitle, topicId, passage, keyTerms },
        intent: "say_it_back",
      };
    }

    case "retrieve_material": {
      const order = ["flashcards", "quiz", "summary", "reviewer", "clean_notes", "story", "html_visual"];
      for (const t of order) {
        const m = ctx.getMaterial(topicId, t);
        if (m) {
          let interactive: InteractivePayload | null = null;
          if (t === "flashcards") interactive = { type: "flashcards", topic: topicTitle, topicId, cards: m.content.cards || [] };
          else if (t === "quiz") interactive = { type: "quiz", topic: topicTitle, topicId, questions: m.content.questions || [] };
          return { reply: `Here's what you have for **${topicTitle}** so far.`, interactive, intent: "retrieve_material" };
        }
      }
      return {
        reply: `Nothing saved yet for **${topicTitle}** — paste your notes to build a study pack.`,
        interactive: null,
        intent: "retrieve_material",
      };
    }

    case "teach_topic":
    default: {
      const taught = await teachTopic({
        topic: topicTitle,
        subject: subjectName,
        question: message,
        history: ctx.history,
        profile: ctx.profile || undefined,
        brief: getBrief(ctx),
        sessionCtx: ctx.sessionCtx,
        signal: ctx.signal,
      });
      if (taught.keyTerms?.length) {
        ctx.saveMaterial(topicId, "sayitback", `${topicTitle} — Say-It-Back passage`, {
          passage: taught.reply,
          keyTerms: taught.keyTerms,
        });
      }
      return { reply: taught.reply, interactive: null, intent: "teach_topic" };
    }
  }
}