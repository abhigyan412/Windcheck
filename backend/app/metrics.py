"""Forecast error statistics. Pure functions, no I/O."""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.config import UK_TZ, WIND_BUCKET_LABELS, WIND_BUCKETS
from app.forecast import join_actuals, select_at_horizon


def _r(x: float) -> float | None:
    return None if x is None or pd.isna(x) else round(float(x), 1)


def summary(paired: pd.DataFrame) -> dict:
    """Headline accuracy stats for a frame with 'error' and 'actual' columns."""
    e = paired["error"]
    if e.empty:
        keys = ["mae", "rmse", "bias", "nmae", "p10", "p50", "p90", "max"]
        return {**dict.fromkeys(keys), "count": 0}
    mae = e.abs().mean()
    mean_actual = paired["actual"].mean()
    return {
        "mae": _r(mae),
        "rmse": _r(np.sqrt((e**2).mean())),
        "bias": _r(e.mean()),
        "nmae": _r(mae / mean_actual * 100) if mean_actual else None,
        "p10": _r(e.quantile(0.1)),
        "p50": _r(e.quantile(0.5)),
        "p90": _r(e.quantile(0.9)),
        "max": _r(e.abs().max()),
        "count": int(e.size),
    }


def shortfall_stats(errors: pd.Series) -> dict:
    """Shortfall = forecast above actual (error > 0): the costly direction for the buyer."""
    if errors.empty:
        return {"shortfall_p90": None, "shortfall_freq": None, "mean_shortfall": None}
    short = errors[errors > 0]
    return {
        "shortfall_p90": _r(errors.clip(lower=0).quantile(0.9)),
        "shortfall_freq": _r((errors > 0).mean() * 100),
        "mean_shortfall": _r(short.mean()) if not short.empty else 0.0,
    }


def by_horizon(
    forecasts: pd.DataFrame,
    actuals: pd.DataFrame,
    horizons: range = range(1, 49),
    start: pd.Timestamp | None = None,
    end: pd.Timestamp | None = None,
) -> list[dict]:
    """Bias and spread (P90 - P10) per forecast horizon."""
    rows = []
    for h in horizons:
        paired = join_actuals(select_at_horizon(forecasts, h), actuals)
        if start is not None:
            paired = paired[(paired["time"] >= start) & (paired["time"] < end)]
        e = paired["error"]
        if e.empty:
            continue
        rows.append(
            {
                "horizon": h,
                "mae": _r(e.abs().mean()),
                "rmse": _r(np.sqrt((e**2).mean())),
                "bias": _r(e.mean()),
                "spread": _r(e.quantile(0.9) - e.quantile(0.1)),
                "count": int(e.size),
            }
        )
    return rows


def wind_bucket(forecast_mw: pd.Series) -> pd.Series:
    return pd.cut(forecast_mw, WIND_BUCKETS, labels=WIND_BUCKET_LABELS, right=False)


def by_level(paired: pd.DataFrame) -> list[dict]:
    """Bias and MAE per forecast wind level bucket."""
    grouped = paired.assign(bucket=wind_bucket(paired["forecast"])).groupby(
        "bucket", observed=False
    )["error"]
    return [
        {"bucket": str(b), "bias": _r(g.mean()), "mae": _r(g.abs().mean()), "count": int(g.size)}
        for b, g in grouped
    ]


def by_hour(paired: pd.DataFrame) -> list[dict]:
    """Bias and MAE per UK hour of day."""
    hours = paired["time"].dt.tz_convert(UK_TZ).dt.hour
    return [
        {"hour": int(h), "bias": _r(g.mean()), "mae": _r(g.abs().mean()), "count": int(g.size)}
        for h, g in paired.groupby(hours)["error"]
    ]


def histogram(errors: pd.Series, bin_mw: int = 500) -> list[dict]:
    """Error distribution in fixed-width MW bins."""
    if errors.empty:
        return []
    lo = int(np.floor(errors.min() / bin_mw) * bin_mw)
    hi = int(np.ceil(errors.max() / bin_mw) * bin_mw) + bin_mw
    counts, edges = np.histogram(errors, bins=range(lo, hi + 1, bin_mw))
    return [
        {"from": int(edges[i]), "to": int(edges[i + 1]), "count": int(c)}
        for i, c in enumerate(counts)
    ]
