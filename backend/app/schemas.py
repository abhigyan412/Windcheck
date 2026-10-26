from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class RangeResponse(BaseModel):
    first_day: date
    last_day: date
    default_day: date
    gate_closure_uk: str
    confidence_levels: list[float]
    max_horizon: int


class SeriesPoint(BaseModel):
    time: datetime
    forecast: float
    actual: float
    error: float
    publishTime: datetime
    band_low: float
    band_high: float
    safe_wind: float


class MetricsResponse(BaseModel):
    mae: float | None
    rmse: float | None
    bias: float | None
    nmae: float | None
    p10: float | None
    p50: float | None
    p90: float | None
    max: float | None
    count: int
    shortfall_p90: float | None
    shortfall_freq: float | None
    mean_shortfall: float | None
    coverage: float | None = Field(description="In-sample: % hours actual >= safe wind")
    backtest_coverage: float | None = Field(
        description="Out-of-sample day-ahead backtest (no look-ahead), same period"
    )


class HorizonRow(BaseModel):
    horizon: int
    mae: float | None
    rmse: float | None
    bias: float | None
    spread: float | None
    count: int


class LevelRow(BaseModel):
    bucket: str
    bias: float | None
    mae: float | None
    count: int


class HourRow(BaseModel):
    hour: int
    bias: float | None
    mae: float | None
    count: int


class HistogramBin(BaseModel):
    from_mw: int = Field(alias="from")
    to: int
    count: int


class BufferRow(BaseModel):
    bucket: str
    q_low: float
    q_high: float
    n: int
    pooled: bool


class ReplayPoint(BaseModel):
    time: datetime
    forecast: float
    band_low: float
    band_high: float
    safe_wind: float
    actual: float | None


class ReplaySummary(BaseModel):
    publish_time_used: datetime
    forecast_mwh: float
    safe_mwh: float
    actual_mwh: float | None
    hours: int
    hours_held: int
    max_short: float | None
    fallback: bool


class ReplayResponse(BaseModel):
    delivery_date: date
    decision_time: datetime
    confidence: float
    points: list[ReplayPoint]
    summary: ReplaySummary


class BuyingSheetRequest(BaseModel):
    delivery_date: date
    decision_time: datetime | None = None
    confidence: float = 0.9
    demand: float | list[float] | None = Field(
        default=None, description="One MW value for every hour, or one value per hour"
    )


class BuyingSheetRow(BaseModel):
    time: datetime
    hour: str
    forecast: float
    safe_wind: float
    buffer: float
    actual: float | None
    held: bool | None
    demand: float | None = None
    to_buy: float | None = None


class BuyingSheetTotals(BaseModel):
    forecast_mwh: float
    safe_mwh: float
    to_buy_mwh: float | None = None
    raw_to_buy_mwh: float | None = None


class BuyingSheetResponse(BaseModel):
    rows: list[BuyingSheetRow]
    totals: BuyingSheetTotals
