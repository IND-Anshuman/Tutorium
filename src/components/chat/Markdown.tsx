"use client";

// Lightweight markdown renderer for assistant replies. react-markdown does not
// set innerHTML (safe by default); remark-gfm adds tables/strikethrough/marks.
// Typographic rules live in globals.css under `.md-body` for consistency.
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="md-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}