# Autonomous Business Lab - student hub

Public follow-up to the SSE Riga workshop, 13 October 2026. GitHub Pages publishes `main`, root folder. No build framework or sign-in is required.

## Student path
The main menu has five distinct destinations:
- **Challenge** (`/`): the opportunity, weekly mentoring from Danielius, conditional job or co-founding opportunities, joining, four-week plan and evidence targets.
- **Learn loops** (`learn/`): Danielius’s delivery and improvement loop model, Grow/Serve/Improve, workflow versus agent, state and controls. Two interactive activities contain five illustrative decisions; no answers are submitted.
- **My builds** (`examples/`): six real projects, with their trigger, work, checks, delivery and memory, plus how each was built. These are implemented examples, not proposed student businesses.
- **Class ideas** (`ideas/`): 33 accepted workshop submissions from 42 entries. Original wording and AI suggestions stay separate; submission order is the default. Each idea can be carried into a local brief.
- **Build yours** (`lesson/`): the six-line brief, five implementation steps, templates and links to the optional technical guide and workshop archive.

The primary call to action remains **Join the challenge** (`/#join`). It opens joining instructions; the email button only opens a draft. On smaller screens, a keyboard-accessible Menu disclosure reveals all five destinations. Without JavaScript, all links remain visible.

The old `challenge/` address redirects to `/` while preserving its fragment. The old `resources/` page redirects to `lesson/#downloads`; files under `resources/` remain directly downloadable. Old theory links under `lesson/` redirect to the matching `learn/` section. The 18-slide archive and standalone download remain optional workshop recap, not a second lesson. `tools/` is a deeper implementation reference; the fictional `simulation/` is linked from its build case.

## Data boundaries
The idea archive is a dated snapshot of complete, visible ideas in the lecture board's current session. It contains no names, device identifiers, private receipt tokens or rejected/failed inputs. Do not infer student counts from submission counts. Scores and proposed prices are AI suggestions, not grades or evidence of demand.

The public slide archive has no live intake, private presenter notes, admin controls or live API calls. Its example counters are dated recordings. The hosted presenter show, demo, live idea board and simulation engine remain separate.

## Local review
Run `python3 -m http.server 4188` from this folder. Check challenge/joining, ideas/search, Learn loops/activities, My builds/viewers, Build yours/drafts/downloads, legacy redirects, and both slide modes at desktop and 390px wide. Run `python3 scripts/check-links.py` for local links and anchors.

## Updating the slides
Run `python3 scripts/build-student-show.py --source-public /path/to/reviewed/presenter/public`. The export expects the reviewed 18-slide structure and sanitizes presenter-only content. Update the explicit snapshot dates only when replacing the corresponding verified image. Review `show/version.json`, test the download, and check the diffs before publishing.

## Publishing
Review changes, commit and push to `main`. Verify the GitHub Pages deployment and the public routes before sharing. Keep simulation engine/workflow changes out of content-only releases.

The site uses plain HTML/CSS/JavaScript. Three.js is vendored under its MIT license. User-entered lesson drafts stay in that browser; no analytics or new server-side collection was added. A `?idea=<seq>` link loads a public suggestion panel. Only an explicit click fills empty brief fields; existing writing is kept, and human-control/feedback decisions stay with the student. Legacy theory fragments go to their matching section in Learn loops. Other deep links reveal collapsed details where needed.
