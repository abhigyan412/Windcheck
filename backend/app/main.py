"""HTTP layer: parameter validation, caching and JSON shaping. Logic lives in the pure modules."""

from __future__ import annotations

import os
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from app import buffer as buf
from app import metrics as m
from app import schemas as s
from app.config import (
    CONFIDENCE_LEVELS,
    DEFAULT_CONFIDENCE,
    GATE_CLOSURE,
    MAX_HORIZON,
    UK_TZ,
)
from app.data import hourly_actuals, load_actuals, load_forecasts
from app.forecast import join_actuals, select_at_horizon, select_day_ahead, uk_day_bounds
from app.replay import build_buying_sheet, build_replay, normalise_demand, to_csv

FIRST_DAY = date(2026, 1, 1)
LAST_DAY = date(2026, 2, 1)  # last delivery day for a decision made in January
DEFAULT_DAY = date(2026, 1, 27)  # windiest day: biggest over-forecast

Mode = Literal["horizon", "dayahead"]

app = FastAPI(title="Wind Forecast Monitor API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- cached data ----------


@lru_cache(maxsize=1)
def _actuals_hourly() -> pd.DataFrame:
    return hourly_actuals(load_actuals())


@lru_cache(maxsize=1)
def _day_ahead_history() -> pd.DataFrame:
    """Day-ahead paired errors for every delivery day: the buffer's learning history."""
    selected = select_day_ahead(load_forecasts(), FIRST_DAY, LAST_DAY)
    return join_actuals(selected, _actuals_hourly())


@lru_cache(maxsize=64)
def _paired(mode: Mode, horizon: int) -> pd.DataFrame:
    if mode == "dayahead":
        return _day_ahead_history()
    return join_actuals(select_at_horizon(load_forecasts(), horizon), _actuals_hourly())


@lru_cache(maxsize=16)
def _backtest(confidence: float) -> pd.DataFrame:
    days = list(pd.date_range(FIRST_DAY, LAST_DAY, freq="D").date)
    return buf.backtest(load_forecasts(), _day_ahead_history(), days, confidence)


@lru_cache(maxsize=8)
def _by_horizon(start: date, end: date) -> list[dict]:
    lo, hi = _bounds(start, end)
    return m.by_horizon(load_forecasts(), _actuals_hourly(), range(1, MAX_HORIZON + 1), lo, hi)


# ---------- helpers ----------


def _bounds(start: date, end: date) -> tuple[pd.Timestamp, pd.Timestamp]:
    return uk_day_bounds(start)[0], uk_day_bounds(end)[1]


def _check_range(start: date | None, end: date | None) -> tuple[date, date]:
    start, end = start or FIRST_DAY, end or LAST_DAY
    if start > end:
        raise HTTPException(400, "start must be on or before end")
    if start < FIRST_DAY or end > LAST_DAY:
        raise HTTPException(400, f"dates must be between {FIRST_DAY} and {LAST_DAY}")
    return start, end


def _check_confidence(confidence: float) -> float:
    if confidence not in CONFIDENCE_LEVELS:
        raise HTTPException(400, f"confidence must be one of {list(CONFIDENCE_LEVELS)}")
    return confidence


def _check_day(day: date) -> date:
    if day < FIRST_DAY or day > LAST_DAY:
        raise HTTPException(400, f"delivery_date must be between {FIRST_DAY} and {LAST_DAY}")
    return day


def _decision(day: date, decision_time: datetime | None) -> pd.Timestamp | None:
    if decision_time is None:
        return None
    ts = pd.Timestamp(decision_time)
    ts = ts.tz_localize(ZoneInfo(UK_TZ)) if ts.tzinfo is None else ts
    ts = ts.tz_convert("UTC")
    if ts >= uk_day_bounds(day)[0]:
        raise HTTPException(400, "decision_time must be before the delivery day starts")
    return ts


def _in_range(df: pd.DataFrame, start: date, end: date) -> pd.DataFrame:
    lo, hi = _bounds(start, end)
    return df[(df["time"] >= lo) & (df["time"] < hi)]


def _records(df: pd.DataFrame) -> list[dict]:
    """DataFrame rows as JSON-ready dicts (ISO timestamps, NaN -> None)."""
    out = df.copy()
    for col in out.columns:
        if pd.api.types.is_datetime64_any_dtype(out[col]):
            out[col] = out[col].map(lambda t: t.isoformat())
    out = out.astype(object).where(out.notna(), None)
    return out.to_dict("records")


# ---------- routes ----------


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/range", response_model=s.RangeResponse)
def data_range():
    return {
        "first_day": FIRST_DAY,
        "last_day": LAST_DAY,
        "default_day": DEFAULT_DAY,
        "gate_closure_uk": GATE_CLOSURE.strftime("%H:%M"),
        "confidence_levels": list(CONFIDENCE_LEVELS),
        "max_horizon": MAX_HORIZON,
    }


@app.get("/api/series", response_model=list[s.SeriesPoint])
def series(
    start: date | None = None,
    end: date | None = None,
    mode: Mode = "horizon",
    horizon: int = Query(24, ge=0, le=MAX_HORIZON),
    confidence: float = DEFAULT_CONFIDENCE,
):
    start, end = _check_range(start, end)
    paired = _in_range(_paired(mode, horizon), start, end)
    table = buf.buffer_table(paired, _check_confidence(confidence))
    out = buf.apply_buffer(paired, table).drop(columns=["bucket"])
    return _records(out)


@app.get("/api/metrics", response_model=s.MetricsResponse)
def metrics(
    start: date | None = None,
    end: date | None = None,
    mode: Mode = "horizon",
    horizon: int = Query(24, ge=0, le=MAX_HORIZON),
    confidence: float = DEFAULT_CONFIDENCE,
):
    start, end = _check_range(start, end)
    confidence = _check_confidence(confidence)
    paired = _in_range(_paired(mode, horizon), start, end)
    in_sample = buf.apply_buffer(paired, buf.buffer_table(paired, confidence))
    backtest = _backtest(confidence)
    backtest = backtest[(backtest["day"] >= start) & (backtest["day"] <= end)]
    return {
        **m.summary(paired),
        **m.shortfall_stats(paired["error"]),
        "coverage": buf.coverage(in_sample),
        "backtest_coverage": buf.coverage(backtest),
    }


@app.get("/api/metrics/by-horizon", response_model=list[s.HorizonRow])
def metrics_by_horizon(start: date | None = None, end: date | None = None):
    return _by_horizon(*_check_range(start, end))


@app.get("/api/metrics/by-level", response_model=list[s.LevelRow])
def metrics_by_level(
    start: date | None = None,
    end: date | None = None,
    mode: Mode = "horizon",
    horizon: int = Query(24, ge=0, le=MAX_HORIZON),
):
    start, end = _check_range(start, end)
    return m.by_level(_in_range(_paired(mode, horizon), start, end))


@app.get("/api/metrics/by-hour", response_model=list[s.HourRow])
def metrics_by_hour(
    start: date | None = None,
    end: date | None = None,
    mode: Mode = "horizon",
    horizon: int = Query(24, ge=0, le=MAX_HORIZON),
):
    start, end = _check_range(start, end)
    return m.by_hour(_in_range(_paired(mode, horizon), start, end))


@app.get("/api/metrics/histogram", response_model=list[s.HistogramBin])
def metrics_histogram(
    start: date | None = None,
    end: date | None = None,
    mode: Mode = "horizon",
    horizon: int = Query(24, ge=0, le=MAX_HORIZON),
):
    start, end = _check_range(start, end)
    return m.histogram(_in_range(_paired(mode, horizon), start, end)["error"])


@app.get("/api/buffer", response_model=list[s.BufferRow])
def buffer_table(
    mode: Mode = "dayahead",
    horizon: int = Query(24, ge=0, le=MAX_HORIZON),
    confidence: float = DEFAULT_CONFIDENCE,
):
    table = buf.buffer_table(_paired(mode, horizon), _check_confidence(confidence))
    return _records(table.rows)


def _replay(day: date, decision_time: datetime | None, confidence: float) -> dict:
    day = _check_day(day)
    result = build_replay(
        load_forecasts(),
        _actuals_hourly(),
        _day_ahead_history(),
        day,
        _check_confidence(confidence),
        _decision(day, decision_time),
    )
    if result["summary"] is None:
        raise HTTPException(404, "no forecast was available at that decision time")
    return result


@app.get("/api/replay", response_model=s.ReplayResponse)
def replay(
    delivery_date: date = DEFAULT_DAY,
    decision_time: datetime | None = None,
    confidence: float = DEFAULT_CONFIDENCE,
):
    result = _replay(delivery_date, decision_time, confidence)
    cols = ["time", "forecast", "band_low", "band_high", "safe_wind", "actual"]
    return {
        "delivery_date": delivery_date,
        "decision_time": result["decision_time"],
        "confidence": confidence,
        "points": _records(result["points"][cols]),
        "summary": result["summary"],
    }


def _sheet(req: s.BuyingSheetRequest) -> dict:
    result = _replay(req.delivery_date, req.decision_time, req.confidence)
    try:
        demand = normalise_demand(req.demand, hours=len(result["points"]))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return build_buying_sheet(result["points"], demand)


@app.post("/api/buying-sheet", response_model=s.BuyingSheetResponse)
def buying_sheet(req: s.BuyingSheetRequest):
    sheet = _sheet(req)
    return {"rows": _records(sheet["rows"]), "totals": sheet["totals"]}


@app.post("/api/buying-sheet.csv")
def buying_sheet_csv(req: s.BuyingSheetRequest):
    filename = f"buying-sheet-{req.delivery_date}.csv"
    return Response(
        to_csv(_sheet(req)),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# Serve the built React app when present (single-image deploy). Must come after API routes.
_static = Path(os.environ.get("STATIC_DIR", Path(__file__).resolve().parents[2] / "frontend/dist"))
if _static.is_dir():
    app.mount("/", StaticFiles(directory=_static, html=True), name="frontend")
