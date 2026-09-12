import { getTopic, getSubject, listMaterials, quizHistory } from "@/lib/db";
import FlashcardDeck from "@/components/chat/FlashcardDeck";
import MiniQuiz from "@/components/chat/MiniQuiz";
import HtmlVisual from "@/components/chat/HtmlVisual";
import SayItBackCard from "@/components/chat/SayItBackCard";
import TeachBackCard from "@/components/chat/TeachBackCard";
import Markdown from "@/components/chat/Markdown";
import { Badge } from "@/components/ui/primitives";
import type { InteractiveSayItBack, InteractiveTeachBack } from "@/lib/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  clean_notes: "Clean notes",
  reviewer: "Reviewer",
  summary: "Summary",
  story: "Story",
  flashcards: "Flashcards",
  quiz: "Quiz",
  html_visual: "Visual guide",
  sayitback: "Say-It-Back",
  teachback: "Teach-back",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>{title}</h2>
      {children}
    </section>
  );
}

export default function TopicPage({ params }: { params: { id: string } }) {
  const topic = getTopic(params.id);
  if (!topic) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm" style={{ color: "var(--ink-3)" }}>Topic not found.</p>
        <Link href="/library" className="btn btn-ghost mt-4">← Back to Library</Link>
      </main>
    );
  }
  const subject = getSubject(topic.subject_id);
  const materials = listMaterials(topic.id);
  const byType = new Map(materials.map((m) => [m.type, m]));
  const scores = quizHistory(topic.id);

  const flashcards = byType.get("flashcards")?.content?.cards || null;
  const quiz = byType.get("quiz")?.content?.questions || null;
  const visual = byType.get("html_visual")?.content;
  const sayitback = byType.get("sayitback")?.content;
  const teachback = byType.get("teachback")?.content;

  const sayItBackPayload: InteractiveSayItBack | null = sayitback?.passage ? {
    type: "say_it_back",
    topic: topic.title,
    topicId: topic.id,
    passage: sayitback.passage,
    keyTerms: (sayitback.keyTerms as string[]) || [],
  } : null;

  const teachBackPayload: InteractiveTeachBack | null = teachback?.transcript ? {
    type: "teach_back",
    topic: topic.title,
    topicId: topic.id,
    transcript: teachback.transcript,
    verdict: teachback.verdict,
    missed: teachback.missed,
    next_step: teachback.next_step,
  } : null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-[40] border-b" style={{ borderColor: "var(--border)", background: "color-mix(in oklab, var(--bg) 88%, transparent)", backdropFilter: "blur(12px)" }}>
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold" style={{ background: "var(--brand)", color: "var(--on-brand)" }}>
              T
            </span>
            <div className="leading-tight">
              <h1 className="text-base font-bold tracking-tight">{topic.title}</h1>
              <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                {subject?.name || "General"}{topic.subcategory && topic.subcategory !== "General" ? ` · ${topic.subcategory}` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/library" className="btn btn-ghost" style={{ minHeight: 36, padding: "0 var(--space-sm)" }}>Library</Link>
            <Link href={`/?topic=${params.id}`} className="btn btn-primary" style={{ minHeight: 36, padding: "0 var(--space-sm)" }}>Study now</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        {scores.length > 0 && (
          <div className="card flex items-center gap-3 p-4">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>Quiz history</span>
            <div className="flex flex-wrap gap-2">
              {scores.slice(-6).map((s, i) => {
                const r = s as { score: number; total: number; created_at: string };
                const pct = r.total ? r.score / r.total : 0;
                return (
                  <span key={i} title={new Date(r.created_at).toLocaleString()} className="badge"
                    style={{ color: pct >= 0.8 ? "var(--success)" : pct >= 0.5 ? "var(--warning)" : "var(--danger)", borderColor: "var(--border)" }}>
                    {r.score}/{r.total}
                  </span>
                );
              })}
              <Badge>avg {((scores as Array<{ score: number; total: number }>).reduce((a, r) => a + r.score, 0) / Math.max(1, (scores as Array<{ score: number; total: number }>).reduce((a, r) => a + r.total, 0)) * 100).toFixed(0)}%</Badge>
            </div>
          </div>
        )}

        {byType.get("clean_notes")?.content?.text && (
          <Section title={LABELS.clean_notes}><div className="card p-5"><Markdown>{String(byType.get("clean_notes").content.text)}</Markdown></div></Section>
        )}
        {byType.get("reviewer")?.content?.text && (
          <Section title={LABELS.reviewer}><div className="card p-5"><Markdown>{String(byType.get("reviewer").content.text)}</Markdown></div></Section>
        )}
        {byType.get("summary")?.content?.text && (
          <Section title={LABELS.summary}><div className="card p-5"><Markdown>{String(byType.get("summary").content.text)}</Markdown></div></Section>
        )}
        {byType.get("story")?.content?.text && (
          <Section title={LABELS.story}><div className="card p-5"><Markdown>{String(byType.get("story").content.text)}</Markdown></div></Section>
        )}
        {flashcards && <Section title={LABELS.flashcards}><FlashcardDeck cards={flashcards} /></Section>}
        {quiz && <Section title={LABELS.quiz}><MiniQuiz questions={quiz} topicId={topic.id} /></Section>}
        {visual?.html && <Section title={LABELS.html_visual}><HtmlVisual title={visual.title || "Visual"} html={visual.html} /></Section>}
        {sayItBackPayload && <Section title={LABELS.sayitback}><SayItBackCard payload={sayItBackPayload} /></Section>}
        {teachBackPayload && <Section title={LABELS.teachback}><TeachBackCard payload={teachBackPayload} /></Section>}

        {materials.length === 0 && (
          <div className="rounded-xl border border-dashed p-10 text-center" style={{ borderColor: "var(--border-strong)" }}>
            <div className="text-4xl" aria-hidden>🗂</div>
            <p className="mt-3 text-sm" style={{ color: "var(--ink-2)" }}>
              No materials yet. Open this topic in the chat and ask Tutorium to build a study pack.
            </p>
            <Link href={`/?topic=${params.id}`} className="btn btn-lamp mt-5">Start in chat</Link>
          </div>
        )}
      </main>
    </div>
  );
}