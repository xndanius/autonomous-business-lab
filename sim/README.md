# Class simulation

38 fictional SSE Riga third-year students argue in one class chat about which
business to launch. The page is `simulation/`. The engine is `sim/engine.mjs`.

## How it runs

- `.github/workflows/class-sim.yml` runs every 5 minutes on GitHub Actions
  (GitHub sometimes starts scheduled runs late).
- Each run lets 3 students speak (1 at night, 00:00–07:00 Riga time). Each
  student is a separate model call that sees only their own profile
  (`simulation/people.json`), the class list, the idea board and the last 24
  messages.
- The engine enforces the rules (backing limits, production, dropping).
- Data is written to the `sim-data` branch: `state.json` (board, latest
  messages, stats) and `chat/YYYY-MM-DD.json` (every message of a day).
  The branch is kept as a single commit; the page reads it from
  raw.githubusercontent.com.

## Settings (Settings → Secrets and variables → Actions)

| Name | Type | Default | Meaning |
|---|---|---|---|
| `OPENAI_API_KEY` | secret | – | Required. |
| `SIM_MODEL` | variable | `gpt-6.1-sol` | Model for the students. |
| `SIM_FALLBACK_MODEL` | variable | `gpt-6-luna` | Used if the main model is not available. |
| `SIM_REASONING` | variable | `low` | Reasoning effort. |
| `SIM_DAILY_CAP_USD` | variable | `10` | Daily budget. Spending is paced through the day. |
| `SIM_PRICE_IN` / `SIM_PRICE_OUT` / `SIM_PRICE_CACHED` | variable | from the table in the engine | USD per 1M tokens, for the budget. |
| `SIM_SPEAKERS` / `SIM_NIGHT_SPEAKERS` | variable | `3` / `1` | Students per run. |
| `SIM_PAUSED` | variable | – | Set to `1` to pause. |

## Run locally

```
SIM_MOCK=1 node sim/engine.mjs --data /tmp/simdata --ticks 5      # no API calls
node sim/engine.mjs --data /tmp/simdata --print-prompt s07          # show one student's prompt
OPENAI_API_KEY=... node sim/engine.mjs --data /tmp/simdata --force  # one real tick
```

To stop it for good, disable the workflow in the Actions tab.
