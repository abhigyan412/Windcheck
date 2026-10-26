import math

import pandas as pd

from app.metrics import by_level, histogram, shortfall_stats, summary


def _paired(errors, actual=10.0):
    return pd.DataFrame({"error": [float(e) for e in errors], "actual": actual, "forecast": 5000.0})


def test_summary_on_hand_computed_set():
    s = summary(_paired([1, -1, 3, -3]))
    assert s["mae"] == 2.0
    assert s["rmse"] == round(math.sqrt(5), 1)
    assert s["bias"] == 0.0
    assert s["nmae"] == 20.0  # MAE 2 / mean actual 10
    assert s["p90"] == 2.4  # linear interpolation over [-3, -1, 1, 3]
    assert s["max"] == 3.0
    assert s["count"] == 4


def test_shortfall_counts_only_forecast_too_high():
    s = shortfall_stats(pd.Series([1.0, -1.0, 3.0, -3.0]))
    assert s["shortfall_freq"] == 50.0
    assert s["mean_shortfall"] == 2.0


def test_empty_input_does_not_crash():
    assert summary(_paired([]))["count"] == 0
    assert shortfall_stats(pd.Series([], dtype=float))["shortfall_p90"] is None
    assert histogram(pd.Series([], dtype=float)) == []


def test_by_level_groups_by_forecast_bucket():
    df = pd.DataFrame({"forecast": [1000.0, 15000.0, 16000.0], "error": [100.0, 2000.0, 4000.0]})
    rows = {r["bucket"]: r for r in by_level(df)}
    assert rows["<6 GW"]["bias"] == 100.0
    assert rows[">14 GW"]["bias"] == 3000.0
    assert rows["6-10 GW"]["count"] == 0
