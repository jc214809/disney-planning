# Disney Trip Planner

A personal web app for planning Walt Disney World vacations. It shows you park hours, Lightning Lane prices, and special events in a calendar-style grid — one column per day, one row per park. You can track your travel budget, save everything to Google Sheets, and manage multiple trips from a single workbook.

No frameworks. No build tools. No install step. Just open `index.html` in a browser and it works.

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [How the App Is Structured](#how-the-app-is-structured)
3. [Setting Up](#setting-up)
4. [File-by-File Breakdown](#file-by-file-breakdown)
5. [How the Calendar Works](#how-the-calendar-works)
6. [How the Budget Works](#how-the-budget-works)
7. [How Google Sheets Sync Works](#how-google-sheets-sync-works)
8. [How Special Events Work](#how-special-events-work)
9. [How the Scraper Works](#how-the-scraper-works)
10. [How GitHub Actions Keeps Data Fresh](#how-github-actions-keeps-data-fresh)
11. [Security Notes](#security-notes)

---

## What It Does

Pick a date range — say, June 28 to July 4 — and the app fetches live data from Disney's scheduling API and draws a grid like this:

```
              | Mon 6/28  | Tue 6/29  | Wed 6/30  | ...
──────────────┼───────────┼───────────┼───────────┼────
Magic Kingdom │ 9am–11pm  │ 9am–10pm  │ 9am–11pm  │
  Hours       │           │           │           │
  Events      │           │ 🎟 MNSSHP │           │
  LL Single   │ TRON $20  │ TRON $22  │ TRON $18  │
  LL Multi    │ $24/person│ $24/person│ $22/person│
──────────────┼───────────┼───────────┼───────────┼────
EPCOT         │ 9am–9pm   │ ...       │
  ...
```

For each park and each day you can see:

- **Hours** — What time the park opens and closes. If you're staying at a Disney resort hotel, Early Entry time is shown (resort guests get in 30 minutes early). If you're at a Deluxe resort, Extended Evening Hours are highlighted.
- **Events** — Special ticketed parties (like Mickey's Not-So-Scary Halloween Party) or free festivals (like EPCOT's Festival of the Arts) that fall on that day. Only shown if there's actually something happening — blank event rows are hidden automatically.
- **LL Single Pass** — The per-ride Lightning Lane prices for that day. You can select how many riders for each ride and the cost feeds into your budget total automatically.
- **LL Multi Pass** — The daily Lightning Lane Multi Pass price per person. Check the box to include it in your budget.
- **Premier Pass** — Shown only if you toggle it on. The all-in-one Lightning Lane pass price.

At the bottom of the screen is a sticky cost summary bar that always shows your running totals: Hotel · Flights · Transport · Tickets · LL Single · LLMP · **TOTAL** · **/ PERSON**.

---

## How the App Is Structured

Everything runs in the browser. There is no server, no database, no back end of any kind. The app is made of five files you edit directly:

```
index.html      — The page structure (all the HTML elements)
style.css       — All the visual styling (colors, layout, fonts)
app.js          — The main app logic (calendar, budget, state)
api.js          — Talks to the themeparks.wiki API and events data
sheets.js       — Google Sheets sync (sign-in, save, load, trips)
config.js       — YOUR secret credentials (never committed to git)
```

Plus supporting files:

```
config.example.js   — A safe template showing what config.js should look like
scrape-events.py    — Python script that fetches event pricing from mousesavers.com
icons/              — Park logo SVGs (Magic Kingdom, EPCOT, etc.)
MOUSETOOLS.md       — Reference doc for the MouseTools Python library (future use)
.github/workflows/  — GitHub Actions automation (runs the scraper weekly)
```

---

## Setting Up

### 1. Clone the repo

```bash
git clone https://github.com/jc214809/disney-planning.git
cd disney-planning
```

### 2. Create your config file

Copy the example:

```bash
cp config.example.js config.js
```

Then open `config.js` and fill in your real values:

```javascript
const GOOGLE_CLIENT_ID = 'your-client-id-here.apps.googleusercontent.com';
const GOOGLE_API_KEY   = 'your-api-key-here';
```

**Where do you get these?**

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or pick an existing one)
3. Enable the **Google Sheets API** and **Google Drive API**
4. Under **Credentials**, create an **OAuth 2.0 Client ID** — choose "Web application", add your site URL to "Authorized JavaScript origins"
5. Also create an **API Key** and restrict it to Sheets + Drive APIs
6. Paste both into `config.js`

> ⚠️ `config.js` is listed in `.gitignore`. It will never be committed. Do not remove it from `.gitignore`.

### 3. Open the app

Just open `index.html` in Chrome or Firefox. No `npm install`. No build step. No local server required (though one helps for development — VS Code's Live Server extension works great).

---

## File-by-File Breakdown

### `index.html`

The skeleton of the entire page. Every button, input, and panel lives here. Key sections:

- **`.header-top`** — The "Disney Trip Planner" title on the left, and on the right: the trip dropdown (switches between saved trips) and the Google sign-in/avatar button.
- **`.controls`** — The date pickers (Start / End), the Load button, park filter toggles (Magic Kingdom, EPCOT, etc.), the Lightning Lane Premier Pass checkbox, and the Budget button. All on one row.
- **`#budget-panel`** — Hidden by default, slides open when you click Budget. Contains the Travel, Hotels, and Tickets sections.
- **`#trip-name-bar`** — Shown only when signed in to Google. Displays the current trip name with a pencil icon to rename it, a trash icon to delete it, a status message, and a Save button.
- **`#planner`** — Empty `<div>` that `app.js` fills in with the calendar grid when you load dates.
- **`.cost-summary-bar`** — Sticky bar at the bottom of the page showing live cost totals.
- **`#new-trip-modal`** — A popup dialog for creating a new trip (date pickers, hotel selector, traveler count, trip name).
- **`#delete-trip-modal`** — A confirmation popup that asks "Are you sure?" before deleting a trip tab from Google Sheets.

### `style.css`

All visual styling. Written in plain CSS — no preprocessors. Key things to know:

- **`.modal-backdrop[hidden] { display: none }`** — This is a critical rule. CSS `display: flex` on `.modal-backdrop` would normally override the HTML `hidden` attribute and show the modal even when it's supposed to be hidden. This rule fixes that by making `[hidden]` always win.
- **`--num-rows`** — A CSS custom property set per park group. Controls how tall the park's left-side label column is. It's calculated dynamically in JavaScript based on how many rows are actually shown (events row is skipped if there's nothing to show).
- **`#sheets-save-btn.dirty`** — When you've made unsaved changes, the Save button turns amber and pulses with a glow animation. This is the visual "hey, save your work" signal.
- **`.unsaved-banner`** — The amber warning strip that appears when you try to switch trips with unsaved changes. It has "Save & Switch" and "Discard" buttons.

### `app.js`

The brain of the app. Everything about what you see in the calendar, how the budget is calculated, and how app state is serialized/restored lives here.

**Key data structures:**

```javascript
let budget = {
  travelers: 1,
  hotels: [],           // array of hotel objects with check-in/out dates and rate
  flights: 0,
  flightsMode: 'person', // 'person' (per person) or 'total' (flat total)
  transport: 0,
  ticketPerPersonPerDay: 0,
  annualPass: false,
};

const llspRiders   = new Map(); // "Ride Name|2026-06-28" → rider count
const llmpIncluded = new Map(); // "Magic Kingdom|2026-06-28" → true/false
```

**Key functions:**

- **`load()`** — Reads the start/end date inputs, calls `loadPlannerData()` from `api.js`, then passes the result to `renderPlanner()`.
- **`renderPlanner(data)`** — Builds the entire calendar HTML as a big template string and injects it into `#planner`. Called every time data changes (dates, park filters, traveler count, etc.).
- **`recalcTotals()`** — Adds up hotel costs (nights × rate per hotel), flights, transport, tickets, LL Single Pass selections, and LLMP checkboxes. Updates all the numbers in the bottom cost bar.
- **`getAppState()`** — Snapshots all current state (dates, budget fields, hotel list, LL selections, park filters) into a plain JavaScript object. This is what gets saved to Google Sheets.
- **`applyAppState(state)`** — Takes a saved state object and restores all the fields, checkboxes, and budget values. Then calls `load()` to fetch fresh park data for the restored dates.
- **`markDirty()`** — Called whenever the user changes anything. Sets a `stateDirty` flag and makes the Save button amber/pulsing. Called from every input listener.
- **`clearDirty()`** — Called after saving or loading. Resets the flag and removes the amber styling.

**Hotel overlap detection:**

If you add two hotels with overlapping date ranges (e.g., Grand Floridian June 28–July 1 AND Polynesian June 30–July 4), the overlapping ones are highlighted in red and excluded from the hotel cost total. This prevents accidentally double-counting nights.

**Resort tier awareness:**

The app tracks what tier your hotel is (Value / Moderate / Deluxe). This affects what's shown in the calendar:
- Resort guests (any tier): Early Entry time shown on Hours row
- Deluxe guests: Extended Evening Hours badge highlighted with a ⭐

### `api.js`

Handles all network requests. Two jobs:

**1. Load park schedule data** from [themeparks.wiki](https://themeparks.wiki):

```
https://api.themeparks.wiki/v1/entity/{parkId}/schedule/{year}/{month}
```

This is a free, unofficial API that mirrors Disney's scheduling data. The app calls it once per park per month covered by your date range — so a 2-week trip spanning two months makes 8 calls (4 parks × 2 months). All 8 calls happen in parallel.

The API returns a `schedule` array with entries of different types:
- `OPERATING` — Normal park hours (open/close times)
- `EARLY_ENTRY` — Resort guest early access window
- `EXTRA_EVENING` — Deluxe resort extended hours
- `SPECIAL_EVENT` — After-hours ticketed parties

Each entry also has a `purchases` array with Lightning Lane pricing embedded directly in the schedule response.

**2. Load special events data** from a JSON file hosted on GitHub:

```
https://raw.githubusercontent.com/jc214809/disney-planning/data/events-data.json
```

This file lives on a special `data` branch of the repo (separate from `main`). It's generated weekly by the scraper (see below) and committed there automatically by GitHub Actions. The format is:

```json
{
  "scrapedAt": "2026-06-25T00:00:00Z",
  "byDate": {
    "2026-08-15": [
      {
        "name": "Mickey's Not-So-Scary Halloween Party",
        "park": "Magic Kingdom",
        "requiresTicket": true,
        "priceAdult": 129.00,
        "priceChild": 119.00
      }
    ]
  }
}
```

`getEventsForDate(date)` just does a lookup into `byDate` — instant, no network call needed after the file is loaded.

### `sheets.js`

Handles everything Google: sign-in, finding/creating the spreadsheet, loading/saving trip data, renaming and deleting tabs, and the trip switcher dropdown.

See the [Google Sheets Sync](#how-google-sheets-sync-works) section below for the full breakdown.

### `config.js`

Two lines. Never committed to git.

```javascript
const GOOGLE_CLIENT_ID = '...';
const GOOGLE_API_KEY   = '...';
```

These are loaded by `index.html` as the first `<script>` tag, before `app.js` and `sheets.js`, so the constants are available globally.

---

## How the Calendar Works

### Step 1: You pick dates and click Load

```
Start: 2026-06-28    End: 2026-07-04    [Load]
```

### Step 2: `load()` is called

```javascript
async function load() {
  const start = document.getElementById('start-date').value;  // "2026-06-28"
  const end   = document.getElementById('end-date').value;    // "2026-07-04"
  const data  = await loadPlannerData(start, end);
  renderPlanner(data);
}
```

### Step 3: `loadPlannerData()` figures out which months are needed

A June 28–July 4 trip spans two months (June and July). The function collects unique year+month combos, then fires one API request per park per month — all in parallel using `Promise.all`.

### Step 4: API responses are processed into a nested map

```javascript
{
  "2026-06-28": {
    "Magic Kingdom": {
      openTime: "2026-06-28T09:00:00-04:00",
      closeTime: "2026-06-28T23:00:00-04:00",
      specialEvents: [{ description: "Early Entry", openTime: "...08:30..." }],
      llsp: [
        { name: "TRON Lightcycle / Run", available: true, price: "$20.00", priceAmount: 2000 },
        { name: "Seven Dwarfs Mine Train", available: true, price: "$18.00", priceAmount: 1800 },
      ],
      llmp: [{ available: true, price: "$24.00", priceAmount: 2400 }],
      llpp: [],
    },
    "EPCOT": { ... },
    ...
  },
  "2026-06-29": { ... },
  ...
}
```

### Step 5: `renderPlanner(data)` builds the grid

For each active park (Magic Kingdom, EPCOT, Hollywood Studios, Animal Kingdom — togglable via the filter buttons), the function builds several rows of cells, one cell per date:

- **Hours cells** — Shows open/close time. If resort guest and Early Entry exists, shows early time instead. Adds special event badges inline.
- **Events cells** — Shows festival/party badges from `api.js`'s event data. **Skipped entirely if no events exist for this park during the trip.**
- **LL Single Pass cells** — A dropdown (0–N riders) per ride. Changing the dropdown immediately updates the cost total.
- **LL Multi Pass cells** — A checkbox per park per day. Only one park per day can be checked (LLMP only works at one park per day).

The whole thing is assembled as one giant HTML string and set with `innerHTML`. It's fast because there's no virtual DOM or diffing — just string concatenation and one DOM write.

### Step 6: `recalcTotals()` updates the bottom bar

After rendering, all the cost numbers in the sticky bar at the bottom are recalculated from scratch: hotel nights × rate, flights × travelers (or flat total), transport, tickets × travelers × days, LL Single rider selections × prices, LLMP checkboxes × traveler count × price.

---

## How the Budget Works

The budget panel has three sections:

### Travel
- **Travelers** — How many people. Affects flights total (if per-person mode), tickets total, and LLMP total.
- **Flights** — Can be entered per person OR as a flat total (toggle buttons). Automatically multiplied by travelers if per-person.
- **Transportation** — A flat number for parking, Uber, rental car, etc.

### Hotels
You can add multiple hotels (useful if you're splitting your trip between resorts or doing a split stay). Each hotel has:
- Resort name (dropdown with all WDW resorts)
- Check-in date
- Check-out date
- Rate per night

The app calculates nights automatically and shows the subtotal inline. If two hotels have overlapping dates, both are highlighted red and excluded from the total — you need to fix the dates before they count.

Hotel tier (Value / Moderate / Deluxe) is detected automatically from the resort name and affects calendar behavior (Early Entry, Extended Hours).

### Tickets
- **Tickets / person / day** — Your average ticket cost. Multiply by travelers and trip days for total.
- **Annual Pass** — Check this to zero out the ticket cost (AP holders don't pay per day).

### The cost bar

Clicking any cost category in the sticky bar at the bottom opens the budget panel and scrolls to + highlights that field so you can quickly edit it.

---

## How Google Sheets Sync Works

### The spreadsheet

One Google Sheets workbook named **"Disney Trip Planner"** lives in your Google Drive. Each trip is a separate tab (sheet) inside that workbook. Tab names are automatically generated from dates and hotel name — e.g., `Jun 28 – Jul 4 · Grand Floridian`.

### Sign-in flow

The app uses **Google Identity Services (GIS)** — Google's modern OAuth 2.0 library — to handle sign-in. There are two ways you end up signed in:

**First time (or after signing out):**
1. Click the "Sign in" button in the top-right corner
2. A Google account chooser popup appears
3. You pick your account and approve the permissions
4. The app gets an access token and uses it for all API calls

**Returning user (automatic):**
1. On page load, the app checks `localStorage` for a saved spreadsheet ID and email
2. If found, it initializes **Google One Tap** — a hidden iframe that silently exchanges your existing Google session for an access token
3. No popup, no clicking. Within a second or two, you're reconnected and your last trip loads automatically

This auto-reconnect is why you don't have to sign in every time you refresh the page.

### What gets saved

When you hit Save (or it happens automatically during rename), the entire app state is written to the current sheet tab as two columns:

| key | value |
|-----|-------|
| startDate | 2026-06-28 |
| endDate | 2026-07-04 |
| travelers | 2 |
| hotels | [{"id":1,"resort":"Grand Floridian Resort & Spa",...}] |
| flights | 450 |
| flightsMode | person |
| ... | ... |

Complex values (like the hotels array or the LL rider selections) are stored as JSON strings and parsed back on load.

### Loading a trip

When you select a trip from the dropdown, `loadFromSheet()` reads the sheet tab, parses all the key/value rows back into a state object, and calls `applyAppState()` which restores every field and then re-fetches the park data for those dates.

### Unsaved changes protection

Any time you change a budget field, add/remove a hotel, change dates, or adjust LL selections, `markDirty()` is called. The Save button turns amber and pulses. If you try to switch to a different trip while there are unsaved changes, the dropdown reverts and an amber warning banner appears:

> **"You have unsaved changes to Jun 28 – Jul 4 · Grand Floridian."** [Save & Switch] [Discard]

### Trip management

- **New Trip** — Opens a modal. Fill in dates, hotel, traveler count, and a name (auto-filled from your inputs). Creates a new tab in the spreadsheet and applies a starter state.
- **Rename** — Click the pencil icon next to the trip name. Edit the name, click Rename. This saves the current state AND renames the sheet tab in one operation.
- **Delete** — Click the trash icon. A confirmation modal appears asking "Are you sure?" before permanently deleting the tab. If it's the last tab, a blank "New Trip" tab is created first (Google Sheets requires at least one sheet).
- **Switch trips** — Use the dropdown in the top-right header. Loads the selected trip automatically.

### Auto-selecting the most upcoming trip

When you first sign in or refresh the page, the app automatically selects the "most upcoming" trip — the one whose start date is closest to today (without being in the past). It parses the date from the tab name format (`Jun 28 – Jul 4 · Grand Floridian`) to determine this. If all trips are in the past, it picks the most recent one.

---

## How Special Events Work

Disney holds ticketed after-hours parties (like Mickey's Not-So-Scary Halloween Party) and free multi-week festivals (like the EPCOT Food & Wine Festival) throughout the year. Ticket prices for the parties change date by date.

The app shows these events as colored badges on the calendar:

- 🎟 **Ticketed events** (orange badge) — Require a separate ticket beyond park admission. Price shown inline if available.
- 🎪 **Festivals** (blue/teal badge) — Included with regular park admission.

These events come from `events-data.json`, a file that is automatically updated weekly by a Python scraper.

---

## How the Scraper Works

`scrape-events.py` is a Python script that reads pricing and date information from [mousesavers.com](https://mousesavers.com) — a well-known Disney fan site that maintains up-to-date event calendars and pricing.

The scraper handles two types of events:

**Per-date events** (price varies by night):
- Mickey's Not-So-Scary Halloween Party
- Mickey's Very Merry Christmas Party
- Disney Jollywood Nights
- Disney H2O Glow After Hours

These events have pricing listed as bullet points like:
> "$126.74 (age 10+), $116.09 (age 3-9) for August 11, 14"

The scraper finds these bullet lists, parses the price and date out of each line, and stores them keyed by date.

**Date-range events** (same info for all dates in the range):
- Walt Disney World Marathon Weekend
- EPCOT International Festival of the Arts
- EPCOT International Flower & Garden Festival
- EPCOT International Food & Wine Festival
- EPCOT International Festival of the Holidays
- Candlelight Processional
- Disney Princess Half Marathon Weekend
- runDisney Springtime Surprise Weekend
- Disney Wine & Dine Half Marathon Weekend
- Puzzlehop Hollywood Studios

These events run continuously from a start date to an end date. The scraper finds the date range in the page text (e.g., "January 17 through February 24") and expands it into every individual date in between.

The output is a single JSON file:
```json
{
  "scrapedAt": "2026-06-25T00:00:00Z",
  "byDate": { "2026-08-15": [...], "2026-08-22": [...] },
  "events": [...]
}
```

---

## How GitHub Actions Keeps Data Fresh

A GitHub Actions workflow runs the scraper automatically every Monday. The workflow:

1. Runs `scrape-events.py` with the mousesavers.com URL
2. Writes `events-data.json`
3. Switches to a special orphan branch called `data` (separate from your code on `main`)
4. Commits and force-pushes just that one JSON file to the `data` branch

The app fetches this file directly from GitHub's raw content CDN:
```
https://raw.githubusercontent.com/jc214809/disney-planning/data/events-data.json
```

This means:
- Event data is always up to date (refreshed weekly)
- No server needed — GitHub hosts the data for free
- The `main` branch stays clean with only source code
- If the scrape fails, the previous week's data is still there

---

## Security Notes

- **`config.js` is gitignored and must never be committed.** It contains your real Google OAuth client ID and API key. If you accidentally commit it, rotate your credentials immediately in the Google Cloud Console.
- The Google API key is restricted to Sheets and Drive APIs only. Even if someone got it, they couldn't use it for anything else.
- The OAuth token lives in memory only — it's never stored in `localStorage`. Only the spreadsheet ID and user email are stored locally (to enable auto-reconnect).
- All data stays in your own Google Drive. Nothing is sent to any third-party server except the themeparks.wiki API (for park schedules) and mousesavers.com (for the scraper).
