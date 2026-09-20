"use client";

// SessionsRail — left-rail UI for switching sessions and starting new ones.
// Mobile: rendered as a slide-in drawer (open/closed); desktop: a static rail.

import { useCallback, useEffect, useState } from "react";

interface SessionRow {
  id: string;
  domain: string;
  domain_locked: number;
  status: string;
  topic_count: number;
  created_at: string;
  updated_at: string;
}

export default function SessionsRail({
  currentSessionId,
  open,
  onClose,
}: {
  currentSessionId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/sessions?userId=demo-user");
        const d = await r.json();
        if (!cancelled) setSessions(d.sessions || []);
      } catch {
        /* rail stays as-is on transient failures */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const startNew = useCallback(async () => {
    setCreating(true);
    try {
      const r = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "demo-user", domain: "" }),
      });
      const d = await r.json();
      // Navigate to the new session — preserves "start fresh" UX.
      window.location.href = `/?session=${d.id}`;
    } finally {
      setCreating(false);
    }
  }, []);

  return (
    <aside
      className="rail"
      data-open={open ? "true" : "false"}
      aria-label="Sessions"
    >
      <div className="rail-head">
        <span className="rail-title">Sessions</span>
        <button className="rail-close" onClick={onClose} aria-label="Close sessions">
          ×
        </button>
      </div>
      <button
        className="rail-new"
        onClick={startNew}
        disabled={creating}
        aria-label="Start a new session"
      >
        {creating ? "Creating…" : "+ New session"}
      </button>
      <div className="rail-list" role="list">
        {loading && sessions.length === 0 && (
          <div className="rail-empty">Loading…</div>
        )}
        {!loading && sessions.length === 0 && (
          <div className="rail-empty">
            No sessions yet. Press <strong>+ New session</strong> to start.
          </div>
        )}
        {sessions.map((s) => {
          const isCurrent = s.id === currentSessionId;
          return (
            <a
              key={s.id}
              href={isCurrent ? "#" : `/?session=${s.id}`}
              className={`rail-item${isCurrent ? " current" : ""}`}
              role="listitem"
              aria-current={isCurrent ? "true" : "false"}
              onClick={(e) => {
                if (isCurrent) e.preventDefault();
              }}
            >
              <div className="rail-item-row">
                <span className="rail-domain">{s.domain || "New session"}</span>
                {s.status === "closed" && (
                  <span className="badge" style={{ color: "var(--ink-3)" }}>closed</span>
                )}
              </div>
              <div className="rail-item-meta">
                {s.topic_count} topic{s.topic_count !== 1 ? "s" : ""} ·{" "}
                {new Date(s.updated_at).toLocaleDateString()}
              </div>
            </a>
          );
        })}
      </div>
    </aside>
  );
}