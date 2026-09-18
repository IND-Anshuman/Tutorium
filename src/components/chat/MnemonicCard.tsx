"use client";

import { useState } from "react";
import type { InteractiveMnemonic } from "@/lib/types";
import Markdown from "./Markdown";

const KIND_META: Record<string, { icon: string; label: string }> = {
  acronym: { icon: "🔤", label: "Acronym" },
  phrase: { icon: "🔗", label: "Story link" },
  peg: { icon: "📍", label: "Peg hook" },
};

export default function MnemonicCard({ payload }: { payload: InteractiveMnemonic }) {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <div className="widget-card widget-card--mnemonic">
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>🧠</span>
        <div className="widget-title">
          <span className="widget-label">Mnemonic forge</span>
          <span className="widget-sub">pick the one that sticks</span>
        </div>
        <span className="widget-counter">{payload.items.length}</span>
      </div>
      <div className="mnemonic-items">
        {payload.items.map((m, i) => {
          const meta = KIND_META[m.kind] || { icon: "💡", label: m.kind };
          const chosen = picked === String(i);
          return (
            <button
              key={i}
              type="button"
              className={`mnemonic-item ${chosen ? "mnemonic-item--picked" : ""}`}
              onClick={() => setPicked(chosen ? null : String(i))}
              aria-pressed={chosen}
            >
              <span className="mnemonic-head">
                <span aria-hidden>{meta.icon}</span>
                <span className="mnemonic-kind">{meta.label}</span>
                {chosen && <span className="mnemonic-chose" aria-hidden>★</span>}
              </span>
              <span className="mnemonic-body"><Markdown>{m.body}</Markdown></span>
              {m.covers?.length > 0 && (
                <span className="mnemonic-covers">{m.covers.join(" · ")}</span>
              )}
            </button>
          );
        })}
      </div>
  </div>
  );
}