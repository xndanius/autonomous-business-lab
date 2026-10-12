# Autonomous Business Lab · SSE Riga

The public website for the guest lecture "Businesses that run while you sleep" at SSE Riga, 13 October 2026.

Four parts:

- `challenge/`: the challenge. One loop, one real user. What to show, key dates, support, FAQ.
- `lesson/`: the lecture on one page, with the exercise prompt and the six lines.
- `examples/`: the 60-Second Startup, While You Sleep, The Long Run comic, The Unfinished Atlas, and two small companies.
- `simulation/`: 38 fictional SSE Riga students argue about which business to launch. Runs every 5 minutes on GitHub Actions; see `sim/README.md`.

Plain static HTML, CSS and JavaScript. No build step, no tracking, no cookies. The simulation page reads its data from the `sim-data` branch.
Three.js r128 is vendored in `assets/three.min.js` (MIT licence).

Hosting: GitHub Pages from the `main` branch, root folder. All links are relative, so the same files also work on Netlify or a custom domain.
