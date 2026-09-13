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
import { buildStudyPackActions, buildStudyPackConfirmation } from "./replies";
import type { Classification, ChatMessage, InteractivePayload, Intent } from "./types";

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

  switch (classification.intent) {
    case "create_study_pack": {
      // 1) build + persist one scene brief (compacted context reused by all later agents)
      const brief = await generateSceneBrief({
        topic: topicTitle,
        subject: subjectName,
        sourceText: message,
        signal: ctx.signal,
      });
      ctx.saveMaterial(topicId, "brief", `${topicTitle} — Brief`, {
        text: brief.brief,
        keyTerms: brief.keyTerms,
      });

      // 2) generate pack (split, isolated sub-calls), save each section independently
      const pack = await createStudyPack({
        topic: topicTitle,
        subject: subjectName,
        brief: brief.brief,
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
        reply: buildStudyPackConfirmation(topicTitle, topicId),
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
      const cards = await createFlashcardsOnly({ topic: topicTitle, brief, signal: ctx.signal });
      if (!cards?.length) {
        return { reply: `I couldn't build flashcards for **${topicTitle}** yet — add more notes first.`, interactive: null, intent: "make_flashcards" };
      }
      ctx.saveMaterial(topicId, "flashcards", `${topicTitle} — Flashcards`, { cards });
      return {
        reply: `Fresh flashcards for **${topicTitle}**.`,
        interactive: { type: "flashcards", topic: topicTitle, topicId, cards },
        intent: "make_flashcards",
      };
    }

    case "make_quiz": {
      const m = ctx.getMaterial(topicId, "quiz");
      if (m?.content?.questions?.length) {
        return {
          reply: `Quiz time — ${topicTitle}.`,
          interactive: { type: "quiz", topic: topicTitle, topicId, questions: m.content.questions },
          intent: "make_quiz",
        };
      }
      const brief = getBrief(ctx);
      const questions = await createQuizOnly({ topic: topicTitle, brief, signal: ctx.signal });
      if (!questions?.length) {
        return { reply: `I couldn't build a quiz for **${topicTitle}** yet — add more notes first.`, interactive: null, intent: "make_quiz" };
      }
      ctx.saveMaterial(topicId, "quiz", `${topicTitle} — Quiz`, { questions });
      return {
        reply: `Quiz time — ${topicTitle}.`,
        interactive: { type: "quiz", topic: topicTitle, topicId, questions },
        intent: "make_quiz",
      };
    }

    case "make_summary": {
      const m = ctx.getMaterial(topicId, "summary");
      return {
        reply: m?.content?.text || `No summary yet — send your notes and I'll build a study pack for **${topicTitle}**.`,
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
        const viz = await generateVisual({ topic: topicTitle, subject: subjectName, brief, signal: ctx.signal });
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