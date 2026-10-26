import type {
  BuyingSheet,
  BuyingSheetRequest,
  HistogramBin,
  HorizonRow,
  LevelRow,
  Metrics,
  Mode,
  RangeInfo,
  Replay,
  SeriesPoint,
} from "./types";

type Params = Record<string, string | number | null | undefined>;

export interface AccuracyQuery {
  start: string;
  end: string;
  mode: Mode;
  horizon: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, init);
  if (!resp.ok) {
    let message = `${resp.status} ${resp.statusText}`;
    try {
      const body = await resp.json();
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      // keep the status text
    }
    throw new Error(message);
  }
  return resp.json() as Promise<T>;
}

function get<T>(path: string, params: Params = {}): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") qs.set(k, String(v));
  }
  const query = qs.toString();
  return request<T>(query ? `${path}?${query}` : path);
}

function post(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const api = {
  range: () => get<RangeInfo>("/api/range"),
  series: (q: AccuracyQuery) => get<SeriesPoint[]>("/api/series", { ...q }),
  metrics: (q: AccuracyQuery) => get<Metrics>("/api/metrics", { ...q }),
  byHorizon: (start: string, end: string) =>
    get<HorizonRow[]>("/api/metrics/by-horizon", { start, end }),
  byLevel: (q: AccuracyQuery) => get<LevelRow[]>("/api/metrics/by-level", { ...q }),
  histogram: (q: AccuracyQuery) => get<HistogramBin[]>("/api/metrics/histogram", { ...q }),
  replay: (delivery_date: string, decision_time: string | null, confidence: number) =>
    get<Replay>("/api/replay", { delivery_date, decision_time, confidence }),
  buyingSheet: (req: BuyingSheetRequest) => request<BuyingSheet>("/api/buying-sheet", post(req)),
  async buyingSheetCsv(req: BuyingSheetRequest): Promise<void> {
    const resp = await fetch("/api/buying-sheet.csv", post(req));
    if (!resp.ok) throw new Error(`CSV export failed (${resp.status})`);
    const url = URL.createObjectURL(await resp.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `buying-sheet-${req.delivery_date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
