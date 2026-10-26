# Wind Forecast Monitor — Project Plan

## 1. Goal in one line

Build a **decision tool** for a UK energy utility's day-ahead trading team that answers:

> **"How much wind can I safely count on tomorrow, so how much power do I need to buy?"**

It shows the **wind generation forecast**, compares it with **what actually happened**, measures **how wrong the forecast usually is**, and turns that error into a **safe-wind number and buffer** the trader can act on.

Not an ML project. Elexon already publishes the forecasts. We **fetch, align, measure and visualise** them, then translate the error into a buying recommendation.

### Product pillars
1. **Decision replay**: "what did I know at decision time, and what really happened?"
2. **Safe wind + uncertainty band**: forecast adjusted by historical error
3. **Shortfall-focused accuracy**: being short costs more than being long
4. **Accuracy explorer**: error by horizon, distribution, KPIs
5. **Buying sheet**: hour-by-hour plan for the delivery day (forecast, safe wind, buffer, and how much to buy if the user enters demand), exportable as CSV

---

## 2. Scope

### In scope
- National-level **wind** only, from Elexon BMRS:
  - Actuals: `FUELHH` stream, `fuelType=WIND`
  - Forecasts: `WINDFOR` stream
- Data relevant to **purchase decisions made in January 2026**
- React frontend, Python backend, Docker, deployed on Vercel (or Heroku/Render)
- README, public repo with a random name, video (max 10 min)

### Out of scope (mention as "future work" in the video)
- Our own forecasting / ML models
- Solar, prices, other fuel types
- Demand **data** from external sources (the brief limits us to Elexon wind). Demand typed in by the user **is** in scope (see 4.8).
- User accounts, live alerts, scheduled ingestion

---

## 3. Data facts (checked against the live API)

| | FUELHH (actuals) | WINDFOR (forecasts) |
|---|---|---|
| URL | `https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream` | `https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream` |
| Query params | `settlementDateFrom`, `settlementDateTo`, `fuelType=WIND` | `publishDateTimeFrom`, `publishDateTimeTo` |
| Resolution | 30 min | **1 hour** |
| Publish frequency | every 30 min | **~8 per day** (02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30 UTC) |
| Each publish covers | — | ~73 hourly points, about 3 days ahead |
| Fields used | `startTime`, `generation` (MW) | `publishTime`, `startTime`, `generation` (MW) |
| Timezone | UTC (`Z`) | UTC (`Z`) |

### Date window
- "Decisions made in January 2026" means forecasts **published** from `2025-12-31T00:00Z` to `2026-02-01T00:00Z`
- Those forecasts target delivery up to about Feb 3, so fetch actuals from **2026-01-01 to 2026-02-03**
- Expected volume: about 31 × 8 × 73 ≈ **18k forecast rows**, about **1.6k actual rows**. Small enough to bundle with the app.

---

## 3A. Data findings (from a first look at January 2026)

### Data quality
- **Actuals:** 1,584 half-hours (1 Jan to 2 Feb), **no missing values**. Average **11.4 GW**, min 1.7 GW, max 17.8 GW.
- **Forecasts:** 18,688 rows from 256 publishes, **exactly 8 per day** every day.
- Forecast `startTime` is **always on the hour**, which confirms alignment Option A (compare on the hour).
- Each publish covers from about **−25h to +66h**. Rows with `startTime < publishTime` (forecasting the past) must be **filtered out**.
- **Demo days:** windiest **27 Jan** (16.4 GW avg), calmest **8 Jan** (4.5 GW avg).

### Finding 1: the forecast is almost always too high
Latest forecast published at least H hours before each target hour, `e = forecast − actual`:

