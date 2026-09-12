import { listLibrary } from "@/lib/db";
import Link from "next/link";
import { EmptyState } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default function LibraryPage() {
  const library = listLibrary("demo-user");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-[40] border-b" style={{ borderColor: "var(--border)", background: "color-mix(in oklab, var(--bg) 88%, transparent)", backdropFilter: "blur(12px)" }}>
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold" style={{ background: "var(--brand)", color: "var(--on-brand)" }}>
              T
            </span>
            <h1 className="text-lg font-bold tracking-tight">Library</h1>
          </div>
          <Link href="/" className="btn btn-ghost" style={{ minHeight: 36, padding: "0 var(--space-sm)" }}>
            ← Chat
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        {library.length === 0 ? (
          <EmptyState
            icon="🗂"
            title="Your library is quiet"
            body="Everything you create — study packs, quizzes, Say-It-Back drills — appears here by subject. Start a chat to build your first one."
            actions={<Link href="/" className="btn btn-lamp">Start a chat</Link>}
          />
        ) : (
          library.map((s) => (
            <section key={s.id} className="mb-10">
              <div className="mb-4 flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--border)" }}>
                <h2 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{s.name}</h2>
                <span className="text-xs" style={{ color: "var(--ink-3)" }}>{s.topics.length} topic{s.topics.length !== 1 ? "s" : ""}</span>
              </div>
              {s.topics.length === 0 && (
                <p className="text-sm" style={{ color: "var(--ink-3)" }}>No topics yet in this subject.</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {s.topics.map((t: any) => {
                  const n = t.materials.length;
                  return (
                    <Link
                      href={`/topic/${t.id}`}
                      key={t.id}
                      className="card p-4 transition-transform no-underline hover:-translate-y-0.5"
                      style={{ color: "inherit" }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-base font-semibold leading-snug">{t.title}</span>
                        <span className="mt-1 text-[11px] text-nowrap" style={{ color: "var(--ink-3)" }}>
                          {new Date(t.last_studied_at).toLocaleDateString()}
                        </span>
                      </div>
                      {t.subcategory && t.subcategory !== "General" && (
                        <div className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>{t.subcategory}</div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {t.materials.slice(0, 6).map((m: any) => (
                          <span key={m.id} className="badge">{m.type.replace(/_/g, " ")}</span>
                        ))}
                        {n > 6 && <span className="badge">+{n - 6}</span>}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}