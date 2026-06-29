const DCL_SHIPS = [
  { class: 'Magic Class',    name: 'Disney Magic' },
  { class: 'Magic Class',    name: 'Disney Wonder' },
  { class: 'Dream Class',    name: 'Disney Dream' },
  { class: 'Dream Class',    name: 'Disney Fantasy' },
  { class: 'Wish Class',     name: 'Disney Wish' },
  { class: 'Wish Class',     name: 'Disney Treasure' },
  { class: 'Wish Class',     name: 'Disney Destiny' },
  { class: 'Adventure Class', name: 'Disney Adventure' },
];

const RESORT_GROUPS = [
  { label: null, options: [{ tier: '', name: 'Off-site / Day Guest' }] },
  { label: 'Value Resorts', options: [
    { tier: 'value', name: 'All-Star Movies Resort' },
    { tier: 'value', name: 'All-Star Music Resort' },
    { tier: 'value', name: 'All-Star Sports Resort' },
    { tier: 'value', name: 'Art of Animation Resort' },
    { tier: 'value', name: 'Pop Century Resort' },
  ]},
  { label: 'Moderate Resorts', options: [
    { tier: 'moderate', name: 'Caribbean Beach Resort' },
    { tier: 'moderate', name: 'Coronado Springs Resort' },
    { tier: 'moderate', name: 'Port Orleans – French Quarter' },
    { tier: 'moderate', name: 'Port Orleans – Riverside' },
  ]},
  { label: 'Deluxe Resorts', options: [
    { tier: 'deluxe', name: 'Animal Kingdom Lodge' },
    { tier: 'deluxe', name: 'Beach Club Resort' },
    { tier: 'deluxe', name: 'BoardWalk Inn' },
    { tier: 'deluxe', name: 'Contemporary Resort' },
    { tier: 'deluxe', name: 'Grand Floridian Resort & Spa' },
    { tier: 'deluxe', name: 'Polynesian Village Resort' },
    { tier: 'deluxe', name: 'Wilderness Lodge' },
    { tier: 'deluxe', name: 'Yacht Club Resort' },
    { tier: 'deluxe', name: 'Swan Hotel' },
    { tier: 'deluxe', name: 'Dolphin Hotel' },
    { tier: 'deluxe', name: 'Swan Reserve' },
  ]},
  { label: 'Deluxe Villa / DVC', options: [
    { tier: 'deluxe', name: 'Animal Kingdom Villas – Kidani Village' },
    { tier: 'deluxe', name: 'Bay Lake Tower at Contemporary Resort' },
    { tier: 'deluxe', name: 'Beach Club Villas' },
    { tier: 'deluxe', name: 'BoardWalk Villas' },
    { tier: 'deluxe', name: 'Boulder Ridge Villas at Wilderness Lodge' },
    { tier: 'deluxe', name: 'Copper Creek Villas & Cabins at Wilderness Lodge' },
    { tier: 'deluxe', name: 'Fort Wilderness – Cabins' },
    { tier: 'deluxe', name: 'Lakeshore Lodge' },
    { tier: 'deluxe', name: 'Old Key West Resort' },
    { tier: 'deluxe', name: 'Polynesian Villas & Bungalows' },
    { tier: 'deluxe', name: 'Riviera Resort' },
    { tier: 'deluxe', name: 'Saratoga Springs Resort & Spa' },
    { tier: 'deluxe', name: 'Treehouse Villas at Saratoga Springs' },
    { tier: 'deluxe', name: 'Villas at Grand Floridian Resort' },
  ]},
  { label: 'Campground', options: [
    { tier: 'value', name: 'Fort Wilderness – Campsites' },
  ]},
];

const PARK_ICONS = {
  'Magic Kingdom':     'icons/magic-kingdom.svg',
  'EPCOT':             'icons/epcot.svg',
  'Hollywood Studios': 'icons/hollywood-studios.svg',
  'Animal Kingdom':    'icons/animal-kingdom.svg',
};

// ── App state ────────────────────────────────────────────────────────────────
let activeParkFilters = new Set(['Magic Kingdom', 'EPCOT', 'Hollywood Studios', 'Animal Kingdom']);
let isResortGuest   = false;
let isDeluxeGuest   = false;
let showPremierPass = false;

// Budget state
let budget = {
  travelers:  1,
  hotels: [],              // [{ id, resort, checkIn, checkOut, ratePerNight }]
  flights:    0,
  flightsMode: 'person',   // 'person' | 'total'
  arriveAt: '',            // datetime-local string
  departAt: '',            // datetime-local string
  transport:  0,
  ticketPerPersonPerDay: 0,
  annualPass: false,
  mears: {
    enabled: false,
    under3: 0,
    ages3to9: 0,
    ages10plus: 0,
    ways: 2,               // 1 = one-way, 2 = round trip
  },
  cruise: {
    enabled: false,
    ship: '',
    sailDate: '',
    nights: 0,
    cabinCost: 0,          // total cabin cost (not per person)
    portFees: 0,           // total port fees & taxes
    onboard: 0,            // onboard spending budget
  },
};
let nextHotelId = 1;

// LL rider/include state
const llspRiders   = new Map(); // "rideName|date" -> rider count
const llmpIncluded = new Map(); // "parkName|date" -> boolean

// Last loaded planner data
let lastPlannerData = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
function hotelTierOnDate(date) {
  const tierRank = { '': 0, value: 1, moderate: 2, deluxe: 3 };
  let highest = '';
  budget.hotels.forEach(h => {
    if (!h.checkIn || !h.checkOut || !date) return;
    if (date < h.checkIn || date >= h.checkOut) return;
    const tier = RESORT_GROUPS.flatMap(g => g.options).find(o => o.name === h.resort)?.tier || '';
    if ((tierRank[tier] ?? 0) > (tierRank[highest] ?? 0)) highest = tier;
  });
  return highest;
}

