"use client";

export default function InfoCards({ cards }: { cards: Array<{ icon?: string; title: string; body: string }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((c, i) => (
        <div key={i} className="card p-4">
          <div className="mb-1.5 text-sm font-semibold">
            {c.icon && <span className="mr-1.5">{c.icon}</span>}
            {c.title}
          </div>
          <p className="text-sm leading-normal" style={{ color: "var(--ink-2)" }}>{c.body}</p>
        </div>
      ))}
    </div>
  );
}