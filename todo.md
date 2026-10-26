# TODO — Implementation Checklist

Granular steps derived from [plan.md](plan.md). Each box should be small enough to finish and verify in one sitting. Section numbers like (§4.6) point back to plan.md.

---

## Phase 0 — Setup & research (~0.75h)

### 0.1 Repo
- [ ] Pick a random repo name (e.g. `kjhwr`) and create a **public** GitHub repo
- [ ] `git init` locally, add remote, default branch `main`
- [ ] Add `.gitignore` (Python: `__pycache__/`, `.venv/`, `.pytest_cache/`, `.ruff_cache/`; Node: `node_modules/`, `dist/`; misc: `.env`, `.DS_Store`, `.vercel/`)
- [ ] Commit `plan.md`, `todo.md`, `CLAUDE.md`
- [ ] Check no personal names in the repo name or files

### 0.2 Research
- [ ] Read Elexon docs for FUELHH and WINDFOR: field definitions, units, coverage
- [ ] Check what WINDFOR covers (transmission-connected? includes curtailment?) to confirm or reject the curtailment explanation (§3A Finding 2)
- [ ] Look up the GB day-ahead auction gate closure time (UK time) and write it down for the `GATE_CLOSURE` config
- [ ] Note sources (links) for the README "Assumptions" section

---

## Phase 1 — Data & analysis (~2.75h)

### 1.1 Backend skeleton
- [ ] Create folders: `backend/app/`, `backend/data/`, `backend/scripts/`, `backend/tests/`
- [ ] Create `backend/requirements.txt`: `fastapi`, `uvicorn[standard]`, `pandas`, `pyarrow`, `pydantic`, `httpx`
- [ ] Create `backend/requirements-dev.txt`: `pytest`, `ruff`, `black`, `jupyter`, `matplotlib`
- [ ] Create `backend/pyproject.toml` with ruff + black config (line length 100, target py311) and pytest `testpaths = ["tests"]`
- [ ] Create a venv and install both requirement files
- [ ] Add empty `backend/app/__init__.py`

### 1.2 Ingest script (`backend/scripts/ingest.py`)
- [ ] Constants: base URL, forecast publish window `2025-12-31T00:00Z`–`2026-02-01T00:00Z`, actuals window `2026-01-01`–`2026-02-03`
- [ ] `fetch_actuals()`: call FUELHH stream with `fuelType=WIND`, settlement-date range
- [ ] `fetch_forecasts()`: call WINDFOR stream in chunks (e.g. 7-day publish windows) to keep responses small
- [ ] Add a timeout and simple retry (3 tries with backoff) on HTTP errors
- [ ] Parse `startTime` / `publishTime` as UTC datetimes
- [ ] Actuals: keep `startTime`, `generation`; drop duplicates on `startTime` (keep latest `publishTime`); sort
- [ ] Forecasts: keep `publishTime`, `startTime`, `generation`; drop duplicates on (`publishTime`, `startTime`); **drop rows where `startTime < publishTime`**; sort
- [ ] Write `backend/data/actuals.parquet` and `backend/data/forecasts.parquet`
- [ ] Print a summary: row counts, date ranges, publishes per day, missing half-hours
- [ ] Run it; check about 1,584 actual rows, 256 publishes, 8 per day
- [ ] Commit the Parquet files (small, needed for deploy)

### 1.3 Analysis notebook (`notebooks/analysis.ipynb`)
- [ ] Load both Parquet files
- [ ] Plot January actuals; mark the windiest (27 Jan) and calmest (8 Jan) days
- [ ] Implement the horizon selection inline (latest publish ≤ T − H) and join with on-the-hour actuals
- [ ] Reproduce the §3A Finding 1 table (H = 1, 4, 12, 24, 36, 48)
- [ ] Reproduce Finding 2: bias by forecast wind bucket (<6, 6–10, 10–14, >14 GW)
- [ ] Reproduce Finding 3: bias vs spread (P90 − P10) across H = 1…48; plot both lines
- [ ] Prototype safe wind: P90 per wind bucket → `safe = max(0, forecast − P90)`
- [ ] Backtest coverage (share of hours where actual ≥ safe) for full-month and expanding-window percentiles
- [ ] Check the bucket sizes (≥ 50 points each); decide whether horizon groups are viable
- [ ] Day-ahead mode: for each delivery day, the latest publish before gate closure on D−1; compute MAE / bias / shortfall P90
- [ ] Write 3–4 headline insights in a markdown cell (feed into the video script)
- [ ] Find a replay day where the buffer clearly saves the trader (candidate: 27 Jan)

