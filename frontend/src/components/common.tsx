import { AlertTriangle, Sparkles } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

export function Skeleton({ height = 280 }: { height?: number }) {
  return <div className="skeleton" style={{ height }} aria-label="Loading" />;
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="banner error" role="alert">
      <AlertTriangle size={18} />
      <span>Something went wrong: {message}</span>
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="banner" role="status">
      <AlertTriangle size={18} style={{ flex: "none", marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

/** Card whose title is a question and whose subtitle is the answer. */
export function Card({
  kicker,
  title,
  answer,
  actions,
  children,
  className = "",
}: {
  kicker?: string;
  title: string;
  answer?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card reveal ${className}`}>
      <div className="card-head">
        <div>
          {kicker && <div className="card-kicker">{kicker}</div>}
          <h2>{title}</h2>
          {answer && <p className="answer">{answer}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Insight({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="insight reveal">
      <div className="insight-icon">
        <Sparkles size={18} />
      </div>
      <div>
        <div className="label">{label}</div>
        <p>{children}</p>
      </div>
    </div>
  );
}

export type Tone = "accent" | "forecast" | "safe" | "critical" | "good";

const TONES: Record<Tone, CSSProperties> = {
  accent: { "--kpi-accent": "var(--accent)", "--kpi-soft": "var(--accent-soft)" } as CSSProperties,
  forecast: {
    "--kpi-accent": "var(--forecast)",
    "--kpi-soft": "rgba(235, 104, 52, 0.12)",
  } as CSSProperties,
  safe: {
    "--kpi-accent": "var(--safe)",
    "--kpi-soft": "rgba(27, 175, 122, 0.12)",
  } as CSSProperties,
  critical: {
    "--kpi-accent": "var(--critical)",
    "--kpi-soft": "var(--critical-soft)",
  } as CSSProperties,
  good: { "--kpi-accent": "var(--good)", "--kpi-soft": "var(--good-soft)" } as CSSProperties,
};

export function Kpi({
  icon,
  label,
  value,
  caption,
  tone = "accent",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="kpi reveal" style={TONES[tone]}>
      <div className="kpi-top">
        <span className="kpi-icon">{icon}</span>
        {label}
      </div>
      <div className="kpi-value">{value}</div>
      {caption && <div className="kpi-caption">{caption}</div>}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
