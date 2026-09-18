"use client";

import { useState } from "react";
import type { InteractiveDocument } from "@/lib/types";

const DRILL_LABEL: Record<string, string> = {
  quiz: "🧠 Mixed quiz",
  flashcards: "🃏 Flashcards",
  say_it_back: "🎙️ Say-it-back drill",
  teach_back: "🗣️ Teach it back",
};

export default function DocumentCard({ payload }: { payload: InteractiveDocument }) {
  const [openDay, setOpenDay] = useState<number | null>(1);
  const { docTitle, pageCount, summary, keyTerms, sections, difficulty, prerequisites, plan } = payload;

  return (
    <div className="widget-card widget-card--doc">
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>📄</span>
        <div className="widget-title">
          <span className="widget-label">{docTitle}</span>
          <span className="widget-sub">
            {pageCount ? `${pageCount} pages · ` : ""}{difficulty || "intermediate"}
            {prerequisites?.length ? ` · needs: ${prerequisites.slice(0, 3).join(", ")}` : ""}
          </span>
        </div>
        {keyTerms?.length > 0 && <span className="widget-counter">{keyTerms.length} terms</span>}
      </div>

      <p className="doc-summary">{summary}</p>

      {keyTerms?.length > 0 && (
        <div className="doc-terms">
          {keyTerms.map((t) => (
            <span key={t} className="doc-term">{t}</span>
          ))}
        </div>
      )}

      {sections?.length > 0 && (
        <div className="doc-sections">
          {sections.slice(0, 8).map((s) => (
            <div key={s.title} className="doc-section">
              <span className="doc-section-title">{s.title}</span>
              <span className="doc-section-body">{s.summary}</span>
            </div>
          ))}
        </div>
      )}

      {plan?.length > 0 && (
        <div className="doc-plan">
          <span className="doc-plan-title">Study plan</span>
          {plan.map((d) => (
            <div key={d.day} className={`doc-plan-day ${openDay === d.day ? "doc-plan-day--open" : ""}`}>
              <button
                type="button"
                className="doc-plan-head"
                onClick={() => setOpenDay(openDay === d.day ? null : d.day)}
                aria-expanded={openDay === d.day}
              >
                <span>Day {d.day} — {d.focus}</span>
                <span className="doc-plan-meta">{d.minutes} min</span>
              </button>
              {openDay === d.day && (
                <div className="doc-plan-body">
                  <ul>
                    {d.tasks.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                  {d.drill && <span className="doc-plan-drill">{DRILL_LABEL[d.drill] || d.drill}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}