| Horizon | MAE | Bias | P10 | P90 | % hours forecast too high |
|---|---|---|---|---|---|
| 1h | 1,753 MW | **+1,517 MW** | −416 | +3,760 | 86% |
| 4h | 1,786 MW | +1,563 MW | −259 | +3,806 | 86% |
| 12h | 1,842 MW | +1,617 MW | −263 | +3,804 | 86% |
| 24h | 1,965 MW | +1,737 MW | −400 | +4,012 | 85% |
| 36h | 2,139 MW | +1,797 MW | −770 | +4,179 | 82% |
| 48h | 2,263 MW | +1,735 MW | −964 | +4,458 | 82% |

- Overall, **actual ≈ 88% of forecast**.
- A 1.5 GW miss **one hour ahead** can't be weather uncertainty, so the bias is **systematic**.

### Finding 2: the bias explodes at high wind
| Forecast level | Avg over-forecast |
|---|---|
| < 6 GW | 564 MW |
| 6–10 GW | 579 MW |
| 10–14 GW | 671 MW |
| **> 14 GW** | **2,634 MW** |

- Forecast reaches **21.3 GW**, actual never exceeds **17.8 GW**.
- **Likely cause: curtailment.** On very windy days the grid can't carry all the power (especially Scotland → England), so wind farms are paid to switch off. The forecast shows what wind *could* produce; FUELHH shows what was *metered onto the grid*. A difference in which wind farms each dataset covers may also contribute.
- **To do (Phase 0):** confirm against Elexon's dataset definitions before stating it as fact. Until then, the pitch says "likely".

### Finding 3: lead time matters less than expected
The miss has two parts:
1. **Fixed bias** (~1.5–1.8 GW too high), roughly **flat** across horizons. Waiting for a later forecast doesn't remove it.
2. **Random spread** (P90 − P10), which **grows** with horizon: about **4.2 GW at 1h** to about **5.4 GW at 48h**.

The big fixed bias hides the growing spread, which is why MAE only goes from 1.75 to 2.26 GW.

### What these findings change in the plan
| Finding | Change |
|---|---|
| Strong systematic bias | Lead the pitch with it: "the raw forecast overstates usable wind by ~12%". Safe wind (4.6) corrects for it automatically because it uses real past errors. |
| Bias depends on wind level | **Per-wind-level buffer is now core** (see 4.6), not a nice-to-have. A flat buffer is too big on calm days and too small on stormy ones. |
| Bias flat, spread grows | Error-vs-horizon chart shows **two lines: bias and spread** (P90 − P10), not one MAE line. |
| Forecast rows for past hours | Ingest/logic filters `startTime ≥ publishTime`. |

---

## 4. Core logic (the most important part)

### 4.1 Forecast horizon
For a target time **T** and horizon **H** hours:

> Use the **latest forecast whose `publishTime` ≤ T − H**.

Example: T = 10 Jan 12:00, H = 24h, so use the latest forecast published at or before 9 Jan 12:00 (that is the 9 Jan 11:30 publish).

Implementation: `pandas.merge_asof` on `publishTime`, grouped by `startTime`, or a sort-and-filter. Must be unit-tested.

### 4.2 Day-ahead decision mode (domain extra)
For delivery day **D**, use the **latest forecast published before gate closure on D−1**.
- The gate closure time is a config value. **Default 09:20 UK** (EPEX GB hourly day-ahead auction; N2EX closes 09:50). See [docs/research.md](docs/research.md). In January UK time = UTC, so the day-ahead forecast is the **07:30 UTC publish on D−1**.
- This matches how the trading team actually works and is a strong pitch point.

### 4.3 Aligning hourly forecasts with half-hourly actuals
Choose one approach and document it:
- **Option A (recommended):** compare only on the hour (forecast at 10:00 vs actual 10:00–10:30). Simple and transparent.
- Option B: average the two actual half-hours (10:00 and 10:30) and compare with the hourly forecast.

### 4.4 Error metrics
Error `e = forecast − actual` (positive means over-forecast, i.e. less wind arrived than expected, so we are short).

