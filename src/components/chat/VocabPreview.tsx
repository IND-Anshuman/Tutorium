"use client";

// VocabPreview — a domain-keyword chip cloud. Used when the tutor suggests
// curriculum terms to add to Speechmatics' dictionary.
export default function VocabPreview({ topic, terms }: { topic?: string; terms: string[] }) {
  if (!terms?.length) return null;
  return (
    <div className="widget-card widget-card--vocab">
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>📖</span>
        <div className="widget-title">
          <span className="widget-label">Vocab to recognize</span>
          <span className="widget-sub">{topic ? `for ${topic}` : "for this topic"}</span>
        </div>
        <span className="widget-counter">{terms.length}</span>
      </div>
      <div className="vocab-cloud">
        {terms.map((t) => (
          <span key={t} className="vocab-chip">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
