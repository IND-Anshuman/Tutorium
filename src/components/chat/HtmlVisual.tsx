"use client";

import { useRef, useState, useCallback } from "react";

// Render the LLM-generated visual inside a sandboxed <iframe srcDoc>. This fully
// isolates its styles and scripts from the host page (the "proper" XSS boundary),
// while srcDoc keeps it same-origin so we can auto-size to its content.
export default function HtmlVisual({ title, html }: { title: string; html: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(220);

  const onLoad = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.body) {
      const h = Math.max(120, Math.min(900, doc.body.scrollHeight || 220));
      setHeight(h);
    }
  }, []);

  const srcDoc = `<div style="padding:12px;font-family:system-ui,sans-serif;color:#1a2333;">${html ?? ""}</div>`;

  return (
    <div className="rounded-xl" style={{ border: "1px solid var(--border)", overflow: "hidden", background: "#fff" }}>
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide" style={{ background: "var(--surface-2)", color: "var(--ink-3)" }}>{title}</div>
      <iframe
        ref={frameRef}
        title={title}
        srcDoc={srcDoc}
        onLoad={onLoad}
        sandbox="allow-same-origin"
        style={{ width: "100%", height, border: "none", display: "block", background: "#fff" }}
      />
    </div>
  );
}