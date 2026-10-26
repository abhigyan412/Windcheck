import { ChevronRight, Gauge, ShieldCheck, Target, TrendingUp, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import type { AccuracyQuery } from "../api";
import { formatGW, formatMW, formatPct } from "../format";
import type { HistogramBin, HorizonRow, LevelRow, Metrics, Mode, RangeInfo } from "../types";
import { useApi, useDebounced } from "../useApi";
import { ErrorDistribution, HorizonChart, LevelChart } from "./AccuracyCharts";
import { Card, ErrorBanner, Insight, Kpi, Segmented, Skeleton } from "./common";
import { GenerationChart } from "./GenerationChart";

function horizonAnswer(rows: HorizonRow[]) {
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return null;
  return (
    <>
      <strong>Not really.</strong> Even 1 hour ahead the forecast is{" "}
      <strong>{formatGW(first.bias)} too high</strong>, so waiting doesn&apos;t fix the bias. What
      grows is uncertainty: from {formatGW(first.spread)} to {formatGW(last.spread)} at{" "}
      {last.horizon} hours ahead.
    </>
  );
}

function levelAnswer(rows: LevelRow[]) {
  const valid = rows.filter((r) => r.bias !== null && r.count > 0);
  if (!valid.length) return null;
  const worst = valid.reduce((a, b) => ((b.bias ?? 0) > (a.bias ?? 0) ? b : a));
  const best = valid.reduce((a, b) => ((b.bias ?? 0) < (a.bias ?? 0) ? b : a));
  return (
    <>
      <strong>When it&apos;s very windy.</strong> If the forecast says {worst.bucket}, it is{" "}
      <strong>{formatGW(worst.bias)} too high</strong> on average, versus {formatGW(best.bias)} when
      it says {best.bucket}. Likely cause: wind farms are switched off (curtailed) when the grid is
      full.
    </>
  );
}

function histogramAnswer(bins: HistogramBin[], m: Metrics | null) {
  const total = bins.reduce((s, b) => s + b.count, 0);
  if (!total) return null;
  const short = bins.filter((b) => b.from >= 0).reduce((s, b) => s + b.count, 0);
  const top = bins.reduce((a, b) => (b.count > a.count ? b : a));
  const range = `${Math.abs(top.from) / 1000}–${Math.abs(top.to) / 1000} GW`;
  return (
    <>
      In <strong>{Math.round((short / total) * 100)}% of hours</strong> less wind arrived than
      forecast. The most common miss was <strong>{range}</strong>
      {top.from >= 0 ? " short" : " spare"}
      {m?.mean_shortfall ? `; when short, by ${formatMW(m.mean_shortfall)} on average.` : "."}
    </>
  );
}

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
      ? "day-ahead forecast (the one available at the auction deadline)"
      : `forecast made ${horizon} hours ahead`;

  return (
    <div className="stack">
      <div className="hero reveal">
        <div>
          <span className="eyebrow">
            <Target size={14} /> Forecast accuracy
          </span>
          <h1>Can you trust the wind forecast?</h1>
          <p className="lede">
            Every hour of the period, forecast against what actually happened. The short answer is
            at the top; the evidence is below.
          </p>
        </div>
      </div>

      <div className="toolbar reveal">
        <label className="field">
          From
          <input
            className="input"
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
            className="input"
            type="date"
            value={end}
            min={range.first_day}
            max={range.last_day}
            onChange={(e) => e.target.value && setEnd(e.target.value)}
          />
        </label>
        <div className="field">
          Which forecast to judge
          <Segmented
            label="Forecast selection"
            value={mode}
            onChange={setMode}
            options={[
              { value: "dayahead", label: "At the auction deadline" },
              { value: "horizon", label: "Made N hours ahead" },
            ]}
          />
        </div>
        {mode === "horizon" && (
          <label className="field" style={{ flex: "1 1 240px" }}>
            <span>
              Made <strong>{horizonInput} hours</strong> before delivery{" "}
              <span className="hint">(drag)</span>
            </span>
            <input
              type="range"
              min={0}
              max={range.max_horizon}
              value={horizonInput}
              onChange={(e) => setHorizonInput(Number(e.target.value))}
            />
          </label>
        )}
        {!validRange && (
          <div className="inline-error" style={{ flexBasis: "100%" }}>
            “From” must be on or before “To”.
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {m && m.count > 0 && (
        <Insight label="The short answer">
          The {which} was <strong>too high in {formatPct(m.shortfall_freq)} of hours</strong>, by{" "}
          <strong>{formatGW(m.bias)}</strong> on average. Always plan on less wind than it says. Our
          safe-wind rule did exactly that and held <strong>{formatPct(m.backtest_coverage)}</strong>{" "}
          of the time, using only information available at the time.
        </Insight>
      )}

      {m ? (
        <div className="kpis">
          <Kpi
            icon={<Gauge size={15} />}
            label="Typical miss"
            value={formatGW(m.mae)}
            caption={
              <>
                {formatPct(m.nmae)} of average wind · {m.count} hours
              </>
            }
          />
          <Kpi
            tone="forecast"
            icon={<TrendingUp size={15} />}
            label="Too high on average"
            value={formatGW(m.bias, true)}
            caption={
              <>
                Over-forecast in <strong>{formatPct(m.shortfall_freq)}</strong> of hours
              </>
            }
          />
          <Kpi
            tone="critical"
            icon={<TriangleAlert size={15} />}
            label="Bad-hour shortfall"
            value={formatGW(m.shortfall_p90)}
            caption="9 hours in 10, the shortfall was smaller than this"
          />
          <Kpi
            tone="good"
            icon={<ShieldCheck size={15} />}
            label="Safe-wind rule held"
            value={formatPct(m.backtest_coverage)}
            caption={
              <>
                Target 90% · tested day-ahead, no hindsight
                {mode === "horizon" && (
                  <>
                    {" "}
                    <span className="tag neutral">day-ahead method</span>
                  </>
                )}
              </>
            }
          />
        </div>
      ) : (
        validRange && <Skeleton height={130} />
      )}

      <Card
        kicker="The evidence"
        title="What was forecast vs what arrived"
        answer={
          <>
            The <strong>orange forecast</strong> sits above the <strong>blue actual</strong> almost
            all month, and the gap is widest at the windy peaks.
          </>
        }
      >
        {series.data ? (
          <GenerationChart data={series.data} showActual confidence={0.9} height={360} />
        ) : (
          <Skeleton height={380} />
        )}
      </Card>

      <div className="grid-2">
        <Card
          kicker="Question"
          title="Does waiting for a newer forecast help?"
          answer={horizons.data ? horizonAnswer(horizons.data) : null}
        >
          {horizons.data ? (
            <HorizonChart rows={horizons.data} current={mode === "horizon" ? horizon : 24} />
          ) : (
            <Skeleton height={260} />
          )}
        </Card>
        <Card
          kicker="Question"
          title="When is the forecast most wrong?"
          answer={levels.data ? levelAnswer(levels.data) : null}
        >
          {levels.data ? <LevelChart rows={levels.data} /> : <Skeleton height={276} />}
        </Card>
      </div>

      <details className="more reveal">
        <summary>
          <ChevronRight size={18} className="chev" />
          More detail: how big are the misses?
          <span className="hint">Every hour, sorted by how wrong the forecast was</span>
        </summary>
        <div className="more-body">
          <p className="detail-answer">{hist.data ? histogramAnswer(hist.data, m) : null}</p>
          {hist.data ? <ErrorDistribution bins={hist.data} /> : <Skeleton height={240} />}
        </div>
      </details>
    </div>
  );
}
