import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_series_happy_path(client):
    resp = client.get("/api/series", params={"start": "2026-01-10", "end": "2026-01-10"})
    assert resp.status_code == 200
    points = resp.json()
    assert len(points) == 24
    assert {"time", "forecast", "actual", "error", "publishTime", "safe_wind"} <= points[0].keys()


def test_series_rejects_reversed_range(client):
    resp = client.get("/api/series", params={"start": "2026-01-20", "end": "2026-01-10"})
    assert resp.status_code == 400


def test_series_rejects_horizon_out_of_range(client):
    assert client.get("/api/series", params={"horizon": 99}).status_code == 422


def test_metrics_rejects_unknown_confidence(client):
    assert client.get("/api/metrics", params={"confidence": 0.5}).status_code == 400


def test_metrics_include_backtest(client):
    body = client.get("/api/metrics", params={"mode": "dayahead"}).json()
    assert body["count"] > 700
    assert 0 < body["backtest_coverage"] <= 100


def test_replay_for_windiest_day(client):
    body = client.get("/api/replay", params={"delivery_date": "2026-01-27"}).json()
    assert len(body["points"]) == 24
    assert body["decision_time"].startswith("2026-01-26T09:20")
    assert body["summary"]["publish_time_used"].startswith("2026-01-26T07:30")


def test_replay_rejects_decision_after_delivery_starts(client):
    resp = client.get(
        "/api/replay",
        params={"delivery_date": "2026-01-27", "decision_time": "2026-01-27T10:00"},
    )
    assert resp.status_code == 400


def test_buying_sheet_with_flat_demand(client):
    body = client.post(
        "/api/buying-sheet", json={"delivery_date": "2026-01-27", "demand": 30000}
    ).json()
    assert len(body["rows"]) == 24
    assert body["totals"]["to_buy_mwh"] >= body["totals"]["raw_to_buy_mwh"]


def test_buying_sheet_rejects_wrong_demand_length(client):
    resp = client.post("/api/buying-sheet", json={"delivery_date": "2026-01-27", "demand": [1, 2]})
    assert resp.status_code == 400


def test_buying_sheet_csv(client):
    resp = client.post(
        "/api/buying-sheet.csv", json={"delivery_date": "2026-01-27", "demand": 30000}
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert "TOTAL" in resp.text