---

## Phase 2 — Backend (~3.5h)

### 2.1 Config & data loading
- [ ] `app/config.py`: `DATA_DIR`, `GATE_CLOSURE` (UK time), `WIND_BUCKETS = [0, 6000, 10000, 14000, inf]`, `MIN_BUCKET_N = 50`, `MAX_HORIZON = 48`, `CONFIDENCE_LEVELS = (0.8, 0.9, 0.95)`
- [ ] `app/data.py`: `load_actuals()`, `load_forecasts()` read Parquet once (`functools.lru_cache`)
- [ ] `app/data.py`: `hourly_actuals()` returns actuals only on the hour (alignment Option A, §4.3)

### 2.2 Forecast selection (`app/forecast.py`) — pure functions
- [ ] `select_at_horizon(forecasts, horizon_h) -> DataFrame[startTime, forecast, publishTime]`: latest publish ≤ T − H for each target
- [ ] `select_as_of(forecasts, decision_time) -> DataFrame`: latest publish ≤ decision_time, targets after decision_time
- [ ] `gate_closure_for(delivery_date) -> datetime`: D−1 at `GATE_CLOSURE`, converted UK → UTC
- [ ] `select_day_ahead(forecasts, start, end) -> DataFrame`: per delivery day, `select_as_of(gate_closure_for(D))` restricted to D's hours
- [ ] `join_actuals(selected, actuals) -> DataFrame[time, forecast, actual, publishTime, error]` with `error = forecast − actual`

### 2.3 Tests: forecast selection (`tests/test_forecast.py`)
- [ ] Fixture: tiny hand-made forecasts (3 publishes, 6 targets) and actuals
- [ ] Horizon picks the latest publish ≤ T − H
- [ ] Horizon excludes a publish that is 1 minute too late
- [ ] Horizon returns nothing for a target with no early-enough publish
- [ ] `select_as_of` never returns a publish after the decision time
- [ ] `gate_closure_for` returns the correct UTC time for a January date
- [ ] Day-ahead uses the D−1 pre-gate publish, not a later one
- [ ] Rows with `startTime < publishTime` never appear
- [ ] Error sign: forecast 10, actual 7 → error +3

### 2.4 Metrics (`app/metrics.py`) — pure functions
- [ ] `summary(errors, actuals) -> dict`: `mae`, `rmse`, `bias`, `nmae`, `p10`, `p50`, `p90`, `max`, `count`
- [ ] `shortfall_stats(errors) -> dict`: `shortfall_p90`, `shortfall_freq`, `mean_shortfall`
- [ ] `by_horizon(forecasts, actuals, horizons=range(1, 49)) -> list[dict]`: `mae`, `rmse`, `bias`, `spread = p90 − p10`
- [ ] `by_level(df) -> list[dict]`: `bias`, `mae`, `n` per wind bucket
- [ ] `by_hour(df) -> list[dict]`: `mae`, `bias` per UK hour (optional)
- [ ] Handle empty input (return `count = 0`, other values `None`)

### 2.5 Tests: metrics (`tests/test_metrics.py`)
- [ ] MAE / RMSE / bias on a 4-point hand-computed set
- [ ] Percentiles on a known set
- [ ] Shortfall frequency counts only `e > 0`
- [ ] nMAE = MAE / mean actual
- [ ] Empty input doesn't crash

