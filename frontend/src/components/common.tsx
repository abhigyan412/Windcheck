import type { ReactNode } from "react";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="loading">{label}</div>;
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="banner error" role="alert">
      Something went wrong: {message}
    </div>
  );
}

export function Card({
  title,
  sub,
  children,
  actions,
}: {
  title: string;
  sub?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2>{title}</h2>
          {sub && <p className="sub">{sub}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Tile({
  label,
  value,
  caption,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {caption && <div className="caption">{caption}</div>}
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
