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

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as GenerationPoint & { showActual: boolean };
  const err = p.actual !== null && p.showActual ? p.forecast - p.actual : null;
  return (
    <div className="chart-tooltip">
      <div className="t">{formatUKDateTime(p.time)} UK</div>
      <div className="row">
        <span>Forecast</span>
        <span>{formatMW(p.forecast)}</span>
      </div>
      <div className="row">
        <span>Safe wind</span>
        <span>{formatMW(p.safe_wind)}</span>
      </div>
      <div className="row">
        <span>Likely range</span>
        <span>
          {formatMW(p.band_low)} – {formatMW(p.band_high)}
        </span>
      </div>
      {p.showActual && (
        <div className="row">
          <span>Actual</span>
          <span>{formatMW(p.actual)}</span>
        </div>
      )}
      {err !== null && (
        <div className="row">
          <span>Error</span>
          <span>
            {formatMW(err, true)} {err > 0 ? "(too high)" : "(too low)"}
          </span>
        </div>
      )}
      {p.publishTime && (
        <div className="row">
          <span>Forecast from</span>
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
        <i className="swatch band" style={{ background: "var(--forecast)" }} /> Likely range (
        {100 - 2 * (100 - pct)}% band)
      </span>
      <span style={{ color: "var(--safe)" }}>
        <i className="swatch dashed" />
        <span style={{ color: "var(--text-2)" }}>Safe wind ({pct}% sure)</span>
      </span>
      {showActual && (
        <span>
          <i className="swatch" style={{ background: "var(--actual)" }} /> Actual
        </span>
      )}
    </div>
  );
}

export function GenerationChart({ data, showActual, singleDay, confidence, height = 320 }: Props) {
  const rows = data.map((d) => ({ ...d, band: [d.band_low, d.band_high], showActual }));
  const peak = Math.max(0, ...data.map((d) => Math.max(d.band_high, d.forecast, d.actual ?? 0)));
  const ticks = roundTicks(peak, 5000);
  return (
    <div>
      <GenerationLegend showActual={showActual} confidence={confidence} />
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={singleDay ? formatUKTime : formatUKDay}
            stroke="var(--axis)"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            minTickGap={24}
          />
          <YAxis
            ticks={ticks}
            domain={[0, ticks[ticks.length - 1]]}
            tickFormatter={(v: number) => `${v / 1000}`}
            stroke="var(--axis)"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            width={40}
            label={{
              value: "GW",
              angle: -90,
              position: "insideLeft",
              fill: "var(--muted)",
              fontSize: 12,
            }}
          />
          <Tooltip content={<ChartTooltip />} />
          <Area
            dataKey="band"
            stroke="none"
            fill="var(--forecast)"
            fillOpacity={0.18}
            isAnimationActive={false}
            activeDot={false}
          />
          <Line
            dataKey="forecast"
            stroke="var(--forecast)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="safe_wind"
            stroke="var(--safe)"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            isAnimationActive={false}
          />
          {showActual && (
            <Line
              dataKey="actual"
              stroke="var(--actual)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