### 2.6 Buffer (`app/buffer.py`) — pure functions
- [ ] `assign_bucket(forecast_mw) -> label` using `WIND_BUCKETS`
- [ ] `buffer_table(errors_df, confidence) -> dict[bucket, (p_low, p_high, n)]`; merge a bucket with its neighbour if `n < MIN_BUCKET_N`
- [ ] `buffer_table_as_of(errors_df, decision_time, confidence)`: only errors whose target time < decision_time (no look-ahead); fall back to the full-month table if too few points, and return a `fallback: bool` flag
- [ ] `apply_buffer(forecast_df, table) -> df` adding `band_low`, `band_high`, `safe_wind` (all clamped ≥ 0)
- [ ] `coverage(df) -> float`: share of rows with `actual ≥ safe_wind`

### 2.7 Tests: buffer (`tests/test_buffer.py`)
- [ ] Bucket boundaries (5,999 / 6,000 / 14,001)
- [ ] Small bucket merges with a neighbour
- [ ] As-of table ignores errors after the decision time (inject a huge future error; table unchanged)
- [ ] Fallback flag is set when history is too short
- [ ] `safe_wind` is never negative
- [ ] Coverage on a known set

### 2.8 Replay & buying sheet (`app/replay.py`)
- [ ] `build_replay(delivery_date, decision_time, confidence)`: as-of forecast for D, apply the as-of buffer, join actuals, build the summary (`forecast_mwh`, `safe_mwh`, `actual_mwh`, `hours_short`, `max_short`, `publishTime_used`, `fallback`)
- [ ] `normalise_demand(demand) -> list[float] | None`: accept one number or exactly 24 values; raise `ValueError` otherwise
- [ ] `build_buying_sheet(replay, demand)`: rows with `hour`, `forecast`, `safe_wind`, `buffer`, `demand`, `to_buy = max(0, demand − safe_wind)`, `actual`, `held`
- [ ] Totals: `forecast_mwh`, `safe_mwh`, `to_buy_mwh`, `raw_to_buy_mwh = Σ max(0, demand − forecast)`
- [ ] `to_csv(sheet) -> str` including a totals row

### 2.9 Tests: replay (`tests/test_replay.py`)
- [ ] Replay uses the publish before the decision time
- [ ] Demand: flat value expands to 24 values
- [ ] Demand: 23 values → `ValueError`
- [ ] Demand: negative value → `ValueError`
- [ ] `to_buy` clamped at 0 when safe wind > demand
- [ ] CSV totals equal the table totals
- [ ] Sheet without demand omits `to_buy` columns

### 2.10 API (`app/schemas.py`, `app/main.py`)
- [ ] Pydantic models: `SeriesPoint`, `MetricsResponse`, `HorizonRow`, `LevelRow`, `BufferRow`, `ReplayResponse`, `BuyingSheetRequest`, `BuyingSheetResponse`
- [ ] `GET /api/health`
- [ ] `GET /api/range`
- [ ] `GET /api/series?start&end&horizon|mode=dayahead`
- [ ] `GET /api/metrics?start&end&horizon|mode`
- [ ] `GET /api/metrics/by-horizon?start&end`
- [ ] `GET /api/metrics/by-level?start&end&horizon`
- [ ] `GET /api/metrics/by-hour?start&end&horizon` (optional)
- [ ] `GET /api/buffer?horizon&confidence`
- [ ] `GET /api/replay?delivery_date&decision_time&confidence`
- [ ] `POST /api/buying-sheet`
- [ ] `POST /api/buying-sheet.csv` (`text/csv`, `Content-Disposition: attachment`)
- [ ] Validation: `start < end`, within range, `0 ≤ horizon ≤ 48`, confidence in the allowed set → 400 with a clear message
- [ ] CORS for `http://localhost:5173`
- [ ] Serve `frontend/dist` as static files at `/` when present (single-image deploy)
- [ ] Cache `by-horizon` results (`lru_cache` on the date range); it's the heaviest call

