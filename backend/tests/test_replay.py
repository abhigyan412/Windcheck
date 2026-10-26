from datetime import date
from io import StringIO

import pandas as pd
import pytest
from conftest import ts

from app.replay import build_buying_sheet, build_replay, normalise_demand, to_csv

EMPTY_HISTORY = pd.DataFrame(columns=["time", "forecast", "actual", "error"])


def _points(safe=(5.0, 50.0), forecast=(10.0, 60.0), actual=(6.0, 40.0)):
    times = pd.date_range("2026-01-15", periods=len(safe), freq="h", tz="UTC")
    return pd.DataFrame({"time": times, "forecast": forecast, "safe_wind": safe, "actual": actual})


def test_replay_uses_publish_before_decision(day_ahead_forecasts):
    actuals = pd.DataFrame(
        {
            "startTime": pd.date_range("2026-01-15", periods=24, freq="h", tz="UTC"),
            "generation": 900.0,
        }
    )
    result = build_replay(day_ahead_forecasts, actuals, EMPTY_HISTORY, date(2026, 1, 15), 0.9)
    assert result["decision_time"] == ts("2026-01-14 09:20")
    assert result["summary"]["publish_time_used"] == ts("2026-01-14 07:30")
    assert set(result["points"]["forecast"]) == {1000.0}
    assert result["summary"]["fallback"]


def test_flat_demand_expands_to_every_hour():
    assert normalise_demand(25000, hours=3) == [25000.0] * 3
    assert normalise_demand(None) is None


@pytest.mark.parametrize("bad", [[1.0] * 23, [1.0] * 23 + [-1.0]])
def test_bad_demand_is_rejected(bad):
    with pytest.raises(ValueError):
        normalise_demand(bad)


def test_to_buy_clamped_at_zero_when_wind_exceeds_demand():
    sheet = build_buying_sheet(_points(), demand=[20.0, 20.0])
    assert sheet["rows"]["to_buy"].tolist() == [15.0, 0.0]
    assert sheet["totals"]["to_buy_mwh"] == 15.0
    assert sheet["totals"]["raw_to_buy_mwh"] == 10.0  # max(0, 20-10) + max(0, 20-60)
    assert sheet["rows"]["held"].tolist() == [True, False]


def test_sheet_without_demand_has_no_to_buy():
    sheet = build_buying_sheet(_points(), demand=None)
    assert "to_buy" not in sheet["rows"]
    assert "to_buy_mwh" not in sheet["totals"]


def test_csv_totals_match_table():
    sheet = build_buying_sheet(_points(), demand=[20.0, 20.0])
    csv = pd.read_csv(StringIO(to_csv(sheet)))
    total = csv[csv["hour"] == "TOTAL"].iloc[0]
    assert total["to_buy"] == sheet["totals"]["to_buy_mwh"]
    assert total["safe_wind"] == sheet["totals"]["safe_mwh"]
    assert len(csv) == 3
