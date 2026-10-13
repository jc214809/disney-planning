const test = require('node:test');
const assert = require('node:assert/strict');
const t = require('../trip-sort.js');

test.beforeEach(() => t.tripStartDates.clear());

test('sorts by saved full start date across years, not month/day', () => {
  t.tripStartDates.set('Jan 5 – Jan 9 · A', '2027-01-05');
  t.tripStartDates.set('Dec 28 – Jan 3 · B', '2026-12-28');
  t.tripStartDates.set('Mar 1 – Mar 5 · C', '2026-03-01');
  assert.deepEqual(
    t.sortSheetNames(['Jan 5 – Jan 9 · A', 'Dec 28 – Jan 3 · B', 'Mar 1 – Mar 5 · C']),
    ['Mar 1 – Mar 5 · C', 'Dec 28 – Jan 3 · B', 'Jan 5 – Jan 9 · A'],
  );
});

test('tabs without saved data fall back to title month/day; unparseable names go last', () => {
  t.tripStartDates.set('Sep 1 – Sep 5 · X', '2026-09-01');
  const names = ['Misc notes', 'Sep 1 – Sep 5 · X', 'Jan 2 – Jan 6 · Legacy'];
  const sorted = t.sortSheetNames(names);
  assert.equal(sorted[sorted.length - 1], 'Misc notes');
  assert.equal(sorted.length, 3);
});

test('groups options under a year heading by start year', () => {
  t.tripStartDates.set('Dec 28 – Jan 3 · B', '2026-12-28');
  t.tripStartDates.set('Jan 5 – Jan 9 · A', '2027-01-05');
  const html = t.tripOptionsHtml(['Jan 5 – Jan 9 · A', 'Dec 28 – Jan 3 · B', 'Misc']);
  assert.match(html, /<optgroup label="2026">.*Dec 28.*<\/optgroup><optgroup label="2027">.*Jan 5.*<\/optgroup><option value="Misc">/);
});

test('escapes quotes and ampersands in option values', () => {
  t.tripStartDates.set('Jun 1 – Jun 5 · Beach & "Club"', '2026-06-01');
  const html = t.tripOptionsHtml(['Jun 1 – Jun 5 · Beach & "Club"']);
  assert.ok(html.includes('value="Jun 1 – Jun 5 · Beach &amp; &quot;Club&quot;"'));
});

test('formatTripDates has no year', () => {
  assert.doesNotMatch(t.formatTripDates('2026-12-28', '2027-01-03'), /20\d\d/);
});
