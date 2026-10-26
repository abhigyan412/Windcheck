from datetime import date

import pandas as pd
from conftest import ts

from app.forecast import (
    gate_closure_for,
    join_actuals,
    select_as_of,
    select_at_horizon,
    select_day_ahead,
    select_for_day,
)


def _value_at(selected: pd.DataFrame, target: str) -> float | None:
    row = selected[selected["startTime"] == ts(target)]
    return None if row.empty else float(row["forecast"].iloc[0])


def test_horizon_picks_latest_publish_at_or_before_t_minus_h(forecasts):
    sel = select_at_horizon(forecasts, 6)
    assert _value_at(sel, "2026-01-10 13:00") == 200  # cutoff 07:00 -> P2
    assert _value_at(sel, "2026-01-10 18:00") == 300  # cutoff 12:00 -> P3


def test_horizon_boundary_is_inclusive(forecasts):
    # 13:00 - 7h = 06:00, exactly P2's publish time.
    assert _value_at(select_at_horizon(forecasts, 7), "2026-01-10 13:00") == 200


def test_horizon_excludes_publish_one_minute_too_late(forecasts):
    # Cutoff 05:59 -> P2 (06:00) is too late, fall back to P1.
    assert _value_at(select_at_horizon(forecasts, 7 + 1 / 60), "2026-01-10 13:00") == 100


def test_horizon_with_no_early_enough_publish_returns_nothing(forecasts):
    assert _value_at(select_at_horizon(forecasts, 14), "2026-01-10 13:00") is None


def test_forecasts_for_the_past_are_never_used(forecasts):
    assert _value_at(select_at_horizon(forecasts, 0), "2026-01-10 10:00") is None
    assert _value_at(select_as_of(forecasts, ts("2026-01-10 12:30")), "2026-01-10 10:00") is None


def test_as_of_never_uses_a_later_publish(forecasts):
    sel = select_as_of(forecasts, ts("2026-01-10 06:30"))
    assert set(sel["forecast"]) == {200}
    assert (sel["publishTime"] <= ts("2026-01-10 06:30")).all()


def test_gate_closure_is_d_minus_1_0920_uk():
    assert gate_closure_for(date(2026, 1, 15)) == ts("2026-01-14 09:20")  # GMT
    assert gate_closure_for(date(2026, 7, 15)) == ts("2026-07-14 08:20")  # BST


def test_day_ahead_uses_pre_gate_publish(day_ahead_forecasts):
    sel = select_for_day(day_ahead_forecasts, date(2026, 1, 15))
    assert len(sel) == 24
    assert set(sel["forecast"]) == {1000}
    assert set(
        select_day_ahead(day_ahead_forecasts, date(2026, 1, 15), date(2026, 1, 15))["forecast"]
    ) == {1000}


def test_error_sign_positive_means_forecast_too_high():
    sel = pd.DataFrame(
        {
            "startTime": [ts("2026-01-10 13:00")],
            "forecast": [10.0],
            "publishTime": [ts("2026-01-10 06:00")],
        }
    )
    act = pd.DataFrame({"startTime": [ts("2026-01-10 13:00")], "generation": [7.0]})
    assert join_actuals(sel, act)["error"].iloc[0] == 3.0
