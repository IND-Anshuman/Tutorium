import { listLibrary } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function LibraryPage() {
  const library = listLibrary("demo-user");
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Library</h1>
        <a href="/" className="text-sm underline-offset-2 hover:underline" style={{ color: "var(--accent)" }}>← Back to chat</a>
      </div>
      {library.length === 0 && (
        <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>
          Nothing here yet — chat with Tutorium and your subjects/topics/materials appear automatically.
        </p>
      )}
      {library.map((s) => (
        <section key={s.id} className="mt-6">
          <h2 className="text-sm font-semibold" style={{ color: "var(--accent)" }}>{s.name}</h2>
          {s.topics.length === 0 && <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>No topics yet.</p>}
          {s.topics.map((t: any) => (
            <Link href={`/topic/${t.id}`} key={t.id} className="block mt-2 rounded-xl p-3 no-underline transition hover:opacity-90" style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "inherit" }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t.title}</span>
                <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                  {t.subcategory || "General"} · {new Date(t.last_studied_at).toLocaleDateString()}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {t.materials.map((m: any) => (
                  <span key={m.id} className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--muted)" }}>
                    {m.type.replace("_", " ")}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </section>
      ))}
    </main>
  );
}