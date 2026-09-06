"use client";

export default function HtmlVisual({ title, html }: { title: string; html: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
      <div className="mb-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>{title}</div>
      <div className="prose-sm max-w-none text-sm [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-4 [&_ul]:list-disc" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}