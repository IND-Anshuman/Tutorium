// Core orchestration: run one turn against a resolved topic.
// Shared by the sync /api/agent route and the background study-pack job so both
// behave identically. Pure-ish: takes db-bound helpers as args for testability.
import {
  createStudyPack,
  teachTopic,
  generateVisual,
} from "./agents";
import { pickVocabTerms } from "./vocab";
import {
  buildStudyPackActions,
  buildStudyPackConfirmation,
} from "./replies";
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
}

export async function orchestrateTurn(ctx: OrcCtx): Promise<OrchestrateResult> {
  const { classification, topicId, topicTitle, subjectName, message } = ctx;
  const sourceText: string =
    ctx.getMaterial(topicId, "clean_notes")?.content?.text ||
    ctx.getMaterial(topicId, "reviewer")?.content?.text ||
    message;

  switch (classification.intent) {
    case "create_study_pack": {
      const pack = await createStudyPack({
        topic: topicTitle,
        subject: subjectName,
        sourceText: message,
      });
      ctx.saveMaterial(topicId, "clean_notes", `${topicTitle} — Clean Notes`, { text: pack.clean_notes });
      ctx.saveMaterial(topicId, "reviewer", `${topicTitle} — Reviewer`, { text: pack.reviewer });
      ctx.saveMaterial(topicId, "flashcards", `${topicTitle} — Flashcards`, { cards: pack.flashcards });
      ctx.saveMaterial(topicId, "quiz", `${topicTitle} — Quiz`, { questions: pack.quiz });
      ctx.saveMaterial(topicId, "summary", `${topicTitle} — Summary`, { text: pack.summary });
      if (pack.story) ctx.saveMaterial(topicId, "story", `${topicTitle} — Story`, { text: pack.story });

      const vocab = pickVocabTerms(pack.clean_notes + "\n" + pack.summary, 12);
      ctx.saveMaterial(topicId, "sayitback", `${topicTitle} — Say-It-Back passage`, {
        passage: pack.summary,
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
      const pack = await createStudyPack({ topic: topicTitle, subject: subjectName, sourceText });
      ctx.saveMaterial(topicId, "flashcards", `${topicTitle} — Flashcards`, { cards: pack.flashcards });
      return {
        reply: `Fresh flashcards for **${topicTitle}**.`,
        interactive: { type: "flashcards", topic: topicTitle, topicId, cards: pack.flashcards },
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
      const pack = await createStudyPack({ topic: topicTitle, subject: subjectName, sourceText });
      ctx.saveMaterial(topicId, "quiz", `${topicTitle} — Quiz`, { questions: pack.quiz });
      return {
        reply: `Quiz time — ${topicTitle}.`,
        interactive: { type: "quiz", topic: topicTitle, topicId, questions: pack.quiz },
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
          interactive: {
            type: "html_visual",
            topic: topicTitle,
            topicId,
            title: m.content.title || `${topicTitle} visual`,
            html: m.content.html,
          },
          intent: "make_visual",
        };
      }
      // Actually generate the HTML visual from existing notes.
      if (sourceText && sourceText.length > 20) {
        const viz = await generateVisual({ topic: topicTitle, subject: subjectName, sourceText });
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
        sourceText,
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