### 2.11 Tests: API (`tests/test_api.py`)
- [ ] `/api/health` → 200
- [ ] `/api/series` happy path returns points with all fields
- [ ] `/api/series` with `start > end` → 400
- [ ] `/api/series` with `horizon = 99` → 400
- [ ] `/api/replay` for 27 Jan → 24 points
- [ ] `/api/buying-sheet` with bad demand length → 400
- [ ] `/api/buying-sheet.csv` returns `text/csv`

### 2.12 Backend done check
- [ ] `pytest` all green
- [ ] `ruff check . && black --check .` clean
- [ ] Open `/docs`, try every endpoint by hand
- [ ] Commit

---

## Phase 3 — Docker & first deploy (~1.25h)

### 3.1 Docker
- [ ] `Dockerfile` stage 1: `node:20-alpine`, `npm ci`, `npm run build` in `frontend/`
- [ ] `Dockerfile` stage 2: `python:3.11-slim`, install `requirements.txt`, copy `backend/` and `frontend/dist`
- [ ] `CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`
- [ ] `.dockerignore` (`node_modules`, `.venv`, `.git`, caches, notebooks)
- [ ] `docker-compose.yml`: one service, port 8000
- [ ] `docker compose up --build` → `/api/health` works and the frontend loads

### 3.2 Vercel
- [ ] `api/index.py`: add `backend/` to `sys.path`, `from app.main import app`
- [ ] Root `requirements.txt` for Vercel (or point to the backend one)
- [ ] `vercel.json`: build the frontend (`frontend/dist` as output), route `/api/(.*)` → `api/index.py`, everything else → `index.html`
- [ ] Make sure the Parquet files are included in the function bundle (`includeFiles`)
- [ ] Deploy a "hello" version: `/api/health` and an empty React page
- [ ] Check the function size and cold start; if they're bad, switch to the Render/Heroku Docker fallback
- [ ] Note the live URL

---

## Phase 4 — Frontend (~5h)

### 4.1 Setup
- [ ] `npm create vite@latest frontend -- --template react-ts`
- [ ] Install `recharts`, `date-fns`, `date-fns-tz`
- [ ] ESLint + Prettier config; add `lint` and `format` scripts
- [ ] `vite.config.ts`: proxy `/api` → `http://localhost:8000`
- [ ] Base styles: CSS variables for colours (actual = blue, forecast = green, band = light green, shortfall = red), system font, responsive container

### 4.2 Data layer
- [ ] `src/types.ts`: TS types mirroring the Pydantic models
- [ ] `src/api.ts`: typed functions for every endpoint; throw on non-2xx with the server message
- [ ] `useApi` hook (or small helper) returning `{data, loading, error}`
- [ ] `src/format.ts`: `formatMW`, `formatGWh`, `formatUKTime` (UTC → Europe/London)

### 4.3 App shell
- [ ] `App.tsx`: header with title + two tabs (Decision replay, Accuracy); default tab = replay
- [ ] Remember the last tab in `localStorage` (wrapped in try/catch)
- [ ] Shared loading spinner, error banner and empty-state components

### 4.4 Tab 1 — Decision replay
- [ ] `ReplayControls`: delivery-day picker (limited to the available range), decision-time picker (default = gate closure D−1), confidence radio (80/90/95)
- [ ] Fetch `/api/replay` on change
- [ ] `SafeWindPanel`: three tiles (Forecast GWh, Safe wind GWh, Outcome "covered N/24")
- [ ] `GenerationChart` (replay mode): forecast line, shaded band (`Area` between `band_low` and `band_high`), dashed safe-wind line
- [ ] "Reveal actual" button toggles the actual line and the Outcome tile
- [ ] Badge showing which publish was used ("Forecast published 9 Jan 09:30")
- [ ] Banner when `fallback = true` ("Early January: buffer uses full-month history")

