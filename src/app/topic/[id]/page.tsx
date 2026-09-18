import { getTopic, getSubject, listMaterials, quizHistory } from "@/lib/db";
import FlashcardDeck from "@/components/chat/FlashcardDeck";
import MiniQuiz from "@/components/chat/MiniQuiz";
import HtmlVisual from "@/components/chat/HtmlVisual";
import SayItBackCard from "@/components/chat/SayItBackCard";
import TeachBackCard from "@/components/chat/TeachBackCard";
import Markdown from "@/components/chat/Markdown";
import type { InteractiveSayItBack, InteractiveTeachBack } from "@/lib/types";
import Link from "next/link";
import ExportPack from "@/components/chat/ExportPack";
import WeaknessRadar from "@/components/chat/WeaknessRadar";
import { getOrCreateProfile } from "@/lib/db";

export const dynamic = "force-dynamic";

const LABELS: Record<string, { label: string; icon: string }> = {
  clean_notes:   { label: "Clean notes",    icon: "📋" },
  reviewer:      { label: "Reviewer",       icon: "🔍" },
  summary:       { label: "Summary",        icon: "📑" },
  story:         { label: "Story",          icon: "📖" },
  flashcards:    { label: "Flashcards",     icon: "🃏" },
  quiz:          { label: "Quiz",           icon: "✅" },
  html_visual:   { label: "Visual guide",   icon: "🖼️" },
  sayitback:     { label: "Say-It-Back",    icon: "🎙" },
  teachback:     { label: "Teach-back",     icon: "📝" },
};

