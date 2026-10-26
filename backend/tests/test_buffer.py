import pandas as pd
from conftest import ts

from app.buffer import apply_buffer, buffer_table, buffer_table_as_of, coverage
from app.metrics import wind_bucket


def _history(n: int, start: str = "2026-01-01", forecast: float = 8000.0, error_step: float = 10.0):
    times = pd.date_range(start, periods=n, freq="h", tz="UTC")
    errors = [i * error_step for i in range(n)]
    return pd.DataFrame({"time": times, "forecast": forecast, "error": errors, "actual": 0.0})


def test_bucket_boundaries():
    labels = wind_bucket(pd.Series([5999.0, 6000.0, 14001.0])).astype(str).tolist()
    assert labels == ["<6 GW", "6-10 GW", ">14 GW"]


def test_thin_bucket_pools_with_neighbour():
    rich = _history(60, forecast=8000.0)
    thin = _history(5, forecast=1000.0)
    rows = buffer_table(pd.concat([rich, thin]), 0.9).rows.set_index("bucket")
    assert rows.loc["<6 GW", "pooled"]
    assert rows.loc["<6 GW", "n"] == 5
    assert not rows.loc["6-10 GW", "pooled"]


def test_as_of_ignores_errors_not_yet_known():
    history = _history(200)
    decision = history["time"].iloc[-1] + pd.Timedelta(hours=1)
    future = pd.DataFrame(
        {
            "time": [decision + pd.Timedelta(hours=5)],
            "forecast": [8000.0],
            "error": [1e6],
            "actual": [0.0],
        }
    )
    before = buffer_table_as_of(history, decision, 0.9).rows
    after = buffer_table_as_of(pd.concat([history, future]), decision, 0.9).rows
    pd.testing.assert_frame_equal(before, after)


def test_as_of_flags_fallback_when_history_is_short():
    history = _history(200)
    early = history["time"].iloc[10]
    assert buffer_table_as_of(history, early, 0.9).fallback
    assert not buffer_table_as_of(
        history, history["time"].iloc[-1] + pd.Timedelta(hours=1), 0.9
    ).fallback


def test_safe_wind_never_negative():
    table = buffer_table(_history(60, forecast=1000.0, error_step=100.0), 0.9)
    out = apply_buffer(pd.DataFrame({"time": [ts("2026-02-01")], "forecast": [100.0]}), table)
    assert out["safe_wind"].iloc[0] == 0.0
    assert out["band_low"].iloc[0] == 0.0


def test_coverage_on_known_set():
    df = pd.DataFrame({"actual": [10.0, 5.0, 20.0, 1.0], "safe_wind": [8.0, 8.0, 8.0, 8.0]})
    assert coverage(df) == 50.0