| Metric | Meaning for the client |
|---|---|
| MAE | "Typically off by X MW" |
| RMSE | Penalises big misses |
| Bias (mean error) | "Forecast tends to be too high/low by X MW" |
| nMAE (MAE / mean actual) | Accuracy as a % without MAPE blow-ups at low wind |
| P10 / P50 / P90 of error | "90% of the time the shortfall was below X MW", which gives the **safety buffer** |
| Max error | Worst case seen in January |

Breakdowns:
- **Error vs horizon** (1h → 48h): plot **bias** and **spread (P90 − P10)** as two lines (see Finding 3)
- **Error by forecast wind level**: bias per bucket (see Finding 2)
- **Error by hour of day** (optional)
- **Error by day** (find the bad days, e.g. storms)

Do **not** use MAPE (division by near-zero wind).

### 4.5 Shortfall vs surplus (asymmetric risk)
The two error directions don't cost the same:
- **Shortfall** (`e > 0`, forecast too high): less wind arrives, the team is short and must buy at expensive imbalance/intraday prices. **Costly.**
- **Surplus** (`e < 0`, forecast too low): extra wind, usually cheaper to deal with.

So, alongside the symmetric metrics, report:
- **Shortfall P90**: 90% of the time the shortfall was below this many MW
- **Shortfall frequency**: % of hours where the forecast was too high
- **Mean shortfall** when a shortfall happens

### 4.6 Safe wind & uncertainty band
Turn the historical error at horizon H into a planning figure for each target hour:

```
safe_wind   = max(0, forecast − P90(e))     # can count on this 90% of the time
band_low    = max(0, forecast − P90(e))     # likely range of actual
band_high   =        forecast − P10(e)
to_procure  = demand − safe_wind            # demand is the user's input (optional, not from Elexon)
```

- **Percentiles are computed per wind-level bucket** (forecast < 6 GW, 6–10, 10–14, > 14 GW; see Finding 2), so stormy hours get a bigger buffer than calm ones. Use horizon groups too (e.g. 0–12h, 12–24h, 24–48h) if each bucket still has enough points (aim for ≥ 50); otherwise merge buckets.
- Confidence level is a control (80 / 90 / 95%).
- **Look-ahead caveat:** in replay mode, compute the percentiles only from errors **known before the decision time** (expanding window). For the first days of January, fall back to the full-month errors and label it clearly. State this in the README and the video; a tech lead will look for it.
- **Backtest the buffer:** report the **coverage**, i.e. how often actual ≥ safe_wind across January. At 90% we expect about 90%. This proves the number can be trusted.

### 4.7 Decision replay
The user picks a **decision moment** (default: gate closure on D−1) and a delivery day D.
1. Find the latest forecast published at or before the decision moment (same rule as 4.1/4.2).
2. Show what the trader saw: forecast, band and safe wind for D (48 half-hours or 24 hours).
3. Reveal the actual line on top, and summarise: "Forecast said X MWh, safe wind Y MWh, actual Z MWh: the buffer covered it / it fell short by N MW in K hours."

This maps directly to requirement 1 ("latest forecasts available when they need to make decisions") and is the centrepiece of the client demo.

### 4.8 Buying sheet & demand input (closes the decision loop)
Without demand, the app can only say "count on X MW of wind". This step turns it into "buy Y MWh".

**Demand input**
- Optional input on the replay tab: either **one flat value** (e.g. 25,000 MW for every hour) or **paste/upload 24 hourly values** (CSV).
- Not stored or sent anywhere beyond the request; it's the user's own number.
- When empty, the sheet still works and just omits the procurement columns.

**Buying sheet** (hour-by-hour table for delivery day D, from the same data as the replay):

| Hour (UK) | Forecast (MW) | Safe wind (MW) | Buffer (MW) | Demand (MW) | To buy (MWh) |
|---|---|---|---|---|---|
| 00:00 | 12,400 | 10,100 | 2,300 | 24,000 | 13,900 |
| … | … | … | … | … | … |
| **Total** | | | | | **Σ** |

