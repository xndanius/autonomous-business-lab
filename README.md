# Autonomous Business Lab - student hub

Public follow-up to the SSE Riga workshop, 13 October 2026. GitHub Pages publishes `main`, root folder. No build framework or sign-in is required.

## Student path
- Home: next step after the workshop.
- `show/`: final 18-slide, student-safe archive; mobile reading/projector modes and standalone download.
- `ideas/`: 33 accepted workshop submissions from 42 entries, with original wording and AI suggestions separated.
- `lesson/`: two activities, concepts and five steps to the first working loop.
- `examples/`: five demonstrated loops, limits and sources.
- `tools/`: working method, small tool stack and official documentation.
- `challenge/`: four-week plan, targets, support and joining details.
- `resources/`: challenge PDF, brief, test cases, evidence log and weekly update.
- `simulation/`: a fictional class, separate from real student input.

## Data boundaries
The idea archive is a dated snapshot of complete, visible ideas in the lecture board's current session. It contains no names, device identifiers, private receipt tokens or rejected/failed inputs. Do not infer student counts from submission counts. Scores and proposed prices are AI suggestions, not grades or evidence of demand.

The public slide archive has no live intake, private presenter notes, admin controls or live API calls. Its example counters are dated recordings. The hosted presenter show, demo, live idea board and simulation engine remain separate.

## Local review
Run `python3 -m http.server 4188` from this folder. Check home, ideas/search, lesson drafts, resources/downloads, and both slide modes at desktop and 390px wide. Run `python3 scripts/check-links.py` for local links and anchors.

## Updating the slides
Run `python3 scripts/build-student-show.py --source-public /path/to/reviewed/presenter/public`. The export expects the reviewed 18-slide structure and sanitizes presenter-only content. Update the explicit snapshot dates only when replacing the corresponding verified image. Review `show/version.json`, test the download, and check the diffs before publishing.

## Publishing
Review changes, commit and push to `main`. Verify the GitHub Pages deployment and the public routes before sharing. Keep simulation engine/workflow changes out of content-only releases.

The site uses plain HTML/CSS/JavaScript. Three.js is vendored under its MIT license. User-entered lesson drafts stay in that browser; no analytics or new server-side collection was added.
