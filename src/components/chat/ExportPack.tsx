"use client";

import { useState } from "react";

// Export Study Pack: builds a Markdown file from the topic's materials entirely
// client-side and downloads it (plus a print option). No backend changes.
interface MaterialLite {
  type: string;
  title: string;
  content: Record<string, unknown>;
}

const ORDER = ["clean_notes", "reviewer", "summary", "flashcards", "quiz", "story", "sayitback"];

function materialToMarkdown(m: MaterialLite): string {
  const c = m.content || {};
  switch (m.type) {
    case "clean_notes":
    case "reviewer":
    case "story":
      return `## ${m.title}\n\n${String(c.text || "")}\n`;
    case "summary":
      return `## ${m.title}\n\n${String(c.text || "")}\n`;
    case "flashcards": {
      const cards = (c.cards as Array<{ front: string; back: string }>) || [];
      return `## ${m.title}\n\n${cards.map((f, i) => `${i + 1}. **${f.front}** — ${f.back}`).join("\n")}\n`;
    }
    case "quiz": {
      const qs = (c.questions as Array<{ question: string; choices: string[]; answer: string; explanation?: string }>) || [];
      return `## ${m.title}\n\n${qs
        .map((q, i) => {
          const correct = q.choices[Number(q.answer)] || "";
          return `${i + 1}. ${q.question}\n${q.choices.map((ch, ci) => `   ${String.fromCharCode(65 + ci)}. ${ch}`).join("\n")}\n   ✅ **${correct}**${q.explanation ? `\n   _${q.explanation}_` : ""}`;
        })
        .join("\n\n")}\n`;
    }
    case "sayitback": {
      return `## ${m.title}\n\n${String(c.passage || "")}\n\n_Key terms: ${((c.keyTerms as string[]) || []).join(", ")}_\n`;
    }
    default:
      return "";
  }
}

export default function ExportPack({ topicTitle, materials }: { topicTitle: string; materials: MaterialLite[] }) {
  const [done, setDone] = useState(false);
  const usable = materials
    .filter((m) => ORDER.includes(m.type))
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  if (!usable.length) return null;

  const build = () =>
    `# ${topicTitle} — Study Pack\n\n_Tutorium export · ${new Date().toLocaleDateString()}_\n\n${usable
      .map(materialToMarkdown)
      .filter(Boolean)
      .join("\n---\n\n")}`;

  const download = () => {
    const blob = new Blob([build()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${topicTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-study-pack.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setDone(true);
    setTimeout(() => setDone(false), 2500);
  };

  const print = () => {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    const pre = build().replace(/&/g, "&amp;").replace(/</g, "&lt;");
    w.document.write(
      `<html><head><title>${topicTitle} — Study Pack</title><style>body{font-family:Georgia,serif;max-width:42rem;margin:2rem auto;line-height:1.6;color:#111}pre{white-space:pre-wrap;font-family:inherit}</style></head><body><pre>${pre}</pre></body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="export-pack">
      <button className="btn btn-ghost" onClick={download} aria-label="Download the study pack as Markdown">
        📤 {done ? "Downloaded!" : "Export pack"}
      </button>
      <button className="btn btn-ghost" onClick={print} aria-label="Print the study pack">
        🖨️ Print
      </button>
    </div>
  );
}