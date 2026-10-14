# Class simulation

38 fictional SSE Riga third-year students argue in one class chat about which
business to launch. The page is `simulation/`. The engine is `sim/engine.mjs`.

## How it runs

- `.github/workflows/class-sim.yml` runs every 5 minutes on GitHub Actions
  (GitHub sometimes starts scheduled runs late).
- Each run gives 3 student turns (1 at night, 00:00–07:00 Riga time), with one
  turn used for an active research-method trial. Each
  student is a separate model call that sees only their own profile
  (`simulation/people.json`), the class list, the idea board and the last 24
  messages.
- The engine enforces the rules (backing limits, production, dropping).
- A manual run can cover a fixed stretch of time: Actions → Class simulation →
  Run workflow with ticks 70 and gap 5 runs one tick every 5 minutes for about
  6 hours, then ends. Useful when GitHub starts scheduled runs late.
- Data is written to the `sim-data` branch: `state.json` (board, latest
  messages, stats) and `chat/YYYY-MM-DD.json` (every message of a day).
  The branch is kept as a single commit; the page reads it from
  raw.githubusercontent.com.

## Research and self-improvement (14 October update)

The engine fetches three allowlisted official RSS feeds once an hour: Riga city
news, Riga city events, and LIAA. At most four current safe records per feed are
kept. Each receipt has the real URL, publication/fetch time, source hash and a
bounded exact excerpt. A failed feed is reported; its content is not invented.
Sources are untrusted data and cannot change instructions or fetch destinations.
Public announcements are context for hypotheses, never proof somebody will pay.

- New pitches and proposed revisions need at least one exact source quote. The
  engine checks the ID and quote against fetched receipts, not model-made links.
- A separate model role assesses the fixed five-part rubric: evidence,
  usefulness, payer, autonomy and a discriminating first test, each 0–2.
- Revisions wait without changing the accepted idea. An anonymised comparison
  checks both versions against the same source packet. The new version stays
  only with a gain of at least one point, at least 1 on every rubric criterion,
  and safety checks. Rejection critiques persist beyond the latest chat window.
- Bounded methods compete: source-first, weekly return, payer test, and the
  whole loop. The same fictional author drafts both methods from the same
  receipt packet. A separate call reviews their anonymised pair. Three matched
  pairs must improve the mean by at least one point and all candidate pairs
  must pass the fixed minimum checks before a method replaces the incumbent.
  Otherwise it keeps the existing method. Full pair/decision receipts are saved.
- Every third tick, one existing speaker turn is dedicated to research. Students
  receive their actual assessed draft notebooks, filtered for current receipts
  and ideas not already on the board. They can pitch a source-led hypothesis or
  explain why it fails; nothing is seeded, auto-voted or auto-approved. A full
  board or unavailable sources disables that dedicated pitch turn.
- New production decisions need a current reviewed version scoring at least
  7/10, every criterion at least 1, plus the existing class voting
  rules. A changed version invalidates its previous review; reviews expire
  after 72 hours. Historical production decisions are preserved as old votes.

No fictional profile, discussion, vote or model score establishes real users,
sales, interviews or a launched business. No outreach or customer tests are
performed. The simulation develops hypotheses and tests for humans to run.

All student, review and trial calls share the existing **$10/day tracked cap**.
Before every call, a conservative UTF-8 request/output cost ceiling is published
to the durable `sim-data` branch using the existing fixed save helper. Pending
chat is flushed by sequence ID in that same snapshot. Failure to publish blocks
the paid call. An interrupted runner retains its reservation when reloaded.
After the call it is replaced by reported token usage. Missing usage or an
ambiguous failed request retains the reservation; network/5xx calls are not
automatically retried. Invalid JSON is still charged. This is an application
estimate using configured prices, not a provider billing invoice. The model,
secret and existing spent balance are unchanged. New-day resets only occur at
midnight Riga time.

Run the meaningful guard tests without a real API key or paid requests:
`node --test sim/learning.test.mjs`.

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