```
buffer   = forecast − safe_wind
to_buy   = max(0, demand − safe_wind) × 1h     # MWh per hourly block
```

- Totals row for the day (GWh), plus a one-line summary: "Buy 312 GWh for 10 Jan; raw forecast would have suggested 268 GWh."
- **Export to CSV** button, so the trader can take it straight into their order workflow.
- In replay mode, an extra "actual" column shows whether the safe wind held for each hour (✓ / ✗ shortfall N MW).
- Hourly rows match the forecast resolution and GB hourly day-ahead products.

---

## 5. Architecture

```
            ┌──────────────────────┐
Elexon API ─▶  ingest.py (one-off) ─┼─▶ backend/data/actuals.parquet
            └──────────────────────┘    backend/data/forecasts.parquet
                                              │
                                   FastAPI + pandas (Python)
                     /api/health  /api/actuals  /api/forecast  /api/metrics
                                              │  JSON
                                   React + Vite + TypeScript
                            controls · line chart · KPI tiles · error charts
```

### Key decisions (and why)
| Decision | Reason |
|---|---|
| Pre-fetch data into Parquet, don't call Elexon live | Fixed historical window, small size, fast, no rate limits, works offline. In production: a scheduled ingest job. |
| FastAPI | Typed, auto-generates OpenAPI docs at `/docs`, quick to build |
| pandas | `merge_asof` and percentiles in a few lines |
| React + Vite + TypeScript | Fast dev setup, type safety |
| Recharts | Simple React-native charts, enough for line and bar charts |
| One Docker image (FastAPI serves the built React app) for local/Heroku, plus Vercel config for deploy | Fewer moving parts |

---

## 6. Repository structure

```
<random-name>/
├── README.md
├── plan.md
├── docker-compose.yml
├── Dockerfile                  # multi-stage: build React → run FastAPI
├── vercel.json
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI app, routes, CORS, static files
│   │   ├── data.py             # load Parquet once, cache in memory
│   │   ├── forecast.py         # horizon + day-ahead selection logic
│   │   ├── metrics.py          # MAE, RMSE, bias, percentiles, shortfall stats
│   │   ├── buffer.py           # safe wind, band, expanding-window percentiles, coverage
│   │   ├── replay.py           # decision-replay + buying-sheet assembly, CSV export
│   │   └── schemas.py          # Pydantic response models
│   ├── data/
│   │   ├── actuals.parquet
│   │   └── forecasts.parquet
│   ├── scripts/
│   │   └── ingest.py           # fetch from Elexon → Parquet
│   ├── tests/
│   │   ├── test_forecast.py
│   │   └── test_metrics.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api.ts              # typed fetch helpers
│   │   ├── components/
│   │   │   ├── Controls.tsx        # date range, horizon slider, mode toggle, confidence
│   │   │   ├── ReplayView.tsx      # decision replay: pick day, reveal actual
│   │   │   ├── SafeWindPanel.tsx   # safe wind / to-procure summary
│   │   │   ├── DemandInput.tsx     # flat value or 24 pasted/uploaded values
│   │   │   ├── BuyingSheet.tsx     # hourly table + totals + CSV export
│   │   │   ├── GenerationChart.tsx # actual vs forecast + shaded band
│   │   │   ├── KpiTiles.tsx        # MAE, bias, shortfall P90, coverage
│   │   │   ├── HorizonChart.tsx    # error vs horizon
│   │   │   └── ErrorDistribution.tsx
│   │   └── types.ts
│   ├── package.json
│   └── vite.config.ts
├── api/
│   └── index.py                # Vercel serverless entry → imports backend app
└── notebooks/
    └── analysis.ipynb          # exploration + findings for the pitch
```

---

## 7. API design

