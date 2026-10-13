#!/usr/bin/env node
// Dev-only visual verification helper. Opens index.html in headless Chromium,
// drives common UI states (open budget panel, toggle a section), and saves a
// screenshot. Not part of the app — see README "Front-end verification".
//
// Usage:
//   node scripts/screenshot.js <state> [outfile]
//
// States:
//   full                 full page, panel closed
//   budget                budget panel open, Air section visible
//   budget:cruise          budget panel open, Cruise section toggled on
//   budget:mears            budget panel open, Transportation + Mears Connect toggled on
//   budget:dining           budget panel open, a dining reservation row added
//   header-budget-click     clicks the header "Budget" button (real user path)
//   blank-trip              asserts blankAppState() fully resets a populated trip (exits 1 on mismatch)
//   events-dec              loads Dec 22–26 2026 (holiday-crowded notes row)
//   events-sept             loads Sep 5–9 2026 through the real Load button, prints Notes + Events rows
//
// Set EVENTS_JSON=<file> to serve that file instead of the published events-data.json.
// Set BASE_URL=https://jc214809.github.io/disney-planning/ to check the deployed site instead.
// Requires a local server on :8765 (Google OAuth is registered to that origin):
//   python3 -m http.server 8765

const { chromium } = require('playwright');

const PORT = 8765;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}/index.html`;

async function openBudgetPanel(page) {
  await page.evaluate(() => {
    const panel = document.getElementById('budget-panel');
    panel.hidden = false;
    panel.classList.add('open');
  });
}

async function toggleCheckbox(page, id) {
  await page.evaluate((elId) => {
    const el = document.getElementById(elId);
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, id);
}

async function loadRange(page, start, end) {
  await page.evaluate(([s, e]) => {
    document.querySelector('.controls').hidden = false; // normally revealed after sign-in
    document.getElementById('start-date').value = s;
    document.getElementById('end-date').value = e;
  }, [start, end]);
  await page.click('#load-btn');
  await page.waitForSelector('.calendar-grid', { timeout: 20000 });
  // Print the Notes row and each park's Events row as text, so event checks don't need eyeballing
  const rows = await page.evaluate(() => {
    const cells = (row) => [...row.querySelectorAll('.cal-cell')].map(c => c.textContent.trim());
    const out = { notes: cells(document.querySelector('.cal-notes-row')) };
    for (const g of document.querySelectorAll('.cal-park-group')) {
      const ev = [...g.querySelectorAll('.cal-row')].find(r => r.textContent.trim().startsWith('Events'));
      if (ev) out[g.querySelector('.cal-park-name').textContent] = cells(ev);
    }
    return out;
  });
  console.log(JSON.stringify(rows, null, 1));
}

const STATES = {
  async full(page) {
    // default state, nothing to do
  },
  async budget(page) {
    await openBudgetPanel(page);
  },
  async 'budget:cruise'(page) {
    await openBudgetPanel(page);
    await toggleCheckbox(page, 'toggle-cruise');
  },
  async 'budget:mears'(page) {
    await openBudgetPanel(page);
    await toggleCheckbox(page, 'b-mears-toggle');
  },
  async 'budget:dining'(page) {
    await openBudgetPanel(page);
    await page.evaluate(() => {
      addDining();
      const res = budget.dining[budget.dining.length - 1];
      res.restaurantId = 'dd39f200-6465-42e6-bff1-6a8b25512e6e'; // 1900 Park Fare (flatRate pricing)
      res.meal = 'Breakfast';
      res.children = 2;
      const match = diningData.find(d => d.id === res.restaurantId);
      const price = diningMealPrice(match, res.meal);
      res.costPerPerson = price.adult;
      res.childCostPerPerson = price.child;
      renderDining();
      recalcTotals();
    });
  },
  async 'header-budget-click'(page) {
    await page.click('#header-open-budget-btn');
  },
  async 'blank-trip'(page) {
    const result = await page.evaluate(() => {
      // Populate every area, then reset, as loading an empty tab does
      applyAppState({
        travelers: 5, flights: 900, transport: 120, annualPass: true, ticketPerPersonPerDay: 150,
        hotels: [{ id: 1, resort: 'Yacht Club', checkIn: '2026-12-01', checkOut: '2026-12-05', ratePerNight: 500 }],
        dining: [{ id: 1, restaurantId: 'x', date: '2026-12-02', meal: 'Dinner', adults: 2, children: 0, costPerPerson: 50, childCostPerPerson: 0 }],
        cruise: { enabled: true, ship: 'Wish', nights: 4, cabinCost: 2000 },
        mears: { enabled: true, under3: 1, ages3to9: 1, ages10plus: 2, ways: 1 },
        showPremierPass: true,
        startDate: '2030-01-01', endDate: '2030-01-05',
      });
      applyAppState(blankAppState());
      const s = getAppState();
      return {
        travelers: s.travelers, flights: s.flights, transport: s.transport, annualPass: s.annualPass,
        ticket: s.ticketPerPersonPerDay, hotels: s.hotels.length, dining: s.dining.length,
        cruise: s.cruise.enabled, mears: s.mears.enabled, premier: s.showPremierPass,
        start: s.startDate, notOldDates: s.startDate !== '2030-01-01',
      };
    });
    console.log(JSON.stringify(result));
    const ok = result.travelers === 1 && result.flights === 0 && result.transport === 0 && !result.annualPass
      && result.ticket === 0 && result.hotels === 0 && result.dining === 0 && !result.cruise
      && !result.mears && !result.premier && result.notOldDates;
    if (!ok) { console.error('FAIL: blank trip did not fully reset'); process.exitCode = 1; }
    else console.log('PASS: blank trip fully resets');
  },
  async 'events-dec'(page) {
    await loadRange(page, '2026-12-22', '2026-12-26');
  },
  async 'events-sept'(page) {
    await loadRange(page, '2026-09-05', '2026-09-09');
  },
  async 'trip-loaded'(page) {
    await page.evaluate(() => {
      document.querySelector('.controls').hidden = false;
      document.getElementById('trip-name-bar').hidden = false;
      document.getElementById('trip-name-slot').hidden = false;
      document.getElementById('trip-name-text').textContent = 'My WDW Trip 2026';
      document.getElementById('start-date').value = '2026-08-01';
      document.getElementById('end-date').value = '2026-08-07';
    });
  },
};

async function main() {
  const [, , state = 'full', outfile = `${state.replace(':', '-')}.png`] = process.argv;

  if (!STATES[state]) {
    console.error(`Unknown state "${state}". Available: ${Object.keys(STATES).join(', ')}`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    if (process.env.EVENTS_JSON) {
      await page.route('**/events-data.json', (route) => route.fulfill({ path: process.env.EVENTS_JSON }));
    }
    await page.goto(BASE_URL);
    await page.waitForTimeout(500);
    await STATES[state](page);
    await page.waitForTimeout(300);
    await page.screenshot({ path: outfile, fullPage: true });
    console.log(`Saved ${outfile}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
