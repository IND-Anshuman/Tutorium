"use client";

export default function InfoCards({ cards }: { cards: Array<{ icon?: string; title: string; body: string }> }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {cards.map((c, i) => (
        <div key={i} className="rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
          <div className="text-sm font-medium">{c.icon ? `${c.icon} ` : ""}{c.title}</div>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{c.body}</p>
        </div>
      ))}
    </div>
  );
}