| Endpoint | Params | Returns |
|---|---|---|
| `GET /api/health` | — | `{status: "ok"}` |
| `GET /api/range` | — | available min/max dates |
| `GET /api/series` | `start`, `end`, `horizon` (hours) **or** `mode=dayahead` | `[{time, actual, forecast, publishTime}]` |
| `GET /api/metrics` | `start`, `end`, `horizon` / `mode` | `{mae, rmse, bias, nmae, p10, p50, p90, max, count, shortfall_p90, shortfall_freq, mean_shortfall, coverage}` |
| `GET /api/replay` | `delivery_date`, `decision_time` (default: gate closure D−1), `confidence` | `{publishTime_used, points: [{time, forecast, band_low, band_high, safe_wind, actual}], summary: {forecast_mwh, safe_mwh, actual_mwh, hours_short, max_short}}` |
| `POST /api/buying-sheet` | body: `delivery_date`, `decision_time`, `confidence`, `demand` (optional: one number or 24 values) | `{rows: [{hour, forecast, safe_wind, buffer, demand, to_buy, actual, held}], totals: {forecast_mwh, safe_mwh, to_buy_mwh, raw_to_buy_mwh}}` |
| `POST /api/buying-sheet.csv` | same body | CSV file download |
| `GET /api/buffer` | `horizon`, `confidence` | `[{wind_bucket, p_low, p_high, coverage, n}]` buffer table used by the band |
| `GET /api/metrics/by-level` | `start`, `end`, `horizon` | `[{wind_bucket, bias, mae, n}]` |
| `GET /api/metrics/by-horizon` | `start`, `end` | `[{horizon, mae, rmse, bias, spread}]` for H = 1…48 |
| `GET /api/metrics/by-hour` | `start`, `end`, `horizon` | `[{hour, mae, bias}]` (optional) |

Validation: `start < end`, within the available range, `0 ≤ horizon ≤ 48`; `demand` is either one non-negative number or exactly 24 non-negative values. Return clear 400 errors.

---

## 8. Frontend (two tabs)

### Tab 1: Decision replay (default, the pitch screen)
```
┌─────────────────────────────────────────────────────────────┐
│ Wind Forecast Monitor        [Decision replay] [Accuracy]   │
│ Delivery day: [10 Jan 2026]  Decision at: [09 Jan 09:00]    │
│ Confidence: (80) (●90) (95)                [Reveal actual]  │
├───────────────────┬───────────────────┬─────────────────────┤
│ Forecast          │ Safe wind (90%)   │ Outcome             │
│ 182 GWh           │ 151 GWh           │ Buffer covered 23/24│
├───────────────────┴───────────────────┴─────────────────────┤
│ Forecast line + shaded band; safe-wind dashed line;         │
│ actual line appears after "Reveal actual"                   │
├─────────────────────────────────────────────────────────────┤
│ Demand: (●Flat [25,000] MW) (Paste 24 values) (Upload CSV)  │
├─────────────────────────────────────────────────────────────┤
│ Buying sheet                                  [Export CSV]  │
│ Hour │ Forecast │ Safe wind │ Buffer │ Demand │ To buy │ ✓/✗ │
│ 00:00│ 12,400   │ 10,100    │ 2,300  │ 24,000 │ 13,900 │ ✓   │
│ …                                                           │
│ Total: buy 312 GWh (raw forecast would suggest 268 GWh)     │
└─────────────────────────────────────────────────────────────┘
```

### Tab 2: Accuracy explorer
```
┌─────────────────────────────────────────────────────────────┐
│ [Start date] [End date]  Horizon: ──●────── 24h  [Day-ahead]│
├──────────┬──────────┬──────────────┬────────────────────────┤
│ MAE      │ Bias     │ Shortfall P90│ Buffer coverage        │
│ 1,240 MW │ +310 MW  │ 2,900 MW     │ 89.6% (target 90%)     │
├──────────┴──────────┴──────────────┴────────────────────────┤
│  Actual vs Forecast (line chart, actual = blue, fc = green) │
│  with shaded uncertainty band                               │
├──────────────────────────────┬──────────────────────────────┤
│ Error vs horizon             │ Bias by forecast wind level  │
│ (bias + spread lines)        │ (bars: <6, 6–10, 10–14, >14) │
├──────────────────────────────┴──────────────────────────────┤
│ Error distribution (hist, shortfall side highlighted)       │
└─────────────────────────────────────────────────────────────┘
```

