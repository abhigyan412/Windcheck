"""Choosing which forecast a trader would have had. Pure functions, no I/O."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd

from app.config import GATE_CLOSURE, UK_TZ

SELECTED_COLUMNS = ["startTime", "forecast", "publishTime"]


def _latest_per_target(candidates: pd.DataFrame) -> pd.DataFrame:
    if candidates.empty:
        return pd.DataFrame(columns=SELECTED_COLUMNS)
    latest = candidates.loc[candidates.groupby("startTime")["publishTime"].idxmax()]
    return (
        latest.rename(columns={"generation": "forecast"})[SELECTED_COLUMNS]
        .sort_values("startTime")
        .reset_index(drop=True)
    )


def select_at_horizon(forecasts: pd.DataFrame, horizon_h: float) -> pd.DataFrame:
    """For each target time T, the latest forecast with publishTime <= T - horizon."""
    lead = forecasts["startTime"] - forecasts["publishTime"]
    return _latest_per_target(forecasts[lead >= pd.Timedelta(hours=horizon_h)])


def select_as_of(forecasts: pd.DataFrame, decision_time: datetime) -> pd.DataFrame:
    """What a trader saw at decision_time: latest forecast per future target."""
    ts = pd.Timestamp(decision_time)
    mask = (forecasts["publishTime"] <= ts) & (forecasts["startTime"] > ts)
    return _latest_per_target(forecasts[mask])


def uk_day_bounds(day: date) -> tuple[pd.Timestamp, pd.Timestamp]:
    """UTC start/end of a UK calendar day (handles GMT/BST)."""
    tz = ZoneInfo(UK_TZ)
    start = datetime.combine(day, datetime.min.time(), tzinfo=tz)
    end = datetime.combine(day + timedelta(days=1), datetime.min.time(), tzinfo=tz)
    return pd.Timestamp(start).tz_convert("UTC"), pd.Timestamp(end).tz_convert("UTC")


def gate_closure_for(delivery_day: date) -> pd.Timestamp:
    """Day-ahead decision moment for a delivery day: GATE_CLOSURE UK time on D-1, in UTC."""
    d_minus_1 = delivery_day - timedelta(days=1)
    local = datetime.combine(d_minus_1, GATE_CLOSURE, tzinfo=ZoneInfo(UK_TZ))
    return pd.Timestamp(local).tz_convert("UTC")


def select_for_day(
    forecasts: pd.DataFrame, delivery_day: date, decision_time: datetime | None = None
) -> pd.DataFrame:
    """Forecast for one delivery day as seen at decision_time (default: D-1 gate closure)."""
    decision = gate_closure_for(delivery_day) if decision_time is None else decision_time
    start, end = uk_day_bounds(delivery_day)
    seen = select_as_of(forecasts, decision)
    return seen[(seen["startTime"] >= start) & (seen["startTime"] < end)].reset_index(drop=True)


def select_day_ahead(forecasts: pd.DataFrame, first_day: date, last_day: date) -> pd.DataFrame:
    """Day-ahead forecast for every delivery day in [first_day, last_day]."""
    days = pd.date_range(first_day, last_day, freq="D").date
    frames = [select_for_day(forecasts, d) for d in days]
    frames = [f for f in frames if not f.empty]
    if not frames:
        return pd.DataFrame(columns=SELECTED_COLUMNS)
    return pd.concat(frames, ignore_index=True)


def join_actuals(selected: pd.DataFrame, actuals: pd.DataFrame) -> pd.DataFrame:
    """Pair selected forecasts with actuals. error = forecast - actual (> 0 means shortfall)."""
    paired = selected.merge(
        actuals.rename(columns={"generation": "actual"})[["startTime", "actual"]],
        on="startTime",
        how="inner",
    ).rename(columns={"startTime": "time"})
    paired["error"] = paired["forecast"] - paired["actual"]
    return paired[["time", "forecast", "actual", "publishTime", "error"]]
