/**
 * Trip-tab naming, dating and dropdown ordering. Pure functions (no DOM, no gapi) so they can be
 * unit-tested in Node: `npm test`. Loaded in the browser before sheets.js.
 */

function formatTripDates(start, end) {
  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

// Full start date (with year) per tab name, read from each tab's saved startDate.
// Tab titles carry no year, so this is what makes the sort year-aware.
const tripStartDates = new Map();

function parseSheetDate(name) {
  // Fallback for tabs with no saved data: month/day from the title, current year
  const m = name.match(/^([A-Za-z]+ \d+)/);
  if (!m) return null;
  const d = new Date(m[1] + ' ' + new Date().getFullYear());
  return isNaN(d) ? null : d;
}

function tripStartDate(name) {
  const iso = tripStartDates.get(name);
  if (iso) {
    const d = new Date(iso + 'T12:00:00');
    if (!isNaN(d)) return d;
  }
  return parseSheetDate(name);
}

function sortSheetNames(sheets) {
  // Chronological by full start date; names without a parseable date go last, alphabetically
  return [...sheets].sort((a, b) => {
    const da = tripStartDate(a), db = tripStartDate(b);
    if (da && db) return da - db || a.localeCompare(b);
    if (da) return -1;
    if (db) return 1;
    return a.localeCompare(b);
  });
}

// <option>s for the trip dropdowns, grouped under a year heading (<optgroup>) by start year.
// Tabs with no usable date go last, ungrouped.
function tripOptionsHtml(names) {
  const esc = n => n.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const opt = n => `<option value="${esc(n)}">${esc(n)}</option>`;
  const byYear = new Map();
  const undated = [];
  for (const n of sortSheetNames(names)) {
    const d = tripStartDate(n);
    if (!d) { undated.push(n); continue; }
    const y = d.getFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(n);
  }
  const groups = [...byYear].map(([y, ns]) => `<optgroup label="${y}">${ns.map(opt).join('')}</optgroup>`);
  return groups.join('') + undated.map(opt).join('');
}


if (typeof module !== 'undefined') {
  module.exports = { tripStartDates, formatTripDates, parseSheetDate, tripStartDate, sortSheetNames, tripOptionsHtml };
}
