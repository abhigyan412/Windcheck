"""Fetch January 2026 wind actuals (FUELHH) and forecasts (WINDFOR) from Elexon into gzipped CSV.

Usage (from repo root or backend/):
    python backend/scripts/ingest.py
"""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pandas as pd

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
DATA_DIR = Path(__file__).resolve().parents[1] / "data"

# Forecasts published for decisions made in January 2026 (plus D-1 of 1 Jan).
FORECAST_PUBLISH_FROM = datetime(2025, 12, 31, tzinfo=UTC)
FORECAST_PUBLISH_TO = datetime(2026, 2, 1, tzinfo=UTC)
# Actuals covering every target those forecasts can reach.
ACTUALS_FROM = "2026-01-01"
ACTUALS_TO = "2026-02-03"

CHUNK = timedelta(days=7)
RETRIES = 3
TIMEOUT_S = 60


def _get(client: httpx.Client, url: str, params: dict) -> list[dict]:
    for attempt in range(1, RETRIES + 1):
        try:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPError, ValueError):
            if attempt == RETRIES:
                raise
            time.sleep(2**attempt)
    raise RuntimeError("unreachable")


def fetch_actuals(client: httpx.Client) -> pd.DataFrame:
    rows = _get(
        client,
        f"{BASE_URL}/FUELHH/stream",
        {"settlementDateFrom": ACTUALS_FROM, "settlementDateTo": ACTUALS_TO, "fuelType": "WIND"},
    )
    df = pd.DataFrame(rows)
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    df = (
        df.sort_values("publishTime")
        .drop_duplicates("startTime", keep="last")
        .sort_values("startTime")[["startTime", "generation"]]
        .reset_index(drop=True)
    )
    df["generation"] = df["generation"].astype("float64")
    return df


def fetch_forecasts(client: httpx.Client) -> pd.DataFrame:
    frames = []
    start = FORECAST_PUBLISH_FROM
    while start < FORECAST_PUBLISH_TO:
        end = min(start + CHUNK, FORECAST_PUBLISH_TO)
        rows = _get(
            client,
            f"{BASE_URL}/WINDFOR/stream",
            {
                "publishDateTimeFrom": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "publishDateTimeTo": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
        )
        frames.append(pd.DataFrame(rows))
        start = end
    df = pd.concat(frames, ignore_index=True)
    df["startTime"] = pd.to_datetime(df["startTime"], utc=True)
    df["publishTime"] = pd.to_datetime(df["publishTime"], utc=True)
    df = df[
        (df["publishTime"] >= FORECAST_PUBLISH_FROM) & (df["publishTime"] < FORECAST_PUBLISH_TO)
    ]
    df = df.drop_duplicates(["publishTime", "startTime"], keep="last")
    # A forecast for a time already in the past is not a forecast.
    df = df[df["startTime"] >= df["publishTime"]]
    df = df.sort_values(["publishTime", "startTime"])[["publishTime", "startTime", "generation"]]
    df["generation"] = df["generation"].astype("float64")
    return df.reset_index(drop=True)


def summarise(actuals: pd.DataFrame, forecasts: pd.DataFrame) -> None:
    expected = pd.date_range(actuals.startTime.min(), actuals.startTime.max(), freq="30min")
    missing = len(expected.difference(pd.DatetimeIndex(actuals.startTime)))
    per_day = forecasts.groupby(forecasts.publishTime.dt.date).publishTime.nunique()
    print(f"actuals:   {len(actuals)} rows, {actuals.startTime.min()} -> {actuals.startTime.max()}")
    print(f"           missing half-hours: {missing}")
    print(f"forecasts: {len(forecasts)} rows, {forecasts.publishTime.nunique()} publishes")
    print(f"           publishes/day: {per_day.value_counts().to_dict()}")


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with httpx.Client(timeout=TIMEOUT_S) as client:
        actuals = fetch_actuals(client)
        forecasts = fetch_forecasts(client)
    actuals.to_csv(DATA_DIR / "actuals.csv.gz", index=False)
    forecasts.to_csv(DATA_DIR / "forecasts.csv.gz", index=False)
    summarise(actuals, forecasts)


if __name__ == "__main__":
    main()
