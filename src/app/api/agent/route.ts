import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateProfile,
  updateProfile,
  saveMessage,
  listMessages,
  findOrCreateSubject,
  findOrCreateTopic,
  getTopic,
  getSubject,
  saveMaterial,
  getMaterial,
  asInteractive,
} from "@/lib/db";
import { classifyMessage, createStudyPack, teachTopic, updateMemory, applyMemoryUpdate } from "@/lib/agents";
import { pickVocabTerms } from "@/lib/vocab";
import { buildStudyPackActions, buildStudyPackConfirmation } from "@/lib/replies";
import type { ChatMessage } from "@/lib/types";

export const maxDuration = 120;

interface AgentRequestBody {
  userId: string;
  message: string;
  topicId?: string | null;
  transcriptMeta?: { fromVoice?: boolean; wordCount?: number; avgConfidence?: number } | null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AgentRequestBody;
    const userId = body.userId || "demo-user";
    const message = (body.message || "").trim();
    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const profile = getOrCreateProfile(userId);
    const history: ChatMessage[] = listMessages(body.topicId || "")
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .slice(-10)
      .map((m: any) => ({ role: m.role, content: m.content }));

    // 1) classify (or lock to current topic context)
    let classification = await classifyMessage(message, history);
    let subject: any;
    let topic: any;

    if (body.topicId) {
      const t = getTopic(body.topicId);
      const s = t ? getSubject(t.subject_id) : null;
      if (t && s) {
        subject = s;
        topic = t;
        classification = { ...classification, subject: s.name, topic: t.title };
      }
    }

    if (!topic) {
      subject = findOrCreateSubject(userId, classification.subject);
      topic = findOrCreateTopic(subject.id, classification.topic, classification.subcategory);
    }

    saveMessage(topic.id, "user", message, null, body.transcriptMeta || null);

    // 2) route by intent
    let reply = "";
    let interactive = null as any;

    const sourceText: string =
      (getMaterial(topic.id, "clean_notes")?.content?.text as string | undefined) ||
      (getMaterial(topic.id, "reviewer")?.content?.text as string | undefined) ||
      message;

