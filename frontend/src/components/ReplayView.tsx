import {
  CheckCircle2,
  CloudLightning,
  Eye,
  EyeOff,
  ShieldCheck,
  Wind,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { formatGWh, formatLongDay, formatMW, formatUKDateTime, toUKLocalInput } from "../format";
import type { BuyingSheetRequest, Demand, RangeInfo, Replay } from "../types";
import { useApi } from "../useApi";
import { BuyingSheet } from "./BuyingSheet";
import { Card, ErrorBanner, Insight, Kpi, Notice, Segmented, Skeleton } from "./common";
import { DemandInput } from "./DemandInput";
import { GenerationChart } from "./GenerationChart";

function insightText(r: Replay, revealed: boolean, confidence: number): string {
  const s = r.summary;
  const pct = Math.round(confidence * 100);
  const plan =
    `The forecast issued ${formatUKDateTime(s.publish_time_used)} promised ` +
    `${formatGWh(s.forecast_mwh)} of wind. Plan on ${formatGWh(s.safe_mwh)} instead: ` +
    `a ${formatGWh(s.forecast_mwh - s.safe_mwh)} cushion that past errors say covers you ${pct}% of the time.`;
  if (!revealed || s.actual_mwh === null) return plan;
  const gap = s.forecast_mwh - s.actual_mwh;
  const direction = gap >= 0 ? "less" : "more";
  return (
    `${formatGWh(s.actual_mwh)} actually arrived: ${formatGWh(Math.abs(gap))} ${direction} than forecast. ` +
    `Planning on safe wind kept you covered in ${s.hours_held} of ${s.hours} hours.`
  );
}

export function ReplayView({ range }: { range: RangeInfo }) {
  const [day, setDay] = useState(range.default_day);
  const [decision, setDecision] = useState<string | null>(null); // null = gate closure
  const [confidence, setConfidence] = useState(0.9);
  const [revealed, setRevealed] = useState(false);
  const [demand, setDemand] = useState<Demand>(null);
  const [demandPending, setDemandPending] = useState(false);

  const replay = useApi(() => api.replay(day, decision, confidence), [day, decision, confidence]);
  const req: BuyingSheetRequest = {
    delivery_date: day,
    decision_time: decision,
    confidence,
    demand,
  };
  const sheet = useApi(() => api.buyingSheet(req), [JSON.stringify(req)]);

  const r = replay.data;
  const s = r?.summary;
  const pct = Math.round(confidence * 100);
  // "Met target" = covered at least as often as the confidence level asked for.
  const metTarget = s ? s.hours_held / s.hours >= confidence : false;

  function changeDay(value: string) {
    setDay(value);
    setDecision(null);
    setRevealed(false);
  }

  return (
    <div className="stack">
      <div className="hero reveal">
        <div>
          <span className="eyebrow">
            <CloudLightning size={14} /> Decision replay
          </span>
          <h1>How much wind could you count on for {formatLongDay(day)}?</h1>
          <p className="lede">
            Step into the trader&apos;s shoes: see exactly what was known when the order had to be
            placed, plan with a safety buffer, then reveal what really happened.
          </p>
        </div>
      </div>

      <div className="toolbar reveal">
        <label className="field">
          Delivery day
          <input
            className="input"
            type="date"
            value={day}
            min={range.first_day}
            max={range.last_day}
            onChange={(e) => e.target.value && changeDay(e.target.value)}
          />
        </label>
        <label className="field">
          <span>
            Order placed at <span className="hint">(default: auction deadline)</span>
          </span>
          <input
            className="input"
            type="datetime-local"
            value={decision ?? (r ? toUKLocalInput(r.decision_time) : "")}
            onChange={(e) => {
              setDecision(e.target.value || null);
              setRevealed(false);
            }}
          />
        </label>
        <div className="field">
          <span>
            How sure do you need to be?{" "}
            <span className="hint">Higher = fewer shortfalls, more spare power</span>
          </span>
          <Segmented
            label="Confidence"
            value={confidence}
            onChange={setConfidence}
            options={range.confidence_levels.map((c) => ({
              value: c,
              label: `${Math.round(c * 100)}%`,
            }))}
          />
        </div>
        <div className="toolbar-end">
          {s && <span className="badge">Forecast of {formatUKDateTime(s.publish_time_used)}</span>}
          <button type="button" className="btn primary" onClick={() => setRevealed((v) => !v)}>
            {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
            {revealed ? "Hide actual" : "Reveal what happened"}
          </button>
        </div>
      </div>

      {replay.error && <ErrorBanner message={replay.error} />}
      {r && s && (
        <Insight label={revealed ? "What happened" : "The plan"}>
          {insightText(r, revealed, confidence)}
        </Insight>
      )}
      {s?.fallback && (
        <Notice>
          Early January: there isn&apos;t a week of past errors yet, so this buffer is learned from
          the whole month. From 8 Jan onward it uses only errors known before the order.
        </Notice>
      )}

      {r && s ? (
        <div className="kpis">
          <Kpi
            tone="forecast"
            icon={<Wind size={15} />}
            label="Forecast promises"
            value={formatGWh(s.forecast_mwh)}
            caption="Raw forecast for the whole day"
          />
          <Kpi
            tone="safe"
            icon={<ShieldCheck size={15} />}
            label={`Safe wind · ${pct}% sure`}
            value={formatGWh(s.safe_mwh)}
            caption={
              <>
                Plan on this. Buffer <strong>{formatGWh(s.forecast_mwh - s.safe_mwh)}</strong>
              </>
            }
          />
          <Kpi
            tone={!revealed ? "accent" : metTarget ? "good" : "critical"}
            icon={revealed && !metTarget ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
            label="What actually arrived"
            value={revealed ? formatGWh(s.actual_mwh) : "Hidden"}
            caption={
              revealed ? (
                <>
                  <span className={`tag ${metTarget ? "good" : "bad"}`}>
                    Covered {s.hours_held}/{s.hours} h
                  </span>
                  {s.max_short ? ` worst gap ${formatMW(s.max_short)}` : ""}
                </>
              ) : (
                "Press “Reveal what happened”"
              )
            }
          />
        </div>
      ) : (
        replay.loading && <Skeleton height={120} />
      )}

      {r ? (
        <Card
          kicker={`${formatLongDay(day)} · hourly, UK time`}
          title="Forecast, likely range and safe wind"
          answer={
            revealed ? (
              <>
                The <strong>blue line</strong> is what really happened. Where it stays above the
                dashed green line, planning on safe wind covered you.
              </>
            ) : (
              <>
                Plan on the <strong>dashed green line</strong>, not the orange forecast. Press
                reveal to see how it played out.
              </>
            )
          }
        >
          <GenerationChart
            data={r.points}
            showActual={revealed}
            singleDay
            confidence={confidence}
          />
        </Card>
      ) : (
        replay.loading && <Skeleton height={380} />
      )}

      <Card
        kicker="Your order"
        title="Buying sheet"
        answer="One line per hour for the day-ahead auction: how much wind to count on and how much power to buy."
      >
        <div className="stack" style={{ gap: 14 }}>
          <DemandInput
            hours={r?.points.length ?? 24}
            onChange={(d, pending) => {
              setDemand(d);
              setDemandPending(pending);
            }}
          />
          {demandPending && (
            <p className="pending-note">
              Enter all {r?.points.length ?? 24} hourly demand values to see the{" "}
              <strong>Demand</strong> and <strong>To buy</strong> columns. Until then the sheet
              shows only how much wind to count on.
            </p>
          )}
          {sheet.error && <ErrorBanner message={sheet.error} />}
          {sheet.data ? (
            <BuyingSheet sheet={sheet.data} request={req} showActual={revealed} />
          ) : (
            sheet.loading && <Skeleton height={300} />
          )}
        </div>
      </Card>
    </div>
  );
}
