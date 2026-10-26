from functools import lru_cache

import pandas as pd

from app.config import DATA_DIR


@lru_cache(maxsize=1)
def load_actuals() -> pd.DataFrame:
    """Half-hourly wind actuals: columns startTime (UTC), generation (MW)."""
    return pd.read_csv(DATA_DIR / "actuals.csv.gz", parse_dates=["startTime"])


@lru_cache(maxsize=1)
def load_forecasts() -> pd.DataFrame:
    """Wind forecasts: columns publishTime (UTC), startTime (UTC), generation (MW)."""
    return pd.read_csv(DATA_DIR / "forecasts.csv.gz", parse_dates=["publishTime", "startTime"])


def hourly_actuals(actuals: pd.DataFrame) -> pd.DataFrame:
    """Keep only half-hours starting on the hour, to compare with hourly forecasts."""
    return actuals[actuals["startTime"].dt.minute == 0].reset_index(drop=True)
