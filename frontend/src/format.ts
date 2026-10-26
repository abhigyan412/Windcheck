const UK = "Europe/London";

const mwFmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const gwhFmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

export function formatMW(v: number | null | undefined, signed = false): string {
  if (v === null || v === undefined) return "–";
  const s = mwFmt.format(Math.round(v));
  return `${signed && v > 0 ? "+" : ""}${s} MW`;
}

export function formatGW(v: number | null | undefined, signed = false): string {
  if (v === null || v === undefined) return "–";
  return `${signed && v > 0 ? "+" : ""}${gwhFmt.format(v / 1000)} GW`;
}

export function formatGWh(mwh: number | null | undefined): string {
  if (mwh === null || mwh === undefined) return "–";
  return `${gwhFmt.format(mwh / 1000)} GWh`;
}

export function formatPct(v: number | null | undefined): string {
  return v === null || v === undefined ? "–" : `${v.toFixed(1)}%`;
}

export function formatUKTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: UK,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatUKDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: UK,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatUKDay(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: UK, day: "numeric", month: "short" }).format(
    new Date(iso),
  );
}

/** "2026-01-26T09:20:00Z" -> "2026-01-26T09:20" in UK local time, for datetime-local inputs. */
export function toUKLocalInput(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: UK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Round axis ticks from 0 up to max, e.g. 0, 5000, 10000 … in MW. */
export function roundTicks(max: number, step: number): number[] {
  const top = Math.max(step, Math.ceil(max / step) * step);
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

/** "2026-01-27" -> "Tue 27 Jan" (a plain calendar date, no time zone shift). */
export function formatLongDay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
