from functools import lru_cache

import pandas as pd

from app.config import DATA_DIR


@lru_cache(maxsize=1)
def load_actuals() -> pd.DataFrame:
    """Half-hourly wind actuals: columns startTime (UTC), generation (MW)."""
    return pd.read_parquet(DATA_DIR / "actuals.parquet")


@lru_cache(maxsize=1)
def load_forecasts() -> pd.DataFrame:
    """Wind forecasts: columns publishTime (UTC), startTime (UTC), generation (MW)."""
    return pd.read_parquet(DATA_DIR / "forecasts.parquet")


def hourly_actuals(actuals: pd.DataFrame) -> pd.DataFrame:
    """Keep only half-hours starting on the hour, to compare with hourly forecasts."""
    return actuals[actuals["startTime"].dt.minute == 0].reset_index(drop=True)