function updateResortTier() {
  const tierRank = { '': 0, value: 1, moderate: 2, deluxe: 3 };
  let highest = '';
  budget.hotels.forEach(h => {
    const tier = RESORT_GROUPS.flatMap(g => g.options).find(o => o.name === h.resort)?.tier || '';
    if ((tierRank[tier] ?? 0) > (tierRank[highest] ?? 0)) highest = tier;
  });
  isResortGuest = highest !== '';
  isDeluxeGuest = highest === 'deluxe';
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' })
    + ' — ' + d.toLocaleDateString(undefined, { weekday: 'long' });
}

function renderBadge(available) {
  return available
    ? `<span class="badge yes">● YES</span>`
    : `<span class="badge no">● NO</span>`;
}

function fmtMoney(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function parsePriceStr(str) {
  if (!str) return 0;
  const n = parseFloat(str.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function escAttr(s) {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Hotel helpers ─────────────────────────────────────────────────────────────
function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(checkIn  + 'T12:00:00');
  const b = new Date(checkOut + 'T12:00:00');
  const n = Math.round((b - a) / 86400000);
  return n > 0 ? n : 0;
}

function overlappingHotelIds(hotels) {
  const overlaps = new Set();
  for (let i = 0; i < hotels.length; i++) {
    for (let j = i + 1; j < hotels.length; j++) {
      const a = hotels[i], b = hotels[j];
      if (!a.checkIn || !a.checkOut || !b.checkIn || !b.checkOut) continue;
      if (a.checkIn < b.checkOut && b.checkIn < a.checkOut) {
        overlaps.add(a.id);
        overlaps.add(b.id);
      }
    }
  }
  return overlaps;
}

function resortSelectHtml(selectedName) {
  return RESORT_GROUPS.map(g => {
    const opts = g.options.map(o => {
      const sel = o.name === selectedName ? ' selected' : '';
      return `<option value="${o.tier}"${sel}>${o.name}</option>`;
    }).join('');
    return g.label ? `<optgroup label="${g.label}">${opts}</optgroup>` : opts;
  }).join('');
}

function renderHotels() {
  const list = document.getElementById('budget-hotels-list');
  if (!list) return;
  const tripStart = document.getElementById('start-date').value;
  const tripEnd   = document.getElementById('end-date').value;
  const overlaps  = overlappingHotelIds(budget.hotels);
  if (!budget.hotels.length) { list.innerHTML = ''; return; }
  list.innerHTML = budget.hotels.map((h, idx) => {
    const nights      = nightsBetween(h.checkIn, h.checkOut);
    const rateMode    = h.rateMode || 'night';
    const ratePerNight = hotelEffectiveRate(h);
    const subtotal    = nights * ratePerNight;
    const isOverlap   = overlaps.has(h.id);
    const noteText    = h.checkIn && h.checkOut && nights > 0
      ? (isOverlap ? '⚠ Overlaps another hotel' : `${nights} night${nights !== 1 ? 's' : ''} = ${fmtMoney(subtotal)}`)
      : '';
    return `
      <div class="hotel-row${isOverlap ? ' overlap-error' : ''}" data-hotel-id="${h.id}">
        <div class="hotel-row-fields">
          <div class="hotel-field">
            <label class="hotel-field-label">Resort</label>
            <select class="hotel-resort-select" data-hotel-id="${h.id}">
              ${resortSelectHtml(h.resort || '')}
            </select>
          </div>
          <div class="hotel-field">
            <label class="hotel-field-label">Check-in</label>
            <input class="hotel-checkin" type="date" value="${h.checkIn}" min="${tripStart}" max="${tripEnd}">
          </div>
          <div class="hotel-field">
            <label class="hotel-field-label">Check-out</label>
            <input class="hotel-checkout" type="date" value="${h.checkOut}" min="${tripStart}" max="${tripEnd}">
          </div>
          <div class="hotel-field">
            <div class="budget-field-header">
              <label class="hotel-field-label">Rate</label>
              <div class="mode-toggle hotel-rate-mode" data-hotel-id="${h.id}">
                <button class="mode-toggle-btn${rateMode === 'night' ? ' active' : ''}" data-mode="night">/ Night</button>
                <button class="mode-toggle-btn${rateMode === 'total' ? ' active' : ''}" data-mode="total">Total</button>
              </div>
            </div>
            <div class="budget-dollar-wrap"><span>$</span><input class="hotel-rate-input" type="number" min="0" step="1" placeholder="0" value="${h.rateValue || ''}"></div>
          </div>
          ${isOverlap ? `<span class="hotel-nights-note overlap-note">⚠ Overlaps another hotel</span>` : ''}
          <button class="hotel-remove-btn" data-hotel-id="${h.id}" title="Remove">× Remove</button>
        </div>
      </div>`;
  }).join('');
}

function updateHotelNoteInPlace(hotel, rowEl) {
  const noteEl = rowEl.querySelector('.hotel-nights-note');
  if (!noteEl) return;
  const overlaps  = overlappingHotelIds(budget.hotels);
  const isOverlap = overlaps.has(hotel.id);
  noteEl.textContent = isOverlap ? '⚠ Overlaps another hotel' : '';
  noteEl.classList.toggle('overlap-note', isOverlap);
}

function hotelEffectiveRate(h) {
  // Always returns rate per night regardless of rateMode
  if (h.rateMode === 'total') {
    const nights = nightsBetween(h.checkIn, h.checkOut);
    return nights > 0 ? (h.rateValue || 0) / nights : 0;
  }
  return h.rateValue || 0;
}

function addHotel() {
  budget.hotels.push({ id: nextHotelId++, resort: '', checkIn: '', checkOut: '', ratePerNight: 0, rateMode: 'night', rateValue: 0 });
  renderHotels();
  recalcTotals();
  if (typeof markDirty === 'function') markDirty();
}

function removeHotel(id) {
  budget.hotels = budget.hotels.filter(h => h.id !== id);
  updateResortTier();
  renderHotels();
  if (lastPlannerData) renderPlanner(lastPlannerData);
  recalcTotals();
  if (typeof markDirty === 'function') markDirty();
}

// ── Budget date calculations ──────────────────────────────────────────────────
function getTripDays() {
  const start = document.getElementById('start-date').value;
  const end   = document.getElementById('end-date').value;
  if (!start || !end) return 0;
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end   + 'T12:00:00');
  const diff = Math.round((e - s) / 86400000);
  return diff >= 0 ? diff + 1 : 0;
}

// ── recalcTotals ──────────────────────────────────────────────────────────────
function recalcTotals() {
  const { travelers, hotels, flights, transport, ticketPerPersonPerDay, annualPass, cruise } = budget;
  const days = getTripDays();

  const overlaps   = overlappingHotelIds(hotels);
  const hotelTotal = hotels.reduce((sum, h) => {
    if (overlaps.has(h.id)) return sum;
    return sum + nightsBetween(h.checkIn, h.checkOut) * hotelEffectiveRate(h);
  }, 0);

  const flightsTotal   = budget.flightsMode === 'total' ? flights : flights * travelers;
  const transportTotal = transport;
  const ticketsTotal   = annualPass ? 0 : ticketPerPersonPerDay * travelers * days;

  let llspTotal = 0;
  if (lastPlannerData) {
    for (const [key, riders] of llspRiders.entries()) {
      if (riders === 0) continue;
      const lastPipe = key.lastIndexOf('|');
      const rideName = key.slice(0, lastPipe);
      const date     = key.slice(lastPipe + 1);
      const dayData  = lastPlannerData[date];
      if (!dayData) continue;
      for (const parkData of Object.values(dayData)) {
        const ride = parkData.llsp.find(r => r.name === rideName);
        if (ride && ride.priceAmount) llspTotal += (ride.priceAmount / 100) * riders;
      }
    }
  }

  let llmpTotal = 0;
  if (lastPlannerData) {
    for (const [key, included] of llmpIncluded.entries()) {
      if (!included) continue;
      const lastPipe = key.lastIndexOf('|');
      const parkName = key.slice(0, lastPipe);
      const date     = key.slice(lastPipe + 1);
      const dayData  = lastPlannerData[date];
      if (!dayData) continue;
      const parkData = dayData[parkName];
      if (!parkData || !parkData.llmp.length) continue;
      const mp = parkData.llmp[0];
      if (mp && mp.priceAmount) llmpTotal += (mp.priceAmount / 100) * travelers;
    }
  }

  const cruiseTotal = cruise.enabled ? (cruise.cabinCost || 0) + (cruise.portFees || 0) + (cruise.onboard || 0) : 0;

  const total     = hotelTotal + flightsTotal + transportTotal + ticketsTotal + llspTotal + llmpTotal + cruiseTotal;
  const perPerson = travelers > 0 ? total / travelers : 0;

  const cruiseValEl = document.getElementById('cs-cruise-val');
  if (cruiseValEl) cruiseValEl.textContent = fmtMoney(cruiseTotal);

  document.getElementById('cs-hotel-val').textContent     = fmtMoney(hotelTotal);
  document.getElementById('cs-flights-val').textContent   = fmtMoney(flightsTotal);
  document.getElementById('cs-transport-val').textContent = fmtMoney(transportTotal);

  const ticketsValEl = document.getElementById('cs-tickets-val');
  if (annualPass) {
    ticketsValEl.innerHTML = '<img src="icons/annual-pass.png" class="cs-ap-logo" alt="Annual Pass">';
  } else {
    ticketsValEl.textContent = fmtMoney(ticketsTotal);
  }

  document.getElementById('cs-llsp-val').textContent      = fmtMoney(llspTotal);
  document.getElementById('cs-llmp-val').textContent      = fmtMoney(llmpTotal);
  document.getElementById('cs-total-val').textContent     = fmtMoney(total);
  document.getElementById('cs-perperson-val').textContent = fmtMoney(perPerson);

  const ticketNote = document.getElementById('b-ticket-days');
  if (ticketNote) {
    ticketNote.textContent = days > 0
      ? `× ${travelers} traveler${travelers !== 1 ? 's' : ''} × ${days} day${days !== 1 ? 's' : ''}`
      : '';
  }
}

// ── renderPlanner ─────────────────────────────────────────────────────────────
function renderPlanner(data) {
  lastPlannerData = data;
  const planner = document.getElementById('planner');

  const dates = Object.keys(data).sort();
  if (!dates.length) {
    planner.innerHTML = '<div class="empty-state">No data found for these dates.</div>';
    recalcTotals();
    return;
  }

  const parkOrder      = ['Magic Kingdom', 'EPCOT', 'Hollywood Studios', 'Animal Kingdom'];
  const activeParkOrder = parkOrder.filter(p => activeParkFilters.has(p));

  const headerCells = dates.map(date => {
    const d       = new Date(date + 'T12:00:00');
    const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
    const mmdd    = d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
    return `<div class="cal-header-cell"><span class="cal-weekday">${weekday}</span><span class="cal-date">${mmdd}</span></div>`;
  }).join('');

  const PARK_NAMES = new Set(['Magic Kingdom', 'EPCOT', 'Hollywood Studios', 'Animal Kingdom']);

  // Top-level notes row: events not tied to a specific main park
  const notesCells = dates.map(date => {
    const evs = getEventsForDate(date).filter(ev => !PARK_NAMES.has(ev.park));
    if (!evs.length) return `<div class="cal-cell cal-cell-notes cal-cell-empty"></div>`;
    const badges = evs.map(ev => {
      const price = ev.priceNote ? ` · ${ev.priceNote}` : '';
      const cls   = ev.requiresTicket ? 'ticketed-event' : 'festival-event';
      const icon  = ev.requiresTicket ? '🎟 ' : '🎪 ';
      return `<span class="event-badge ${cls}">${icon}${ev.name}${price}</span>`;
    }).join('');
    return `<div class="cal-cell cal-cell-notes"><div class="cell-events">${badges}</div></div>`;
  }).join('');

  const numRows = 4 + (showPremierPass ? 1 : 0);

  const parkGroups = activeParkOrder.map(parkName => {
    const icon = PARK_ICONS[parkName] ? `<img src="${PARK_ICONS[parkName]}" alt="">` : '';

    function rowCells(rowFn) {
      return dates.map(date => {
        const d = data[date]?.[parkName];
        return rowFn(d, date);
      }).join('');
    }

    const hoursCells = rowCells((d, date) => {
      if (!d) return `<div class="cal-cell cal-cell-empty"></div>`;
      const tierOnDate     = hotelTierOnDate(date);
      const isResortOnDate = tierOnDate !== '';
      const isDeluxeOnDate = tierOnDate === 'deluxe';
      const earlyEntry     = d.specialEvents.find(e => e.description === 'Early Entry');
      const effectiveOpen  = isResortOnDate && earlyEntry ? earlyEntry.openTime : d.openTime;
      const apiBadges = d.specialEvents.flatMap(e => {
        if (e.description === 'Early Entry') return [];
        if (e.description === 'Extended Evening') {
          const eligible = isDeluxeOnDate;
          return [`<span class="event-badge extended-evening${eligible ? ' eligible' : ''}">${eligible ? '⭐ ' : ''}Deluxe &amp; DVC Extended Hours ${formatTime(e.openTime)}–${formatTime(e.closeTime)}</span>`];
        }
        return [`<span class="event-badge special-event">After-Hours Event ${formatTime(e.openTime)}–${formatTime(e.closeTime)}</span>`];
      }).join('');
      return `<div class="cal-cell">
        <div class="cell-hours">${formatTime(effectiveOpen)}–${formatTime(d.closeTime)}</div>
        ${apiBadges ? `<div class="cell-events">${apiBadges}</div>` : ''}
      </div>`;
    });

    // Park-specific events row — only shown if at least one date has events for this park
    const hasEvents = dates.some(date => getEventsForDate(date).some(ev => ev.park === parkName));
    const eventsCells = !hasEvents ? '' : rowCells((d, date) => {
      const evs = getEventsForDate(date).filter(ev => ev.park === parkName);
      if (!evs.length) return `<div class="cal-cell cal-cell-empty"></div>`;
      const badges = evs.map(ev => {
        const adult = ev.priceAdult != null ? `$${ev.priceAdult.toFixed(2)}` : null;
        const child = ev.priceChild != null && ev.priceChild !== ev.priceAdult ? ` / $${ev.priceChild.toFixed(2)} child` : '';
        const price = adult ? ` · ${adult}${child}` : (ev.priceNote ? ` · ${ev.priceNote}` : '');
        const cls   = ev.requiresTicket ? 'ticketed-event' : 'festival-event';
        const icon  = ev.requiresTicket ? '🎟 ' : '🎪 ';
        return `<span class="event-badge ${cls}">${icon}${ev.name}${price}</span>`;
      }).join('');
      return `<div class="cal-cell"><div class="cell-events">${badges}</div></div>`;
    });

    const llspCells = rowCells((d, date) => {
      if (!d) return `<div class="cal-cell cal-cell-empty"></div>`;
      if (!d.llsp.length) return `<div class="cal-cell"><span class="cell-none">—</span></div>`;
      const items = d.llsp.map(r => {
        const key          = `${r.name}|${date}`;
        const currentRiders = llspRiders.get(key) ?? 0;
        let opts = '';
        for (let i = 0; i <= budget.travelers; i++) {
          opts += `<option value="${i}"${i === currentRiders ? ' selected' : ''}>${i}</option>`;
        }
        return `
        <div class="cell-ll-item ${r.available ? 'available' : 'unavailable'}">
          <div class="cell-ll-item-top">
            <select class="llsp-riders-select" data-key="${escAttr(key)}" title="Riders">${opts}</select>
            <span class="cell-ll-name">${r.name}</span>
            <span class="cell-ll-price">${r.price || '—'}</span>
          </div>
        </div>`;
      }).join('');
      return `<div class="cal-cell">${items}</div>`;
    });

    const llmpCells = rowCells((d, date) => {
      if (!d) return `<div class="cal-cell cal-cell-empty"></div>`;
      if (!d.llmp.length) return `<div class="cal-cell"><span class="cell-none">—</span></div>`;
      const mpKey    = `${parkName}|${date}`;
      const included = llmpIncluded.get(mpKey) ?? false;
      const mp       = d.llmp[0];
      return `<div class="cal-cell">
        <div class="cell-ll-item ${mp.available ? 'available' : 'unavailable'}">
          <div class="cell-ll-item-top">
            <input type="checkbox" class="llmp-include-check" data-key="${escAttr(mpKey)}" data-date="${escAttr(date)}" ${included ? 'checked' : ''}>
            <span class="cell-ll-name">LLMP</span>
            <span class="cell-ll-price">${mp.price || '—'}</span>
          </div>
        </div>
      </div>`;
    });

    const premierCells = !showPremierPass ? '' : rowCells((d, date) => {
      if (!d) return `<div class="cal-cell cal-cell-empty"></div>`;
      if (!d.llpp.length) return `<div class="cal-cell"><span class="cell-none">—</span></div>`;
      return `<div class="cal-cell">${d.llpp.map(r => `
        <div class="cell-ll-item ${r.available ? 'available' : 'unavailable'}">
          <div class="cell-ll-item-top">
            <span class="cell-ll-name">Premier Pass</span>
            <span class="cell-ll-price">${r.price || '—'}</span>
          </div>
        </div>`).join('')}</div>`;
    });

    const parkNumRows   = numRows - (hasEvents ? 0 : 1);
    const lastLlmpClass    = showPremierPass ? '' : ' cal-row-last';
    const lastPremierClass = ' cal-row-last';

    return `
      <div class="cal-park-group" style="--num-rows: ${parkNumRows}">
        <div class="cal-park-col">
          ${icon}
          <span class="cal-park-name">${parkName}</span>
        </div>
        <div class="cal-subrows">
          <div class="cal-row">
            <div class="cal-row-label"><span class="row-type-only">Hours</span></div>
            <div class="cal-row-cells">${hoursCells}</div>
          </div>
          ${!hasEvents ? '' : `<div class="cal-row">
            <div class="cal-row-label"><span class="row-type-only">Events</span></div>
            <div class="cal-row-cells">${eventsCells}</div>
          </div>`}
          <div class="cal-row">
            <div class="cal-row-label"><span class="row-type-only">Single Pass</span></div>
            <div class="cal-row-cells">${llspCells}</div>
          </div>
          <div class="cal-row${lastLlmpClass}">
            <div class="cal-row-label"><span class="row-type-only">LL Multi Pass</span></div>
            <div class="cal-row-cells">${llmpCells}</div>
          </div>
          ${!showPremierPass ? '' : `
          <div class="cal-row${lastPremierClass}">
            <div class="cal-row-label"><span class="row-type-only">Premier Pass</span></div>
            <div class="cal-row-cells">${premierCells}</div>
          </div>`}
        </div>
      </div>`;
  }).join('');

  planner.innerHTML = `
    <div class="calendar-grid" style="--col-count: ${dates.length}">
      <div class="cal-header">
        <div class="cal-park-col-spacer"></div>
        <div class="cal-row-label-spacer"></div>
        <div class="cal-header-cells">${headerCells}</div>
      </div>
      <div class="cal-notes-row">
        <div class="cal-park-col-spacer"></div>
        <div class="cal-row-label cal-notes-label"><span class="row-type-only">Notes</span></div>
        <div class="cal-row-cells">${notesCells}</div>
      </div>
      ${parkGroups}
    </div>`;

  recalcTotals();
}

// ── Status ────────────────────────────────────────────────────────────────────
function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className   = isError ? 'error' : 'loading';
  el.style.display = msg ? 'block' : 'none';
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function load() {
  const start = document.getElementById('start-date').value;
  const end   = document.getElementById('end-date').value;
  if (!start || !end) { setStatus('Please select a start and end date.', true); return; }
  if (start > end)    { setStatus('Start date must be before end date.', true); return; }
  setStatus('Loading park data…');
  document.getElementById('planner').innerHTML = '';
  try {
    const data = await loadPlannerData(start, end);
    renderPlanner(data);
    setStatus('');
  } catch (err) {
    setStatus(`Error loading data: ${err.message}`, true);
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.getElementById('park-toggles').addEventListener('click', e => {
  const btn = e.target.closest('.park-toggle');
  if (!btn) return;
  const park = btn.dataset.park;
  if (activeParkFilters.has(park)) {
    activeParkFilters.delete(park);
    btn.classList.remove('active');
  } else {
    activeParkFilters.add(park);
    btn.classList.add('active');
  }
  if (document.getElementById('planner').innerHTML) load();
});

document.getElementById('load-btn').addEventListener('click', load);

document.getElementById('toggle-premier').addEventListener('change', e => {
  showPremierPass = e.target.checked;
  if (document.getElementById('planner').innerHTML) load();
});

document.getElementById('toggle-cruise').addEventListener('change', e => {
  budget.cruise.enabled = e.target.checked;
  const cruiseWrap = document.getElementById('cs-cruise-wrap');
  if (cruiseWrap) cruiseWrap.hidden = !e.target.checked;
  // Show/hide the whole cruise budget section
  const cruiseSection = document.getElementById('bs-cruise');
  if (cruiseSection) cruiseSection.hidden = !e.target.checked;
  recalcTotals();
  if (typeof markDirty === 'function') markDirty();
});

document.getElementById('budget-toggle-btn').addEventListener('click', () => {
  const inner  = document.querySelector('.budget-panel-inner');
  const btn    = document.getElementById('budget-toggle-btn');
  const isOpen = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
  if (inner) inner.hidden = isOpen;
});

document.getElementById('budget-panel').addEventListener('click', e => {
  const btn = e.target.closest('.section-collapse-btn');
  if (!btn) return;
  // Don't collapse when clicking the cruise checkbox inside the button
  if (e.target.type === 'checkbox') return;
  const sectionId = btn.dataset.section;
  const section   = document.getElementById(sectionId);
  if (!section) return;
  const body      = section.querySelector('.budget-section-body');
  if (!body) return;
  const isOpen = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
  body.hidden = isOpen;
});

document.getElementById('b-travelers').addEventListener('input', e => {
  budget.travelers = Math.max(1, parseInt(e.target.value) || 1);
  if (lastPlannerData) renderPlanner(lastPlannerData);
  else recalcTotals();
  if (typeof markDirty === 'function') markDirty();
});

document.getElementById('budget-hotels-list').addEventListener('click', e => {
  const removeBtn = e.target.closest('.hotel-remove-btn');
  if (removeBtn) { removeHotel(Number(removeBtn.dataset.hotelId)); return; }

  const modeBtn = e.target.closest('.hotel-rate-mode .mode-toggle-btn');
  if (modeBtn) {
    const hotelId = Number(modeBtn.closest('.hotel-rate-mode').dataset.hotelId);
    const hotel   = budget.hotels.find(h => h.id === hotelId);
    if (!hotel) return;
    hotel.rateMode = modeBtn.dataset.mode;
    hotel.ratePerNight = hotelEffectiveRate(hotel);
    renderHotels();
    recalcTotals();
    if (typeof markDirty === 'function') markDirty();
  }
});

document.getElementById('budget-hotels-list').addEventListener('input', e => {
  const row = e.target.closest('.hotel-row');
  if (!row) return;
  const id    = Number(row.dataset.hotelId);
  const hotel = budget.hotels.find(h => h.id === id);
  if (!hotel) return;

  if (e.target.classList.contains('hotel-resort-select')) {
    hotel.resort = e.target.options[e.target.selectedIndex].text;
    updateResortTier();
    if (lastPlannerData) renderPlanner(lastPlannerData);
    renderHotels();
    recalcTotals();
    if (typeof refreshSheetsTabName === 'function') refreshSheetsTabName();
    if (typeof markDirty === 'function') markDirty();
    return;
  }
  if (e.target.classList.contains('hotel-rate-input')) {
    hotel.rateValue = parseFloat(e.target.value) || 0;
    hotel.ratePerNight = hotelEffectiveRate(hotel);
    updateHotelNoteInPlace(hotel, row);
    recalcTotals();
    if (typeof markDirty === 'function') markDirty();
    return;
  }
  if (e.target.classList.contains('hotel-checkin')) {
    const tripStart = document.getElementById('start-date').value;
    const tripEnd   = document.getElementById('end-date').value;
    let v = e.target.value;
    if (tripStart && v < tripStart) v = tripStart;
    if (tripEnd   && v > tripEnd)   v = tripEnd;
    hotel.checkIn  = v;
    e.target.value = v;
  }
  if (e.target.classList.contains('hotel-checkout')) {
    const tripStart = document.getElementById('start-date').value;
    const tripEnd   = document.getElementById('end-date').value;
    let v = e.target.value;
    if (tripStart && v < tripStart) v = tripStart;
    if (tripEnd   && v > tripEnd)   v = tripEnd;
    hotel.checkOut = v;
    e.target.value = v;
  }
  renderHotels();
  if (lastPlannerData) renderPlanner(lastPlannerData);
  recalcTotals();
  if (typeof markDirty === 'function') markDirty();
});

document.getElementById('add-hotel-btn').addEventListener('click', addHotel);

// ── Cruise ────────────────────────────────────────────────────────────────────
function updateCruiseNote() {
  const nights = budget.cruise.nights || 0;
  const cabin  = budget.cruise.cabinCost || 0;
  const fees   = budget.cruise.portFees || 0;
  const onboard = budget.cruise.onboard || 0;
  const noteEl = document.getElementById('b-cruise-note');
  if (!noteEl) return;
  if (nights > 0 || cabin > 0) {
    noteEl.textContent = `${nights} night${nights !== 1 ? 's' : ''} · Cabin ${fmtMoney(cabin)} · Fees ${fmtMoney(fees)} · Onboard ${fmtMoney(onboard)}`;
  } else {
    noteEl.textContent = '';
  }
}


document.getElementById('b-cruise-ship').addEventListener('change', e => {
  budget.cruise.ship = e.target.value;
  if (typeof markDirty === 'function') markDirty();
});
document.getElementById('b-cruise-sail').addEventListener('change', e => {
  budget.cruise.sailDate = e.target.value;
  if (typeof markDirty === 'function') markDirty();
});
document.getElementById('b-cruise-nights').addEventListener('input', e => {
  budget.cruise.nights = parseInt(e.target.value) || 0;
  updateCruiseNote();
  recalcTotals();
  if (typeof markDirty === 'function') markDirty();
});
document.getElementById('b-cruise-cabin').addEventListener('input', e => {
  budget.cruise.cabinCost = parseFloat(e.target.value) || 0;
  updateCruiseNote();
  recalcTotals();
  if (typeof markDirty === 'function') markDirty();
});
document.getElementById('b-cruise-fees').addEventListener('input', e => {
  budget.cruise.portFees = parseFloat(e.target.value) || 0;
  updateCruiseNote();
  recalcTotals();
  if (typeof markDirty === 'function') markDirty();
});
document.getElementById('b-cruise-onboard').addEventListener('input', e => {
  budget.cruise.onboard = parseFloat(e.target.value) || 0;
  updateCruiseNote();
  recalcTotals();
  if (typeof markDirty === 'function') markDirty();
});

document.getElementById('b-flights').addEventListener('input', e => {
  budget.flights = parseFloat(e.target.value) || 0;
  recalcTotals();
  if (typeof markDirty === 'function') markDirty();
});

document.getElementById('b-flights-mode').addEventListener('click', e => {
  const btn = e.target.closest('.mode-toggle-btn');
  if (!btn) return;
  budget.flightsMode = btn.dataset.mode;
  document.querySelectorAll('#b-flights-mode .mode-toggle-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === budget.flightsMode));
  recalcTotals();
  if (typeof markDirty === 'function') markDirty();
});

document.getElementById('b-transport').addEventListener('input', e => {
  budget.transport = parseFloat(e.target.value) || 0;
  // If Mears is on and user manually edits, turn Mears off
  if (budget.mears.enabled) {
    budget.mears.enabled = false;
    document.getElementById('b-mears-toggle').checked = false;
    document.getElementById('b-mears-fields').hidden = true;
    const transportWrap = document.querySelector('#bs-transport .budget-dollar-wrap');
    if (transportWrap) transportWrap.hidden = false;
  }
  recalcTotals();
  if (typeof markDirty === 'function') markDirty();
});

// ── Mears Connect ─────────────────────────────────────────────────────────────
function calcMearsTotal() {
  const { under3, ages3to9, ages10plus, ways } = budget.mears;
  return (ages3to9 * 13 + ages10plus * 16) * ways;
}

function applyMearsToTransport() {
  const total = calcMearsTotal();
  budget.transport = total;
  const el = document.getElementById('b-transport');
  if (el) el.value = total || '';
  // Update stepper display values
  const { under3, ages3to9, ages10plus } = budget.mears;
  const u3El    = document.getElementById('mv-u3');
  const s39El   = document.getElementById('mv-3to9');
  const s10El   = document.getElementById('mv-10plus');
  if (u3El)  u3El.textContent  = under3;
  if (s39El) s39El.textContent = ages3to9;
  if (s10El) s10El.textContent = ages10plus;
  recalcTotals();
  if (typeof markDirty === 'function') markDirty();
}

function syncMearsWayBtns() {
  document.querySelectorAll('.mears-way-btn').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.ways) === budget.mears.ways);
  });
}

document.getElementById('b-mears-toggle').addEventListener('change', e => {
  budget.mears.enabled = e.target.checked;
  document.getElementById('b-mears-fields').hidden = !e.target.checked;
  const transportWrap = document.querySelector('#bs-transport .budget-dollar-wrap');
  if (transportWrap) transportWrap.hidden = e.target.checked;
  if (e.target.checked) {
    applyMearsToTransport();
  } else {
    // Reset all Mears counters and transport cost to zero
    budget.mears.under3 = 0;
    budget.mears.ages3to9 = 0;
    budget.mears.ages10plus = 0;
    budget.mears.ways = 1;
    budget.transport = 0;
    document.getElementById('mv-u3').textContent   = 0;
    document.getElementById('mv-3to9').textContent  = 0;
    document.getElementById('mv-10plus').textContent = 0;
    syncMearsWayBtns();
    const transportInput = document.getElementById('b-transport');
    if (transportInput) transportInput.value = '';
    recalcTotals();
  }
  if (typeof markDirty === 'function') markDirty();
});

// Stepper buttons for Mears age counts
document.getElementById('b-mears-fields').addEventListener('click', e => {
  const btn = e.target.closest('.mears-step-btn');
  if (btn) {
    const field = btn.dataset.field;
    const dir   = Number(btn.dataset.dir);
    const m = budget.mears;
    m[field] = Math.max(0, (m[field] || 0) + dir);
    applyMearsToTransport();
    return;
  }
  const wayBtn = e.target.closest('.mears-way-btn');
  if (wayBtn) {
    budget.mears.ways = Number(wayBtn.dataset.ways);
    syncMearsWayBtns();
    applyMearsToTransport();
  }
});

// Arrival / departure listeners
document.getElementById('b-arrive').addEventListener('change', e => {
  budget.arriveAt = e.target.value;
  if (typeof markDirty === 'function') markDirty();
});
document.getElementById('b-depart').addEventListener('change', e => {
  budget.departAt = e.target.value;
  if (typeof markDirty === 'function') markDirty();
});

document.getElementById('b-tickets').addEventListener('input', e => {
  budget.ticketPerPersonPerDay = parseFloat(e.target.value) || 0;
  recalcTotals();
  if (typeof markDirty === 'function') markDirty();
});

document.getElementById('b-annual-pass').addEventListener('change', e => {
  budget.annualPass = e.target.checked;
  const ticketsInput = document.getElementById('b-tickets');
  if (!budget.annualPass) {
    budget.ticketPerPersonPerDay = 0;
    ticketsInput.value = '';
  }
  ticketsInput.disabled    = budget.annualPass;
  ticketsInput.style.opacity = budget.annualPass ? '0.4' : '';
  recalcTotals();
  if (typeof markDirty === 'function') markDirty();
});

function onTripDatesChange() {
  const tripStart = document.getElementById('start-date').value;
  const tripEnd   = document.getElementById('end-date').value;
  if (tripStart && tripEnd) {
    budget.hotels.forEach(h => {
      if (h.checkIn  && h.checkIn  < tripStart) h.checkIn  = tripStart;
      if (h.checkIn  && h.checkIn  > tripEnd)   h.checkIn  = tripEnd;
      if (h.checkOut && h.checkOut < tripStart)  h.checkOut = tripStart;
      if (h.checkOut && h.checkOut > tripEnd)    h.checkOut = tripEnd;
    });
    renderHotels();
  }
  recalcTotals();
  if (typeof refreshSheetsTabName === 'function') refreshSheetsTabName();
  if (typeof markDirty === 'function') markDirty();
}
document.getElementById('start-date').addEventListener('change', onTripDatesChange);
document.getElementById('end-date').addEventListener('change', onTripDatesChange);

document.getElementById('planner').addEventListener('change', e => {
  if (e.target.classList.contains('llsp-riders-select')) {
    llspRiders.set(e.target.dataset.key, parseInt(e.target.value));
    recalcTotals();
    if (typeof markDirty === 'function') markDirty();
  }
  if (e.target.classList.contains('llmp-include-check')) {
    const key  = e.target.dataset.key;
    const date = e.target.dataset.date;
    if (e.target.checked) {
      for (const k of llmpIncluded.keys()) {
        if (k.endsWith(`|${date}`) && k !== key) {
          llmpIncluded.set(k, false);
          const other = document.querySelector(`.llmp-include-check[data-key="${CSS.escape(k)}"]`);
          if (other) other.checked = false;
        }
      }
      llmpIncluded.set(key, true);
    } else {
      llmpIncluded.set(key, false);
    }
    recalcTotals();
    if (typeof markDirty === 'function') markDirty();
  }
});

document.getElementById('cost-summary-bar').addEventListener('click', e => {
  const btn = e.target.closest('[data-target]');
  if (!btn) return;
  const targetId   = btn.dataset.target;
  const inner      = document.querySelector('.budget-panel-inner');
  const toggleBtn  = document.getElementById('budget-toggle-btn');
  if (inner && inner.hidden) {
    inner.hidden = false;
    toggleBtn.setAttribute('aria-expanded', 'true');
  }
  const input = document.getElementById(targetId);
  if (input) {
    input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    input.focus();
    input.select();
    input.classList.add('budget-highlight');
    setTimeout(() => input.classList.remove('budget-highlight'), 1200);
  }
});

// ── Google Sheets state serialization ────────────────────────────────────────
function getAppState() {
  return {
    startDate:             document.getElementById('start-date').value,
    endDate:               document.getElementById('end-date').value,
    travelers:             budget.travelers,
    flights:               budget.flights,
    flightsMode:           budget.flightsMode,
    arriveAt:              budget.arriveAt,
    departAt:              budget.departAt,
    transport:             budget.transport,
    annualPass:            budget.annualPass,
    ticketPerPersonPerDay: budget.ticketPerPersonPerDay,
    activeParkFilters:     [...activeParkFilters],
    hotels:                budget.hotels,
    mears:                 budget.mears,
    cruise:                budget.cruise,
    showPremierPass:       showPremierPass,
    llspRiders:            [...llspRiders.entries()],
    llmpIncluded:          [...llmpIncluded.entries()],
  };
}

function applyAppState(state) {
  if (state.startDate) document.getElementById('start-date').value = state.startDate;
  if (state.endDate)   document.getElementById('end-date').value   = state.endDate;

  if (state.travelers != null) {
    budget.travelers = Number(state.travelers) || 1;
    const el = document.getElementById('b-travelers');
    if (el) el.value = budget.travelers;
  }
  if (state.flights != null) {
    budget.flights = Number(state.flights) || 0;
    const el = document.getElementById('b-flights');
    if (el) el.value = budget.flights;
  }
  if (state.flightsMode) {
    budget.flightsMode = state.flightsMode;
    document.querySelectorAll('#b-flights-mode .mode-toggle-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === budget.flightsMode));
  }
  if (state.transport != null) {
    budget.transport = Number(state.transport) || 0;
    const el = document.getElementById('b-transport');
    if (el) el.value = budget.transport;
  }
  if (state.annualPass != null) {
    budget.annualPass = Boolean(state.annualPass);
    const cb = document.getElementById('b-annual-pass');
    if (cb) cb.checked = budget.annualPass;
    const ticketsInput = document.getElementById('b-tickets');
    if (ticketsInput) {
      ticketsInput.disabled    = budget.annualPass;
      ticketsInput.style.opacity = budget.annualPass ? '0.4' : '';
    }
  }
  if (state.ticketPerPersonPerDay != null) {
    budget.ticketPerPersonPerDay = Number(state.ticketPerPersonPerDay) || 0;
    const el = document.getElementById('b-tickets');
    if (el) el.value = budget.ticketPerPersonPerDay;
  }
  if (Array.isArray(state.activeParkFilters)) {
    activeParkFilters = new Set(state.activeParkFilters);
    document.querySelectorAll('.park-toggle').forEach(btn => {
      btn.classList.toggle('active', activeParkFilters.has(btn.dataset.park));
    });
  }
  if (Array.isArray(state.hotels)) {
    budget.hotels = state.hotels.map(h => ({
      rateMode: 'night',
      rateValue: h.rateValue ?? h.ratePerNight ?? 0,
      ...h,
    }));
    nextHotelId = (budget.hotels.reduce((m, h) => Math.max(m, h.id ?? 0), 0)) + 1;
    updateResortTier();
    renderHotels();
  }
  if (state.arriveAt != null) {
    budget.arriveAt = state.arriveAt || '';
    const el = document.getElementById('b-arrive');
    if (el) el.value = budget.arriveAt;
  }
  if (state.departAt != null) {
    budget.departAt = state.departAt || '';
    const el = document.getElementById('b-depart');
    if (el) el.value = budget.departAt;
  }
  if (state.mears != null) {
    budget.mears = { ...budget.mears, ...state.mears };
    const m = budget.mears;
    const toggle = document.getElementById('b-mears-toggle');
    if (toggle) toggle.checked = m.enabled;
    const fields = document.getElementById('b-mears-fields');
    if (fields) fields.hidden = !m.enabled;
    const transportWrap = document.querySelector('#bs-transport .budget-dollar-wrap');
    if (transportWrap) transportWrap.hidden = !!m.enabled;
    syncMearsWayBtns();
    if (m.enabled) applyMearsToTransport();
    else {
      const u3El  = document.getElementById('mv-u3');
      const s39El = document.getElementById('mv-3to9');
      const s10El = document.getElementById('mv-10plus');
      if (u3El)  u3El.textContent  = m.under3    || 0;
      if (s39El) s39El.textContent = m.ages3to9  || 0;
      if (s10El) s10El.textContent = m.ages10plus || 0;
    }
  }
  if (state.cruise != null) {
    budget.cruise = { ...budget.cruise, ...state.cruise };
    const c = budget.cruise;
    const headerToggle = document.getElementById('toggle-cruise');
    if (headerToggle) headerToggle.checked = !!c.enabled;
    const cruiseSection = document.getElementById('bs-cruise');
    if (cruiseSection) cruiseSection.hidden = !c.enabled;
    const cruiseWrap = document.getElementById('cs-cruise-wrap');
    if (cruiseWrap) cruiseWrap.hidden = !c.enabled;
    const shipEl = document.getElementById('b-cruise-ship');
    if (shipEl) shipEl.value = c.ship || '';
    const sailEl = document.getElementById('b-cruise-sail');
    if (sailEl) sailEl.value = c.sailDate || '';
    const nightsEl = document.getElementById('b-cruise-nights');
    if (nightsEl) nightsEl.value = c.nights || '';
    const cabinEl = document.getElementById('b-cruise-cabin');
    if (cabinEl) cabinEl.value = c.cabinCost || '';
    const feesEl = document.getElementById('b-cruise-fees');
    if (feesEl) feesEl.value = c.portFees || '';
    const onboardEl = document.getElementById('b-cruise-onboard');
    if (onboardEl) onboardEl.value = c.onboard || '';
    updateCruiseNote();
  }
  if (state.showPremierPass != null) {
    showPremierPass = Boolean(state.showPremierPass);
    const cb = document.getElementById('toggle-premier');
    if (cb) cb.checked = showPremierPass;
  }
  if (Array.isArray(state.llspRiders)) {
    llspRiders.clear();
    state.llspRiders.forEach(([k, v]) => llspRiders.set(k, v));
  }
  if (Array.isArray(state.llmpIncluded)) {
    llmpIncluded.clear();
    state.llmpIncluded.forEach(([k, v]) => llmpIncluded.set(k, v));
  }

  // Reload planner data for the (potentially new) date range
  if (state.startDate && state.endDate) load();
  else recalcTotals();
}

// ── Initial setup ─────────────────────────────────────────────────────────────
loadSpecialEvents();

const today   = new Date();
const weekOut = new Date(today);
weekOut.setDate(today.getDate() + 6);
// Use local date string to avoid UTC offset shifting the date
const localDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
document.getElementById('start-date').value = localDate(today);
document.getElementById('end-date').value   = localDate(weekOut);

recalcTotals();
