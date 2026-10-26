from datetime import time
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

UK_TZ = "Europe/London"
# EPEX GB hourly day-ahead auction gate closure on D-1 (see docs/research.md).
GATE_CLOSURE = time(9, 20)

# Forecast wind level buckets in MW (see plan.md, Finding 2).
WIND_BUCKETS = [0, 6000, 10000, 14000, float("inf")]
WIND_BUCKET_LABELS = ["<6 GW", "6-10 GW", "10-14 GW", ">14 GW"]
# Minimum errors behind a bucket's percentile before it borrows from neighbours.
MIN_BUCKET_N = 50
# Minimum error history before an as-of buffer table is trusted; otherwise use the full month.
MIN_HISTORY_N = 168

MAX_HORIZON = 48
CONFIDENCE_LEVELS = (0.8, 0.9, 0.95)
DEFAULT_CONFIDENCE = 0.9