    switch (classification.intent) {
      case "create_study_pack": {
        const pack = await createStudyPack({
          topic: topic.title,
          subject: subject.name,
          sourceText: message,
        });
        saveMaterial(topic.id, "clean_notes", `${topic.title} — Clean Notes`, { text: pack.clean_notes });
        saveMaterial(topic.id, "reviewer", `${topic.title} — Reviewer`, { text: pack.reviewer });
        saveMaterial(topic.id, "flashcards", `${topic.title} — Flashcards`, { cards: pack.flashcards });
        saveMaterial(topic.id, "quiz", `${topic.title} — Quiz`, { questions: pack.quiz });
        saveMaterial(topic.id, "summary", `${topic.title} — Summary`, { text: pack.summary });
        if (pack.story) saveMaterial(topic.id, "story", `${topic.title} — Story`, { text: pack.story });

        reply = buildStudyPackConfirmation(topic.title, topic.id);
        interactive = buildStudyPackActions(topic.title, topic.id);

        const vocab = pickVocabTerms(pack.clean_notes + "\n" + pack.summary, 12);
        saveMaterial(topic.id, "sayitback", `${topic.title} — Say-It-Back passage`, {
          passage: pack.summary,
          keyTerms: vocab.map((v) => v.term),
        });
        break;
      }

      case "make_flashcards": {
        const m = getMaterial(topic.id, "flashcards");
        if (m) {
          interactive = { type: "flashcards", topic: topic.title, topicId: topic.id, cards: m.content.cards || [] };
          reply = `Here are your ${topic.title} flashcards.`;
        } else {
          const pack = await createStudyPack({ topic: topic.title, subject: subject.name, sourceText });
          saveMaterial(topic.id, "flashcards", `${topic.title} — Flashcards`, { cards: pack.flashcards });
          interactive = { type: "flashcards", topic: topic.title, topicId: topic.id, cards: pack.flashcards };
          reply = `Fresh flashcards for **${topic.title}**.`;
        }
        break;
      }

      case "make_quiz": {
        const m = getMaterial(topic.id, "quiz");
        if (m) {
          interactive = { type: "quiz", topic: topic.title, topicId: topic.id, questions: m.content.questions || [] };
          reply = `Quiz time — ${topic.title}.`;
        } else {
          const pack = await createStudyPack({ topic: topic.title, subject: subject.name, sourceText });
          saveMaterial(topic.id, "quiz", `${topic.title} — Quiz`, { questions: pack.quiz });
          interactive = { type: "quiz", topic: topic.title, topicId: topic.id, questions: pack.quiz };
          reply = `Quiz time — ${topic.title}.`;
        }
        break;
      }

      case "make_summary": {
        const m = getMaterial(topic.id, "summary");
        reply = m ? m.content.text : `No summary yet — send your notes and I'll build a study pack for **${topic.title}**.`;
        break;
      }

      case "make_story": {
        const m = getMaterial(topic.id, "story");
        reply = m ? m.content.text : `No story yet — send notes and ask for a study pack.`;
        break;
      }

      case "make_visual": {
        const m = getMaterial(topic.id, "html_visual");
        if (m) {
          interactive = { type: "html_visual", topic: topic.title, topicId: topic.id, title: m.content.title || `${topic.title} visual`, html: m.content.html };
          reply = `Here's the visual guide for **${topic.title}**.`;
        } else {
          reply = `Visual generation for **${topic.title}** needs a study pack first — send your notes to build one, then I'll draw it.`;
        }
        break;
      }

      case "say_it_back": {
        const m = getMaterial(topic.id, "sayitback");
        const passage = m?.content?.passage || (getMaterial(topic.id, "summary")?.content?.text as string | undefined) || `Say back what you learned about ${topic.title}.`;
        const keyTerms = (m?.content?.keyTerms as string[] | undefined) || pickVocabTerms(passage, 10).map((v) => v.term);
        interactive = {
          type: "say_it_back",
          topic: topic.title,
          topicId: topic.id,
          passage,
          keyTerms,
        };
        reply = `Read this aloud in your own words — I'll score every word.`;
        break;
      }

      case "retrieve_material": {
        const order = ["flashcards", "quiz", "summary", "reviewer", "clean_notes", "story", "html_visual"];
        for (const t of order) {
          const m = getMaterial(topic.id, t);
          if (m) {
            if (t === "flashcards") interactive = { type: "flashcards", topic: topic.title, topicId: topic.id, cards: m.content.cards || [] };
            else if (t === "quiz") interactive = { type: "quiz", topic: topic.title, topicId: topic.id, questions: m.content.questions || [] };
            reply = `Here's what you have for **${topic.title}** so far.`;
            break;
          }
        }
        if (!reply) reply = `Nothing saved yet for **${topic.title}** — paste your notes to build a study pack.`;
        break;
      }

      case "teach_topic":
      default: {
        const taught = await teachTopic({
          topic: topic.title,
          subject: subject.name,
          question: message,
          history,
          profile: {
            learning_style: profile.learning_style,
            weaknesses: profile.weaknesses,
            strengths: profile.strengths,
          },
          sourceText,
        });
        reply = taught.reply;
        if (taught.keyTerms?.length) {
          saveMaterial(topic.id, "sayitback", `${topic.title} — Say-It-Back passage`, {
            passage: taught.reply,
            keyTerms: taught.keyTerms,
          });
        }
        break;
      }
    }

    // 3) memory update (best-effort)
    try {
      const upd = await updateMemory({
        message,
        reply,
        profile: { learning_style: profile.learning_style, strengths: profile.strengths, weaknesses: profile.weaknesses },
      });
      const applied = applyMemoryUpdate(
        { learning_style: profile.learning_style, strengths: profile.strengths, weaknesses: profile.weaknesses },
        upd
      );
      updateProfile(userId, {
        learning_style: applied.learning_style,
        strengths: applied.strengths,
        weaknesses: applied.weaknesses,
        next_recommended_action: applied.next_recommended_action,
      });
    } catch (e) {
      console.warn("memory update skipped:", (e as Error).message);
    }

    saveMessage(topic.id, "assistant", reply, asInteractive(interactive));

    return NextResponse.json({
      reply,
      interactive,
      topicId: topic.id,
      topicTitle: topic.title,
      subjectId: subject.id,
      subjectName: subject.name,
      intent: classification.intent,
      runtime: "featherless",
    });
  } catch (err) {
    console.error("agent error:", err);
    return NextResponse.json({ error: (err as Error).message || "agent failed" }, { status: 500 });
  }
}