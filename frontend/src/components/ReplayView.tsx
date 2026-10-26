import { useState } from "react";
import { api } from "../api";
import { formatGWh, formatMW, formatUKDateTime, toUKLocalInput } from "../format";
import type { BuyingSheetRequest, Demand, RangeInfo } from "../types";
import { useApi } from "../useApi";
import { BuyingSheet } from "./BuyingSheet";
import { Card, ErrorBanner, Loading, Segmented, Tile } from "./common";
import { DemandInput } from "./DemandInput";
import { GenerationChart } from "./GenerationChart";

export function ReplayView({ range }: { range: RangeInfo }) {
  const [day, setDay] = useState(range.default_day);
  const [decision, setDecision] = useState<string | null>(null); // null = gate closure
  const [confidence, setConfidence] = useState(0.9);
  const [revealed, setRevealed] = useState(false);
  const [demand, setDemand] = useState<Demand>(null);

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

  function changeDay(value: string) {
    setDay(value);
    setDecision(null);
    setRevealed(false);
  }

  return (
    <>
      <Card
        title="Decision replay"
        sub={`Pick a delivery day. You see exactly what the trader saw at the decision time (default: day-ahead gate closure, ${range.gate_closure_uk} UK the day before), then reveal what actually happened.`}
      >
        <div className="controls">
          <label className="field">
            Delivery day
            <input
              type="date"
              value={day}
              min={range.first_day}
              max={range.last_day}
              onChange={(e) => e.target.value && changeDay(e.target.value)}
            />
          </label>
          <label className="field">
            Decision at (UK time)
            <input
              type="datetime-local"
              value={decision ?? (r ? toUKLocalInput(r.decision_time) : "")}
              onChange={(e) => {
                setDecision(e.target.value || null);
                setRevealed(false);
              }}
            />
          </label>
          <div className="field">
            How sure do you need to be?
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
          <button type="button" className="primary" onClick={() => setRevealed((v) => !v)}>
            {revealed ? "Hide actual" : "Reveal actual"}
          </button>
          {s && (
            <span className="badge">
              Forecast published {formatUKDateTime(s.publish_time_used)} UK
            </span>
          )}
        </div>
      </Card>

      {replay.error && <ErrorBanner message={replay.error} />}
      {s?.fallback && (
        <div className="banner">
          Early January: there isn't a week of past errors yet, so this buffer is learned from the
          whole month. From 8 Jan onward it only uses errors known before the decision.
        </div>
      )}

      {r && s && (
        <>
          <div className="tiles">
            <Tile
              label="Forecast for the day"
              value={formatGWh(s.forecast_mwh)}
              caption="What the raw forecast promises"
            />
            <Tile
              label={`Safe wind (${Math.round(confidence * 100)}% sure)`}
              value={formatGWh(s.safe_mwh)}
              caption={`Plan on this. Buffer: ${formatGWh(s.forecast_mwh - s.safe_mwh)}`}
            />
            <Tile
              label="What happened"
              value={revealed ? formatGWh(s.actual_mwh) : "?"}
              caption={
                revealed
                  ? `Safe wind held in ${s.hours_held} of ${s.hours} hours` +
                    (s.max_short ? ` · worst miss ${formatMW(s.max_short)}` : "")
                  : "Press “Reveal actual”"
              }
            />
          </div>

          <Card title="Wind for the delivery day" sub="Hourly, UK time">
            <GenerationChart
              data={r.points}
              showActual={revealed}
              singleDay
              confidence={confidence}
            />
          </Card>
        </>
      )}
      {replay.loading && !r && <Loading />}

      <Card
        title="Buying sheet"
        sub="Hour by hour: how much wind to count on and how much power to buy. To buy = demand − safe wind."
      >
        <DemandInput hours={r?.points.length ?? 24} onChange={setDemand} />
        <div style={{ height: 12 }} />
        {sheet.error && <ErrorBanner message={sheet.error} />}
        {sheet.data ? (
          <BuyingSheet sheet={sheet.data} request={req} showActual={revealed} />
        ) : (
          sheet.loading && <Loading />
        )}
      </Card>
    </>
  );
}
