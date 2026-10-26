import { useState } from "react";
import { api } from "../api";
import type { AccuracyQuery } from "../api";
import { formatGW, formatMW, formatPct } from "../format";
import type { Mode, RangeInfo } from "../types";
import { useApi, useDebounced } from "../useApi";
import { ErrorDistribution, HorizonChart, LevelChart } from "./AccuracyCharts";
import { Card, ErrorBanner, Loading, Segmented, Tile } from "./common";
import { GenerationChart } from "./GenerationChart";

export function AccuracyView({ range }: { range: RangeInfo }) {
  const [start, setStart] = useState(range.first_day);
  const [end, setEnd] = useState(range.last_day);
  const [mode, setMode] = useState<Mode>("dayahead");
  const [horizonInput, setHorizonInput] = useState(24);
  const horizon = useDebounced(horizonInput, 250);

  const validRange = start <= end;
  const q: AccuracyQuery = { start, end, mode, horizon };
  const key = JSON.stringify(q);

  const metrics = useApi(() => api.metrics(q), [key], validRange);
  const series = useApi(() => api.series(q), [key], validRange);
  const levels = useApi(() => api.byLevel(q), [key], validRange);
  const hist = useApi(() => api.histogram(q), [key], validRange);
  const horizons = useApi(() => api.byHorizon(start, end), [start, end], validRange);

  const m = metrics.data;
  const error = metrics.error ?? series.error ?? levels.error ?? hist.error ?? horizons.error;
  const which =
    mode === "dayahead"
      ? `the day-ahead forecast (latest before ${range.gate_closure_uk} UK on the day before)`
      : `the forecast made ${horizon} h ahead`;

  return (
    <>
      <Card title="Accuracy explorer" sub={`How wrong is ${which}?`}>
        <div className="controls">
          <label className="field">
            From
            <input
              type="date"
              value={start}
              min={range.first_day}
              max={range.last_day}
              onChange={(e) => e.target.value && setStart(e.target.value)}
            />
          </label>
          <label className="field">
            To
            <input
              type="date"
              value={end}
              min={range.first_day}
              max={range.last_day}
              onChange={(e) => e.target.value && setEnd(e.target.value)}
            />
          </label>
          <div className="field">
            Which forecast
            <Segmented
              label="Forecast selection"
              value={mode}
              onChange={setMode}
              options={[
                { value: "dayahead", label: "Day-ahead (at gate closure)" },
                { value: "horizon", label: "Fixed hours ahead" },
              ]}
            />
          </div>
          {mode === "horizon" && (
            <label className="field" style={{ minWidth: 220 }}>
              Forecast horizon: {horizonInput} h ahead
              <input
                type="range"
                min={0}
                max={range.max_horizon}
                value={horizonInput}
                onChange={(e) => setHorizonInput(Number(e.target.value))}
              />
            </label>
          )}
        </div>
        {!validRange && <div className="inline-error">“From” must be on or before “To”.</div>}
      </Card>

      {error && <ErrorBanner message={error} />}

      <div className="tiles">
        <Tile
          label="Typical miss (MAE)"
          value={m ? formatGW(m.mae) : "…"}
          caption={m ? `${formatPct(m.nmae)} of average wind · ${m.count} hours` : undefined}
        />
        <Tile
          label="Bias"
          value={m ? formatGW(m.bias, true) : "…"}
          caption={m ? `Forecast too high in ${formatPct(m.shortfall_freq)} of hours` : undefined}
        />
        <Tile
          label="Shortfall, worst 10%"
          value={m ? formatGW(m.shortfall_p90) : "…"}
          caption="90% of hours, wind fell short by less than this"
        />
        <Tile
          label="Safe-wind backtest"
          value={m ? formatPct(m.backtest_coverage) : "…"}
          caption={
            m
              ? `Day-ahead safe wind held this often (target 90%), learned only from the past. Same-period fit: ${formatPct(m.coverage)}`
              : undefined
          }
        />
      </div>

      <Card
        title="Forecast vs actual"
        sub="Hourly, with the 80% likely range and 90% safe wind learned from this period"
      >
        {series.data ? (
          <GenerationChart data={series.data} showActual confidence={0.9} height={340} />
        ) : (
          <Loading />
        )}
      </Card>

      <div className="grid-2">
        <Card
          title="Does buying later help?"
          sub="The fixed over-forecast barely changes with lead time; the uncertainty grows the further ahead you look."
        >
          {horizons.data ? (
            <HorizonChart rows={horizons.data} current={mode === "horizon" ? horizon : 24} />
          ) : (
            <Loading />
          )}
        </Card>
        <Card
          title="Over-forecast by wind level"
          sub="Windy hours are over-forecast most, likely because wind farms are curtailed when the grid is full."
        >
          {levels.data ? <LevelChart rows={levels.data} /> : <Loading />}
        </Card>
      </div>
      <div style={{ height: 16 }} />
      <Card
        title="How big are the misses?"
        sub={
          m
            ? `Hours by size of miss. Mean shortfall when short: ${formatMW(m.mean_shortfall)}.`
            : undefined
        }
      >
        {hist.data ? <ErrorDistribution bins={hist.data} /> : <Loading />}
      </Card>
    </>
  );
}
