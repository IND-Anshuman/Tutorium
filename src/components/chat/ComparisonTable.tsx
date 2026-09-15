"use client";

export default function ComparisonTable({
  headers,
  rows,
  topic,
}: {
  headers: string[];
  rows: string[][];
  topic?: string;
}) {
  if (!rows?.length) return null;
  return (
    <div className="widget-card widget-card--compare">
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>⚖️</span>
        <div className="widget-title">
          <span className="widget-label">Side by side</span>
          {topic && <span className="widget-sub">{topic}</span>}
        </div>
        <span className="widget-counter">{rows.length}</span>
      </div>
      <div className="compare-row">
        {headers.slice(0, 2).map((h, i) => (
          <div key={i} className="compare-cell compare-cell--head">{h}</div>
        ))}
        {rows.map((row, ri) => (
          <div key={ri} className="compare-pair">
            <div className="compare-cell">{row[0]}</div>
            <div className="compare-cell">{row[1]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