### 4.5 Demand input & buying sheet
- [ ] `DemandInput`: mode toggle (Flat / Paste 24 / Upload CSV)
- [ ] Flat: number input with an MW label
- [ ] Paste: textarea; parse comma- or newline-separated values; show a count ("24/24 values")
- [ ] Upload: read a CSV file client-side; take the first numeric column
- [ ] Client-side validation (24 values, ≥ 0) with inline errors
- [ ] POST `/api/buying-sheet` when the demand is valid
- [ ] `BuyingSheet`: table with Hour (UK), Forecast, Safe wind, Buffer, Demand, To buy, ✓/✗ (✗ shows the shortfall MW)
- [ ] Hide the demand / to-buy columns when there's no demand
- [ ] Totals row + summary line ("Buy X GWh; raw forecast would suggest Y GWh")
- [ ] "Export CSV" button → POST `/api/buying-sheet.csv` → download the file

### 4.6 Tab 2 — Accuracy explorer
- [ ] `AccuracyControls`: start/end date pickers, horizon slider 0–48 (debounced), day-ahead toggle
- [ ] `KpiTiles`: MAE, Bias, Shortfall P90, Buffer coverage, each with a plain-English caption
- [ ] `GenerationChart` (explorer mode): actual + forecast lines with the band; tooltip shows actual, forecast, error and the publish used
- [ ] `HorizonChart`: two lines (bias, spread) over H = 1…48; marker at the current slider value
- [ ] `LevelChart`: bar chart of bias per wind bucket
- [ ] `ErrorDistribution`: histogram of errors, shortfall side (> 0) in red
- [ ] Default view: all of January, H = 24

### 4.7 Frontend done check
- [ ] `npm run lint` and `npx prettier --check src` clean
- [ ] `npm run build` succeeds
- [ ] Manual pass: every control, both tabs, CSV export, bad demand input
- [ ] Laptop width looks right; phone width doesn't scroll sideways
- [ ] Commit

---

## Phase 5 — Polish & final deploy (~1h)

- [ ] Units on every axis, tile and column (MW vs MWh/GWh)
- [ ] All times shown in UK time
- [ ] Page title, favicon, footer "Data: Elexon BMRS"
- [ ] Remove console logs and dead code
- [ ] Final `pytest`, `ruff`, `black`, `npm run lint`, `npm run build`
- [ ] Optional: GitHub Actions workflow running pytest + lint on push
- [ ] Redeploy; test the live app in an incognito window
- [ ] Fill in real numbers in place of the placeholders (312 / 268 GWh, coverage %) in the video script notes

### 5.1 README.md
- [ ] What the app does (2–3 lines)
- [ ] Live app link
- [ ] Video link (fill in after Phase 6)
- [ ] Directory and file descriptions
- [ ] How to run with Docker
- [ ] How to run without Docker (backend + frontend separately)
- [ ] How to refresh the data (`python backend/scripts/ingest.py`)
- [ ] How to run tests and lint
- [ ] Design decisions & assumptions: horizon rule, alignment, gate closure time, error sign, no look-ahead, curtailment explanation, bucket choice
- [ ] Key findings (short)
- [ ] Future work
- [ ] **Explicit AI tools statement**
- [ ] Commit and push

---

## Phase 6 — Video (~1.75h)

- [ ] Write the Part 1 script (client, ≤ 5 min) from plan.md §12 with real numbers
- [ ] Write the Part 2 script (tech lead, ≤ 5 min)
- [ ] Prepare the architecture diagram slide (or show plan.md §5)
- [ ] Open tabs ready to show: live app on replay 27 Jan, VS Code on `forecast.py` / `buffer.py` / tests
- [ ] Rehearse each part once with a timer
- [ ] Record (screen + voice); check the audio
- [ ] Total ≤ 10 min; trim if needed
- [ ] Upload to YouTube as **Unlisted**
- [ ] Add the video link to the README; push

---

## Phase 7 — Submission

- [ ] Repo is public with a random name
- [ ] Open the repo link in incognito → visible
- [ ] Open the live app link in incognito → loads data
- [ ] Open the video link in incognito → plays (unlisted, not private)
- [ ] README links all work
- [ ] Fill in and submit the form
