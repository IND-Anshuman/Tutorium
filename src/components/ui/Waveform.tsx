"use client";

// Voice waveform — the memorable voice-forward anchor. Animated bars convey
// "listening" + "speaking" states. Reduced-motion is handled in globals.css
// (the wave-keyframes are disabled under prefers-reduced-motion).

const BARS = 7;

export default function Waveform({ active, color = "var(--lamp)" }: { active: boolean; color?: string }) {
  const bars = Array.from({ length: BARS }, (_, i) => {
    const r = ((i * 37) % 10) / 10;
    return 0.35 + r * 0.55; // stable per-bar height 0.35–0.9
  });

  return (
    <span role="img" aria-label={active ? "Listening" : "Voice ready"} className="wave" data-active={active} style={{ height: 20 }}>
      {bars.map((h, i) => (
        <span
          key={i}
          className="wave-bar"
          style={{ height: `${h * 100}%`, background: color, animationDelay: `${i * 90}ms` }}
        />
      ))}
    </span>
  );
}