- Default view: all of January, horizon 24h
- Tooltip shows actual, forecast, error and which publish was used
- Plain-English captions under each KPI ("Typically off by…", "Keep this much buffer…")
- Loading and empty/error states
- Works on a laptop screen; basic mobile responsiveness

---

## 9. Testing & quality

- **Unit tests (pytest)**:
  - Horizon selection: picks the latest publish ≤ T−H; excludes later ones; handles "no forecast available"
  - Day-ahead selection respects gate closure
  - Metrics on a tiny hand-computed dataset
  - Shortfall stats use the correct sign (forecast > actual = shortfall)
  - Expanding-window percentiles never use errors from after the decision time (no look-ahead)
  - Safe wind is never negative; coverage computed correctly
  - Forecast rows for past hours (`startTime < publishTime`) are excluded
  - Rows land in the correct wind-level bucket; small buckets merge
  - Buying sheet: `to_buy = max(0, demand − safe_wind)`; flat and 24-value demand both work; wrong-length demand returns 400; CSV totals match the table
- **API tests**: FastAPI `TestClient` for status codes and validation
- Lint/format: `ruff` + `black` (Python), `eslint` + `prettier` (TS)
- Optional: GitHub Actions running tests on push
- Type hints everywhere; Pydantic response models

---

## 10. Deployment

### Local
```bash
docker compose up --build      # app at http://localhost:8000
```

### Vercel
- Frontend: static build of `frontend/`
- Backend: `api/index.py` exposes the FastAPI app as a Python serverless function
- Parquet files bundled with the function (small)
- `vercel.json` rewrites `/api/*` → function, everything else → React build
- **Fallback:** if Vercel's Python runtime causes trouble, deploy the Docker image to Render or Heroku

Deploy early (Phase 3) so deployment issues don't pile up at the end.

---

## 11. Phases & timeline (≤ 16 hours)

| Phase | Tasks | Est. |
|---|---|---|
| **0. Research** | Read Elexon docs, GB day-ahead market basics, confirm gate closure time | 0.75h |
| **1. Data + analysis** | `ingest.py`, Parquet files, notebook: horizon logic, metrics, shortfall stats, buffer backtest, find 3–4 headline insights | 2.75h |
| **2. Backend** | FastAPI endpoints, horizon/day-ahead logic, metrics, buffer, replay, buying sheet + CSV, tests | 3.5h |
| **3. Docker + first deploy** | Dockerfile, compose, Vercel config, deploy a "hello" version | 1.25h |
| **4. Frontend** | Replay tab, safe-wind panel, band chart, demand input, buying sheet, accuracy tab, KPI tiles, horizon chart, distribution | 5h |
| **5. Polish** | Styling, loading/error states, README, lint, final deploy | 1h |
| **6. Video** | Script, rehearse, record, upload (unlisted) | 1.75h |
| | **Total** | **~16h** |

**If running late, cut in this order:** error distribution chart → CSV *upload* of demand (keep flat value + paste) → confidence selector (fix at 90%) → horizon groups in the buffer (keep wind-level buckets) → expanding window (use full-month errors, state the caveat) → day-ahead mode in the accuracy tab. **Never cut:** horizon logic + tests, replay, safe wind, buying sheet (with flat demand + CSV export), README, video.

---

## 12. Video plan (≤ 10 min)

