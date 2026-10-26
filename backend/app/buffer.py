"""Safe wind: forecast adjusted by historical error, per wind level. Pure functions, no I/O."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import pandas as pd

from app.config import MIN_BUCKET_N, MIN_HISTORY_N, WIND_BUCKET_LABELS
from app.forecast import gate_closure_for, select_for_day
from app.metrics import wind_bucket

# An actual for a half-hour is known once that half-hour has ended.
ACTUAL_DELAY = pd.Timedelta(minutes=30)


@dataclass
class BufferTable:
    """Per wind bucket: q_high = P(conf) of error, q_low = P(1 - conf) of error."""

    rows: pd.DataFrame  # columns: bucket, q_low, q_high, n, pooled
    confidence: float
    fallback: bool = False


def buffer_table(paired: pd.DataFrame, confidence: float) -> BufferTable:
    """Error percentiles per forecast wind bucket. Thin buckets pool with their neighbours."""
    errors = paired.assign(bucket=wind_bucket(paired["forecast"]))
    by_bucket = [errors.loc[errors["bucket"] == b, "error"] for b in WIND_BUCKET_LABELS]
    rows = []
    for i, label in enumerate(WIND_BUCKET_LABELS):
        width, pool = 0, by_bucket[i]
        while len(pool) < MIN_BUCKET_N and width < len(WIND_BUCKET_LABELS):
            width += 1
            lo, hi = max(0, i - width), min(len(by_bucket), i + width + 1)
            pool = pd.concat(by_bucket[lo:hi])
        rows.append(
            {
                "bucket": label,
                "q_low": float(pool.quantile(1 - confidence)) if len(pool) else 0.0,
                "q_high": float(pool.quantile(confidence)) if len(pool) else 0.0,
                "n": int(len(by_bucket[i])),
                "pooled": width > 0,
            }
        )
    return BufferTable(pd.DataFrame(rows), confidence)


def buffer_table_as_of(
    history: pd.DataFrame, decision_time: pd.Timestamp, confidence: float
) -> BufferTable:
    """Buffer from errors whose actual was already known at decision_time (no look-ahead).

    Falls back to the whole history, flagged, when too little is known yet.
    """
    known = history[history["time"] + ACTUAL_DELAY <= decision_time] if len(history) else history
    if len(known) < MIN_HISTORY_N:
        table = buffer_table(history, confidence)
        table.fallback = True
        return table
    return buffer_table(known, confidence)


def apply_buffer(selected: pd.DataFrame, table: BufferTable) -> pd.DataFrame:
    """Add band_low, band_high and safe_wind (all >= 0) to a frame with a 'forecast' column."""
    out = selected.assign(bucket=wind_bucket(selected["forecast"]).astype(str))
    out = out.merge(table.rows[["bucket", "q_low", "q_high"]], on="bucket", how="left")
    out["band_low"] = (out["forecast"] - out["q_high"]).clip(lower=0)
    out["band_high"] = (out["forecast"] - out["q_low"]).clip(lower=0)
    out["safe_wind"] = out["band_low"]
    return out.drop(columns=["q_low", "q_high"])


def coverage(df: pd.DataFrame) -> float | None:
    """Share of hours (%) where actual wind was at least the safe wind."""
    if df.empty:
        return None
    return round(float((df["actual"] >= df["safe_wind"]).mean() * 100), 1)


def backtest(
    forecasts: pd.DataFrame,
    history: pd.DataFrame,
    days: list[date],
    confidence: float,
) -> pd.DataFrame:
    """Replay every delivery day with an as-of buffer and record the outcome per hour.

    history: day-ahead paired errors (time, forecast, actual, error) for the whole period.
    """
    frames = []
    actuals = history[["time", "actual"]]
    for day in days:
        decision = gate_closure_for(day)
        seen = select_for_day(forecasts, day, decision).rename(columns={"startTime": "time"})
        if seen.empty:
            continue
        table = buffer_table_as_of(history, decision, confidence)
        frame = apply_buffer(seen, table).merge(actuals, on="time", how="inner")
        frames.append(frame.assign(day=day, fallback=table.fallback))
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
