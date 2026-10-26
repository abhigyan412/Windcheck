"""Decision replay and the hour-by-hour buying sheet. Pure functions, no I/O."""

from __future__ import annotations

import io
from datetime import date

import pandas as pd

from app.buffer import apply_buffer, buffer_table_as_of
from app.config import UK_TZ
from app.forecast import gate_closure_for, select_for_day

HOURS_PER_DAY = 24


def build_replay(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    history: pd.DataFrame,
    delivery_day: date,
    confidence: float,
    decision_time: pd.Timestamp | None = None,
) -> dict:
    """What the trader saw for delivery_day at decision_time, plus what actually happened.

    actuals: hourly actuals (startTime, generation). history: day-ahead paired errors.
    """
    decision = gate_closure_for(delivery_day) if decision_time is None else decision_time
    seen = select_for_day(forecasts, delivery_day, decision)
    if seen.empty:
        return {"decision_time": decision, "points": pd.DataFrame(), "summary": None}

    table = buffer_table_as_of(history, decision, confidence)
    points = apply_buffer(seen.rename(columns={"startTime": "time"}), table)
    points = points.merge(
        actuals.rename(columns={"startTime": "time", "generation": "actual"}), on="time", how="left"
    )
    known = points.dropna(subset=["actual"])
    held = known["actual"] >= known["safe_wind"]
    shortfall = (known["safe_wind"] - known["actual"]).clip(lower=0)
    summary = {
        "publish_time_used": points["publishTime"].max(),
        "forecast_mwh": round(float(points["forecast"].sum()), 0),
        "safe_mwh": round(float(points["safe_wind"].sum()), 0),
        "actual_mwh": round(float(known["actual"].sum()), 0) if not known.empty else None,
        "hours": int(len(points)),
        "hours_held": int(held.sum()),
        "max_short": round(float(shortfall.max()), 0) if not known.empty else None,
        "fallback": table.fallback,
    }
    return {"decision_time": decision, "points": points, "summary": summary}


def normalise_demand(demand: float | list[float] | None, hours: int = HOURS_PER_DAY):
    """One MW value for every hour, or exactly one value per hour. None means no demand."""
    if demand is None:
        return None
    values = [float(demand)] * hours if isinstance(demand, int | float) else list(demand)
    if len(values) != hours:
        raise ValueError(f"demand needs 1 or {hours} values, got {len(values)}")
    if any(v < 0 for v in values):
        raise ValueError("demand values must be non-negative")
    return values


def build_buying_sheet(points: pd.DataFrame, demand: list[float] | None) -> dict:
    """Hourly plan: safe wind, buffer and, when demand is given, how much to buy (MWh)."""
    sheet = pd.DataFrame(
        {
            "time": points["time"],
            "hour": points["time"].dt.tz_convert(UK_TZ).dt.strftime("%H:%M"),
            "forecast": points["forecast"].round(0),
            "safe_wind": points["safe_wind"].round(0),
            "buffer": (points["forecast"] - points["safe_wind"]).round(0),
            "actual": points["actual"],
        }
    )
    sheet["held"] = (sheet["actual"] >= sheet["safe_wind"]).where(sheet["actual"].notna())
    totals = {
        "forecast_mwh": float(sheet["forecast"].sum()),
        "safe_mwh": float(sheet["safe_wind"].sum()),
    }
    if demand is not None:
        sheet["demand"] = demand
        # Hourly blocks: MW held for one hour = MWh.
        sheet["to_buy"] = (sheet["demand"] - sheet["safe_wind"]).clip(lower=0)
        raw = (sheet["demand"] - sheet["forecast"]).clip(lower=0)
        totals["to_buy_mwh"] = float(sheet["to_buy"].sum())
        totals["raw_to_buy_mwh"] = float(raw.sum())
    return {"rows": sheet, "totals": totals}


def to_csv(sheet: dict) -> str:
    """Buying sheet as CSV with a totals row."""
    rows = sheet["rows"].drop(columns=["time"])
    totals = {"hour": "TOTAL", "forecast": sheet["totals"]["forecast_mwh"]}
    totals["safe_wind"] = sheet["totals"]["safe_mwh"]
    if "to_buy" in rows:
        totals["to_buy"] = sheet["totals"]["to_buy_mwh"]
    out = pd.concat([rows, pd.DataFrame([totals])], ignore_index=True)
    buf = io.StringIO()
    out.to_csv(buf, index=False)
    return buf.getvalue()
