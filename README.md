# Windcheck — Day-ahead wind forecast monitor

A decision tool for a GB energy utility's day-ahead trading team. It answers one question:

> **How much wind can I safely count on tomorrow, and so how much power do I need to buy?**

It compares Elexon's national wind forecasts (WINDFOR) with actual wind generation (FUELHH) for decisions made in **January 2026**, measures how wrong the forecasts are, and turns that error into a **safe-wind** figure and an hour-by-hour **buying sheet**.

- **Live app:** https://windcheck-chi.vercel.app
- **Video walkthrough:** _TODO: add unlisted YouTube URL_

---

## What the app does

**Tab 1 — Decision replay** (the trader's view)
- Pick a delivery day. The app shows exactly the forecast the trader had at the decision time (default: day-ahead gate closure, 09:20 UK on the day before).
- A shaded likely range and a **safe wind** line (forecast minus the error that was exceeded only 10% of the time, learned per wind level).
- **Reveal actual** shows what really happened and whether the safe wind held, hour by hour.
- **Buying sheet:** enter demand (one flat MW value or 24 hourly values, or upload a CSV) to get `to buy = demand − safe wind` per hour, with totals and **CSV export**.

**Tab 2 — Accuracy explorer** (the evidence)
- Day-ahead forecast or any fixed horizon (0–48 h, slider), over any date range in January.
- KPIs: typical miss (MAE), bias, worst-10% shortfall, and an **out-of-sample backtest** of the safe-wind number.
- Charts: forecast vs actual with band, bias and spread by horizon, over-forecast by wind level, distribution of misses.

## Key findings (January 2026)

| | Day-ahead forecast |
|---|---|
| Typical miss (MAE) | 2.1 GW (18% of average wind) |
| Bias | **+1.8 GW too high**, too high in **85%** of hours |
| Over-forecast when forecast > 14 GW | **+2.6 GW** (vs +0.7–0.8 GW below 10 GW) |
| Safe-wind (90%) coverage, honest backtest | **86.6%** (89.7% in-sample) |

1. The raw forecast overstates usable wind by ~12%. A 1.5 GW over-forecast even **1 hour** ahead means the bias is systematic, not weather uncertainty.
2. The gap is largest on windy days. Forecasts reach 21 GW while actual never exceeds 17.8 GW: **likely curtailment** (wind farms paid to switch off when the grid is full). Not confirmed from Elexon's dataset definitions, so stated as "likely".
3. Buying later doesn't remove the bias (flat at ~1.5–1.8 GW across horizons), but it does narrow the uncertainty (P90−P10 spread ~4.2 GW at 1 h vs ~5.4 GW at 48 h).
4. On 27 Jan (windiest day), the day-ahead forecast was **82 GWh too high**; the safe-wind figure held in **23 of 24 hours**. With 30 GW demand, the sheet says buy 362 GWh; trusting the raw forecast would have bought only 243 GWh.

Full analysis: [notebooks/analysis.ipynb](notebooks/analysis.ipynb).

---

## How to run

### With Docker (one command)
```bash
docker compose up --build
# open http://localhost:8000
```
The image builds the React app and serves it from FastAPI together with the API.

### Without Docker
Prerequisites: Python 3.11, Node 20.

```bash
# Backend (terminal 1)
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows; on macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload     # http://localhost:8000, API docs at /docs

# Frontend (terminal 2)
cd frontend
npm install
npm run dev                       # http://localhost:5173 (proxies /api to :8000)
```

### Tests and lint
```bash
cd backend && pytest                                # 37 tests
cd backend && ruff check . && black --check .
cd frontend && npm run lint && npx prettier --check src && npm run build
```

### Refresh the data
The app ships with the January 2026 data in `backend/data/` and never calls Elexon at runtime. To re-download:
```bash
python backend/scripts/ingest.py
```

---

## Repository layout

```
├── backend/
│   ├── app/
│   │   ├── config.py        # gate closure, wind buckets, limits
│   │   ├── data.py          # load the bundled data once (cached)
│   │   ├── forecast.py      # which forecast the trader had: horizon rule, day-ahead, as-of
│   │   ├── metrics.py       # MAE, RMSE, bias, percentiles, shortfall, by horizon/level/hour
│   │   ├── buffer.py        # safe wind: per-wind-level error percentiles, no-look-ahead, backtest
│   │   ├── replay.py        # decision replay, buying sheet, CSV export
│   │   ├── schemas.py       # Pydantic response models (OpenAPI docs at /docs)
│   │   └── main.py          # FastAPI routes, validation, caching, static frontend
│   ├── data/                # actuals.csv.gz, forecasts.csv.gz (Elexon, Jan 2026)
│   ├── scripts/ingest.py    # Elexon API -> data/
│   ├── tests/               # pytest: unit tests per module + API tests
│   ├── requirements.txt     # runtime deps
│   ├── requirements-dev.txt # + test, lint, notebook deps
│   └── pyproject.toml       # ruff, black, pytest config
├── frontend/
│   └── src/
│       ├── App.tsx          # shell + tabs
│       ├── api.ts, types.ts # typed API client, mirrors schemas.py
│       ├── format.ts        # MW/GWh and UK-time formatting
│       ├── useApi.ts        # fetch hook (loading/error, stale-response safe), debounce
│       └── components/      # ReplayView, BuyingSheet, DemandInput, GenerationChart,
│                            # AccuracyView, AccuracyCharts, common UI pieces
├── api/index.py             # Vercel serverless entry (wraps backend FastAPI app)
├── vercel.json              # Vercel: build frontend, route /api/* to the Python function
├── requirements.txt         # Python deps for the Vercel function
├── Dockerfile               # multi-stage: build React -> run FastAPI
├── docker-compose.yml
├── notebooks/analysis.ipynb # exploration and findings (uses the backend modules)
├── docs/research.md         # gate closure and dataset research, with sources
├── plan.md, todo.md         # project plan and implementation checklist
└── CLAUDE.md                # commands and rules for AI-assisted development
```

---

## Design decisions & assumptions

| Topic | Decision |
|---|---|
| **Horizon rule** | For target time T and horizon H: the latest forecast with `publishTime ≤ T − H`. |
| **Day-ahead** | Latest forecast before **09:20 UK on D−1** (EPEX GB hourly auction gate closure; N2EX is 09:50). In January this is the 07:30 UTC publish. See [docs/research.md](docs/research.md). |
| **Scope window** | Forecasts *published* 31 Dec 2025 – 31 Jan 2026 (decisions made in January, incl. D−1 for 1 Jan); actuals 1 Jan – 3 Feb. Delivery days 1 Jan – 1 Feb. |
| **Alignment** | Forecasts are hourly, actuals half-hourly: compare on the hour (forecast 10:00 vs the actual half-hour starting 10:00). |
| **Error sign** | `error = forecast − actual`; positive = forecast too high = **shortfall** for the buyer (the costly direction). |
| **Past rows** | WINDFOR includes rows for times before the publish; these are dropped (a forecast of the past isn't a forecast). |
| **Safe wind** | `max(0, forecast − P90(error))`, with P90 computed **per forecast wind level** (<6, 6–10, 10–14, >14 GW) because the error depends strongly on wind level. Buckets with < 50 points borrow from neighbours. |
| **No look-ahead** | In replay and the backtest, percentiles use only errors whose actual was known before the decision time. With less than a week of history (decisions up to 7 Jan), the full month is used and the UI says so. |
| **Metrics** | No MAPE: it explodes at low wind. nMAE (MAE / mean actual) is used instead. |
| **Data at runtime** | Pre-fetched and bundled (~90 KB). Fixed historical window, fast, no rate limits. In production this would be a scheduled ingest. |
| **Time zones** | UTC internally; UI shows UK time (GMT = UTC in January; BST handled in code and tested). |

## Development practices
- Core logic lives in pure functions (`forecast`, `metrics`, `buffer`, `replay`) with no I/O, so it is unit-tested with small hand-computed examples (37 tests), including boundary cases such as a publish 1 minute too late and a large future error that must not affect the buffer.
- The HTTP layer (`main.py`) only validates, caches and shapes JSON. Pydantic models document every response at `/docs`.
- Typed end to end: Python type hints and Pydantic, TypeScript types mirroring the schemas.
- Formatting and lint: black + ruff, eslint + prettier.
- Chart colours are checked for colour-blind safety; every series has a legend and the buying sheet is a table view of the same data.


