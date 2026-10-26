# Research notes

## Day-ahead gate closure (GB)
| Auction | Gate closure (UK time) | Notes |
|---|---|---|
| EPEX SPOT GB hourly day-ahead | **09:20** D−1 | Most liquid GB day-ahead auction |
| Nord Pool N2EX GB day-ahead | 09:50 D−1 | Results by 10:00 |

**Decision:** default `GATE_CLOSURE = 09:20` Europe/London (configurable). In January UK time = UTC.
With publishes at 07:30 and 09:30 UTC, the forecast used for day-ahead decisions is the **07:30 UTC** publish on D−1.

Sources:
- Nord Pool, "About the Day-Ahead GB auction": https://support.nordpoolgroup.com/support/solutions/articles/8000088463-about-the-day-ahead-gb-auction
- Modo Energy, GB N2EX/EPEX day-ahead and intraday explainer: https://modoenergy.com/research/en/wholesale-trading-markets-explainer-gb-n2ex-epex-dayahead-intraday

## WINDFOR definition
- Elexon glossary: forecast of wind generation for Power Park Modules (wind farms). Older docs describe 4 runs/day; the current API shows **8 publishes/day** at hourly resolution (verified, Jan 2026).
- No source found stating whether WINDFOR accounts for curtailment (constraint actions). The systematic over-forecast at high wind is therefore described as **"likely curtailment"**, not as fact.

Sources:
- Elexon glossary, Wind Generation Forecast: https://www.elexon.co.uk/bsc/glossary/wind-generation-forecast/
- Elexon CP1381 (negative wind forecasts on BMRS): https://www.elexon.co.uk/change-proposal/cp1381/
