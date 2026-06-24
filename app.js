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
  transport:  0,
  ticketPerPersonPerDay: 0,
  annualPass: false,
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
    const nights   = nightsBetween(h.checkIn, h.checkOut);
    const subtotal = nights * h.ratePerNight;
    const isOverlap = overlaps.has(h.id);
    const noteText = h.checkIn && h.checkOut && nights > 0
      ? (isOverlap ? '⚠ Overlaps another hotel' : `${nights} night${nights !== 1 ? 's' : ''} = ${fmtMoney(subtotal)}`)
      : '';
    return `
      <div class="hotel-row${isOverlap ? ' overlap-error' : ''}" data-hotel-id="${h.id}">
        <div class="hotel-row-header">
          <span class="hotel-row-label">Hotel ${idx + 1}</span>
          <button class="hotel-remove-btn" data-hotel-id="${h.id}" title="Remove">× Remove</button>
        </div>
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
            <label class="hotel-field-label">Rate / night</label>
            <div class="budget-dollar-wrap"><span>$</span><input class="hotel-rate-input" type="number" min="0" step="1" placeholder="0" value="${h.ratePerNight || ''}"></div>
          </div>
          <div class="hotel-field hotel-field-note">
            <label class="hotel-field-label">&nbsp;</label>
            <span class="hotel-nights-note${isOverlap ? ' overlap-note' : ''}">${noteText}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

function updateHotelNoteInPlace(hotel, rowEl) {
  const noteEl = rowEl.querySelector('.hotel-nights-note');
  if (!noteEl) return;
  const nights   = nightsBetween(hotel.checkIn, hotel.checkOut);
  const subtotal = nights * hotel.ratePerNight;
  const overlaps = overlappingHotelIds(budget.hotels);
  const isOverlap = overlaps.has(hotel.id);
  noteEl.textContent = hotel.checkIn && hotel.checkOut && nights > 0
    ? (isOverlap ? '⚠ Overlaps another hotel' : `${nights} night${nights !== 1 ? 's' : ''} = ${fmtMoney(subtotal)}`)
    : '';
  noteEl.classList.toggle('overlap-note', isOverlap);
}

function addHotel() {
  budget.hotels.push({ id: nextHotelId++, resort: '', checkIn: '', checkOut: '', ratePerNight: 0 });
  renderHotels();
  recalcTotals();
}

function removeHotel(id) {
  budget.hotels = budget.hotels.filter(h => h.id !== id);
  updateResortTier();
  renderHotels();
  if (lastPlannerData) renderPlanner(lastPlannerData);
  recalcTotals();
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
  const { travelers, hotels, flights, transport, ticketPerPersonPerDay, annualPass } = budget;
  const days = getTripDays();

  const overlaps   = overlappingHotelIds(hotels);
  const hotelTotal = hotels.reduce((sum, h) => {
    if (overlaps.has(h.id)) return sum;
    return sum + nightsBetween(h.checkIn, h.checkOut) * h.ratePerNight;
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

  const total     = hotelTotal + flightsTotal + transportTotal + ticketsTotal + llspTotal + llmpTotal;
  const perPerson = travelers > 0 ? total / travelers : 0;

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

  const numRows = 3 + (showPremierPass ? 1 : 0);

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
      const tierOnDate    = hotelTierOnDate(date);
      const isResortOnDate = tierOnDate !== '';
      const isDeluxeOnDate = tierOnDate === 'deluxe';
      const earlyEntry    = d.specialEvents.find(e => e.description === 'Early Entry');
      const effectiveOpen = isResortOnDate && earlyEntry ? earlyEntry.openTime : d.openTime;
      const apiBadges = d.specialEvents.flatMap(e => {
        if (e.description === 'Early Entry') return [];
        if (e.description === 'Extended Evening') {
          const eligible = isDeluxeOnDate;
          return [`<span class="event-badge extended-evening${eligible ? ' eligible' : ''}">${eligible ? '⭐ ' : ''}Deluxe &amp; DVC Extended Hours ${formatTime(e.openTime)}–${formatTime(e.closeTime)}</span>`];
        }
        return [`<span class="event-badge special-event">After-Hours Event ${formatTime(e.openTime)}–${formatTime(e.closeTime)}</span>`];
      });
      const scrapedBadges = getEventsForDate(date)
        .filter(ev => ev.park === parkName)
        .map(ev => {
          const adult    = ev.priceAdult != null ? `$${ev.priceAdult.toFixed(2)}` : null;
          const child    = ev.priceChild != null && ev.priceChild !== ev.priceAdult ? ` / $${ev.priceChild.toFixed(2)} child` : '';
          const priceStr = adult ? ` · ${adult}${child}` : '';
          return `<span class="event-badge ticketed-event">🎟 ${ev.name}${priceStr}</span>`;
        });
      const events = [...apiBadges, ...scrapedBadges].join('');
      return `<div class="cal-cell">
        <div class="cell-hours">${formatTime(effectiveOpen)}–${formatTime(d.closeTime)}</div>
        ${events ? `<div class="cell-events">${events}</div>` : ''}
      </div>`;
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

    const lastLlmpClass    = showPremierPass ? '' : ' cal-row-last';
    const lastPremierClass = ' cal-row-last';

    return `
      <div class="cal-park-group" style="--num-rows: ${numRows}">
        <div class="cal-park-col">
          ${icon}
          <span class="cal-park-name">${parkName}</span>
        </div>
        <div class="cal-subrows">
          <div class="cal-row">
            <div class="cal-row-label"><span class="row-type-only">Hours</span></div>
            <div class="cal-row-cells">${hoursCells}</div>
          </div>
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

