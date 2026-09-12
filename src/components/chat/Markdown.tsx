"use client";

// Lightweight markdown renderer for assistant replies. react-markdown does not
// set innerHTML (safe by default), and remark-gfm adds tables/strikethrough/etc.
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({ children }: { children: string }) {
  return (
    <div
      className="prose-invert max-w-none text-sm leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:ml-5 [&_ul]:list-disc [&_ol]:list-decimal [&_h1]:text-base [&_h1]:font-bold [&_h2]:text-sm [&_h2]:font-semibold [&_strong]:font-semibold [&_a]:underline"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}