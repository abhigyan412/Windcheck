# CLAUDE.md

Wind forecast decision tool for a UK utility's day-ahead trading team. FastAPI + pandas backend, React + Vite + TypeScript frontend, Elexon BMRS wind data (FUELHH actuals, WINDFOR forecasts) for decisions made in January 2026. Full design and rationale: [plan.md](plan.md).

## Commands

```bash
# Full app (Docker) → http://localhost:8000
docker compose up --build

# Data refresh (Elexon → backend/data/*.parquet)
python backend/scripts/ingest.py

# Backend (from backend/)
pip install -r requirements.txt
uvicorn app.main:app --reload          # http://localhost:8000, docs at /docs
pytest                                 # all tests
pytest tests/test_forecast.py -k horizon   # single test
ruff check . && black --check .        # lint + format check
black . && ruff check --fix .          # auto-fix

# Frontend (from frontend/)
npm install
npm run dev                            # http://localhost:5173, proxies /api → :8000
npm run build
npm run lint
npx prettier --check src
```

## Layout

- `backend/app/`: `forecast.py` (horizon/day-ahead selection), `metrics.py` (error stats), `buffer.py` (safe wind, bands, coverage), `replay.py` (replay + buying sheet), `main.py` (routes)
- `backend/data/`: bundled Parquet files; the app never calls Elexon at runtime
- `frontend/src/components/`: one component per dashboard panel
- `api/index.py`: Vercel serverless entry wrapping the FastAPI app

## Domain rules (do not break)

- **Horizon rule:** for target time T and horizon H, use the latest forecast with `publishTime ≤ T − H`.
- **Error sign:** `e = forecast − actual`; `e > 0` is a **shortfall** (the costly case).
- **No look-ahead:** replay buffers use only errors known before the decision time.
- Drop forecast rows where `startTime < publishTime`.
- Compare on the hour: hourly forecasts vs the actual half-hour starting on the hour.
- Everything in **UTC** internally; label the UI in UK time.
- Units: MW for instantaneous values, MWh/GWh for totals. Label them.
- No MAPE (blows up at low wind).
- Safe wind and `to_buy` are clamped at ≥ 0.

## Conventions

- Python: type hints everywhere, Pydantic response models, pure functions in `forecast.py`/`metrics.py`/`buffer.py` (no I/O) so they're easy to test.
- Any change to selection, metrics, or buffer logic needs a pytest with a small hand-computed example.
- TypeScript: API types live in `frontend/src/types.ts`; fetch calls only through `frontend/src/api.ts`.
- Keep scope to Elexon wind data only (user-entered demand is the one exception).
