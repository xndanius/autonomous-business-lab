# Autonomous Business Lab - student hub

Public follow-up to the SSE Riga workshop, 13 October 2026. GitHub Pages publishes `main`, root folder. No build framework or sign-in is required.

## Student path
The main menu has three destinations, in this order:
- **Challenge** (`/`): the opportunity, weekly mentoring from Danielius, conditional job or co-founding opportunities, joining, four-week plan and evidence targets.
- **Class ideas** (`ideas/`): 33 accepted workshop submissions from 42 entries, with original wording and AI suggestions separated; submission order is the default, AI score is optional. Each idea can be carried into a local brief.
- **Learn & build** (`lesson/`): the six-line brief first, five steps to a running loop, downloadable templates, and an optional model/reference section. The workshop-page review is optional.

The primary call to action is **Join the challenge** (`/#join`). It opens the joining instructions; the email button only opens a draft.

The old `challenge/` address redirects to `/` while preserving its fragment. The old `resources/` page redirects to `lesson/#downloads`; files under `resources/` remain directly downloadable. Slides are an optional workshop recap inside Learn & build, not a second lesson destination. The deeper `examples/`, `tools/` and fictional `simulation/` pages remain linked from the learning material. The 18-slide public archive and standalone download remain in `show/`.

## Data boundaries
The idea archive is a dated snapshot of complete, visible ideas in the lecture board's current session. It contains no names, device identifiers, private receipt tokens or rejected/failed inputs. Do not infer student counts from submission counts. Scores and proposed prices are AI suggestions, not grades or evidence of demand.

The public slide archive has no live intake, private presenter notes, admin controls or live API calls. Its example counters are dated recordings. The hosted presenter show, demo, live idea board and simulation engine remain separate.

## Local review
Run `python3 -m http.server 4188` from this folder. Check challenge/joining, ideas/search, Learn & build/drafts/downloads, legacy redirects, and both slide modes at desktop and 390px wide. Run `python3 scripts/check-links.py` for local links and anchors.

## Updating the slides
Run `python3 scripts/build-student-show.py --source-public /path/to/reviewed/presenter/public`. The export expects the reviewed 18-slide structure and sanitizes presenter-only content. Update the explicit snapshot dates only when replacing the corresponding verified image. Review `show/version.json`, test the download, and check the diffs before publishing.

## Publishing
Review changes, commit and push to `main`. Verify the GitHub Pages deployment and the public routes before sharing. Keep simulation engine/workflow changes out of content-only releases.

The site uses plain HTML/CSS/JavaScript. Three.js is vendored under its MIT license. User-entered lesson drafts stay in that browser; no analytics or new server-side collection was added. A `?idea=<seq>` link loads a public suggestion panel. Only an explicit click fills empty brief fields; existing writing is kept, and human-control/feedback decisions stay with the student. Deep links reveal the relevant collapsed reference section.
