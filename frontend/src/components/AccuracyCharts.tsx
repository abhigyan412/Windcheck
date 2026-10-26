import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import { formatGW, roundTicks } from "../format";
import type { HistogramBin, HorizonRow, LevelRow } from "../types";

const xAxis = {
  stroke: "var(--axis)",
  tickLine: false,
  tick: { fill: "var(--muted)", fontSize: 12 },
} as const;
const yAxis = {
  axisLine: false,
  tickLine: false,
  tick: { fill: "var(--muted)", fontSize: 12 },
  width: 52,
} as const;
const gwTick = (v: number) => `${v / 1000} GW`;
const cursorFill = { fill: "var(--surface-2)" };

function Tip({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="chart-tooltip">
      <div className="t">{title}</div>
      {rows.map(([k, v]) => (
        <div className="row" key={k}>
          <span>{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}

export function HorizonChart({ rows, current }: { rows: HorizonRow[]; current: number }) {
  const tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload as HorizonRow;
    return (
      <Tip
        title={`Forecast made ${r.horizon} h ahead`}
        rows={[
          ["Too high on average", formatGW(r.bias)],
          ["Uncertainty (P90 − P10)", formatGW(r.spread)],
          ["Typical miss", formatGW(r.mae)],
        ]}
      />
    );
  };
  const ticks = roundTicks(Math.max(0, ...rows.map((r) => r.spread ?? 0)), 2000);
  return (
    <>
      <div className="legend">
        <span>
          <i className="swatch" style={{ background: "var(--forecast)" }} /> Too high on average
          (bias)
        </span>
        <span>
          <i className="swatch" style={{ background: "var(--actual)" }} /> Uncertainty (spread)
        </span>
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 14, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="horizon"
            {...xAxis}
            ticks={[1, 6, 12, 18, 24, 30, 36, 42, 48]}
            label={{
              value: "hours before delivery the forecast was made",
              position: "insideBottom",
              offset: -8,
              fill: "var(--muted)",
              fontSize: 12,
            }}
          />
          <YAxis
            tickFormatter={gwTick}
            ticks={ticks}
            domain={[0, ticks[ticks.length - 1]]}
            {...yAxis}
          />
          <Tooltip content={tip} cursor={{ stroke: "var(--border-strong)" }} />
          <ReferenceLine x={current} stroke="var(--muted)" strokeDasharray="3 3" />
          <Line
            dataKey="bias"
            stroke="var(--forecast)"
            strokeWidth={2.25}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Line
            dataKey="spread"
            stroke="var(--actual)"
            strokeWidth={2.25}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}

export function LevelChart({ rows }: { rows: LevelRow[] }) {
  const tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload as LevelRow;
    return (
      <Tip
        title={`Forecast said ${r.bucket}`}
        rows={[
          ["Too high on average", formatGW(r.bias)],
          ["Hours in this group", String(r.count)],
        ]}
      />
    );
  };
  const ticks = roundTicks(Math.max(0, ...rows.map((r) => r.bias ?? 0)), 1000);
  return (
    <ResponsiveContainer width="100%" height={276}>
      <BarChart data={rows} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="bucket" {...xAxis} tickFormatter={(b: string) => `forecast ${b}`} />
        <YAxis
          tickFormatter={gwTick}
          ticks={ticks}
          domain={[0, ticks[ticks.length - 1]]}
          {...yAxis}
        />
        <Tooltip content={tip} cursor={cursorFill} />
        <Bar
          dataKey="bias"
          fill="var(--forecast)"
          radius={[6, 6, 0, 0]}
          maxBarSize={64}
          isAnimationActive={false}
          label={{
            position: "top",
            fill: "var(--text-2)",
            fontSize: 12,
            fontWeight: 600,
            // No unit here: a unit makes Recharts wrap the label onto two lines.
            formatter: (v: number) => `+${(v / 1000).toFixed(1)}`,
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

const gw = (mw: number) => `${Math.abs(mw) / 1000}`;

/** "1 to 1.5" style range label for a histogram bin, in GW. */
function binLabel(b: HistogramBin): string {
  return `${b.from < 0 ? "−" : ""}${gw(b.from)}–${b.to < 0 ? "−" : ""}${gw(b.to)}`;
}

export function ErrorDistribution({ bins }: { bins: HistogramBin[] }) {
  const total = bins.reduce((s, b) => s + b.count, 0) || 1;
  const rows = bins.map((b) => ({ ...b, label: binLabel(b), short: b.from >= 0 }));
  const tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload as (typeof rows)[number];
    const what = r.short
      ? `${gw(r.from)}–${gw(r.to)} GW less wind than forecast`
      : `${gw(r.to)}–${gw(r.from)} GW more wind than forecast`;
    return (
      <Tip
        title={what}
        rows={[
          ["Hours", String(r.count)],
          ["Share of hours", `${((r.count / total) * 100).toFixed(0)}%`],
        ]}
      />
    );
  };
  return (
    <>
      <div className="legend">
        <span>
          <i className="swatch block" style={{ background: "var(--critical)" }} /> Less wind than
          forecast → you&apos;d be short
        </span>
        <span>
          <i className="swatch block" style={{ background: "var(--neutral-bar)" }} /> More wind than
          forecast → spare power
        </span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} barCategoryGap={3} margin={{ top: 8, right: 8, bottom: 14, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="label"
            {...xAxis}
            interval="preserveStartEnd"
            minTickGap={10}
            label={{
              value: "forecast − actual (GW): right of 0 = less wind than forecast",
              position: "insideBottom",
              offset: -8,
              fill: "var(--muted)",
              fontSize: 12,
            }}
          />
          <YAxis {...yAxis} allowDecimals={false} tickFormatter={(v: number) => `${v} h`} />
          <Tooltip content={tip} cursor={cursorFill} />
          <Bar dataKey="count" radius={[5, 5, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.from} fill={r.short ? "var(--critical)" : "var(--neutral-bar)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