document.getElementById('budget-toggle-btn').addEventListener('click', () => {
  const panel = document.getElementById('budget-panel');
  panel.hidden = !panel.hidden;
  document.getElementById('budget-toggle-btn').classList.toggle('active', !panel.hidden);
});

document.getElementById('b-travelers').addEventListener('input', e => {
  budget.travelers = Math.max(1, parseInt(e.target.value) || 1);
  if (lastPlannerData) renderPlanner(lastPlannerData);
  else recalcTotals();
});

document.getElementById('budget-hotels-list').addEventListener('click', e => {
  const removeBtn = e.target.closest('.hotel-remove-btn');
  if (removeBtn) removeHotel(Number(removeBtn.dataset.hotelId));
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
    return;
  }
  if (e.target.classList.contains('hotel-rate-input')) {
    hotel.ratePerNight = parseFloat(e.target.value) || 0;
    updateHotelNoteInPlace(hotel, row);
    recalcTotals();
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
});

document.getElementById('add-hotel-btn').addEventListener('click', addHotel);

document.getElementById('b-flights').addEventListener('input', e => {
  budget.flights = parseFloat(e.target.value) || 0;
  recalcTotals();
});

document.getElementById('b-flights-mode').addEventListener('click', e => {
  const btn = e.target.closest('.mode-toggle-btn');
  if (!btn) return;
  budget.flightsMode = btn.dataset.mode;
  document.querySelectorAll('#b-flights-mode .mode-toggle-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === budget.flightsMode));
  recalcTotals();
});

document.getElementById('b-transport').addEventListener('input', e => {
  budget.transport = parseFloat(e.target.value) || 0;
  recalcTotals();
});

document.getElementById('b-tickets').addEventListener('input', e => {
  budget.ticketPerPersonPerDay = parseFloat(e.target.value) || 0;
  recalcTotals();
});

document.getElementById('b-annual-pass').addEventListener('change', e => {
  budget.annualPass = e.target.checked;
  const ticketsInput = document.getElementById('b-tickets');
  ticketsInput.disabled    = budget.annualPass;
  ticketsInput.style.opacity = budget.annualPass ? '0.4' : '';
  recalcTotals();
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
}
document.getElementById('start-date').addEventListener('change', onTripDatesChange);
document.getElementById('end-date').addEventListener('change', onTripDatesChange);

document.getElementById('planner').addEventListener('change', e => {
  if (e.target.classList.contains('llsp-riders-select')) {
    llspRiders.set(e.target.dataset.key, parseInt(e.target.value));
    recalcTotals();
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
  }
});

document.getElementById('cost-summary-bar').addEventListener('click', e => {
  const btn = e.target.closest('[data-target]');
  if (!btn) return;
  const targetId = btn.dataset.target;
  const panel    = document.getElementById('budget-panel');
  if (panel.hidden) {
    panel.hidden = false;
    document.getElementById('budget-toggle-btn').classList.add('active');
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