### Part 1 — Client pitch (≤ 5 min), business language only
1. **Problem** (30s): "Every morning you buy tomorrow's power. Wind is free but uncertain. How much of the forecast can you actually count on?"
2. **Decision replay demo** (2 min): pick a hard January day (e.g. **27 Jan**, windiest, where the over-forecast is largest) → "this is what you saw at 09:00 the day before" → show safe wind and band → reveal actual → "the buffer would have covered you in 23 of 24 hours" → type in demand → buying sheet: "buy 312 GWh, not the 268 GWh the raw forecast suggests" → export CSV
3. **Accuracy explorer** (1 min): January overview, move the horizon slider, shortfall-highlighted distribution
4. **Key findings** (1 min), using real January numbers:
   - "The raw forecast overstates usable wind by about **12%**; day-ahead it's typically **~1.7 GW too high**"
   - "It's too high in **~85% of hours**, which is when you end up short"
   - "On stormy days (forecast > 14 GW) the gap is **~2.6 GW**, likely because wind farms get switched off when the grid is full"
   - "Buying later doesn't fix the bias, but it does shrink the uncertainty: spread goes from ~5.4 GW at 2 days ahead to ~4.2 GW at 1 hour"
   - "Plan on safe wind to be covered 90% of the time; across January this held X% of the time"
5. **Next steps** (30s): live data, demand and solar, curtailment data to explain the bias, price/cost impact, alerts

### Part 2 — Tech lead review (≤ 5 min)
1. Architecture diagram and the reason for pre-fetched data (45s)
2. Data pipeline: ingest, alignment choice (45s)
3. Core logic walkthrough: `forecast.py` horizon selection, `metrics.py` shortfall sign convention, `buffer.py` expanding window (no look-ahead) and coverage backtest (1.5 min)
4. API + frontend structure (1 min)
5. Tests, Docker, deploy, AI usage, trade-offs and what I'd do next (1 min)

---

## 13. README checklist
- [ ] What the app does (2–3 lines)
- [ ] Live link (Vercel/Heroku)
- [ ] Video link
- [ ] Directory and file descriptions
- [ ] How to run: Docker, and without Docker (backend + frontend separately)
- [ ] How to refresh data (`python backend/scripts/ingest.py`)
- [ ] How to run tests
- [ ] Design decisions and assumptions (alignment, horizon definition, gate closure)
- [ ] **AI tools used** (explicit statement)

---

## 14. Submission checklist
- [ ] Repo is **public**, name is a random string (e.g. `kjhwr`)
- [ ] No personal names or secrets in the repo
- [ ] Deployed app loads and shows data
- [ ] YouTube video is **unlisted** (not private), ≤ 10 min, both parts present
- [ ] Every link opened in **incognito** and working
- [ ] Form submitted

---

## 15. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Wrong horizon logic | Unit tests with hand-made examples; explain it clearly in the video |
| Timezone mistakes | Keep everything UTC internally; label UI in UK time (same as UTC in January) |
| Vercel Python issues | Deploy early; Render/Heroku Docker fallback |
| Missing data points | Drop unmatched pairs, show the count of points used |
| Over-scoping | Stick to the phases above; follow the cut order in section 11 |
| Buffer looks over-fitted ("you tuned it on January") | Expanding window (past errors only) + coverage backtest; say it out loud |
| Curtailment explanation turns out wrong | Say "likely" until confirmed in Phase 0; the pattern itself is measured and holds either way |
| Wind-level buckets too thin for stable percentiles | Minimum ~50 points per bucket; merge neighbours otherwise |
| Client confuses MW and MWh | Charts in MW; daily summaries in MWh/GWh; label units everywhere |

---

## 16. Nice-to-haves (only if time remains)
- **Worst days table:** top 5 January days by miss size (date, forecast, actual, miss); a click opens them in replay
- Error by hour-of-day heatmap
- CSV download of the accuracy-explorer series
- GitHub Actions CI badge
- Forecast stability view: how the forecast for one target hour changed across its ~8 updates
