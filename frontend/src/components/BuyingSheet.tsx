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

export function BuyingSheet({ sheet, request, showActual }: Props) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const hasDemand = sheet.totals.to_buy_mwh !== undefined && sheet.totals.to_buy_mwh !== null;
  const { totals } = sheet;

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
    <div>
      <div className="table-wrap">
        <table className="sheet">
          <thead>
            <tr>
              <th>Hour (UK)</th>
              <th>Forecast (MW)</th>
              <th>Safe wind (MW)</th>
              <th>Buffer (MW)</th>
              {hasDemand && <th>Demand (MW)</th>}
              {hasDemand && <th>To buy (MWh)</th>}
              {showActual && <th>Actual (MW)</th>}
              {showActual && <th>Safe wind held?</th>}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((r) => (
              <tr key={r.time}>
                <td>{r.hour}</td>
                <td>{n.format(r.forecast)}</td>
                <td>{n.format(r.safe_wind)}</td>
                <td>{n.format(r.buffer)}</td>
                {hasDemand && <td>{n.format(r.demand ?? 0)}</td>}
                {hasDemand && <td>{n.format(r.to_buy ?? 0)}</td>}
                {showActual && <td>{r.actual === null ? "–" : n.format(r.actual)}</td>}
                {showActual && (
                  <td>
                    {r.held === null ? (
                      "–"
                    ) : r.held ? (
                      <span className="held">✓ held</span>
                    ) : (
                      <span className="short">
                        ✗ short {n.format(r.safe_wind - (r.actual ?? 0))} MW
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td>{formatGWh(totals.forecast_mwh)}</td>
              <td>{formatGWh(totals.safe_mwh)}</td>
              <td>{formatGWh(totals.forecast_mwh - totals.safe_mwh)}</td>
              {hasDemand && <td />}
              {hasDemand && <td>{formatGWh(totals.to_buy_mwh)}</td>}
              {showActual && <td />}
              {showActual && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <p className="summary-line">
          {hasDemand ? (
            <>
              Buy <strong>{formatGWh(totals.to_buy_mwh)}</strong> for this day. Trusting the raw
              forecast would suggest only {formatGWh(totals.raw_to_buy_mwh)}.
            </>
          ) : (
            <>
              Count on <strong>{formatGWh(totals.safe_mwh)}</strong> of wind. Enter demand to see
              how much to buy.
            </>
          )}
        </p>
        <button type="button" className="secondary" onClick={exportCsv} disabled={exporting}>
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
      {exportError && <div className="inline-error">{exportError}</div>}
    </div>
  );
}
