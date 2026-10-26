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
import { formatMW, roundTicks } from "../format";
import type { HistogramBin, HorizonRow, LevelRow } from "../types";

const axis = { stroke: "var(--axis)", tick: { fill: "var(--muted)", fontSize: 12 } };
const gwTick = (v: number) => `${v / 1000}`;

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
        title={`${r.horizon} h ahead`}
        rows={[
          ["Bias (avg too high)", formatMW(r.bias, true)],
          ["Spread (P90 − P10)", formatMW(r.spread)],
          ["Typical miss (MAE)", formatMW(r.mae)],
        ]}
      />
    );
  };
  return (
    <>
      <div className="legend">
        <span>
          <i className="swatch" style={{ background: "var(--forecast)" }} /> Bias: fixed
          over-forecast
        </span>
        <span>
          <i className="swatch" style={{ background: "var(--actual)" }} /> Spread: uncertainty (P90
          − P10)
        </span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 12, left: 8 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="horizon"
            {...axis}
            label={{
              value: "hours ahead",
              position: "insideBottom",
              offset: -6,
              fill: "var(--muted)",
              fontSize: 12,
            }}
          />
          <YAxis tickFormatter={gwTick} {...axis} width={40} domain={[0, "auto"]} />
          <Tooltip content={tip} />
          <ReferenceLine x={current} stroke="var(--muted)" strokeDasharray="3 3" />
          <Line
            dataKey="bias"
            stroke="var(--forecast)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="spread"
            stroke="var(--actual)"
            strokeWidth={2}
            dot={false}
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
        title={`Forecast ${r.bucket}`}
        rows={[
          ["Avg too high", formatMW(r.bias, true)],
          ["Hours", String(r.count)],
        ]}
      />
    );
  };
  const ticks = roundTicks(Math.max(0, ...rows.map((r) => r.bias ?? 0)), 1000);
  return (
    <ResponsiveContainer width="100%" height={262}>
      <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="var(--grid)" vertical={false} />
        <XAxis dataKey="bucket" {...axis} />
        <YAxis
          tickFormatter={gwTick}
          ticks={ticks}
          domain={[0, ticks[ticks.length - 1]]}
          {...axis}
          width={40}
          label={{
            value: "GW",
            angle: -90,
            position: "insideLeft",
            fill: "var(--muted)",
            fontSize: 12,
          }}
        />
        <Tooltip content={tip} cursor={{ fill: "var(--surface-2)" }} />
        <Bar
          dataKey="bias"
          fill="var(--forecast)"
          radius={[4, 4, 0, 0]}
          maxBarSize={56}
          isAnimationActive={false}
          label={{
            position: "top",
            fill: "var(--text-2)",
            fontSize: 12,
            // Unit lives on the axis; a unit here wraps onto a second line.
            formatter: (v: number) => `${v > 0 ? "+" : ""}${(v / 1000).toFixed(1)}`,
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ErrorDistribution({ bins }: { bins: HistogramBin[] }) {
  const rows = bins.map((b) => ({ ...b, mid: (b.from + b.to) / 2, short: b.from >= 0 }));
  const tip = ({ active, payload }: TooltipProps<number, string>) => {
    if (!active || !payload?.length) return null;
    const r = payload[0].payload as (typeof rows)[number];
    return (
      <Tip
        title={`${formatMW(r.from, true)} to ${formatMW(r.to, true)}`}
        rows={[
          [r.short ? "Forecast too high (short)" : "Forecast too low (spare)", `${r.count} hours`],
        ]}
      />
    );
  };
  return (
    <>
      <div className="legend">
        <span>
          <i className="swatch band" style={{ background: "var(--critical)", opacity: 1 }} />{" "}
          Forecast too high → you are short
        </span>
        <span>
          <i className="swatch band" style={{ background: "var(--neutral-bar)", opacity: 1 }} />{" "}
          Forecast too low → spare wind
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} barCategoryGap={2} margin={{ top: 8, right: 8, bottom: 12, left: 8 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="mid"
            tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v / 1000}`}
            {...axis}
            label={{
              value: "forecast − actual (GW)",
              position: "insideBottom",
              offset: -6,
              fill: "var(--muted)",
              fontSize: 12,
            }}
          />
          <YAxis {...axis} width={40} allowDecimals={false} />
          <Tooltip content={tip} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.from} fill={r.short ? "var(--critical)" : "var(--neutral-bar)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}