export default function TopicPage({ params }: { params: { id: string } }) {
  const topic = getTopic(params.id);
  if (!topic) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="text-4xl" aria-hidden>🔍</div>
        <p className="mt-3 text-sm" style={{ color: "var(--ink-2)" }}>Topic not found.</p>
        <Link href="/library" className="btn btn-ghost mt-4">← Back to Library</Link>
      </main>
    );
  }
  const subject = getSubject(topic.subject_id);
  const materials = listMaterials(topic.id);
  const byType = new Map(materials.map((m) => [m.type, m]));
  const scores = quizHistory(topic.id);
  const profile = getOrCreateProfile("demo-user");
  const sayitbackMat = byType.get("sayitback")?.content;
  const quizLatest = scores.length ? (scores as Array<{ score: number; total: number }>)[scores.length - 1] : null;
  const radarData = {
    quizAccuracy: quizLatest && quizLatest.total ? quizLatest.score / quizLatest.total : 0,
    speechClarity: sayitbackMat?.lastOverall != null ? Number(sayitbackMat.lastOverall) / 100 : 0,
    vocabStrength: sayitbackMat?.keyTerms?.length
      ? Math.max(0, 1 - ((sayitbackMat.missedTerms as string[])?.length || 0) / (sayitbackMat.keyTerms as string[]).length)
      : 0,
    consistency: Math.min(1, scores.length / 5),
    weakAreas: Math.max(0, 1 - (profile.weaknesses?.length || 0) / 6),
  };

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

  const avg = scores.length
    ? Math.round(
        ((scores as Array<{ score: number; total: number }>).reduce((a, r) => a + r.score, 0) /
         Math.max(1, (scores as Array<{ score: number; total: number }>).reduce((a, r) => a + r.total, 0))) * 100
      )
    : null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-[40] border-b" style={{ borderColor: "var(--border)", background: "color-mix(in oklab, var(--bg) 88%, transparent)", backdropFilter: "blur(12px)" }}>
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
          <Link href="/library" className="flex items-center gap-3 no-underline" style={{ color: "inherit" }}>
            <span className="brand-mark" aria-hidden>T</span>
            <div className="leading-tight">
              <h1 className="text-base font-bold tracking-tight">{topic.title}</h1>
              <p className="text-[11px]" style={{ color: "var(--ink-3)" }}>
                {subject?.name || "General"}{topic.subcategory && topic.subcategory !== "General" ? ` · ${topic.subcategory}` : ""}
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/library" className="btn btn-ghost" style={{ minHeight: 36, padding: "0 var(--space-sm)" }}>Library</Link>
            <Link href={`/?topic=${params.id}`} className="btn btn-primary" style={{ minHeight: 36, padding: "0 var(--space-sm)" }}>Study now</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        {/* Topic stats strip */}
        {materials.length > 0 && (
          <div className="topic-stats">
            <div className="topic-stat">
              <span className="topic-stat-num">{materials.length}</span>
              <span className="topic-stat-label">materials</span>
            </div>
            <div className="topic-stat">
              <span className="topic-stat-num">{scores.length}</span>
              <span className="topic-stat-label">quiz attempts</span>
            </div>
            {avg !== null && (
              <div className="topic-stat">
                <span className="topic-stat-num" style={{ color: avg >= 80 ? "var(--success)" : avg >= 50 ? "var(--warning)" : "var(--danger)" }}>{avg}%</span>
                <span className="topic-stat-label">average</span>
              </div>
            )}
            <div className="topic-stat">
              <span className="topic-stat-num">{flashcards?.length || 0}</span>
              <span className="topic-stat-label">flashcards</span>
            </div>
          </div>
        )}

        {/* Quiz history strip */}
        {scores.length > 0 && (
          <div className="topic-quiz-history">
            <span className="topic-quiz-history-label">Quiz history</span>
            <div className="topic-quiz-history-list">
              {scores.slice(-8).map((s, i) => {
                const r = s as { score: number; total: number; created_at: string };
                const pct = r.total ? r.score / r.total : 0;
                const tone = pct >= 0.8 ? "var(--success)" : pct >= 0.5 ? "var(--warning)" : "var(--danger)";
                return (
                  <span
                    key={i}
                    title={new Date(r.created_at).toLocaleString()}
                    className="topic-quiz-pill"
                    style={{ color: tone, borderColor: `color-mix(in oklab, ${tone} 40%, transparent)`, background: `color-mix(in oklab, ${tone} 10%, var(--surface-2))` }}
                  >
                    {r.score}/{r.total}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Topic materials list (TOC) */}
        {materials.length > 0 && (
          <div className="topic-toc">
            <div className="topic-toc-label">In this topic</div>
            <div className="topic-toc-grid">
              {Object.keys(LABELS).filter((t) => byType.has(t)).map((t) => {
                const m = LABELS[t];
                return (
                  <a key={t} href={`#sec-${t}`} className="topic-toc-chip">
                    <span aria-hidden>{m.icon}</span>
                    {m.label}
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Materials */}
        {byType.get("clean_notes")?.content?.text && (
          <section id="sec-clean_notes" className="topic-section">
            <h2 className="topic-section-title"><span aria-hidden>📋</span> Clean notes</h2>
            <div className="topic-section-body"><Markdown>{String(byType.get("clean_notes").content.text)}</Markdown></div>
          </section>
        )}
        {byType.get("reviewer")?.content?.text && (
          <section id="sec-reviewer" className="topic-section">
            <h2 className="topic-section-title"><span aria-hidden>🔍</span> Reviewer</h2>
            <div className="topic-section-body"><Markdown>{String(byType.get("reviewer").content.text)}</Markdown></div>
          </section>
        )}
        {byType.get("summary")?.content?.text && (
          <section id="sec-summary" className="topic-section">
            <h2 className="topic-section-title"><span aria-hidden>📑</span> Summary</h2>
            <div className="topic-section-body"><Markdown>{String(byType.get("summary").content.text)}</Markdown></div>
          </section>
        )}
        {byType.get("story")?.content?.text && (
          <section id="sec-story" className="topic-section">
            <h2 className="topic-section-title"><span aria-hidden>📖</span> Story</h2>
            <div className="topic-section-body"><Markdown>{String(byType.get("story").content.text)}</Markdown></div>
          </section>
        )}
        {flashcards && (
          <section id="sec-flashcards" className="topic-section">
            <h2 className="topic-section-title"><span aria-hidden>🃏</span> Flashcards</h2>
            <FlashcardDeck cards={flashcards} />
          </section>
        )}
        {quiz && (
          <section id="sec-quiz" className="topic-section">
            <h2 className="topic-section-title"><span aria-hidden>✅</span> Quiz</h2>
            <MiniQuiz questions={quiz} topicId={topic.id} />
          </section>
        )}
        <section className="topic-section">
          <h2 className="topic-section-title"><span aria-hidden>🕸️</span> Your radar</h2>
          <WeaknessRadar data={radarData} />
        </section>
        <section className="topic-section">
          <h2 className="topic-section-title"><span aria-hidden>📤</span> Take it with you</h2>
          <ExportPack topicTitle={topic.title} materials={materials} />
        </section>
        {visual?.html && (
          <section id="sec-html_visual" className="topic-section">
            <h2 className="topic-section-title"><span aria-hidden>🖼️</span> Visual guide</h2>
            <HtmlVisual title={visual.title || "Visual"} html={visual.html} />
          </section>
        )}
        {sayItBackPayload && (
          <section id="sec-sayitback" className="topic-section">
            <h2 className="topic-section-title"><span aria-hidden>🎙</span> Say-It-Back</h2>
            <SayItBackCard payload={sayItBackPayload} />
          </section>
        )}
        {teachBackPayload && (
          <section id="sec-teachback" className="topic-section">
            <h2 className="topic-section-title"><span aria-hidden>📝</span> Teach-back</h2>
            <TeachBackCard payload={teachBackPayload} />
          </section>
        )}

        {materials.length === 0 && (
          <div className="topic-empty">
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
