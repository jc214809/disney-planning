# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Personal WDW trip-planning web app: park hours, Lightning Lane prices, and special events in a calendar grid, plus budget tracking and Google Sheets sync. **README.md is the detailed reference** (file-by-file breakdown, data flows, calendar/budget/Sheets internals) — read the relevant README section before changing a subsystem; do not duplicate it here.

> Maintenance rule: update this file (and the README section) when a file's responsibility, a workflow, or a config requirement changes.

## Run / develop

- No frameworks, no build step: open `index.html` in a browser.
- `config.js` (gitignored) holds `GOOGLE_CLIENT_ID` / `GOOGLE_API_KEY`; copy from `config.example.js`.
- Scraper: `EVENT_URL=<url> python3 scrape-events.py` → writes `events-data.json`. Runs weekly via `.github/workflows/scrape-events.yml`, output published on the `data` branch.
- Deploy: `.github/workflows/deploy.yml`.

## File map

| File | Owns |
|---|---|
| `app.js` | Calendar grid, budget logic, resort/ship/transport constants, UI state |
| `api.js` | Disney API fetches + special-events JSON (raw.githubusercontent `data` branch) |
| `sheets.js` | Google OAuth (gapi + GIS) and Sheets save/load with multi-trip tabs |
| `scrape-events.py` | mousesavers.com special-event scraper |
| `trip-sort.js` | Pure trip-tab naming/dating and year-grouped dropdown ordering (Node-testable) |
| `style.css` | All styling |

## Gotchas

- The app fetches `events-data.json` from the `data` branch on raw.githubusercontent.com — local scraper output is NOT picked up until the workflow (or a manual push) updates that branch.
- Tests: `npm test` (Node tests for `trip-sort.js` + Python unittests for the scraper); the scrape and deploy workflows run them. `node scripts/screenshot.js blank-trip` asserts an empty tab resets the planner. Front-end changes: open `index.html` and check the browser console. Scraper changes: also run it against the live page and diff the JSON (macOS python.org builds can fail SSL verification locally — fetch via curl and patch `fetch_html`).
- The scraper takes each section's year from the page text (`section_year`), not from today's date; it exits non-zero if fewer than `MIN_EVENTS` events are found, so the workflow fails (and the `data` branch keeps the last good file) when the page layout changes.
- `config.js` must never be committed; only `config.example.js` is tracked.

## Front-end verification

`scripts/screenshot.js` (Playwright, dev-only — `npm install` once) drives common UI states headlessly and saves a screenshot, so visual checks don't require re-deriving DOM quirks (e.g. the budget panel needs both `hidden = false` and `.open`) each session.

- Requires the local server on port 8765 (`python3 -m http.server 8765` — Google OAuth is registered to that origin, [[Local dev port is always 8765]]).
- `node scripts/screenshot.js <state> [outfile]` — states: `full`, `budget`, `budget:cruise`, `budget:mears`, `events-sept`, `events-dec` (the events-* states load a date range and print the Notes/Events rows; `EVENTS_JSON=<file>` serves a local events file, `BASE_URL=<url>` checks the deployed site). Add new states to the `STATES` map in the script as new panels/toggles need covering.
