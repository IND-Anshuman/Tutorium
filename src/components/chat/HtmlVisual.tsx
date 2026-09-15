"use client";

import { useRef, useState, useCallback } from "react";

// Render the LLM-generated visual inside a sandboxed <iframe srcDoc>. This
// fully isolates its styles and scripts from the host page, while srcDoc
// keeps it same-origin so we can auto-size to its content.
export default function HtmlVisual({ title, html }: { title: string; html: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(220);
  const [open, setOpen] = useState(true);

  const onLoad = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (doc?.body) {
      const h = Math.max(140, Math.min(900, doc.body.scrollHeight || 220));
      setHeight(h);
    }
  }, []);

  const srcDoc = `<div style="padding:14px;font-family:system-ui,sans-serif;color:#1a2333;">${html ?? ""}</div>`;

  return (
    <div className="widget-card widget-card--visual">
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>🖼️</span>
        <div className="widget-title">
          <span className="widget-label">{title || "Visual guide"}</span>
          <span className="widget-sub">interactive diagram</span>
        </div>
        <button
          className="widget-toggle"
          aria-label={open ? "Collapse visual" : "Expand visual"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "▾" : "▸"}
        </button>
      </div>
      {open && (
        <div className="visual-frame-wrap">
          <iframe
            ref={frameRef}
            title={title}
            srcDoc={srcDoc}
            onLoad={onLoad}
            sandbox="allow-same-origin"
            className="visual-frame"
            style={{ height }}
          />
        </div>
      )}
    </div>
  );
}
