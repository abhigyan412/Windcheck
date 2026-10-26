import pandas as pd
import pytest


def ts(s: str) -> pd.Timestamp:
    return pd.Timestamp(s, tz="UTC")


@pytest.fixture
def forecasts() -> pd.DataFrame:
    """Three publishes on 10 Jan. Value = 100 x publish number, so the choice is visible.

    P1 00:00, P2 06:00, P3 12:00; all forecast 13:00 and 18:00.
    P3 also has a row for 10:00, which is in its past and must never be used.
    """
    rows = [
        ("2026-01-10 00:00", "2026-01-10 13:00", 100),
        ("2026-01-10 00:00", "2026-01-10 18:00", 100),
        ("2026-01-10 06:00", "2026-01-10 13:00", 200),
        ("2026-01-10 06:00", "2026-01-10 18:00", 200),
        ("2026-01-10 12:00", "2026-01-10 10:00", 999),
        ("2026-01-10 12:00", "2026-01-10 13:00", 300),
        ("2026-01-10 12:00", "2026-01-10 18:00", 300),
    ]
    return pd.DataFrame(
        [(ts(p), ts(s), float(g)) for p, s, g in rows],
        columns=["publishTime", "startTime", "generation"],
    )


@pytest.fixture
def day_ahead_forecasts() -> pd.DataFrame:
    """Publishes on 14 Jan at 07:30, 09:30, 11:30 for every hour of 15 Jan.

    Gate closure is 09:20 UK on 14 Jan, so only the 07:30 publish (value 1000) counts.
    """
    hours = pd.date_range("2026-01-15", periods=24, freq="h", tz="UTC")
    frames = [
        pd.DataFrame({"publishTime": ts(p), "startTime": hours, "generation": float(v)})
        for p, v in [
            ("2026-01-14 07:30", 1000),
            ("2026-01-14 09:30", 2000),
            ("2026-01-14 11:30", 3000),
        ]
    ]
    return pd.concat(frames, ignore_index=True)
