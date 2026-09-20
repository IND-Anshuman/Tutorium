import { listLibrary, listSessions } from "@/lib/db";
import Link from "next/link";
import { EmptyState } from "@/components/ui/primitives";
import AccountControls from "@/components/auth/AccountControls";

export const dynamic = "force-dynamic";

const ICONS: Record<string, string> = {
  quiz: "✅",
  flashcards: "🃏",
  html_visual: "🖼️",
  sayitback: "🎙",
  teachback: "📝",
  clean_notes: "📋",
  reviewer: "🔍",
  summary: "📑",
  story: "📖",
  document: "📄",
  theme: "🎨",
};

// Human names for material types (chips say "Quiz", not "make_quiz").
const NAMES: Record<string, string> = {
  quiz: "Quiz",
  flashcards: "Flashcards",
  html_visual: "Visual",
  sayitback: "Say-it-back",
  teachback: "Teach-back",
  clean_notes: "Notes",
  reviewer: "Reviewer",
  summary: "Summary",
  story: "Story",
  document: "Document",
  theme: "Theme",
};

export default function LibraryPage() {
  const userId = "demo-user";
  const library = listLibrary(userId);
  const sessions = (listSessions(userId, { limit: 6 }) as Array<any>);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-[40] border-b" style={{ borderColor: "var(--border)", background: "color-mix(in oklab, var(--bg) 88%, transparent)", backdropFilter: "blur(12px)" }}>
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-3 no-underline" style={{ color: "inherit" }}>
                      <span className="brand-mark brand-mark--img" aria-hidden>
                        <img src="/logo-dark.png" alt="" width={32} height={32} />
                      </span>
                      <h1 className="text-lg font-bold tracking-tight">Library</h1>
                    </Link>
                    <nav className="flex items-center gap-2">
                      <Link href="/" className="btn btn-ghost" style={{ minHeight: 36, padding: "0 var(--space-sm)" }}>
                        ← Back to chat
                      </Link>
                      <AccountControls />
                    </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        {/* Recent sessions */}
        {sessions.length > 0 && (
          <section className="mb-10">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--ink-2)" }}>Recent sessions</h2>
              <span className="text-xs" style={{ color: "var(--ink-3)" }}>{sessions.length}</span>
            </div>
            <ul className="space-y-2">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/?session=${s.id}`}
                    className="lib-session-card no-underline"
                  >
                    <span className="lib-session-dot" aria-hidden />
                    <span className="lib-session-domain">{s.domain || "Untitled domain"}</span>
                    <span className="lib-session-meta">
                      {(s.topic_count || 0)} {(s.topic_count || 0) === 1 ? "topic" : "topics"}
                      <span className="lib-session-dot-sep" aria-hidden>·</span>
                      {new Date(s.updated_at || s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                    <span className="lib-session-arrow" aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Topics by subject */}
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--ink-2)" }}>Subjects</h2>
            <span className="text-xs" style={{ color: "var(--ink-3)" }}>{library.length}</span>
          </div>

          {library.length === 0 ? (
            <EmptyState
              icon="🗂"
              title="Your library is quiet"
              body="Everything you create — study packs, quizzes, Say-It-Back drills — appears here by subject. Start a chat to build your first one."
              actions={<Link href="/" className="btn btn-lamp">Start a chat</Link>}
            />
          ) : (
            library.map((s) => (
              <div key={s.id} className="lib-subject">
                <div className="lib-subject-head">
                  <h3 className="lib-subject-name">{s.name}</h3>
                  <span className="lib-subject-count">{s.topics.length} topic{s.topics.length !== 1 ? "s" : ""}</span>
                </div>
                {s.topics.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--ink-3)" }}>No topics yet in this subject.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {s.topics.map((t: any) => {
                      const n = t.materials.length;
                      return (
                        <Link
                          href={`/topic/${t.id}`}
                          key={t.id}
                          className="lib-topic-card no-underline"
                        >
                          <div className="lib-topic-head">
                            <span className="lib-topic-title">{t.title}</span>
                            <span className="lib-topic-date">
                              {new Date(t.last_studied_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </span>
                          </div>
                          {t.subcategory && t.subcategory !== "General" && (
                            <div className="lib-topic-sub">{t.subcategory}</div>
                          )}
                          <div className="lib-topic-materials">
                            {t.materials.slice(0, 6).map((m: any) => (
                              <span key={m.id} className="lib-material-chip">
                                <span aria-hidden>{ICONS[m.type] || "📘"}</span>
                                {NAMES[m.type] || m.type.replace(/_/g, " ")}
                              </span>
                            ))}
                            {n > 6 && <span className="lib-material-chip lib-material-chip--more">+{n - 6}</span>}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
