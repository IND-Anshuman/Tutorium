"use client";

interface InfoCard {
  icon?: string;
  title: string;
  body: string;
}

export default function InfoCards({ items, topic }: { items: InfoCard[]; topic?: string }) {
  if (!items?.length) return null;
  return (
    <div className="widget-card widget-card--info">
      <div className="widget-head">
        <span className="widget-icon" aria-hidden>💡</span>
        <div className="widget-title">
          <span className="widget-label">Key ideas</span>
          {topic && <span className="widget-sub">{topic}</span>}
        </div>
        <span className="widget-counter">{items.length}</span>
      </div>
      <div className="info-grid">
        {items.map((it, i) => (
          <div key={i} className="info-tile">
            {it.icon && <div className="info-tile-icon" aria-hidden>{it.icon}</div>}
            <div className="info-tile-label">{it.title}</div>
            <div className="info-tile-value">{it.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
