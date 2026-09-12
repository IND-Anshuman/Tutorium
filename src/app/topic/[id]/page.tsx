import { getTopic, getSubject, listMaterials, quizHistory } from "@/lib/db";
import FlashcardDeck from "@/components/chat/FlashcardDeck";
import MiniQuiz from "@/components/chat/MiniQuiz";
import HtmlVisual from "@/components/chat/HtmlVisual";
import SayItBackCard from "@/components/chat/SayItBackCard";
import TeachBackCard from "@/components/chat/TeachBackCard";
import Markdown from "@/components/chat/Markdown";
import type { InteractivePayload } from "@/lib/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h2 className="text-sm font-semibold" style={{ color: "var(--accent)" }}>{title}</h2>
      <div className="mt-1.5 rounded-xl p-4" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
        {children}
      </div>
    </section>
  );
}

export default function TopicPage({ params }: { params: { id: string } }) {
  const topic = getTopic(params.id);
  if (!topic) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-sm" style={{ color: "var(--muted)" }}>Topic not found.</p>
        <Link href="/library" style={{ color: "var(--accent)" }} className="mt-2 inline-block text-sm underline">← Back to Library</Link>
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

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{topic.title}</h1>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            {subject?.name || "General"}{topic.subcategory ? ` · ${topic.subcategory}` : ""} · last studied {new Date(topic.last_studied_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/library" className="text-sm underline-offset-2 hover:underline" style={{ color: "var(--accent)" }}>Library</Link>
          <Link href={`/?topic=${params.id}`} className="rounded-lg px-3 py-1.5 text-sm font-medium" style={{ background: "var(--accent)", color: "#0b0e14" }}>
            Continue studying →
          </Link>
        </div>
      </div>

      {scores.length > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
          <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Quiz history</span>
          {scores.slice(-5).map((s, i) => {
            const row = s as { score: number; total: number };
            const pct = row.score / row.total;
            return (
              <span key={i} className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                style={{ background: "var(--bg)", color: pct >= 0.8 ? "var(--accent-2)" : pct >= 0.5 ? "var(--warn)" : "var(--miss)", border: "1px solid var(--border)" }}>
                {row.score}/{row.total}
              </span>
            );
          })}
        </div>
      )}

      {byType.get("clean_notes")?.content?.text && (
        <Section title="Clean notes">
          <Markdown>{String(byType.get("clean_notes").content.text)}</Markdown>
        </Section>
      )}
      {byType.get("reviewer")?.content?.text && (
        <Section title="Reviewer">
          <Markdown>{String(byType.get("reviewer").content.text)}</Markdown>
        </Section>
      )}
      {byType.get("summary")?.content?.text && (
        <Section title="Summary">
          <Markdown>{String(byType.get("summary").content.text)}</Markdown>
        </Section>
      )}
      {byType.get("story")?.content?.text && (
        <Section title="Story">
          <Markdown>{String(byType.get("story").content.text)}</Markdown>
        </Section>
      )}
      {flashcards && (
        <Section title="Flashcards">
          <FlashcardDeck cards={flashcards} />
        </Section>
      )}
      {quiz && (
        <Section title="Quiz">
          <MiniQuiz questions={quiz} topicId={topic.id} />
        </Section>
      )}
      {visual?.html && (
        <Section title="Visual guide">
          <HtmlVisual title={visual.title || "Visual"} html={visual.html} />
        </Section>
      )}
      {sayitback?.passage && (
        <Section title="Say-It-Back">
          <SayItBackCard
            payload={{
              type: "say_it_back",
              topic: topic.title,
              topicId: topic.id,
              passage: sayitback.passage,
              keyTerms: (sayitback.keyTerms as string[]) || [],
            }}
            // This page is not the chat — recording happens in the chat flow.
          />
        </Section>
      )}
      {teachback?.transcript && (
        <Section title="Teach-back review">
          <TeachBackCard
            payload={{
              type: "teach_back",
              topic: topic.title,
              topicId: topic.id,
              transcript: teachback.transcript,
              verdict: teachback.verdict,
              missed: teachback.missed,
              next_step: teachback.next_step,
            }}
          />
        </Section>
      )}
      {materials.length === 0 && (
        <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>
          No materials yet — open this topic in the chat and ask Tutorium to build a study pack.
        </p>
      )}
    </main>
  );
}