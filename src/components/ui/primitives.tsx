"use client";

// Tiny shared UI vocabulary — one set of primitives every screen reuses so the
// product register stays consistent (same button, same control, same icon).

export function StatusDot({ status }: { status: "ok" | "warn" | "danger" | "idle" }) {
  const color =
    status === "ok" ? "var(--success)" : status === "warn" ? "var(--warning)" : status === "danger" ? "var(--danger)" : "var(--ink-3)";
  return <span className="dot" style={{ background: color, boxShadow: `0 0 0 3px ${color}22` }} aria-hidden />;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "brand" | "lamp" | "ok" | "warn" | "danger" }) {
  const border = tone === "brand" ? "var(--brand)" : tone === "lamp" ? "var(--lamp)" : tone === "ok" ? "var(--success)" : tone === "warn" ? "var(--warning)" : tone === "danger" ? "var(--danger)" : "var(--border)";
  const color = tone === "brand" ? "var(--brand)" : tone === "lamp" ? "var(--lamp)" : tone === "ok" ? "var(--success)" : tone === "warn" ? "var(--warning)" : tone === "danger" ? "var(--danger)" : "var(--ink-2)";
  return (
    <span className="badge" style={{ borderColor: border, color }}>
      {children}
    </span>
  );
}

export function Skeleton({ w, h = 14, style }: { w?: string; h?: number; style?: React.CSSProperties }) {
  return <span className="skeleton" style={{ width: w || "100%", height: h, display: "inline-block", ...style }} />;
}

export function EmptyState({
  icon,
  title,
  body,
  actions,
}: {
  icon?: string;
  title: string;
  body: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      {icon && <div className="mb-4 text-5xl" aria-hidden>{icon}</div>}
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>{body}</p>
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}