// Mirrors backend/app/schemas.py

export type Mode = "horizon" | "dayahead";

export interface RangeInfo {
  first_day: string;
  last_day: string;
  default_day: string;
  gate_closure_uk: string;
  confidence_levels: number[];
  max_horizon: number;
}

export interface SeriesPoint {
  time: string;
  forecast: number;
  actual: number;
  error: number;
  publishTime: string;
  band_low: number;
  band_high: number;
  safe_wind: number;
}

export interface Metrics {
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  nmae: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  max: number | null;
  count: number;
  shortfall_p90: number | null;
  shortfall_freq: number | null;
  mean_shortfall: number | null;
  coverage: number | null;
  backtest_coverage: number | null;
}

export interface HorizonRow {
  horizon: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  spread: number | null;
  count: number;
}

export interface LevelRow {
  bucket: string;
  bias: number | null;
  mae: number | null;
  count: number;
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
}

export interface ReplayPoint {
  time: string;
  forecast: number;
  band_low: number;
  band_high: number;
  safe_wind: number;
  actual: number | null;
}

export interface ReplaySummary {
  publish_time_used: string;
  forecast_mwh: number;
  safe_mwh: number;
  actual_mwh: number | null;
  hours: number;
  hours_held: number;
  max_short: number | null;
  fallback: boolean;
}

export interface Replay {
  delivery_date: string;
  decision_time: string;
  confidence: number;
  points: ReplayPoint[];
  summary: ReplaySummary;
}

export type Demand = number | number[] | null;

export interface BuyingSheetRequest {
  delivery_date: string;
  decision_time?: string | null;
  confidence: number;
  demand: Demand;
}

export interface BuyingSheetRow {
  time: string;
  hour: string;
  forecast: number;
  safe_wind: number;
  buffer: number;
  actual: number | null;
  held: boolean | null;
  demand?: number | null;
  to_buy?: number | null;
}

export interface BuyingSheet {
  rows: BuyingSheetRow[];
  totals: {
    forecast_mwh: number;
    safe_mwh: number;
    to_buy_mwh?: number | null;
    raw_to_buy_mwh?: number | null;
  };
}
