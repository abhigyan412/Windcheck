import { Download } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { formatGWh } from "../format";
import type { BuyingSheet as Sheet, BuyingSheetRequest } from "../types";

const n = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

interface Props {
  sheet: Sheet;
  request: BuyingSheetRequest;
  showActual: boolean;
}

export function Formula({ hasDemand }: { hasDemand: boolean }) {
  return (
    <div className="formula">
      <span className="chip">Forecast</span>
      <span className="op">−</span>
      <span className="chip">Buffer</span>
      <span className="op">=</span>
      <span className="chip" style={{ color: "var(--safe)" }}>
        Safe wind
      </span>
      {hasDemand && (
        <>
          <span className="sep" />
          <span className="chip">Demand</span>
          <span className="op">−</span>
          <span className="chip" style={{ color: "var(--safe)" }}>
            Safe wind
          </span>
          <span className="op">=</span>
          <span className="chip" style={{ color: "var(--accent-ink)" }}>
            To buy
          </span>
        </>
      )}
    </div>
  );
}

export function BuyingSheet({ sheet, request, showActual }: Props) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const { totals } = sheet;
  const hasDemand = totals.to_buy_mwh !== undefined && totals.to_buy_mwh !== null;
  const extra = hasDemand ? (totals.to_buy_mwh ?? 0) - (totals.raw_to_buy_mwh ?? 0) : 0;

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      await api.buyingSheetCsv(request);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <Formula hasDemand={hasDemand} />

      <div className="totals">
        <div className="total">
          <div className="label">Forecast wind (day)</div>
          <div className="value">{formatGWh(totals.forecast_mwh)}</div>
          <div className="sub">What the raw forecast promises</div>
        </div>
        <div className="total">
          <div className="label">Safe wind (day)</div>
          <div className="value" style={{ color: "var(--safe)" }}>
            {formatGWh(totals.safe_mwh)}
          </div>
          <div className="sub">Buffer {formatGWh(totals.forecast_mwh - totals.safe_mwh)}</div>
        </div>
        {hasDemand && (
          <div className="total hero-total">
            <div className="label">Order for the auction</div>
            <div className="value" style={{ color: "var(--accent-ink)" }}>
              {formatGWh(totals.to_buy_mwh)}
            </div>
            <div className="sub">
              Raw forecast would buy {formatGWh(totals.raw_to_buy_mwh)} ({formatGWh(extra)} less)
            </div>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th>Hour (UK)</th>
              <th>Forecast</th>
              <th>
                <span className="op">−</span>Buffer
              </th>
              <th>
                <span className="op">=</span>Safe wind
              </th>
              {hasDemand && <th>Demand</th>}
              {hasDemand && (
                <th>
                  <span className="op">=</span>To buy
                </th>
              )}
              {showActual && <th>Actual wind</th>}
              {showActual && <th>Safe wind held?</th>}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r) => (
              <tr key={r.time}>
                <td className="key">{r.hour}</td>
                <td>{n.format(r.forecast)}</td>
                <td>{n.format(r.buffer)}</td>
                <td className="key" style={{ color: "var(--safe)" }}>
                  {n.format(r.safe_wind)}
                </td>
                {hasDemand && <td>{n.format(r.demand ?? 0)}</td>}
                {hasDemand && <td className="buy">{n.format(r.to_buy ?? 0)}</td>}
                {showActual && <td>{r.actual === null ? "–" : n.format(r.actual)}</td>}
                {showActual && (
                  <td>
                    {r.held === null ? (
                      "–"
                    ) : r.held ? (
                      <span className="tag good">✓ Covered</span>
                    ) : (
                      <span className="tag bad">
                        ✗ Short {n.format(r.safe_wind - (r.actual ?? 0))} MW
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Day total</td>
              <td>{formatGWh(totals.forecast_mwh)}</td>
              <td>{formatGWh(totals.forecast_mwh - totals.safe_mwh)}</td>
              <td>{formatGWh(totals.safe_mwh)}</td>
              {hasDemand && <td />}
              {hasDemand && <td>{formatGWh(totals.to_buy_mwh)}</td>}
              {showActual && <td />}
              {showActual && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span className="kpi-caption">
          All values in MW per hour; one-hour blocks, so MW = MWh. Totals in GWh.
        </span>
        <button type="button" className="btn" onClick={exportCsv} disabled={exporting}>
          <Download size={15} /> {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
      {exportError && <div className="inline-error">{exportError}</div>}
    </div>
  );
}
