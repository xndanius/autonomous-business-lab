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
  A named notebook note held by its author is remembered, so the same rejected
  hypothesis does not consume every later research turn.
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

## Collaborative accelerator (14 October)

The ongoing class chat continues. A separate implementation discussion serves
only a stable shortlist: Top 3 plus up to two runners-up, never more than five.
Fewer slots are shown when there are fewer appropriate current hypotheses.
The ten older production votes remain historical; they do not fill this board.
Current independent idea reviews rank the shortlist. Once a day at most one
challenger can replace its weakest member, with a real one-point reviewed gain.
Unsafe or incomplete versions do not enter the public shortlist. Provisional
means a research hypothesis, not a qualified or validated business.

Each selected idea receives three fictional student roles: research/customer,
build/operations, and challenger/economics. They use distinct questions and
actual bounded primary-source receipts, then draft a four-week plan. The
challenger sees the draft before an independent anonymous plan assessment.
Plans specify an MVP, tool choices, loop and exception owner, privacy, proposed
unit economics, four milestones and human-runnable pass/fail tests under €50.
Refinements must gain at least one point on the same fixed rubric without any
zero criterion. Model interpretations and supplier prices never count as proof
of customer demand. All proposed implementation and tests remain unperformed.

The controlled source catalog adds current Eurostat economic/industry/food
feeds, dated enterprise AI/cloud surveys, Stripe Latvia fees and Payment Links,
GitHub scheduled workflows, Cloudflare tariffs and n8n schedule/approval docs.
Only fixed verified URLs can be fetched; text is data, never instructions.
Each source retains its real publication/fetch dates, hash, exact excerpt and
scope: aggregate market context, supplier cost, alternative tool, or technical
capability. Bodies and expected headings are verified; a related card, changed
format, redirect, oversized body or failed fetch produces no invented receipt.
Feeds refresh every six hours and documentation/pricing once daily.

Three invented experienced mentor roles cover discovery, go-to-market/economics
and technical operations. A persistent weekly queue independently reviews every
currently selected idea, rotating the assigned lens each week. It receives pure
idea/plan content and receipts, without votes, previous grades or mentor opinions.
The verdict records risks, gaps, dissent and one falsifiable human-run milestone.
`revise` flags rework. `drop` archives/holds the version and frees pitch capacity;
re-entry needs materially changed idea fields AND new evidence plus a fresh
independent grade of at least 7/10 and at least 1 in every criterion. Held history
and critiques remain accessible. Teams may request the appropriate sparring lens,
at most once per idea per day and five calls for the whole class per Riga week.
That global ledger is reserved durably before a call, surviving retirement or
interruption. Budget pauses leave unfinished weekly work queued, not completed.

A safe rejected draft remains visible as **Draft — needs evidence**, with its
actual independent score, unsupported verdict and critique. It never overrides
a current accepted plan or earns readiness. Changed idea fields mark it stale;
future teams receive its gaps rather than repeat the same mistakes. One migration
replays genuine safe archived assessments bound to the current idea hash,
validating the plan schema, fixed score and receipt integrity. Unsafe drafts are
withheld. Citation diagnostics retain only counts, lengths and known-source /
exact-match flags, never rejected quotes or invented links.

The common notebook keeps five fixed principles, bounded source-linked working
heuristics, persistent review lessons, dissent and unanswered questions. It is
shared with the whole class and team prompts. Agreement between fictional
personas is never additional evidence. A plan/idea change invalidates its weekly
verdict; reviews recur within seven days, with a one-day repeat guard after a
plan change. Team plan cycles are bounded to one attempt per idea per six hours
and use an existing turn, not an unbounded extra conversation.

`discussion/YYYY-MM-DD.json` retains the separate discussion in full.
`implementation-archive.json` retains all plan versions, weekly reviews, sparring
and retirements. The same before-call durable checkpoint flushes pending chat,
discussion and archive so interruption cannot lose the corresponding history.

Future executable teams are **not enabled**. The plan handoff contains scoped
MVP, virtual roles, unknowns and owner-run real validation gates. `test-ready`
requires verified exact plan quotes and a current safe supported plan scoring at least 7 with every criterion
at least 1. It means ready for a human to test, never permission to launch.
Every handoff says `research-only`, `realValidation: not-run` and
`launchAllowed: false`; no outreach, deployments, payments or new secrets/tools
are granted.

Manual `focus=collaboration` runs are for bounded genuine verification on the
same saved history and budget: one collaboration job per tick, no fabricated
fixture state or budget reset. The normal scheduled/long run stays `mixed`.

Run the meaningful guard tests without a real API key or paid requests:
`node --test sim/*.test.mjs`.

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
