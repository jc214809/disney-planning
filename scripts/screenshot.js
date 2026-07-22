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
//
// Requires a local server on :8765 (Google OAuth is registered to that origin):
//   python3 -m http.server 8765

const { chromium } = require('playwright');

const PORT = 8765;
const BASE_URL = `http://localhost:${PORT}/index.html`;

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
