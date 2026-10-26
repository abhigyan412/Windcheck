import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import { formatMW, formatUKDateTime, formatUKDay, formatUKTime, roundTicks } from "../format";

export interface GenerationPoint {
  time: string;
  forecast: number;
  band_low: number;
  band_high: number;
  safe_wind: number;
  actual: number | null;
  publishTime?: string;
}

interface Props {
  data: GenerationPoint[];
  showActual: boolean;
  /** Single day: label the axis with hours; otherwise with dates. */
  singleDay?: boolean;
  confidence: number;
  height?: number;
}

const dot = (color: string) => (
  <i className="swatch block" style={{ background: color, width: 8, height: 8 }} />
);

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as GenerationPoint & { showActual: boolean };
  const err = p.actual !== null && p.showActual ? p.forecast - p.actual : null;
  return (
    <div className="chart-tooltip">
      <div className="t">{formatUKDateTime(p.time)}</div>
      <div className="row">
        <span>{dot("var(--forecast)")} Forecast</span>
        <span>{formatMW(p.forecast)}</span>
      </div>
      <div className="row">
        <span>{dot("var(--safe)")} Safe wind</span>
        <span>{formatMW(p.safe_wind)}</span>
      </div>
      {p.showActual && (
        <div className="row">
          <span>{dot("var(--actual)")} Actual</span>
          <span>{formatMW(p.actual)}</span>
        </div>
      )}
      <div className="row">
        <span>Likely range</span>
        <span>
          {formatMW(p.band_low)} – {formatMW(p.band_high)}
        </span>
      </div>
      {err !== null && (
        <div className="row emph">
          <span>{err > 0 ? "Less wind than forecast" : "More wind than forecast"}</span>
          <span style={{ color: err > 0 ? "var(--critical)" : "var(--good-text)" }}>
            {formatMW(Math.abs(err))}
          </span>
        </div>
      )}
      {p.publishTime && (
        <div className="row" style={{ marginTop: 4, color: "var(--muted)" }}>
          <span>Forecast issued</span>
          <span>{formatUKDateTime(p.publishTime)}</span>
        </div>
      )}
    </div>
  );
}

export function GenerationLegend({
  showActual,
  confidence,
}: {
  showActual: boolean;
  confidence: number;
}) {
  const pct = Math.round(confidence * 100);
  return (
    <div className="legend">
      <span>
        <i className="swatch" style={{ background: "var(--forecast)" }} /> Forecast
      </span>
      <span>
        <i className="swatch band" style={{ background: "var(--forecast)" }} /> Likely range
      </span>
      <span>
        <i className="swatch dashed" /> Safe wind ({pct}% sure)
      </span>
      {showActual && (
        <span>
          <i className="swatch" style={{ background: "var(--actual)" }} /> Actual
        </span>
      )}
    </div>
  );
}

export function GenerationChart({ data, showActual, singleDay, confidence, height = 340 }: Props) {
  const gid = useId().replace(/:/g, "");
  const rows = data.map((d) => ({ ...d, band: [d.band_low, d.band_high], showActual }));
  const peak = Math.max(0, ...data.map((d) => Math.max(d.band_high, d.forecast, d.actual ?? 0)));
  const ticks = roundTicks(peak, 5000);
  return (
    <div>
      <GenerationLegend showActual={showActual} confidence={confidence} />
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`band-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--forecast)", stopOpacity: 0.28 }} />
              <stop offset="100%" style={{ stopColor: "var(--forecast)", stopOpacity: 0.08 }} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={singleDay ? formatUKTime : formatUKDay}
            stroke="var(--axis)"
            tickLine={false}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            minTickGap={28}
          />
          <YAxis
            ticks={ticks}
            domain={[0, ticks[ticks.length - 1]]}
            tickFormatter={(v: number) => `${v / 1000} GW`}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            width={52}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
          />
          <Area
            dataKey="band"
            stroke="none"
            fill={`url(#band-${gid})`}
            isAnimationActive={false}
            activeDot={false}
          />
          <Line
            dataKey="forecast"
            stroke="var(--forecast)"
            strokeWidth={2.25}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            isAnimationActive={false}
          />
          <Line
            dataKey="safe_wind"
            stroke="var(--safe)"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            isAnimationActive={false}
          />
          {showActual && (
            <Line
              dataKey="actual"
              stroke="var(--actual)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4.5, strokeWidth: 2, stroke: "var(--surface)" }}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
